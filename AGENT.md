# AGENT.md — OpenGavel: Fair and Transparent Moderation (GenLayer)

> **Project name (locked): OpenGavel** — open arbitration gavel. Contract file `contracts/opengavel.py`, class `OpenGavel`, tests `tests/integration/test_opengavel.py`. All future contracts files follow the OpenGavel naming.

> **Wallet (locked):** ALL deploys and method tests MUST use the shared dev wallet in `D:\Genlayer-project\wallet` (address `0x88D0Fc097bE4cb773A695Db8e22F4CFb7f563848`, StudioNet gasless). Scripts read `GENLAYER_DEV_KEY` from `D:\Genlayer-project\wallet\.env` at runtime — never via argv, never logged, never committed. NEVER deploy/test with the CLI default account (`cpe-deploy`). Entry points: `scripts/deploy_opengavel.py` -> `deployed-opengavel.json`, then `scripts/test_all_opengavel_methods.py` (all 8 methods, coverage diffed vs on-chain schema).
> **Lean testing (locked per user 2026-10-13, after the exemplum scolding):** NO repeat full sweeps, NO spam volume. Iterate off-chain (lint, direct tests, localnet); touch StudioNet only for final validation with targeted transactions. The registry is append-only — every test case stays visible forever.
> **Prime directive:** ALWAYS follow official GenLayer docs patterns (`https://docs.genlayer.com/`) and the loaded skills (`genlayer-cli`, `write-contract`, `genvm-lint`, `integration-tests`). Do NOT invent custom consensus, storage, or validator patterns. When in doubt, re-read the docs before coding.

## 1. Project Summary

Build a GenLayer-based arbitration system for fair and transparent moderation decisions in online communities, ensuring unbiased and consistent enforcement of rules.

- Target: **communities** (Discord-like / forum / DAO). NOT games for now.
- Language: **full-English** (contract prompts, rules, reasoning, docs, code comments).
- Core value: neutral validator consensus replaces single-admin / single-AI moderation.

## 2. Key Decisions (locked)

1. Community-only scope for v1. Game real-time use-case deferred (latency + cost reasons).
2. Full-English prompts and rules.
3. Contract owns the verdict. Frontend/backend only collects reports and displays results.
4. Rules are versioned on-chain per community. Every case references `rules_version`.
5. Appeal is a first-class path (re-moderation transaction + `genlayer appeal <txHash>` support).
6. Structured verdict only. No open-ended free text as decision field.

## 3. GenLayer Compliance — MUST FOLLOW (do not drift)

Source of truth:
- `https://docs.genlayer.com/developers/intelligent-contracts/when-to-use-genlayer`
- `https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle`
- `https://docs.genlayer.com/developers/intelligent-contracts/first-contract`
- `https://docs.genlayer.com/understand-genlayer-protocol/typical-use-cases`
- Skills: `genlayer-cli`, `write-contract`, `genvm-lint`, `integration-tests`

Mandatory rules:
1. **Runner header pinned** on line 1 of every contract:
   `# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`
   FORBIDDEN: `py-genlayer:test`, `py-genlayer:latest`, unversioned `py-genlayer`.
2. **Contract shape:** `class X(gl.Contract)`, storage = class-level annotations only, `__init__` sets values only, public methods use `@gl.public.view` / `@gl.public.write`.
3. **Storage types only:** `TreeMap[K,V]`, `DynArray[T]`, `u256/i256`, `str`, `Address`, `@allow_storage @dataclass`. NEVER `list`, `dict`, bare `int` for money, or `Enum` in storage. Append new fields at END only.
4. **Equivalence principle:**
   - `strict_eq` ONLY for deterministic calls (RPC, stable API + `sort_keys=True`).
   - Moderation (LLM) MUST use custom `gl.vm.run_nondet_unsafe(leader_fn, validator_fn)`.
   - Validator MUST independently re-run the task and compare decision fields. NEVER trust leader output. NEVER schema-only validation.
   - Compare: `verdict` + `violated_rule_id` exact match, `severity` tolerance ±1, `reasoning` may differ. Gate: REMOVE/BAN vs ALLOW mismatch = reject.
   - `prompt_comparative` allowed for prototyping only; production = custom validator.
   - `prompt_non_comparative` FORBIDDEN for verdict/scoring decisions.
5. **Error classification:** use `[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, `[LLM_ERROR]` prefixes with `_handle_leader_error()` helper. Bare `Exception` forbidden; use `gl.vm.UserError`. LLM errors must disagree (force rotation), never agree.
6. **LLM resilience:** always `response_format="json"`, defensive JSON cleanup, key aliasing, aggressive numeric coercion, try/except around parsing.
7. **Agentic pattern:** for character/format rules (URLs, counts, hashtags), LLM generates Python checks + `spawn_sandbox(eval())` deterministically, then LLM judges with ground truth.
8. **Workflow order:** write contract -> `genvm-lint check` (must pass) -> direct-mode tests -> integration tests (`gltest -v -s`) -> deploy to studionet -> testnet-bradbury. NEVER deploy unlinted code.
9. **Boundary:** Frontend = UI/wallet/indexing/preview. Contract = verdict + enforcement + appeal. Evidence = stable on-chain inputs (content text + rules text + version). No private data validators cannot see.
10. **Framing:** use "evidence-based moderation / agreed arbitration primitive". NEVER claim legal court/judge.

## 4. Architecture

```
[Reporter UI] -> report_content(community_id, content_text, author, context)
[Admin UI]    -> create_community / update_rules (versioned)
[Contract]    -> moderate_case(case_id): LLM + validator consensus -> store Case
[Validators]  -> independent re-run + field comparison
[Public UI]   -> get_case / list_cases + reasoning + rules_version (transparency)
[Appeal UI]   -> appeal_case(case_id, reason) -> re-moderation
```

State model (v1):
- `Community { name: str, rules_text: str, version: u256, admin: Address, created_at: str }`
- `Case { community_id: str, content_text: str, author: str, context: str, status: str, verdict: str, violated_rule_id: str, severity: u256, action: str, reasoning: str, rules_version: u256, report_count: u256 }`
- `communities: TreeMap[str, Community]`, `cases: TreeMap[str, Case]`, `case_order: DynArray[str]`, `community_cases: TreeMap[str, DynArray[str]]` (or JSON index)
- Verdict enum as str: `ALLOW | WARN | REMOVE | BAN | ESCALATE`
- Status enum as str: `PENDING | DECIDED | APPEALED | FINAL`

Methods (v1):
- `__init__()` — no args (communities created post-deploy for flexibility)
- `create_community(community_id, name, rules_text)` — write
- `update_rules(community_id, new_rules_text)` — write, bumps version, admin-only
- `report_content(community_id, content_text, author, context)` — write, returns case_id
- `moderate_case(case_id)` — write, nondet LLM + custom validator, sets verdict/severity/action
- `appeal_case(case_id, appeal_reason)` — write, resets to APPEALED + re-runs moderation with appeal context
- `get_case(case_id)` — view
- `list_cases(community_id, limit)` — view
- `get_community(community_id)` — view

## 5. Equivalence Design (moderation-specific)

Leader output JSON:
`{"verdict": str, "violated_rule_id": str, "severity": 0-10, "action": str, "reasoning": str}`

Validator logic:
1. If leader is not `Return` -> `_handle_leader_error`.
2. Re-run same prompt independently.
3. Normalize (`verdict.upper().strip()`, `violated_rule_id.strip()`, coerce severity).
4. `verdict` must match exactly. `violated_rule_id` must match exactly (empty = empty).
5. Severity: gate if either 0 vs >0 mismatch on REMOVE/BAN boundary -> reject; else `abs(a-b) <= 1`.
6. `reasoning`/`action` text ignored for consensus (stored from leader only).

Prompt must include: community rules text + version, reported content, author context, appeal context if any, output JSON schema, instruction to be neutral and cite rule id.

## 6. Roadmap

- [x] Phase 0: docs research + fit analysis + architecture (2026-10-06)
- [x] Phase 1: scaffold + `contracts/opengavel.py` v1 (community, English)
- [x] Phase 2: `genvm-lint check` clean (ok=true, 8 methods: 5 write + 3 view, typecheck 0 errors 2026-10-06)
- [ ] Phase 3: direct-mode unit tests (validation, state transitions, admin guards)
- [x] Phase 4: integration tests on localnet/studionet (consensus agreement, appeal flow)
- [x] Phase 5: deploy studionet (gasless) + manual `call/write/receipt/schema` verification
- [x] Phase 6: frontend `frontend/` (Vite+React+TS+Tailwind v4+shadcn structure, report + case view + appeal + admin)
- Bradbury CANCELLED per user (2026-10-06): StudioNet only until production. Phase 7 dropped.
- [x] Phase 8 (2026-10-06): on-chain ownership registry — `community_ids` + `list_communities` + `list_communities_by_admin` in contract (v2). v1 record kept in `deployed-opengavel-v1.json`. Current deployment: `0xd41824f7142915714fB81F8db17944576a259F47` (10 methods: 5 write + 5 view). Frontend reads ownership/registry from the contract; `mine.ts` deleted.
- Future: reputation/strikes, multi-community automation, embeddings for similar-case search (`py-lib-genlayer-embeddings`), game-chat adapter (deferred)

## 7. Activity Log (append-only, newest at bottom)

- 2026-10-06: Read docs.genlayer.com root + typical-use-cases + first-contract + when-to-use-genlayer + equivalence-principle. Confirmed moderation = good fit (policy/rule evaluation + content assessment). Folder empty, no code yet.
- 2026-10-06: Created this AGENT.md per user request. Locked scope: option 1, community target, full-English. Next: scaffold contract v1.
- 2026-10-06: DEPLOYED + SWEEP PASSED on StudioNet with wallet 0x88D0Fc097bE4cb773A695Db8e22F4CFb7f563848. Contract `OpenGavel` at `0x1E5aB482B51bC88A99a4BfF4d52d803A89e3021d` (deploy tx `0xc3795a39dfa85ab5348b31b680b528cb08e914f1a5ff86d02b43929067346bea`, receipt status 1, schema 8 methods; see `deployed-opengavel.json`). All 8 methods exec=SUCCESS/FINALIZED: create_community, get_community (v1), update_rules (v1->v2, R6 present), report_content, list_cases (1, general-1), moderate_case (verdict ALLOW severity 0 rules_v 2 via real LLM consensus), get_case, appeal_case (appeals=1). Coverage audit clean in both directions.
- 2026-10-06: RED-TEAM SWEEP 44/45 on StudioNet (isolated `redteam` community, `scripts/test_redteam_opengavel.py`). All 15 deterministic guards PASS (duplicate/short/long inputs, non-admin update rejected, unknown community/case rejected, double-moderate + PENDING-appeal + short-reason + 4th-appeal rejected). LLM verdicts all plausible: hate slur BAN/R1/10, death-threat+doxx BAN/R2/10, spam REMOVE/R3/6, minor-sexual BAN/R4/10, civil ALLOW/0, insult WARN/R5/5. Bogus free-speech appeal did NOT flip hate BAN; appeal limit enforced (3 ok, 4th rejected). ONE artifact: `b4 moderate` tracked tx read exec=ERROR while on-chain state is correct DECIDED/BAN/R4/10 (verified via CLI get_case redteam-5, appeal_count 0) — a transient send-retry double-submitted and the tracked hash was the loser; guard `c1` proves the duplicate was correctly rejected. Harness patched to log tx hashes with every check. No contract change needed.
- 2026-10-06: FRONTEND BUILT in `frontend/` (Vite+React+TS+Tailwind v4, shadcn-style `/components/ui` + `@/` alias + `cn()`). Section 1 `OpenGavelHero` (skiper39 crowd canvas restyled parchment/ink + headline/CTAs; Section 2 mascot later removed per user, crowd gained talking bubbles instead), dApp (Landing/Communities/Report/CaseDetail/Admin + genlayer-js wiring copied from proven ai-notary patterns: browser EIP-1193 + VITE_DEV_ACCOUNT_KEY, write→FINALIZED→execution check, explorer-studio links). Real key NEVER in repo (only `.env.example` placeholder; dev runs `VITE_DEV_ACCOUNT_KEY` from wallet `.env`).
- 2026-10-06: CONTRACT v2 (ownership on-chain): `community_ids` registry + `list_communities` + `list_communities_by_admin`; deploy `0xd41824f7142915714fB81F8db17944576a259F47` (record in `deployed-opengavel-v2.json`); sweep 10/10, red-team 45/45; frontend ownership via contract, `mine.ts` deleted.
- 2026-10-13: GITHUB-READY: repo sterilized (no secrets/keys — wallet lives outside at `D:\Genlayer-project\wallet`; OG_READER_PW env-only throwaway), `.gitignore` (dist/node_modules/.env/keystores), `README.md` (live v4 address + Vercel notes), MIT `LICENSE`, `frontend/vercel.json` (SPA rewrites), template leftovers deleted (App.css, hero.png, react/vite.svg, icons.svg, Vite README replaced). Local commit `4c60e50` "OpenGavel: vision-evidence moderation contract v4 + dApp" (identity repo-local: dhozil). Vercel: import repo, Root Directory = `frontend`, NO env vars (defaults point at v4); never set VITE_DEV_ACCOUNT_KEY in prod.
- 2026-10-06: CONTRACT v3 — screenshot evidence (`Case` += url/hash, BOTH-or-NEITHER validation, prompt block, `get_case` returns both): deploy `0x9dc9ef2DDa9bC9746Cfe4ced299610F43d474863` (v2 record in `deployed-opengavel-v2.json`); sweep state-passed; red-team 56/56 inc. evidence guards a16-a20; frontend upload+hash+Verify; committee live = 5 validators (3 agree, 2 idle).
- 2026-10-13: CONTRACT v5 — origin-post evidence (user: postings must be machine-readable, image stays optional): `Case.source_url` (appended last), `report_content` 7th param with http(s)≤2000 validation, `_fetch_source_text` (opportunistic, never raises, tag-stripped ≤4000 chars; both sides converge on same fallback), prompt SOURCE section. Deploy `0x4708b9Ace6EE163cD2bF77bcDed5f81F33ACA3B6` (v4 record in `deployed-opengavel-v4.json`; v4 = vision `images=[bytes]` + fixture Catbox, sweep 10/10, mapping-bug lesson: numeric case-id sort). Sweep v5 10/10 (source fetch in consensus) + lean mini-probe 5/5 (`probe_source_guards.py`, `probegarden` community). NO full red-team rerun (lean rule; guards unchanged, red-team calls compat-updated + a21/a22 added for next run). Frontend: source input w/ validation, origin-post card on case page, config/footer/smoke → v5. Build clean + smoke OK.
- 2026-10-06: CONTRACT v4 — vision evidence (user proved docs: `images=[bytes]` image-processing): `_fetch_evidence_bytes` (web.get pinned URL, TRANSIENT/EXTERNAL classification, 3MB EXPECTED cap; PIL dropped — `io` forbidden by linter, downscale moved to frontend duty) + vision branch in `leader_fn` (same 5-field schema, unchanged validator). Fixture `https://files.catbox.moe/bhbinv.png` (sha256 `e07cd6f…414552`, byte-verified). Deploy `0x6fE52…976A04` (v3 record in `deployed-opengavel-v3.json`). Sweep 10/10 (vision ALLOW). Red-team: harness lexicographic-sort bug once misattributed 4 verdicts — fixed to numeric sort; all 6 vision verdicts re-read on-chain CORRECT (hate BAN/R1, threat BAN/10, spam REMOVE/R3 with reasoning citing image-vs-text, minor BAN/R4, civil ALLOW, insult REMOVE/R5) + pending-appeal guard proven via single tx (`[EXPECTED] Only DECIDED…`). Tooling note: CLI receipts need the throwaway `reader2` keystore + `OG_READER_PW` stdin pipe (old `reader` keystore went bad); receipt ~seconds when healthy — slowness was 45+ FINALIZED waits + 11 vision consensuses on a shared 30/min budget, not a bug.
- 2026-10-06: Section 2 REMOVED per user (too much scroll): `MascotPortfolioHero` usage + `mascot-portfolio-hero.tsx` deleted; hero flows straight into how-it-works + live record. Build still clean.
- 2026-10-06: Crowd redrawn per user (all 3 Gen Z vibes, code-drawn, zero external assets): `CrowdCanvas` rewritten to procedural walkers with leg-swing walk cycle, depth-scaled lanes, rAF loop (gsap dropped from this file), talking-bubble system. Props now `{ density, greetings }`. Build clean, preview 200.
- 2026-10-06: Crowd professionalism pass per user: varied tall/slim/broad bodies, 6 tops (hoodie/tee/jacket/puffer/varsity-G-patch/open flannel), 4 bottoms (baggy/cargo+cuffs/pleated skirt/shorts), 3 shoe styles + striped socks, 7 hairstyles (curtains/buns/swaying pony/buzz/messy/fringe/long), 4 hats (beanie/back-cap/bucket/snapback), faces (glint eye/brow/blush/smile), round glasses, hoops, layered bags (bouncing backpack/crossbody/tote), coffee cups, phone zombies with screen glow, rim-light + hem shading. Build clean.
- 2026-10-06: Courthouse plaza ground per user (zebra removed, seams evened per review — plain plaza, no light-bar confusion). Drawn under walkers each frame. Build clean.
- 2026-10-06: Pro anatomy rewrite per user critique (after studying frontend-design skill): real kinematic skeleton (hips/knees/pitching ankles, bent elbows, oriented mitten+thumb hands), one closed bezier torso silhouette with tone-on-tone definition + rim light instead of boxes, two-handed texting grip (phone actually held, thumbs on glass, head bowed, screen glow), finger-wrapped coffee cups, heel-strike/toe-off sneakers-boots-hightops, layered garments clipped inside the silhouette, forward lean (stronger for skaters), plus prefers-reduced-motion freeze. Critiqued: still flat-illustration by choice (matches court-poster art direction), no fake 3D. Build clean, preview 200.
- 2026-10-06: Hero REPLACED with user's gen-z-strides material (`D:\Genlayer-project\bahan simpan\gen-z-strides-main`): IK crowd renderer (2-bone legs, stance-locked feet, heel-to-toe roll, phone/skater-push/boombox-notes/office-briefcase/coffee/headphones kinds) integrated verbatim into `skiper39.tsx` (exports preserved, Landing untouched), `city-street.jpg` bundled (182KB, in dist), hero recomposed to material layout (photo + parchment gradient + density 24), dark `crowd-bubble` CSS in `index.css`. Old procedural renderer retired. Build clean, dist contains city-street, preview 200.
- 2026-10-06: Frontend audit + hardening per user: hook-level double-submit guard (`busyRef`, survives keyboard/double-click races), mobile nav row (desktop nav was md-hidden = dead end on phones), Landing distinguishes chain-error from empty, Report find-my-case retry (no stranded filings) + phase-aware labels (wallet-confirm vs FINALIZED-wait), CaseDetail clears appeal form + stale-rules badge (judged vX vs current vY) + appeal maxLength, Admin clears forms + refreshes version post-publish + contract-mirroring maxLengths everywhere. Build clean, preview 200.
- 2026-10-06: Favicon replaced with OpenGavel mark (`frontend/public/favicon.svg`): ink seal + gold coin + diagonal gavel. Ships in dist, build clean.
- 2026-10-06: Admin update-target is strictly owner-only per user: dropdown lists ONLY communities where the connected wallet is on-chain admin (resolved per candidate id at connect; non-owned ids never appear — empty state otherwise).
- 2026-10-13: Deployment history consolidated into `deployments.json` (per-version files removed; `deployed-opengavel.json` stays live pointer). Pushed to `github.com/dhozil/open-gavel`.
- 2026-10-13: Harness hardening (no re-run, lean rule): receipts via genlayer_py `get_transaction` (full consensus_data, zero CLI/keystore) after reader keystores kept breaking; `await_case` polling in red-team + sweep (latest-nonfinal lag once framed correct redteam4-7 verdict as empty); red-team community parameterized (`COMM` argv) + numeric case-id sort (lexicographic sort once misattributed 4 verdicts). v6 verdicts re-verified on-chain CORRECT (incl. image-vs-text fusion reasoning); pending-appeal guard proven via single tx. wallet is on-chain admin (resolved per candidate id at connect; non-owned ids never appear — empty state otherwise). Create stays manual. No custom-id path in edit; contract remains final enforcer.

## 8. Common Commands

```bash
genlayer network set studionet
genlayer network info
genlayer account
genlayer deploy --contract contracts/opengavel.py
genlayer call <address> get_case --args "case-1"
genlayer write <address> report_content --args "general" "hello world" "alice" "forum post"
genlayer receipt <txHash> --stdout --stderr
genlayer schema <address>
genlayer code <address>
genlayer appeal <txHash>
genvm-lint check contracts/opengavel.py --json
gltest tests/integration/ -v -s --network studionet
```

## 9. Resume Prompt (paste to continue session)

> Continue OpenGavel (Fair and Transparent Moderation) project. Read AGENT.md fully. Follow GenLayer docs patterns strictly (pinned runner, TreeMap/DynArray, custom run_nondet_unsafe validator with independent re-run, error prefixes, lint-before-test). Current phase: [update]. Do not drift from community + full-English scope without user approval.
