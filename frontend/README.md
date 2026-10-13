# OpenGavel frontend

Vite + React + TypeScript + Tailwind v4 dApp for the OpenGavel moderation
contract on GenLayer StudioNet. See the repo root [README](../README.md).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc + vite build -> dist/
```

Reads work keyless. Writes need a wallet (browser extension) or, for local
demos only, `VITE_DEV_ACCOUNT_KEY` in a local `.env` (see `.env.example`) —
never set it on a deployment.

## Deploy (Vercel)

Root Directory: `frontend`. No env vars required (defaults point at the live
contract). `vercel.json` handles SPA rewrites.
