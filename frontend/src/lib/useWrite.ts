import { useCallback, useRef, useState } from "react";
import { explorerTx } from "../config";
import { invalidateReads, waitExecuted } from "./api";
import { signerFor } from "./chain";
import { useAccount } from "./account";

export type WritePhase = "idle" | "signing" | "waiting" | "done" | "error";

export interface WriteState {
  phase: WritePhase;
  hash: string | null;
  error: string | null;
}

/**
 * Submit a write, wait for FINALIZED, verify contract execution.
 * LLM verdicts (moderate/appeal) take minutes — the UI says so honestly.
 */
export function useWrite() {
  const { address, kind } = useAccount();
  const [state, setState] = useState<WriteState>({ phase: "idle", hash: null, error: null });
  // Hook-level double-submit guard: buttons also disable via `busy`, but a
  // keyboard/double-click race must never produce two transactions.
  const busyRef = useRef(false);

  const submit = useCallback(
    async (fn: (signer: unknown) => Promise<`0x${string}`>) => {
      if (!address || !kind) {
        setState({ phase: "error", hash: null, error: "Connect a wallet or the dev key first." });
        return null;
      }
      if (busyRef.current) return null;
      busyRef.current = true;
      setState({ phase: "signing", hash: null, error: null });
      try {
        const signer = await signerFor(kind, address);
        const hash = await fn(signer);
        setState({ phase: "waiting", hash, error: null });
        const res = await waitExecuted(hash);
        if (!res.ok) {
          setState({ phase: "error", hash, error: res.detail ?? "The contract did not complete." });
          return null;
        }
        setState({ phase: "done", hash, error: null });
        invalidateReads(); // a finalized write must never leave a stale screen
        return hash;
      } catch (e) {
        setState({ phase: "error", hash: null, error: e instanceof Error ? e.message : String(e) });
        return null;
      } finally {
        busyRef.current = false;
      }
    },
    [address, kind],
  );

  const reset = useCallback(() => setState({ phase: "idle", hash: null, error: null }), []);
  const busy = state.phase === "signing" || state.phase === "waiting";
  return { state, submit, reset, busy, explorer: state.hash ? explorerTx(state.hash) : null };
}
