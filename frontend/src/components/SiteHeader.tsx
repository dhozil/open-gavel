import { Link } from "react-router-dom";
import { Gavel, Scale, Wallet } from "lucide-react";
import { useAccount } from "../lib/account";
import { explorerAddress } from "../config";
import { Button } from "./ui/button";

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/communities", label: "Communities" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/report", label: "Report" },
  { to: "/admin", label: "Manage" },
];

export function SiteHeader() {
  const { address, kind, connecting, error, canUseDev, connect, disconnect } = useAccount();
  return (
    <header className="sticky top-0 z-40 border-b border-court/15 bg-parchment/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-display text-lg uppercase tracking-tight">
          <span className="grid size-8 place-items-center rounded-full bg-gavel text-court">
            <Gavel size={16} />
          </span>
          OpenGavel
        </Link>
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="rounded-full px-3 py-1.5 text-sm font-semibold opacity-70 transition hover:bg-court hover:text-parchment hover:opacity-100"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {address ? (
            <>
              <a
                href={explorerAddress(address)}
                target="_blank"
                rel="noreferrer"
                className="hidden max-w-40 truncate rounded-full border border-court/25 px-3 py-1.5 font-mono text-xs sm:block"
                title={address}
              >
                {kind === "dev" ? "dev · " : ""}
                {address.slice(0, 6)}…{address.slice(-4)}
              </a>
              <Button variant="outline" onClick={disconnect} className="px-4 py-1.5">
                Disconnect
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => void connect("browser")}
                disabled={connecting}
                className="px-4 py-1.5"
              >
                <Wallet size={14} /> Connect
              </Button>
              {canUseDev && (
                <Button onClick={() => void connect("dev")} disabled={connecting} className="px-4 py-1.5">
                  Use dev key
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {error && <p className="border-t border-red-800/30 bg-red-50 px-4 py-1.5 text-center text-xs text-red-800">{error}</p>}
      {/* Mobile nav: the desktop row is hidden below md, so this keeps every page reachable. */}
      <nav className="flex gap-1 overflow-x-auto border-t border-court/10 px-4 py-1.5 md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            className="shrink-0 rounded-full px-3 py-1 text-xs font-bold opacity-70 hover:bg-court hover:text-parchment hover:opacity-100"
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <p className="hidden items-center justify-center gap-1 border-t border-court/10 px-4 py-1 text-center text-[11px] opacity-60 md:flex">
        <Scale size={11} /> StudioNet · every verdict carries its evidence trail — content, rule cited, reasoning, version
      </p>
    </header>
  );
}
