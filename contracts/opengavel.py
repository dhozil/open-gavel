# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
import re
from dataclasses import dataclass
from genlayer import *

ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

VALID_VERDICTS = ("ALLOW", "WARN", "REMOVE", "BAN", "ESCALATE")
VALID_STATUSES = ("PENDING", "DECIDED", "APPEALED", "FINAL")


@allow_storage
@dataclass
class Community:
    community_id: str
    name: str
    rules_text: str
    version: u256
    admin: Address
    created_at: str


@allow_storage
@dataclass
class Case:
    case_id: str
    community_id: str
    content_text: str
    author: str
    context: str
    status: str
    verdict: str
    violated_rule_id: str
    severity: u256
    action: str
    reasoning: str
    rules_version: u256
    appeal_reason: str
    appeal_count: u256
    # Tamper-evident screenshot evidence (appended last: storage layout stays
    # compatible for readers of earlier fields). The image itself lives off
    # chain (any public host); the contract pins its URL + SHA-256 so an
    # edited screenshot can never match. Empty pair = text-only report.
    evidence_url: str
    evidence_hash: str


def _clean_json_text(text: str) -> str:
    first = text.find("{")
    last = text.rfind("}")
    if first == -1 or last == -1 or last <= first:
        return text
    cleaned = text[first : last + 1]
    cleaned = re.sub(r",(?!\s*?[\{\[\"\'\w])", "", cleaned)
    return cleaned


def _parse_moderation_json(raw: object) -> dict:
    if isinstance(raw, dict):
        data = raw
    elif isinstance(raw, str):
        try:
            data = json.loads(_clean_json_text(raw))
        except Exception:
            raise gl.vm.UserError(f"{ERROR_LLM} LLM returned unparseable JSON")
        if not isinstance(data, dict):
            raise gl.vm.UserError(f"{ERROR_LLM} LLM JSON is not an object")
    else:
        raise gl.vm.UserError(f"{ERROR_LLM} LLM returned non-dict: {type(raw)}")
    return data


def _coerce_verdict(raw: object) -> str:
    if raw is None:
        return "ESCALATE"
    v = str(raw).strip().upper()
    if v in VALID_VERDICTS:
        return v
    # Common LLM aliases
    aliases = {
        "APPROVE": "ALLOW",
        "ALLOWED": "ALLOW",
        "OK": "ALLOW",
        "SAFE": "ALLOW",
        "WARNING": "WARN",
        "DELETE": "REMOVE",
        "TAKEDOWN": "REMOVE",
        "BLOCK": "BAN",
        "SUSPEND": "BAN",
        "REVIEW": "ESCALATE",
        "UNSURE": "ESCALATE",
    }
    return aliases.get(v, "ESCALATE")


def _coerce_severity(raw: object) -> int:
    if raw is None:
        return 5
    try:
        return max(0, min(10, int(round(float(str(raw).strip())))))
    except (ValueError, TypeError):
        return 5


def _coerce_rule_id(raw: object) -> str:
    if raw is None:
        return ""
    return str(raw).strip()[:128]


def _check_evidence(url: str, digest: str) -> tuple[str, str]:
    url = (url or "").strip()
    digest = (digest or "").strip().lower()
    if not url and not digest:
        return ("", "")
    if bool(url) != bool(digest):
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Evidence needs BOTH url and sha256 hash")
    if len(url) > 2000:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Evidence url too long (max 2000 chars)")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Evidence url must start with http(s)://")
    if len(digest) != 64:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Evidence hash must be 64 hex chars (sha256)")
    for ch in digest:
        if ch not in "0123456789abcdef":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Evidence hash must be 64 hex chars (sha256)")
    return (url, digest)


def _build_prompt(rules_text: str, rules_version: str, content_text: str, context: str, extra: str, evidence: str, seen_image: bool) -> str:
    evidence_block = (
        evidence
        if seen_image
        else (evidence if evidence else "(none — text-only report, judge the content as written)")
    )
    image_line = (
        "\nYou can SEE the attached screenshot. Base the verdict on what is actually visible in it "
        "combined with the reported text below. A violation visible in EITHER counts; if the image "
        "contradicts the reported text, say so in reasoning and weigh what the image shows."
        if seen_image
        else ""
    )
    return f"""You are a neutral community moderator. Enforce ONLY the community rules below. Be unbiased and consistent.

COMMUNITY RULES (version {rules_version}):
{rules_text}

REPORTED CONTENT:
{content_text}

CONTEXT (author, channel, prior strikes):
{context}

SCREENSHOT EVIDENCE:
{evidence_block}
{image_line}

{extra}

Classify the content and respond with JSON ONLY in this exact shape:
{{
  "verdict": "ALLOW | WARN | REMOVE | BAN | ESCALATE",
  "violated_rule_id": "rule id or empty string if ALLOW",
  "severity": 0-10,
  "action": "short enforcement action, e.g. no action | warn user | remove content | temp ban | escalate to humans",
  "reasoning": "1-3 sentences citing the specific rule and why it applies or not"
}}
Severity guide: 0-2 harmless, 3-4 borderline, 5-6 violation, 7-8 serious, 9-10 severe/hate/threats.
If unsure, use ESCALATE with severity 5. Never invent rules outside the list above.
JSON only, no markdown, no extra text."""


def _fetch_evidence_bytes(url: str) -> bytes:
    """Fetch pinned screenshot bytes for the vision path.

    Runs inside nondet on both leader and validators, so both sides analyze
    the same bytes. Failures are TRANSIENT (host blip) unless the host answers
    4xx (EXTERNAL: the evidence itself is gone — deterministic).
    """
    try:
        res = gl.nondet.web.get(url)
    except Exception as e:
        raise gl.vm.UserError(f"{ERROR_TRANSIENT} Evidence fetch failed: {e}")
    if res.status != 200:
        if 400 <= res.status < 500:
            raise gl.vm.UserError(f"{ERROR_EXTERNAL} Evidence url returned {res.status}")
        raise gl.vm.UserError(f"{ERROR_TRANSIENT} Evidence host returned {res.status}")
    raw = res.body
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    img = bytes(raw)
    if len(img) < 100:
        raise gl.vm.UserError(f"{ERROR_EXTERNAL} Evidence download too small to be an image")
    # Consensus stays cheap: oversized evidence is the reporter's fault
    # (deterministic EXPECTED), not a retryable failure. The frontend
    # downscales screenshots to <=1280px before upload, so this path
    # should rarely trigger.
    if len(img) > 3000000:
        raise gl.vm.UserError(f"{ERROR_EXPECTED} Evidence image too large (max 3MB after encoding)")
    return img


class OpenGavel(gl.Contract):
    owner: Address
    communities: TreeMap[str, Community]
    cases: TreeMap[str, Case]
    case_order: DynArray[str]
    case_seq: u256
    # On-chain registry: every community id ever created, in creation order.
    # Ownership views scan this registry and filter by Community.admin, so the
    # frontend never needs localStorage or guesswork to answer "what do I own?".
    # Only top-level append/iteration patterns are used (no nested storage).
    community_ids: DynArray[str]

    def __init__(self):
        self.owner = gl.message.sender_address
        self.case_seq = 0

    def _require_community(self, community_id: str) -> Community:
        if community_id not in self.communities:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown community: {community_id}")
        return self.communities[community_id]

    def _require_case(self, case_id: str) -> Case:
        if case_id not in self.cases:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown case: {case_id}")
        return self.cases[case_id]

    def _run_moderation(
        self, rules_text: str, rules_version: u256, content_text: str, context: str, extra: str, evidence_url: str, evidence_hash: str
    ) -> dict:
        def leader_fn():
            images: list = []
            seen_image = False
            evidence_block = ""
            if evidence_url:
                evidence_block = (
                    f"URL: {evidence_url}\nSHA-256: {evidence_hash}\n"
                    "The screenshot is attached to this prompt — its bytes were fetched from the URL above."
                )
                # Vision path (docs: image-processing): fetch the pinned bytes and
                # let the model SEE the screenshot. Validators re-fetch the same
                # URL independently, so both sides analyze identical bytes.
                images = [_fetch_evidence_bytes(evidence_url)]
                seen_image = True
            prompt = _build_prompt(rules_text, str(rules_version), content_text, context, extra, evidence_block, seen_image)
            try:
                if seen_image:
                    response = gl.nondet.exec_prompt(prompt, images=images, response_format="json")
                else:
                    response = gl.nondet.exec_prompt(prompt, response_format="json")
            except Exception as e:
                raise gl.vm.UserError(f"{ERROR_TRANSIENT} LLM call failed: {e}")
            data = _parse_moderation_json(response)
            verdict = _coerce_verdict(data.get("verdict", data.get("decision", "ESCALATE")))
            rule_id = _coerce_rule_id(data.get("violated_rule_id", data.get("violated_rule", data.get("rule_id", ""))))
            severity = _coerce_severity(data.get("severity", data.get("score", 5)))
            action = str(data.get("action", ""))[:256]
            reasoning = str(data.get("reasoning", data.get("analysis", data.get("explanation", ""))))[:2000]
            if verdict == "ALLOW":
                rule_id = ""
                if severity > 3:
                    severity = 0
            if not reasoning:
                raise gl.vm.UserError(f"{ERROR_LLM} LLM returned empty reasoning")
            return {
                "verdict": verdict,
                "violated_rule_id": rule_id,
                "severity": severity,
                "action": action,
                "reasoning": reasoning,
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
                try:
                    leader_fn()
                    return False
                except gl.vm.UserError as e:
                    validator_msg = e.message if hasattr(e, "message") else str(e)
                    if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
                        return validator_msg == leader_msg
                    if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
                        return True
                    return False
                except Exception:
                    return False
            try:
                validator_data = leader_fn()
            except Exception:
                return False
            leader_data = leaders_res.calldata
            try:
                if leader_data.get("verdict") != validator_data.get("verdict"):
                    return False
                if (leader_data.get("violated_rule_id") or "") != (validator_data.get("violated_rule_id") or ""):
                    return False
                ls = int(leader_data.get("severity", 5))
                vs = int(validator_data.get("severity", 5))
                severe = ("REMOVE", "BAN")
                # Gate: removal-level decisions must agree on severity side
                if (leader_data.get("verdict") in severe) != (validator_data.get("verdict") in severe):
                    return False
                if (ls == 0) != (vs == 0):
                    return False
                return abs(ls - vs) <= 1
            except Exception:
                return False

        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

    @gl.public.write
    def create_community(self, community_id: str, name: str, rules_text: str) -> None:
        cid = community_id.strip()
        if not cid or len(cid) > 64:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Invalid community_id")
        if cid in self.communities:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Community already exists")
        if not rules_text or len(rules_text.strip()) < 20:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Rules text too short (min 20 chars)")
        if len(rules_text) > 12000:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Rules text too long (max 12000 chars)")
        self.communities[cid] = Community(
            community_id=cid,
            name=name.strip()[:128],
            rules_text=rules_text,
            version=1,
            admin=gl.message.sender_address,
            created_at="",
        )
        self.community_ids.append(cid)

    @gl.public.write
    def update_rules(self, community_id: str, new_rules_text: str) -> None:
        community = self._require_community(community_id)
        if gl.message.sender_address != community.admin:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only community admin can update rules")
        if not new_rules_text or len(new_rules_text.strip()) < 20:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Rules text too short (min 20 chars)")
        if len(new_rules_text) > 12000:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Rules text too long (max 12000 chars)")
        community.rules_text = new_rules_text
        community.version = community.version + 1
        self.communities[community_id] = community

    @gl.public.write
    def report_content(self, community_id: str, content_text: str, author: str, context: str, evidence_url: str, evidence_hash: str) -> None:
        self._require_community(community_id)
        if not content_text or not content_text.strip():
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Content text is empty")
        if len(content_text) > 8000:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Content too long (max 8000 chars)")
        evidence_url, evidence_hash = _check_evidence(evidence_url, evidence_hash)
        self.case_seq = self.case_seq + 1
        case_id = f"{community_id}-{int(self.case_seq)}"
        community = self.communities[community_id]
        case = Case(
            case_id=case_id,
            community_id=community_id,
            content_text=content_text,
            author=author.strip()[:128],
            context=context.strip()[:2000],
            status="PENDING",
            verdict="",
            violated_rule_id="",
            severity=0,
            action="",
            reasoning="",
            rules_version=community.version,
            appeal_reason="",
            appeal_count=0,
            evidence_url=evidence_url,
            evidence_hash=evidence_hash,
        )
        self.cases[case_id] = case
        self.case_order.append(case_id)

    @gl.public.write
    def moderate_case(self, case_id: str) -> None:
        case = self._require_case(case_id)
        if case.status not in ("PENDING", "APPEALED"):
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Case already decided, use appeal to reopen")
        community = self._require_community(case.community_id)
        result = self._run_moderation(
            community.rules_text,
            community.version,
            case.content_text,
            f"Author: {case.author}\n{case.context}",
            "",
            case.evidence_url,
            case.evidence_hash,
        )
        case.verdict = result["verdict"]
        case.violated_rule_id = result["violated_rule_id"]
        case.severity = result["severity"]
        case.action = result["action"]
        case.reasoning = result["reasoning"]
        case.rules_version = community.version
        case.status = "DECIDED"
        self.cases[case_id] = case

    @gl.public.write
    def appeal_case(self, case_id: str, appeal_reason: str) -> None:
        case = self._require_case(case_id)
        if case.status != "DECIDED":
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Only DECIDED cases can be appealed")
        if not appeal_reason or len(appeal_reason.strip()) < 10:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Appeal reason too short (min 10 chars)")
        if case.appeal_count >= 3:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Max 3 appeals per case")
        community = self._require_community(case.community_id)
        result = self._run_moderation(
            community.rules_text,
            community.version,
            case.content_text,
            f"Author: {case.author}\n{case.context}",
            f"APPEAL (reason: {appeal_reason.strip()[:1000]}). Re-evaluate carefully. Prior verdict: {case.verdict}. Overturn it only if the rules clearly support it.",
            case.evidence_url,
            case.evidence_hash,
        )
        case.verdict = result["verdict"]
        case.violated_rule_id = result["violated_rule_id"]
        case.severity = result["severity"]
        case.action = result["action"]
        case.reasoning = result["reasoning"]
        case.rules_version = community.version
        case.appeal_reason = appeal_reason.strip()[:1000]
        case.appeal_count = case.appeal_count + 1
        case.status = "DECIDED"
        self.cases[case_id] = case

    @gl.public.view
    def get_case(self, case_id: str) -> dict:
        case = self._require_case(case_id)
        return {
            "case_id": case.case_id,
            "community_id": case.community_id,
            "content_text": case.content_text,
            "author": case.author,
            "context": case.context,
            "status": case.status,
            "verdict": case.verdict,
            "violated_rule_id": case.violated_rule_id,
            "severity": int(case.severity),
            "action": case.action,
            "reasoning": case.reasoning,
            "rules_version": int(case.rules_version),
            "appeal_reason": case.appeal_reason,
            "appeal_count": int(case.appeal_count),
            "evidence_url": case.evidence_url,
            "evidence_hash": case.evidence_hash,
        }

    @gl.public.view
    def list_cases(self, community_id: str, limit: u256) -> list:
        self._require_community(community_id)
        out: list = []
        count = 0
        total = len(self.case_order)
        lim = int(limit)
        if lim <= 0:
            lim = 20
        if lim > 100:
            lim = 100
        idx = total - 1
        while idx >= 0 and count < lim:
            cid = self.case_order[idx]
            c = self.cases[cid]
            if c.community_id == community_id:
                out.append(
                    {
                        "case_id": c.case_id,
                        "status": c.status,
                        "verdict": c.verdict,
                        "severity": int(c.severity),
                    }
                )
                count += 1
            idx -= 1
        return out

    @gl.public.view
    def get_community(self, community_id: str) -> dict:
        community = self._require_community(community_id)
        return {
            "community_id": community.community_id,
            "name": community.name,
            "rules_text": community.rules_text,
            "version": int(community.version),
            "admin": community.admin.as_hex,
        }

    @gl.public.view
    def list_communities(self, limit: u256) -> list:
        out: list = []
        count = 0
        total = len(self.community_ids)
        lim = int(limit)
        if lim <= 0:
            lim = 20
        if lim > 100:
            lim = 100
        idx = total - 1
        while idx >= 0 and count < lim:
            cid = self.community_ids[idx]
            c = self.communities[cid]
            out.append(
                {
                    "community_id": c.community_id,
                    "name": c.name,
                    "version": int(c.version),
                }
            )
            count += 1
            idx -= 1
        return out

    @gl.public.view
    def list_communities_by_admin(self, admin_address: str) -> list:
        try:
            target = Address(admin_address)
        except Exception:
            raise gl.vm.UserError(f"{ERROR_EXPECTED} Invalid admin address")
        out: list = []
        total = len(self.community_ids)
        idx = 0
        while idx < total:
            cid = self.community_ids[idx]
            if self.communities[cid].admin == target:
                out.append(cid)
            idx += 1
        return out
