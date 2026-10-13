import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Label, Textarea } from "../components/ui/field";
import { createCommunity, getCommunity, listCommunitiesByAdmin, updateRules } from "../lib/api";
import { useAccount } from "../lib/account";
import { useWrite } from "../lib/useWrite";

export function Admin() {
  const { address } = useAccount();
  const { state, submit, busy, explorer } = useWrite();
  const [cid, setCid] = useState("");
  const [name, setName] = useState("");
  const [rules, setRules] = useState("");
  const [target, setTarget] = useState("");
  const [newRules, setNewRules] = useState("");
  const [version, setVersion] = useState<number | null>(null);
  const [owned, setOwned] = useState<string[] | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // Ownership comes from the contract itself: one read answers
  // "which communities does this wallet admin?" — no localStorage,
  // no probing, nothing to drift. Non-owned ids never appear here.
  useEffect(() => {
    if (!address) {
      setOwned(null);
      return;
    }
    let live = true;
    listCommunitiesByAdmin(address)
      .then((ids) => live && setOwned(ids))
      .catch(() => live && setOwned([]));
    return () => {
      live = false;
    };
  }, [address]);

  // Keep the selected target valid and show its on-chain version.
  useEffect(() => {
    if (owned && target && !owned.includes(target)) setTarget("");
  }, [owned, target]);
  useEffect(() => {
    const t = target.trim();
    if (!t) {
      setVersion(null);
      return;
    }
    let live = true;
    getCommunity(t)
      .then((c) => live && setVersion(c.version))
      .catch(() => live && setVersion(null));
    return () => {
      live = false;
    };
  }, [target]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl uppercase tracking-tight">Manage rulebooks</h1>
      <p className="mt-1 text-sm opacity-70">
        Rulebooks are versioned on-chain. Updating rules bumps the version — past verdicts keep
        citing the version they were judged under. Only the community admin (its creator) can update.
      </p>
      {!address && (
        <p className="mt-4 rounded-xl border border-gavel-deep/40 bg-gavel/10 p-3 text-sm">
          Connect a wallet or the dev key to write. The admin check happens in the contract, so a
          non-admin update fails with its reason shown.
        </p>
      )}

      <Card className="mt-6 space-y-4">
        <h2 className="font-bold">Create community</h2>
        <div>
          <Label>Community id (unique, max 64 chars)</Label>
          <Input value={cid} onChange={(e) => setCid(e.target.value)} placeholder="e.g. book-club" maxLength={64} />
        </div>
        <div>
          <Label>Display name (max 128)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Book Club" maxLength={128} />
        </div>
        <div>
          <Label>Rules (min 20 chars — give each an R-number id)</Label>
          <Textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            placeholder={"R1 - …\nR2 - …"}
            maxLength={12000}
          />
        </div>
        <Button
          disabled={busy || !address}
          onClick={() =>
            void submit((s) => createCommunity(s, cid.trim(), name.trim(), rules.trim())).then(
              (hash) => {
                if (hash) {
                  setTarget(cid.trim());
                  setOwned((prev) => (prev && !prev.includes(cid.trim()) ? [...prev, cid.trim()] : prev));
                  setCreated(cid.trim());
                  setCid("");
                  setName("");
                  setRules("");
                }
              },
            )
          }
        >
          {state.phase === "signing"
            ? "Confirm in your wallet…"
            : state.phase === "waiting"
              ? "Writing — waiting for FINALIZED…"
              : "Create"}
        </Button>
      </Card>

      <Card className="mt-4 space-y-4">
        <h2 className="font-bold">Update rules</h2>
        <div>
          <Label>My communities (this wallet is admin)</Label>
          {!address ? (
            <p className="text-sm opacity-60">Connect first — ownership is checked per wallet.</p>
          ) : owned === null ? (
            <p className="text-sm opacity-60">Checking ownership on-chain…</p>
          ) : owned.length === 0 ? (
            <p className="rounded-xl border border-dashed border-court/30 p-3 text-sm opacity-60">
              Empty — this wallet admins no community yet. Create one above and it appears here.
            </p>
          ) : (
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-xl border border-court/25 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-gavel-deep"
            >
              <option value="">Select a community…</option>
              {owned.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          {target && (
            <p className="mt-1.5 text-xs font-bold text-emerald-800">
              You are the admin — updates will apply.
            </p>
          )}
        </div>
        <div>
          <Label>New full rulebook (min 20 chars)</Label>
          <Textarea value={newRules} onChange={(e) => setNewRules(e.target.value)} maxLength={12000} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || !address || !target}
            onClick={() =>
              void submit((s) => updateRules(s, target.trim(), newRules.trim())).then((hash) => {
                if (hash) {
                  setNewRules("");
                  // Re-read so the on-chain version label reflects the bump.
                  getCommunity(target.trim())
                    .then((c) => setVersion(c.version))
                    .catch(() => undefined);
                }
              })
            }
          >
            {state.phase === "signing"
              ? "Confirm in your wallet…"
              : state.phase === "waiting"
                ? "Writing — waiting for FINALIZED…"
                : "Publish new version"}
          </Button>
          {version !== null && (
            <span className="font-mono text-sm opacity-70">on-chain v{version}</span>
          )}
        </div>
      </Card>

      {state.phase === "error" && (
        <p className="mt-4 rounded-xl border border-red-800/30 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {state.phase === "done" && (
        <p className="mt-4 rounded-xl border border-emerald-800/30 bg-emerald-50 p-3 text-sm text-emerald-900">
          Applied and finalized.{" "}
          {explorer && (
            <a href={explorer} target="_blank" rel="noreferrer" className="font-mono underline">
              View transaction
            </a>
          )}
        </p>
      )}
      {created && state.phase !== "signing" && state.phase !== "waiting" && (
        <Card className="mt-4 flex flex-wrap items-center gap-3 border-gavel-deep/40 bg-gavel/10">
          <p className="grow text-sm">
            <code className="font-mono font-bold">{created}</code> is live on-chain — your
            rulebook, your court.
          </p>
          <Link
            to={`/communities?cid=${encodeURIComponent(created)}`}
            className="inline-flex items-center gap-1 rounded-full border border-court bg-gavel px-5 py-2.5 text-sm font-bold transition hover:bg-court hover:text-parchment"
          >
            See my community <ArrowRight size={14} />
          </Link>
        </Card>
      )}
    </div>
  );
}
