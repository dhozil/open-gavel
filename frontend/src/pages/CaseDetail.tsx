import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Quote, ScrollText, ShieldCheck } from "lucide-react";
import { Card, Badge } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label, Textarea } from "../components/ui/field";
import { SeverityMeter, VerdictBadge } from "../components/Verdict";
import { appealCase, getCase, getCommunity, listCases, moderateCase, verifyEvidence, type CaseDetail } from "../lib/api";
import { useAccount } from "../lib/account";
import { useWrite } from "../lib/useWrite";

export function CaseDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { address } = useAccount();
  const { state, submit, busy, explorer } = useWrite();
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [siblings, setSiblings] = useState<string[]>([]);

  const goBack = () => {
    // Prefer real history (came from a list); otherwise fall back to Communities.
    if (window.history.length > 1) navigate(-1);
    else navigate("/communities");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await getCase(id);
      setDetail(c);
      // Rules evolve; a verdict stays pinned to the version it was judged
      // under. Show both so staleness is visible, not hidden.
      getCommunity(c.community_id)
        .then((g) => setCurrentVersion(g.version))
        .catch(() => setCurrentVersion(null));
      // Sibling cases (newest-first) for prev/next browsing without leaving.
      listCases(c.community_id, 50)
        .then((l) => setSiblings(l.map((s) => s.case_id)))
        .catch(() => setSiblings([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAfter = async (hash: string | null, clearForm?: boolean) => {
    if (hash) {
      if (clearForm) setReason("");
      await load();
    }
  };

  if (loading) return <p className="mx-auto max-w-3xl px-4 py-10 text-sm opacity-60">Reading the chain…</p>;
  if (error || !detail)
    return <p className="mx-auto max-w-3xl px-4 py-10 text-sm text-red-800">{error ?? "Case not found."}</p>;

  const canAppeal = detail.status === "DECIDED" && detail.appeal_count < 3;
  const sibIdx = siblings.indexOf(detail.case_id);
  const newer = sibIdx > 0 ? siblings[sibIdx - 1] : null; // list is newest-first
  const older = sibIdx >= 0 && sibIdx < siblings.length - 1 ? siblings[sibIdx + 1] : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={goBack} className="px-4 py-1.5">
          <ArrowLeft size={14} /> Back
        </Button>
        <Link to="/communities" className="text-xs font-bold opacity-60 hover:underline">
          All communities
        </Link>
        <span className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            disabled={!newer}
            onClick={() => newer && navigate(`/case/${newer}`)}
            className="px-3 py-1.5"
            title={newer ? `Newer: ${newer}` : "No newer case"}
          >
            <ChevronLeft size={14} /> Newer
          </Button>
          <Button
            variant="ghost"
            disabled={!older}
            onClick={() => older && navigate(`/case/${older}`)}
            className="px-3 py-1.5"
            title={older ? `Older: ${older}` : "No older case"}
          >
            Older <ChevronRight size={14} />
          </Button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{detail.case_id}</h1>
        <Badge>{detail.status}</Badge>
        <VerdictBadge verdict={detail.verdict} />
        <SeverityMeter value={detail.severity} />
      </div>

      {/* Evidence trail — the whole point of OpenGavel */}
      <Card className="mt-6">
        <h2 className="flex items-center gap-2 font-bold">
          <Quote size={16} /> Reported content
        </h2>
        <blockquote className="mt-2 whitespace-pre-wrap rounded-xl bg-court/5 p-4 text-sm">
          {detail.content_text}
        </blockquote>
        <p className="mt-2 text-xs opacity-60">
          by {detail.author || "anonymous"}
          {detail.context ? ` · ${detail.context}` : ""}
        </p>
      </Card>

      <EvidencePanel url={detail.evidence_url} hash={detail.evidence_hash} />
      {detail.source_url && (
        <Card className="mt-4">
          <h2 className="text-sm font-bold">Origin post</h2>
          <a
            href={detail.source_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 break-all font-mono text-xs text-gavel-deep underline"
          >
            {detail.source_url}
          </a>
          <p className="mt-1 text-xs opacity-60">
            Validators attempted to read this live during consensus; if unreachable, the
            verdict rests on the reported content and screenshot above.
          </p>
        </Card>
      )}

      {detail.verdict ? (
        <Card className="mt-4 border-gavel-deep/40">
          <h2 className="flex items-center gap-2 font-bold">
            <ShieldCheck size={16} /> Verdict — evidence trail
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 font-bold opacity-60">Action</dt>
              <dd>{detail.action || "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 font-bold opacity-60">Rule cited</dt>
              <dd className="font-mono">{detail.violated_rule_id || "none (allowed)"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 font-bold opacity-60">Rules version</dt>
              <dd className="font-mono">
                v{detail.rules_version}
                {currentVersion !== null && currentVersion !== detail.rules_version && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                    judged under v{detail.rules_version}, current is v{currentVersion}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-32 shrink-0 font-bold opacity-60">Appeals used</dt>
              <dd className="font-mono">{detail.appeal_count}/3</dd>
            </div>
          </dl>
          <p className="mt-3 rounded-xl bg-gavel/10 p-3 text-sm italic">“{detail.reasoning}”</p>
          {detail.appeal_reason && (
            <p className="mt-2 text-xs opacity-70">Last appeal reason: {detail.appeal_reason}</p>
          )}
        </Card>
      ) : (
        <Card className="mt-4">
          <p className="text-sm">
            No verdict yet — this case is <b>{detail.status}</b>. Anyone can trigger validator
            consensus (takes minutes).
          </p>
          <Button
            className="mt-3"
            disabled={busy || !address}
            onClick={() => void submit((s) => moderateCase(s, detail.case_id)).then(refreshAfter)}
          >
            {state.phase === "signing"
              ? "Confirm in your wallet…"
              : state.phase === "waiting"
                ? "Validators are judging — waiting for FINALIZED (minutes)…"
                : "Request AI verdict"}
          </Button>
        </Card>
      )}

      {canAppeal && (
        <Card className="mt-4">
          <h2 className="flex items-center gap-2 font-bold">
            <ScrollText size={16} /> Appeal ({3 - detail.appeal_count} left)
          </h2>
          <p className="mt-1 text-xs opacity-70">
            Appeals re-run full consensus with your reason attached. A bogus appeal does not flip a
            sound verdict — it was tested.
          </p>
          <div className="mt-3">
            <Label>Appeal reason (min 10 chars, max 1000)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do the rules support overturning this?" maxLength={1000} />
          </div>
          <Button
            className="mt-3"
            disabled={busy || !address || reason.trim().length < 10}
            onClick={() =>
              void submit((s) => appealCase(s, detail.case_id, reason.trim())).then((h) =>
                refreshAfter(h, true),
              )
            }
          >
            {state.phase === "signing"
              ? "Confirm in your wallet…"
              : state.phase === "waiting"
                ? "Re-judging — waiting for FINALIZED (minutes)…"
                : "Submit appeal"}
          </Button>
        </Card>
      )}

      {state.phase === "error" && (
        <p className="mt-4 rounded-xl border border-red-800/30 bg-red-50 p-3 text-sm text-red-800">
          {state.error}
        </p>
      )}
      {explorer && (
        <p className="mt-3 text-xs opacity-70">
          <a href={explorer} target="_blank" rel="noreferrer" className="font-mono underline">
            View transaction
          </a>
        </p>
      )}
    </div>
  );
}

function EvidencePanel({ url, hash }: { url: string; hash: string }) {
  const [result, setResult] = useState<"idle" | "checking" | "match" | "mismatch" | "unreachable">("idle");
  if (!url) {
    return (
      <Card className="mt-4">
        <h2 className="text-sm font-bold">Screenshot evidence</h2>
        <p className="mt-1 text-sm opacity-60">
          None attached — text-only report. Judge the words as written.
        </p>
      </Card>
    );
  }
  return (
    <Card className="mt-4 border-gavel-deep/40">
      <h2 className="text-sm font-bold">Screenshot evidence (tamper-evident)</h2>
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt="screenshot evidence"
          className="mt-2 max-h-64 rounded-xl border border-court/20 transition hover:border-gavel-deep"
          loading="lazy"
        />
      </a>
      <p className="mt-2 break-all font-mono text-[11px] opacity-70">{url}</p>
      <p className="mt-1 break-all font-mono text-[11px] font-bold">sha256:{hash}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={result === "checking"}
          onClick={() => {
            setResult("checking");
            verifyEvidence(url, hash)
              .then(setResult)
              .catch(() => setResult("unreachable"));
          }}
          className="px-4 py-1.5"
        >
          {result === "checking" ? "Re-hashing…" : "Verify hash"}
        </Button>
        {result === "match" && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
            MATCH — bytes identical to report time
          </span>
        )}
        {result === "mismatch" && (
          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-900">
            MISMATCH — image was changed after reporting
          </span>
        )}
        {result === "unreachable" && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
            Host unreachable — could not re-hash (try opening the URL)
          </span>
        )}
      </div>
    </Card>
  );
}
