import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input, Label, Textarea } from "../components/ui/field";
import { compressEvidence, listCases, moderateCase, reportContent, sha256Hex, uploadEvidence } from "../lib/api";
import { useAccount } from "../lib/account";
import { useWrite } from "../lib/useWrite";

export function Report() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { address } = useAccount();
  const { state, submit, busy, explorer } = useWrite();
  const [communityId, setCommunityId] = useState(() => searchParams.get("cid")?.trim() ?? "general");
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [context, setContext] = useState("");
  const [step, setStep] = useState<"report" | "moderate" | "done">("report");
  const [filedId, setFiledId] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [evUrl, setEvUrl] = useState("");
  const [evHash, setEvHash] = useState("");
  const [evBusy, setEvBusy] = useState(false);
  const [evError, setEvError] = useState<string | null>(null);
  const [evPreview, setEvPreview] = useState<string | null>(null);
  const [evTypeWarn, setEvTypeWarn] = useState<string | null>(null);
  const [srcUrl, setSrcUrl] = useState("");
  const [srcWarn, setSrcWarn] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  // Compressed bytes held for Step 2: the moderator (often you, right here)
  // sends them straight with moderate_case — zero hosts, zero fetching.
  const [evBytes, setEvBytes] = useState<Uint8Array | null>(null);

  // Deep link (?cid=…) from a community or case page wins over the default.
  useEffect(() => {
    const cid = searchParams.get("cid")?.trim();
    if (cid) setCommunityId(cid);
  }, [searchParams]);

  // Screenshot evidence: compress in-browser (qwik pattern), hash the EXACT
  // bytes that will be sent, then upload for public display. Upload failure
  // never blocks consensus — the bytes travel with the verdict call itself.
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setLastFile(f);
    if (!f.type.startsWith("image/")) {
      setEvError("Only image files (PNG/JPG screenshots).");
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setEvError("Max 8 MB per screenshot.");
      return;
    }
    setEvBusy(true);
    setEvError(null);
    try {
      const bytes = await compressEvidence(f);
      setEvBytes(bytes);
      const hash = await sha256Hex(bytes.buffer as ArrayBuffer);
      setEvPreview(URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "image/jpeg" })));
      setEvHash(hash);
      try {
        setEvUrl(await uploadEvidence(new File([bytes.buffer as ArrayBuffer], "evidence.jpg", { type: "image/jpeg" })));
      } catch (e) {
        // Display upload failed: drop the pair (contract needs BOTH url+hash
        // or NEITHER) — the bytes still ride along to the verdict call, so
        // consensus analyzes the image; only the public pin is lost.
        setEvUrl("");
        setEvHash("");
        setEvError(
          `Display upload failed (${e instanceof Error ? e.message : String(e)}). ` +
          "You can still file: the image travels with your verdict request, it just won't be pinned for public audit.",
        );
      }
    } catch (e) {
      setEvError(e instanceof Error ? e.message : String(e));
    } finally {
      setEvBusy(false);
    }
  };

  // Manual URL check: validators analyze BYTES, so the link must serve an
  // actual image (post pages serve HTML and would break consensus). Social
  // posts work via their image CDN links (preview.redd.it, pbs.twimg.com,
  // fbcdn) — or screenshot first, which is sturdier (CDN links can expire
  // or sit behind login walls validators cannot pass).
  const checkEvUrl = async (url: string) => {
    const u = url.trim();
    setEvTypeWarn(null);
    if (!u) return;
    if (!/^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(u)) {
      setEvTypeWarn(
        "That does not look like a direct image link (post pages serve HTML, not pixels). " +
        "Use the image's own address (e.g. preview.redd.it, pbs.twimg.com, fbcdn) — or screenshot + upload above, which always works.",
      );
      return;
    }
    try {
      const res = await fetch(u, { method: "HEAD" });
      const ct = res.headers.get("content-type") ?? "";
      if (res.ok && ct && !ct.startsWith("image/")) {
        setEvTypeWarn(`That URL serves ${ct || "non-image content"}, not an image. Screenshot + upload instead.`);
      }
    } catch {
      // Host blocks browser checks (CORS) — allow it; consensus fetch may still succeed server-side.
    }
  };

  const fileReport = async (e: React.FormEvent) => {
    e.preventDefault();
    const src = srcUrl.trim();
    if (src) {
      if (src.length > 2000 || (!src.startsWith("http://") && !src.startsWith("https://"))) {
        setSrcWarn("Source must be an http(s) URL, max 2000 chars.");
        return;
      }
      setSrcWarn(null);
    }
    if (evUrl.trim() && !/^[0-9a-fA-F]{64}$/.test(evHash.trim())) {
      setEvError("Evidence URL needs its 64-hex SHA-256 (upload a file, or paste the hash).");
      return;
    }
    const hash = await submit((s) =>
      reportContent(s, communityId.trim(), content.trim(), author.trim() || "anonymous", context.trim(), evUrl.trim(), evHash.trim().toLowerCase(), src),
    );
    if (hash) {
      // Case ids are deterministic: community_id + global sequence. The newest
      // listing entry is the case just filed — read it rather than guessing.
      const list = await listCases(communityId.trim(), 1).catch(() => []);
      if (list.length > 0) setFiledId(list[0].case_id);
      setStep("moderate");
    }
  };

  // The report landed but the follow-up read failed (rate limit, blip): the
  // case exists on-chain, so offer a retry instead of stranding the user.
  const findFiledCase = async () => {
    setFinding(true);
    try {
      const list = await listCases(communityId.trim(), 1);
      if (list.length > 0) setFiledId(list[0].case_id);
    } finally {
      setFinding(false);
    }
  };

  const requestVerdict = async () => {
    if (!filedId) return;
    const hash = await submit((s) => moderateCase(s, filedId, evBytes ?? new Uint8Array(0)));
    if (hash) {
      setStep("done");
      navigate(`/case/${filedId}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10" id="report">
      <h1 className="font-display text-3xl uppercase tracking-tight">File a report</h1>
      <p className="mt-1 text-sm opacity-70">
        Step 1 files the content (frozen on-chain). Step 2 runs validator consensus — it takes
        minutes, and the reasoning is published with the verdict.
      </p>

      {!address && (
        <p className="mt-4 rounded-xl border border-gavel-deep/40 bg-gavel/10 p-3 text-sm">
          Connect a wallet or the dev key (top right) to file. Reads stay free without one.
        </p>
      )}

      {step === "report" && (
        <form onSubmit={(e) => void fileReport(e)} className="mt-6 space-y-4">
          <Card className="space-y-4">
            <div>
              <Label>Community id</Label>
              <Input value={communityId} onChange={(e) => setCommunityId(e.target.value)} required />
            </div>
            <div>
              <Label>Reported content</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                maxLength={8000}
                placeholder="Paste the exact content to be judged…"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Author (handle, max 128)</Label>
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="anonymous" maxLength={128} />
              </div>
              <div>
                <Label>Context (max 2000)</Label>
                <Input
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="channel, prior strikes…"
                  maxLength={2000}
                />
              </div>
            </div>
            <div>
              <Label>Screenshot evidence (proves it happened)</Label>
              <p className="-mt-1 mb-2 text-xs opacity-60">
                Reports without proof are just claims. Attach the real screenshot — it is hashed
                (SHA-256) in your browser and pinned on-chain, so an edited image can never match.
              </p>
              <input
                type="file"
                accept="image/*"
                disabled={evBusy || busy}
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  // reset so picking the SAME file again still fires onChange (retry path)
                  e.target.value = "";
                }}
                className="block w-full cursor-pointer rounded-xl border border-dashed border-court/30 bg-white px-3.5 py-2.5 text-sm file:mr-3 file:rounded-full file:border file:border-court file:bg-gavel file:px-3 file:py-1 file:text-xs file:font-bold"
              />
              {evBusy && <p className="mt-1.5 text-xs opacity-60">Hashing + uploading…</p>}
              {evPreview && (
                <div className="mt-2 flex items-start gap-3">
                  <img src={evPreview} alt="evidence preview" className="max-h-28 rounded-xl border border-court/20" />
                  <div className="min-w-0 text-xs">
                    <p className="break-all font-mono opacity-70">{evUrl || "…"}</p>
                    <p className="mt-1 break-all font-mono font-bold">sha256:{evHash || "…"}</p>
                  </div>
                </div>
              )}
              {evError && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <p className="w-full text-xs text-red-800">{evError}</p>
                  {lastFile && (
                    <Button
                      variant="outline"
                      disabled={evBusy}
                      onClick={() => void onFile(lastFile)}
                      className="px-4 py-1.5"
                    >
                      Retry upload
                    </Button>
                  )}
                </div>
              )}
              <div className="mt-2">
                <Label>…or paste a direct image URL + its SHA-256</Label>
                <p className="-mt-1 mb-2 text-xs opacity-60">
                  Post pages don't count — paste the image's own address (Reddit: preview.redd.it,
                  X: pbs.twimg.com/media/…, Facebook: fbcdn link). Screenshot + upload is sturdier:
                  CDN links can expire or hide behind logins.
                </p>
                <Input
                  value={evUrl}
                  onChange={(e) => setEvUrl(e.target.value)}
                  onBlur={(e) => void checkEvUrl(e.target.value)}
                  placeholder="https://…png"
                  maxLength={2000}
                />
                {evTypeWarn && <p className="mt-1.5 text-xs text-amber-800">{evTypeWarn}</p>}
                <Input
                  value={evHash}
                  onChange={(e) => setEvHash(e.target.value.trim())}
                  placeholder="64 hex chars"
                  maxLength={64}
                  className="mt-2 font-mono"
                />
              </div>
            </div>
            <div>
              <Label>Origin post link (optional — strengthens the case)</Label>
              <p className="-mt-1 mb-2 text-xs opacity-60">
                Link to the real post (Reddit thread, X post, forum page…). Validators try to
                read it live and weigh it with your words and screenshot — if it can't be
                fetched, the report is still judged on content + screenshot.
              </p>
              <Input
                value={srcUrl}
                onChange={(e) => setSrcUrl(e.target.value)}
                placeholder="https://reddit.com/r/…/comments/…"
                maxLength={2000}
              />
              {srcWarn && <p className="mt-1.5 text-xs text-red-800">{srcWarn}</p>}
            </div>
            <Button type="submit" disabled={busy || !address || evBusy}>
              {state.phase === "signing"
                ? "Confirm in your wallet…"
                : state.phase === "waiting"
                  ? "Filing on-chain — waiting for FINALIZED…"
                  : "Step 1 — File report"}
            </Button>
          </Card>
        </form>
      )}

      {step !== "report" && !filedId && (
        <Card className="mt-6">
          <p className="text-sm">
            Report landed on-chain, but the follow-up read failed — your case exists, this page
            just could not see its id yet.
          </p>
          <Button onClick={() => void findFiledCase()} disabled={finding} className="mt-3">
            {finding ? "Searching…" : "Find my case"}
          </Button>
        </Card>
      )}

      {step !== "report" && filedId && (
        <Card className="mt-6">
          <p className="text-sm">
            Filed as <code className="font-mono font-bold">{filedId}</code>. Now anyone — including
            you — can trigger the AI verdict.
          </p>
          <Button onClick={() => void requestVerdict()} disabled={busy} className="mt-3">
            {state.phase === "signing"
              ? "Confirm in your wallet…"
              : state.phase === "waiting"
                ? "Validators are judging — waiting for FINALIZED (minutes)…"
                : "Step 2 — Request AI verdict"}
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
          Transaction{" "}
          <a href={explorer} target="_blank" rel="noreferrer" className="font-mono underline">
            {state.hash?.slice(0, 10)}…
          </a>{" "}
          — wait for FINALIZED, then the case page shows the verdict.
        </p>
      )}
    </div>
  );
}
