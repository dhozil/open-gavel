/**
 * Typed wrappers over the OpenGavel contract.
 *
 * Reads return decoded values and throw on failure. Writes return the tx hash;
 * callers must wait for FINALIZED and inspect execution_result before reporting
 * success — ACCEPTED/FINALIZED describe consensus, not contract execution.
 */

import { CONTRACT_ADDRESS } from "../config";
import { client } from "./chain";
import { cachedRead, invalidateReads, isRateLimit, rateLimitMessage, withRetry } from "./readCache";

export { invalidateReads, isRateLimit, rateLimitMessage };

type Addr = `0x${string}`;
const CONTRACT = CONTRACT_ADDRESS as Addr;

type Raw = Parameters<typeof client.readContract>[0]["args"];

export interface Community {
  community_id: string;
  name: string;
  rules_text: string;
  version: number;
  admin: string;
}

export interface CaseSummary {
  case_id: string;
  status: string;
  verdict: string;
  severity: number;
}

export interface CaseDetail {
  case_id: string;
  community_id: string;
  content_text: string;
  author: string;
  context: string;
  status: string;
  verdict: string;
  violated_rule_id: string;
  severity: number;
  action: string;
  reasoning: string;
  rules_version: number;
  appeal_reason: string;
  appeal_count: number;
  evidence_url: string;
  evidence_hash: string;
  source_url: string;
}

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  try {
    const value = await cachedRead([CONTRACT, functionName, args], () =>
      withRetry(() =>
        client.readContract({
          address: CONTRACT,
          functionName,
          args: args as Raw,
        }),
      ),
    );
    return value as unknown as T;
  } catch (e) {
    if (isRateLimit(e)) throw new Error(rateLimitMessage());
    throw e;
  }
}

export const getCommunity = (id: string) => read<Community>("get_community", [id]);
export const getCase = (id: string) => read<CaseDetail>("get_case", [id]);
export const listCases = (communityId: string, limit = 20) =>
  read<CaseSummary[]>("list_cases", [communityId, limit]);

export interface CommunitySummary {
  community_id: string;
  name: string;
  version: number;
}

/** Full on-chain registry, newest first — no hardcoded lists needed. */
export const listCommunities = (limit = 20) =>
  read<CommunitySummary[]>("list_communities", [limit]);

/** Ownership answered by the contract itself: ids where admin == address. */
export const listCommunitiesByAdmin = (admin: string) =>
  read<string[]>("list_communities_by_admin", [admin]);

export async function write(
  functionName: string,
  args: unknown[],
  account: unknown,
): Promise<`0x${string}`> {
  const hash = await client.writeContract({
    address: CONTRACT,
    functionName,
    args: args as Raw,
    value: 0n,
    account: account as never,
  });
  return hash as `0x${string}`;
}

interface LeaderReceipt {
  execution_result?: string;
  result?: { status?: string; payload?: unknown };
  genvm_result?: { stderr?: string; error_description?: string | null };
}

interface FullReceipt {
  status_name?: string;
  status?: string;
  consensus_data?: { leader_receipt?: LeaderReceipt[] };
}

/** Wait for FINALIZED, then report whether the contract body actually ran. */
export async function waitExecuted(hash: `0x${string}`): Promise<{ ok: boolean; detail: string | null }> {
  const receipt = (await client.waitForTransactionReceipt({
    hash: hash as Parameters<typeof client.waitForTransactionReceipt>[0]["hash"],
    // Cast: pins the literal so an SDK status-enum change surfaces at compile time.
    status: "FINALIZED" as Parameters<typeof client.waitForTransactionReceipt>[0]["status"],
    interval: 3000,
    retries: 120,
  })) as unknown as FullReceipt;

  if ((receipt.status_name ?? receipt.status)?.toUpperCase() === "UNDETERMINED") {
    return { ok: false, detail: "Validators could not reach consensus (UNDETERMINED). No state was written." };
  }
  const leader = receipt.consensus_data?.leader_receipt?.[0];
  if (!leader) return { ok: false, detail: "Receipt carries no execution result; treat as unverified." };
  const resultStatus = leader.result?.status;
  // Deterministic rejections arrive as rollback + tagged payload — surface the tag.
  if (resultStatus && resultStatus !== "return") {
    return { ok: false, detail: String(leader.result?.payload ?? resultStatus) };
  }
  if (leader.execution_result === "SUCCESS") return { ok: true, detail: null };
  const stderr = leader.genvm_result?.stderr?.trim();
  return { ok: false, detail: stderr || leader.genvm_result?.error_description || "The contract did not complete." };
}

export const createCommunity = (a: unknown, id: string, name: string, rules: string) =>
  write("create_community", [id, name, rules], a);
export const updateRules = (a: unknown, id: string, rules: string) =>
  write("update_rules", [id, rules], a);
export const reportContent = (
  a: unknown,
  communityId: string,
  content: string,
  author: string,
  context: string,
  evidenceUrl = "",
  evidenceHash = "",
  sourceUrl = "",
) => write("report_content", [communityId, content, author, context, evidenceUrl, evidenceHash, sourceUrl], a);

/** SHA-256 of bytes, hex-encoded — the tamper-evidence commitment. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Re-hash a fetched evidence URL and compare against the pinned hash. */
export async function verifyEvidence(
  url: string,
  pinned: string,
): Promise<"match" | "mismatch" | "unreachable"> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return "unreachable";
  }
  if (!res.ok) return "unreachable";
  const hash = await sha256Hex(await res.arrayBuffer());
  return hash.toLowerCase() === pinned.toLowerCase() ? "match" : "mismatch";
}

/** Anonymous no-key image hosts for screenshot evidence.
 *  Catbox first (permanent, content-deduped), uguu.se as fallback.
 *  Retries with backoff per host: file hosts occasionally reset connections
 *  or grey-list IPs, and a single host failing must never strand a report. */
async function tryCatbox(file: File): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", file);
  const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Catbox HTTP ${res.status}`);
  const url = (await res.text()).trim();
  if (!url.startsWith("https://")) throw new Error(`Catbox rejected: ${url.slice(0, 80)}`);
  return url;
}

async function tryUguu(file: File): Promise<string> {
  const form = new FormData();
  form.append("files[]", file, "evidence.png");
  const res = await fetch("https://uguu.se/upload.php", { method: "POST", body: form });
  if (!res.ok) throw new Error(`uguu.se HTTP ${res.status}`);
  const data = (await res.json()) as { success?: boolean; files?: Array<{ url?: string }> };
  const url = data?.files?.[0]?.url ?? "";
  if (!data?.success || !url.startsWith("https://")) throw new Error("uguu.se rejected the file");
  return url;
}

async function tryProxy(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk));
  }
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: btoa(binary), name: file.name || "evidence.jpg" }),
  });
  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url?.startsWith("https://")) {
    throw new Error(data.error ?? `Proxy HTTP ${res.status}`);
  }
  return data.url;
}

export async function uploadEvidence(file: File): Promise<string> {
  const hosts: Array<[string, (f: File) => Promise<string>]> = [
    ["Catbox", tryCatbox],
    ["uguu.se", tryUguu],
    ["OpenGavel proxy", tryProxy],
  ];
  const problems: string[] = [];
  for (const [name, fn] of hosts) {
    for (let i = 0; i < 2; i++) {
      try {
        return await fn(file);
      } catch (e) {
        problems.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
        await sleep(2000 * (i + 1));
      }
    }
  }
  throw new Error(
    `All upload hosts failed (${problems.join(" | ")}). ` +
    "Host the image anywhere public and paste its URL + SHA-256 below.",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const moderateCase = (a: unknown, caseId: string, image: Uint8Array = new Uint8Array(0)) =>
  write("moderate_case", [caseId, image], a);
export const appealCase = (a: unknown, caseId: string, reason: string, image: Uint8Array = new Uint8Array(0)) =>
  write("appeal_case", [caseId, reason, image], a);

/** Compress to a consensus-friendly JPEG (qwik pattern): max 1280px, fed back
 *  until under ~200KB. Returns the exact bytes to send (hash these, not the original). */
export async function compressEvidence(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable for compression.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  let quality = 0.82;
  for (let i = 0; i < 4; i++) {
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) throw new Error("Compression failed.");
    if (blob.size <= 200 * 1024 || quality <= 0.4) {
      return new Uint8Array(await blob.arrayBuffer());
    }
    quality -= 0.15;
  }
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.4));
  if (!blob) throw new Error("Compression failed.");
  return new Uint8Array(await blob.arrayBuffer());
}
