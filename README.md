# OpenGavel — Fair and Transparent Moderation

A GenLayer Intelligent Contract that arbitrates community moderation through
decentralized AI-validator consensus, plus a React dApp to use it. No single
admin, no single AI: a leader proposes a verdict, independent validators
re-judge the same content **and screenshot evidence**, and only agreement is
stored on-chain — with the reasoning, the rule cited, and the rules version.

**Network:** GenLayer StudioNet only (`chainId 61999`, gasless).

## Live deployment (contract v4, vision evidence)

| | |
|---|---|
| Contract | `OpenGavel` |
| Address | `0x13A6D9439963bac9Baf891c5e9660A9E6DaCf1b6` |
| Methods | 10 (5 write + 5 view) |
| History | `deployed-opengavel-v1/v2/v3.json` (immutable predecessors) |

## How a verdict happens

```
report_content (text + screenshot URL + SHA-256)
        │  evidence pinned on-chain, image stays off-chain
        ▼
moderate_case ── leader fetches evidence bytes → vision LLM judges image + text
        │         validators independently re-fetch + re-judge
        │         verdict / rule / severity must agree (±1 on severity)
        ▼
   DECIDED with full evidence trail (content, screenshot, hash, rule, reasoning, version)
        │
        ▼
appeal_case (max 3, each re-runs full consensus with your reason attached)
```

## Project layout

```
contracts/opengavel.py            the Intelligent Contract (pinned GenVM runner)
scripts/deploy_opengavel.py       deploy with the shared dev wallet (reads D:\Genlayer-project\wallet\.env at runtime)
scripts/test_all_opengavel_methods.py   10-method sweep, coverage diffed vs on-chain schema
scripts/test_redteam_opengavel.py       adversarial sweep (guards + content + appeals)
tests/integration/test_opengavel.py     gltest lifecycle test
frontend/                         Vite + React + TS + Tailwind dApp (report, verdicts, appeals, admin)
AGENT.md                          full activity log + roadmap + locked rules
```

## Run it

```bash
# contract checks (always lint before anything else)
genvm-lint check contracts/opengavel.py

# frontend (dev key enables writes locally; never set it in production)
cd frontend && npm install && npm run dev
# VITE_DEV_ACCOUNT_KEY=0x...   # local demo only
```

## Deploy the frontend (Vercel)

1. Import this repo, set **Root Directory to `frontend`**.
2. No environment variables required — the build defaults to the deployment above.
3. Never set `VITE_DEV_ACCOUNT_KEY` on a deployment. Reads work keyless.

Optional overrides: `VITE_CONTRACT_ADDRESS`, `VITE_GENLAYER_RPC`.

## Testing philosophy

Lean on-chain footprint: iterate logic off-chain (lint, direct tests, localnet),
touch StudioNet only for final validation with targeted transactions. No repeat
full sweeps, no spam — the registry is append-only and every test case stays
visible forever.

## License

MIT — see [LICENSE](LICENSE).
