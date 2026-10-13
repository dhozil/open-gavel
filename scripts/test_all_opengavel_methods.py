"""Exercise every OpenGavel method with the shared dev wallet, and prove it.

Wallet: GENLAYER_DEV_KEY is read at runtime from
D:\\Genlayer-project\\wallet\\.env — never via argv, never logged, never
committed. Same pattern as D:\\Genlayer-project\\wallet\\test_all_methods.py.

Two GenLayer facts shape this harness (learned in the wallet repo):
1. genlayer-py's receipt has no consensus_data, so execution_result comes
   from the CLI: `genlayer receipt <tx>` blocks until FINALIZED.
2. Reads default to latest-nonfinal, so every read happens after the
   FINALIZED barrier of the write it follows.

Coverage is diffed against the on-chain schema in both directions, so the
audit fails if the contract grows a method this sweep does not call, or if
this sweep expects a method the contract no longer has.

    python scripts/test_all_opengavel_methods.py
"""

import json
import time
from pathlib import Path

import genlayer_py.accounts as accounts
from genlayer_py.chains import studionet
from genlayer_py.client.client import create_client

HERE = Path(__file__).resolve().parent.parent
WALLET_ENV = Path(r"D:\Genlayer-project\wallet\.env")
DEPLOY = HERE / "deployed-opengavel.json"

EXPECTED_METHODS = {
    "create_community",
    "update_rules",
    "report_content",
    "moderate_case",
    "appeal_case",
    "get_case",
    "list_cases",
    "get_community",
    "list_communities",
    "list_communities_by_admin",
}

RULES_V1 = """R1 - No hate speech or slurs targeting protected groups.
R2 - No threats, harassment, or doxxing.
R3 - No spam, scams, or malicious links.
R4 - No explicit sexual content involving minors (zero tolerance).
R5 - Be civil: no insults in heated debate, attack ideas not people."""

RULES_V2 = RULES_V1 + "\nR6 - No AI-generated misinformation presented as fact."

results: list[tuple[str, str, str]] = []
covered: set[str] = set()
failed: list[str] = []


def record(method: str, kind: str, note: str, ok: bool = True) -> None:
    results.append((method, kind, note))
    covered.add(method)
    if not ok:
        failed.append(method)
    print(f"  [{kind:5}] {method:18} {note}")


def full_receipt(client, tx: str) -> dict:
    """Full receipt via genlayer_py get_transaction: execution_result plus
    consensus votes, no CLI, no keystore, no passwords. Polls until the
    execution result is present and the lifecycle status holds still twice
    (covers leader rotation settling on the accepted outcome)."""
    execution = status_num = payload = stderr = None
    last_status = object()
    stable = 0
    for _ in range(60):
        try:
            d = dict(client.get_transaction(tx))
            lr = ((d.get("consensus_data") or {}).get("leader_receipt") or [{}])[0]
            execution = lr.get("execution_result")
            res = lr.get("result") or {}
            payload = res.get("payload")
            if isinstance(payload, dict):
                payload = payload.get("readable", str(payload))
            if payload is None:
                stderr = ((lr.get("genvm_result") or {}).get("stderr") or "").strip() or None
            status_num = d.get("status")
        except Exception:
            pass
        if execution is not None and status_num == last_status:
            stable += 1
            if stable >= 2:
                break
        else:
            stable = 0
        last_status = status_num
        time.sleep(10)
    return {"execution": execution, "status_name": f"status={status_num}",
            "payload": payload, "stdout": stderr}


def main() -> None:
    key = next(
        line.split(b"=", 1)[1].decode("utf-8").strip()
        for line in WALLET_ENV.read_bytes().split(b"\n")
        if line.startswith(b"GENLAYER_DEV_KEY=")
    )
    account = accounts.create_account(key)
    client = create_client(chain=studionet, account=account)
    print("tester   :", account.address)

    if not DEPLOY.exists():
        raise SystemExit(f"missing {DEPLOY} — run scripts/deploy_opengavel.py first")
    address = json.loads(DEPLOY.read_text())["address"]
    print("contract :", address)

    def call(method, args=None):
        last = None
        for i in range(1, 7):
            try:
                return client.read_contract(address, method, args or [])
            except Exception as exc:
                last = exc
                text = str(exc).lower()
                if not ("rate limit" in text or "-32029" in text or "429" in text
                        or "502" in text or "503" in text or "504" in text
                        or "timeout" in text or "connection" in text):
                    raise
                wait = 12 * i
                print(f"  {method:18} transient, retry {wait}s ({i}/6)")
                time.sleep(wait)
        raise RuntimeError(f"{method} unreadable after 6 tries: {str(last)[:110]}")

    def write(method, args=None):
        last, tx = None, None
        for i in range(1, 8):
            try:
                tx = client.write_contract(address, method, account=account, args=args or [])
                break
            except Exception as exc:
                last = exc
                text = str(exc).lower()
                if not ("rate limit" in text or "-32029" in text or "429" in text
                        or "502" in text or "503" in text or "504" in text
                        or "timeout" in text or "connection" in text):
                    raise
                wait = 15 * i
                print(f"  {method:18} send refused, retry {wait}s ({i}/7)")
                time.sleep(wait)
        if tx is None:
            raise RuntimeError(f"{method} could not be sent: {str(last)[:110]}")
        rc = full_receipt(client, tx)
        ok = rc["execution"] == "SUCCESS"
        note = f"exec={rc['execution']} status={rc['status_name']}"
        if not ok:
            detail = rc["payload"] or rc["stdout"] or "no detail"
            note += f" | {detail.strip()[:100]}"
        record(method, "write", note, ok=ok)
        time.sleep(5)  # StudioNet per-IP budget is shared; pace the writes
        return rc

    # --- 1. create_community -------------------------------------------------
    write("create_community", ["general", "General", RULES_V1])

    # --- 2. get_community ----------------------------------------------------
    community = call("get_community", ["general"])
    ok = community.get("version") == 1 and "R1" in community.get("rules_text", "")
    record("get_community", "read", f"version={community.get('version')}", ok=ok)
    if not ok:
        failed.append("get_community:content")

    # --- 3. update_rules (version must bump 1 -> 2) ---------------------------
    write("update_rules", ["general", RULES_V2])
    community = call("get_community", ["general"])
    ok = community.get("version") == 2 and "R6" in community.get("rules_text", "")
    record("update_rules:verify", "read", f"version={community.get('version')}", ok=ok)
    if not ok:
        failed.append("update_rules:content")

    # --- 4. report_content (with screenshot evidence pair) --------------------------
    # Neutral vision fixture: byte-identical on host (verified), so the vision
    # path analyzes a real image while verdicts stay text-driven.
    _ev_url = "https://files.catbox.moe/bhbinv.png"
    _ev_hash = "e07cd6f1a47cb760b7710002562aa8dba691b73ae4a080b5b806471798241552"
    _ev_text = "I disagree with your proposal because the budget numbers look wrong."
    # example.com: ultra-stable fixture proving the source-fetch path runs.
    _src_url = "https://example.com"
    write("report_content", ["general", _ev_text,
                             "alice", "forum post, no prior strikes",
                             _ev_url, _ev_hash, _src_url])

    # --- 5. list_cases ---------------------------------------------------------
    cases = call("list_cases", ["general", 20])
    ok = isinstance(cases, list) and len(cases) == 1 and cases[0].get("case_id") == "general-1"
    record("list_cases", "read", f"count={len(cases) if isinstance(cases, list) else '?'}", ok=ok)
    if not ok:
        raise SystemExit("cannot continue without case general-1")

    # --- 6. moderate_case with DIRECT image bytes (qwik pattern) --------------------
    # No fetch involved: identical calldata on every node. This is the primary
    # evidence path going forward.
    with open(HERE / "tests" / "fixtures" / "neutral.png", "rb") as f:
        _img = f.read()
    write("moderate_case", ["general-1", _img])

    # --- 7. get_case (poll past latest-nonfinal lag) ----------------------------------
    case = None
    for _ in range(15):
        try:
            case = call("get_case", ["general-1"])
        except Exception:
            pass
        else:
            if case.get("status") == "DECIDED":
                break
        time.sleep(10)
    case = case or {}
    ok = (case.get("status") == "DECIDED"
          and case.get("verdict") in ("ALLOW", "WARN", "REMOVE", "BAN", "ESCALATE")
          and case.get("rules_version") == 2
          and case.get("evidence_url") == _ev_url
          and case.get("evidence_hash") == _ev_hash
          and case.get("source_url") == _src_url)
    record("get_case", "read",
           f"verdict={case.get('verdict')} severity={case.get('severity')} rules_v={case.get('rules_version')}",
           ok=ok)
    if not ok:
        failed.append("get_case:content")

    # --- 8. appeal_case via URL-fetch fallback (empty bytes) -------------------------
    # Proves the fallback still works when the moderator has no local bytes.
    write("appeal_case", ["general-1",
                          "This was civil disagreement about budgets, please re-check against R5.",
                          b""])
    appealed = None
    for _ in range(15):
        try:
            appealed = call("get_case", ["general-1"])
        except Exception:
            pass
        else:
            if appealed.get("appeal_count") == 1:
                break
        time.sleep(10)
    appealed = appealed or {}
    ok = appealed.get("appeal_count") == 1 and appealed.get("status") == "DECIDED"
    record("appeal_case:verify", "read", f"appeals={appealed.get('appeal_count')}", ok=ok)
    if not ok:
        failed.append("appeal_case:content")

    # --- 9. list_communities (on-chain registry) ----------------------------------
    comms = call("list_communities", [20])
    ok = (isinstance(comms, list) and len(comms) == 1
          and comms[0].get("community_id") == "general" and comms[0].get("version") == 2)
    record("list_communities", "read", f"count={len(comms) if isinstance(comms, list) else '?'}", ok=ok)
    if not ok:
        failed.append("list_communities:content")

    # --- 10. list_communities_by_admin (ownership from the contract) ---------------
    mine = call("list_communities_by_admin", [community.get("admin")])
    ok = isinstance(mine, list) and "general" in mine
    record("list_communities_by_admin", "read", f"owned={mine}", ok=ok)
    if not ok:
        failed.append("list_communities_by_admin:content")
    stranger = call("list_communities_by_admin", ["0x0000000000000000000000000000000000000000"])
    ok = isinstance(stranger, list) and len(stranger) == 0
    record("list_communities_by_admin:empty", "read", f"owned={stranger}", ok=ok)
    if not ok:
        failed.append("list_communities_by_admin:empty-content")

    # --- coverage audit vs on-chain schema -----------------------------------------
    schema = client.get_contract_schema(address)
    onchain = {m["name"] if isinstance(m, dict) else m for m in schema.get("methods", [])} \
        if isinstance(schema, dict) else set()
    missing = EXPECTED_METHODS - covered
    extra = onchain - EXPECTED_METHODS
    stale = EXPECTED_METHODS - onchain
    print("\n--- coverage ---")
    print("covered :", sorted(covered))
    print("onchain :", sorted(onchain))
    if missing:
        print("NEVER CALLED:", sorted(missing))
        failed.append("coverage:missing")
    if stale:
        print("EXPECTED BUT NOT ONCHAIN:", sorted(stale))
        failed.append("coverage:stale")
    if extra:
        print("ONCHAIN BUT NOT IN SWEEP:", sorted(extra))
        failed.append("coverage:extra")

    print("\n--- results ---")
    for method, kind, note in results:
        print(f"  [{kind:5}] {method:18} {note}")
    if failed:
        print("\nFAILED:", failed)
        raise SystemExit(1)
    print("\nALL 10 METHODS EXERCISED AND VERIFIED")


if __name__ == "__main__":
    main()
