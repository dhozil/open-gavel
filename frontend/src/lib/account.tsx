import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { connectBrowser, connectDev, hasDevKey } from "./chain";

export type AccountKind = "browser" | "dev";

interface AccountCtx {
  address: string | null;
  kind: AccountKind | null;
  connecting: boolean;
  error: string | null;
  canUseDev: boolean;
  connect: (kind: AccountKind) => Promise<void>;
  disconnect: () => void;
}

const Ctx = createContext<AccountCtx>({
  address: null,
  kind: null,
  connecting: false,
  error: null,
  canUseDev: false,
  connect: async () => undefined,
  disconnect: () => undefined,
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [kind, setKind] = useState<AccountKind | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async (k: AccountKind) => {
    setConnecting(true);
    setError(null);
    try {
      const addr = k === "dev" ? await connectDev() : await connectBrowser();
      setAddress(addr);
      setKind(k);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress(null);
    setKind(null);
    setError(null);
  }, []);

  return (
    <Ctx.Provider
      value={{ address, kind, connecting, error, canUseDev: hasDevKey(), connect, disconnect }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAccount(): AccountCtx {
  return useContext(Ctx);
}
