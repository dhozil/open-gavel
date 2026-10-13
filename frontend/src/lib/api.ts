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

/** Anonymous no-key image host for screenshot evidence (Catbox). */
export async function uploadEvidence(file: File): Promise<string> {
  const form = new FormData();
  form.append("reqtype", "fileupload");
  form.append("fileToUpload", file);
  const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}). Host the image anywhere public and paste its URL instead.`);
  const url = (await res.text()).trim();
  if (!url.startsWith("https://")) throw new Error(`Upload rejected: ${url.slice(0, 80)}`);
  return url;
}
export const moderateCase = (a: unknown, caseId: string) => write("moderate_case", [caseId], a);
export const appealCase = (a: unknown, caseId: string, reason: string) =>
  write("appeal_case", [caseId, reason], a);
