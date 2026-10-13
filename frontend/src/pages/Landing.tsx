import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, FileText, MessagesSquare, RotateCcw, Scale } from "lucide-react";
import { OpenGavelHero } from "../components/ui/skiper39";
import { Card } from "../components/ui/card";
import { SeverityMeter, VerdictBadge } from "../components/Verdict";
import { listCases, type CaseSummary } from "../lib/api";

const STEPS = [
  { icon: FileText, title: "Report", text: "Anyone files content against a versioned rulebook. The report is frozen on-chain." },
  { icon: MessagesSquare, title: "Consensus", text: "A leader proposes a verdict; independent validators re-judge it. Only agreement is stored." },
  { icon: Eye, title: "Public record", text: "Content, rule cited, reasoning, and rules version stay readable by everyone." },
  { icon: RotateCcw, title: "Appeal", text: "Up to 3 appeals per case — each one re-runs full consensus with your reason attached." },
];

export function Landing() {
  const [cases, setCases] = useState<CaseSummary[] | null>(null);
  const [casesError, setCasesError] = useState(false);

  useEffect(() => {
    let live = true;
    listCases("general", 6)
      .then((c) => live && setCases(c))
      .catch(() => {
        if (!live) return;
        setCases([]);
        setCasesError(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      {/* Section 1 — Community Canvas hero */}
      <section className="relative h-svh min-h-[640px]">
        <OpenGavelHero />
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-2xl uppercase tracking-tight md:text-3xl">
          How a verdict happens
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Card key={s.title}>
              <p className="font-display text-3xl text-gavel-deep">0{i + 1}</p>
              <s.icon size={20} className="mt-2" />
              <h3 className="mt-2 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm opacity-70">{s.text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Live cases */}
      <section id="cases" className="border-t border-court/15 bg-parchment-deep/40">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex items-end justify-between">
            <h2 className="font-display text-2xl uppercase tracking-tight md:text-3xl">
              Live record
            </h2>
            <Link to="/communities" className="inline-flex items-center gap-1 text-sm font-bold hover:underline">
              All communities <ArrowRight size={14} />
            </Link>
          </div>
          {cases === null ? (
            <p className="mt-6 text-sm opacity-60">Reading the chain…</p>
          ) : casesError ? (
            <p className="mt-6 rounded-xl border border-red-800/30 bg-red-50 p-3 text-sm text-red-800">
              Could not reach StudioNet — the record may still be there. Check your connection and reload.
            </p>
          ) : cases.length === 0 ? (
            <p className="mt-6 text-sm opacity-60">No cases yet — file the first report.</p>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {cases.map((c) => (
                <Link key={c.case_id} to={`/case/${c.case_id}`}>
                  <Card className="transition hover:border-gavel-deep">
                    <div className="flex items-center justify-between gap-2">
                      <code className="font-mono text-sm font-bold">{c.case_id}</code>
                      <VerdictBadge verdict={c.verdict} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs opacity-70">
                      <span className="inline-flex items-center gap-1">
                        <Scale size={12} /> {c.status} · appeals decided on-chain
                      </span>
                      <SeverityMeter value={c.severity} />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
