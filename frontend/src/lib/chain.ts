/**
 * GenLayer client + accounts.
 *
 * Reads never need an account. Writes need a signer, from either:
 *  - a browser wallet (EIP-1193: eth_requestAccounts, then switch to StudioNet), or
 *  - the local development key (VITE_DEV_ACCOUNT_KEY) — a browser-exposed dev
 *    key for local demos only, never for anything holding real funds.
 *
 * Adapted from the proven ai-notary frontend (genlayer-js 1.x, StudioNet):
 * writes go through eth_sendTransaction on the injected provider, and the dev
 * account is created with genlayer-js createAccount. The UI always states
 * plainly which kind of account is signing.
 */

import { createAccount, createClient } from "genlayer-js";
import { RPC_URL, chain } from "../config";

type Provider = {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
};

function injected(): Provider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: Provider }).ethereum;
  return eth && typeof eth.request === "function" ? eth : null;
}

export const client = createClient({ chain, endpoint: RPC_URL });

const CHAIN_ID_HEX = `0x${chain.id.toString(16)}`;

export async function connectBrowser(): Promise<string> {
  const p = injected();
  if (!p) throw new Error("No browser wallet detected. Install MetaMask or Rabby.");
  let accounts: string[];
  try {
    accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  } catch {
    throw new Error("Connection declined. Nothing was connected.");
  }
  if (!accounts?.length) throw new Error("The wallet returned no account.");
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await p.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_ID_HEX,
            chainName: chain.name,
            rpcUrls: [RPC_URL],
            nativeCurrency: chain.nativeCurrency,
            blockExplorerUrls: ["https://explorer-studio.genlayer.com"],
          },
        ],
      });
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } else {
      throw err;
    }
  }
  // genlayer-js reads senderAccount.address — it must be an object, never a string.
  (client as unknown as { account: { address: string } }).account = { address: accounts[0] };
  return accounts[0];
}

let cachedDev: unknown = null;

export function hasDevKey(): boolean {
  const v = import.meta.env.VITE_DEV_ACCOUNT_KEY;
  return Boolean(v && v.length > 0);
}

export async function connectDev(): Promise<string> {
  const key = import.meta.env.VITE_DEV_ACCOUNT_KEY as string | undefined;
  if (!key) throw new Error("Set VITE_DEV_ACCOUNT_KEY to use the local development account.");
  if (!cachedDev) cachedDev = createAccount(key as `0x${string}`);
  const address = (cachedDev as { address?: string }).address;
  if (!address) throw new Error("The development account has no address.");
  (client as unknown as { account: unknown }).account = cachedDev;
  return address;
}

/** The signer object to hand to writeContract, matching the connected kind. */
export async function signerFor(kind: "browser" | "dev", address: string): Promise<unknown> {
  if (kind === "dev") {
    if (!cachedDev) await connectDev();
    return cachedDev;
  }
  return { address };
}
