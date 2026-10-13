import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, ArrowUpRight, BookOpen, Landmark, Scale, Search } from "lucide-react";
import { Card } from "../components/ui/card";
import { Input, Label } from "../components/ui/field";
import { SeverityMeter, VerdictBadge } from "../components/Verdict";
import {
  getCommunity,
  listCases,
  listCommunities,
  type CaseSummary,
  type Community,
  type CommunitySummary,
} from "../lib/api";
import { cn } from "../lib/utils";

/** Split a rulebook into citable rows: "R1 - …" becomes [R1 chip + text]. */
function parseRules(text: string): Array<{ id: string | null; text: string }> {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(R\d+)\s*[-–:.]?\s*(.*)$/);
      return m ? { id: m[1], text: m[2] || l } : { id: null, text: l };
    });
}

export function Communities() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [community, setCommunity] = useState<Community | null>(null);
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [registry, setRegistry] = useState<CommunitySummary[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  // On-chain registry: every community, no hardcoded list.
  // Deep link (?cid=…) opens a community straight away — e.g. right after creating it.
  useEffect(() => {
    let live = true;
    listCommunities(20)
      .then((r) => {
        if (!live) return;
        setRegistry(r);
        // Case counts for the directory cards (one cheap read each, cached).
        Promise.all(
          r.map((c) =>
            listCases(c.community_id, 100)
              .then((l) => [c.community_id, l.length] as const)
              .catch(() => [c.community_id, 0] as const),
          ),
        ).then((pairs) => {
          if (!live) return;
          setCounts(Object.fromEntries(pairs));
          const deep = searchParams.get("cid")?.trim();
          if (deep) void load(deep);
          else if (r.length > 0 && selected === null) void load(r[0].community_id);
        });
      })
      .catch(() => live && setRegistry([]));
    return () => {
      live = false;
    };
    // load-on-first-paint only; selection changes go through load().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (cid: string) => {
    const target = cid.trim();
    if (!target) return;
    setError(null);
    try {
      const [c, list] = await Promise.all([getCommunity(target), listCases(target, 20)]);
      setCommunity(c);
      setCases(list);
      setSelected(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCommunity(null);
      setCases(null);
    }
  };

  const totalCases = Object.values(counts).reduce((a, b) => a + b, 0);

  // Live name/id filter (client-side, zero RPC). Card density follows the
  // result count: few courts get the grand treatment, many get compact.
  const q = query.trim().toLowerCase();
  const filtered = (registry ?? []).filter(
    (c) => !q || c.name.toLowerCase().includes(q) || c.community_id.toLowerCase().includes(q),
  );
  const compact = filtered.length > 6;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Directory header */}
      <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-50">Directory</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-tight md:text-4xl">Communities</h1>
          <p className="mt-1 max-w-[60ch] text-sm opacity-70">
            Each community owns a versioned rulebook. Every verdict cites the version it was
            judged under — pick a court to inspect its law and its record.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-court/20 bg-white/60 px-3 py-1.5 text-xs font-bold">
            <Landmark size={13} /> {registry?.length ?? "…"} communities
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-court/20 bg-white/60 px-3 py-1.5 text-xs font-bold">
            <Scale size={13} /> {totalCases} cases on record
          </span>
        </div>
      </div>

      {/* Community court cards */}
      <div className="mt-4 flex gap-2">
        <div className="relative grow">
          <Search size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 opacity-50" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter courts by name or id…"
            className="pl-9"
          />
        </div>
        {q && (
          <span className="self-center whitespace-nowrap text-xs font-bold opacity-60">
            {filtered.length} match{filtered.length === 1 ? "" : "es"}
          </span>
        )}
      </div>
      <div className={cn("mt-4 grid gap-4", compact ? "md:grid-cols-3 xl:grid-cols-4" : "md:grid-cols-2")}>
        {filtered.map((c) => {
          const active = selected === c.community_id;
          return (
            <button
              key={c.community_id}
              type="button"
              onClick={() => void load(c.community_id)}
              className={cn(
                "group rounded-2xl border bg-white/70 text-left shadow-sm transition",
                compact ? "p-3" : "p-5",
                active
                  ? "border-gavel-deep shadow-md ring-2 ring-gavel/60"
                  : "border-court/20 hover:-translate-y-0.5 hover:border-gavel-deep hover:shadow-md",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] uppercase tracking-widest opacity-50">
                    {c.community_id}
                  </p>
                  <h2 className={cn("font-display uppercase leading-tight", compact ? "mt-0 text-base" : "mt-0.5 text-xl")}>{c.name}</h2>
                </div>
                <span className="shrink-0 rounded-full bg-gavel px-2 py-0.5 text-[11px] font-bold uppercase">
                  v{c.version}
                </span>
              </div>
              <div className={cn("flex items-center justify-between border-t border-court/10 text-xs", compact ? "mt-2 pt-2" : "mt-3 pt-3")}>
                <span className="font-bold opacity-70">
                  {counts[c.community_id] ?? "…"} {counts[c.community_id] === 1 ? "case" : "cases"}
                </span>
                <span className="inline-flex items-center gap-1 font-bold text-gavel-deep opacity-0 transition group-hover:opacity-100">
                  {active ? "Viewing" : "Open"} <ArrowUpRight size={13} />
                </span>
              </div>
            </button>
          );
        })}
        {registry !== null && filtered.length === 0 && (
          <p className="text-sm opacity-60">
            {registry.length === 0 ? "No communities on-chain yet." : `No court matches “${query.trim()}”.`}
          </p>
        )}
      </div>

      {error && <p className="mt-4 rounded-xl border border-red-800/30 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {/* Rulebook */}
      {community && (
        <Card className="mt-6 border-gavel-deep/30">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen size={16} />
            <h2 className="font-display text-xl uppercase">{community.name} — rulebook</h2>
            <span className="rounded-full bg-gavel px-2.5 py-0.5 text-[11px] font-bold uppercase">
              v{community.version} in force
            </span>
          </div>
          <ol className="mt-4 space-y-2">
            {parseRules(community.rules_text).map((r, i) => (
              <li key={i} className="flex gap-3 rounded-xl bg-court/[0.04] px-3 py-2 text-sm">
                {r.id ? (
                  <span className="mt-0.5 h-fit shrink-0 rounded-md bg-court px-1.5 py-0.5 font-mono text-[11px] font-bold text-parchment">
                    {r.id}
                  </span>
                ) : (
                  <span className="mt-0.5 h-fit shrink-0 rounded-md bg-court/15 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                    §
                  </span>
                )}
                <span className="leading-relaxed">{r.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 font-mono text-[11px] opacity-60">admin {community.admin}</p>
        </Card>
      )}

      {/* Case record */}
      {cases && community && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">
              Record — {cases.length} {cases.length === 1 ? "case" : "cases"}
            </h2>
            <Link
              to="/report"
              className="inline-flex items-center gap-1 text-sm font-bold text-gavel-deep hover:underline"
            >
              File a report <ArrowRight size={14} />
            </Link>
          </div>
          {cases.length === 0 ? (
            <p className="mt-2 text-sm opacity-60">No cases filed here yet.</p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {cases.map((c) => (
                <Link key={c.case_id} to={`/case/${c.case_id}`}>
                  <Card className="transition hover:border-gavel-deep">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-sm font-bold">{c.case_id}</code>
                      <VerdictBadge verdict={c.verdict} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs opacity-70">
                      <span>{c.status}</span>
                      <SeverityMeter value={c.severity} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {!community && !error && (
        <div className="mt-6">
          <Label>Tip</Label>
          <p className="text-sm opacity-60">Pick a court above or paste any id — reads are free and need no wallet.</p>
        </div>
      )}
    </div>
  );
}
