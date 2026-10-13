/**
 * Deployment configuration — StudioNet only.
 *
 * The contract address defaults to the OpenGavel deployment verified by the
 * red-team sweep, so a fresh checkout works. Override per environment with
 * VITE_CONTRACT_ADDRESS. Nothing else in the app hardcodes an address.
 */

import { chains } from "genlayer-js";

function env(key: string): string | undefined {
  const v = import.meta.env[key];
  return v && v.length > 0 ? v : undefined;
}

export const chain = chains.studionet;

export const RPC_URL = env("VITE_GENLAYER_RPC") ?? chain.rpcUrls.default.http[0];

/** Verified working StudioNet explorer (serves /address/<addr> and /tx/<hash>). */
export const EXPLORER_URL = (
  env("VITE_GENLAYER_EXPLORER") ?? "https://explorer-studio.genlayer.com"
).replace(/\/+$/, "");

export const CONTRACT_ADDRESS = (env("VITE_CONTRACT_ADDRESS") ??
  "0x9dc9ef2DDa9bC9746Cfe4ced299610F43d474863") as `0x${string}`;

export const ZERO = "0x0000000000000000000000000000000000000000";

export function explorerTx(hash: string): string {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

export function contractsConfigured(): boolean {
  return CONTRACT_ADDRESS !== ZERO;
}
