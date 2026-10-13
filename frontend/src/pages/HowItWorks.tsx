import { Link } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  FileText,
  MessagesSquare,
  Eye,
  RotateCcw,
  Wallet,
  Timer,
  ShieldCheck,
  CircleHelp,
} from "lucide-react";
import { Card } from "../components/ui/card";

const STEPS = [
  {
    icon: BookOpen,
    title: "1. Create a community",
    text: "On the Manage page, create a community with its rulebook (give every rule an R-number, e.g. R1). You become that community's admin — the only wallet that can publish new rule versions. Rules start at v1.",
  },
  {
    icon: FileText,
    title: "2. File a report",
    text: "On the Report page, paste the exact content, the author's handle, and context. Filing freezes the content on-chain and opens a case (community_id-N) with status PENDING. Anyone can file — no permission needed.",
  },
  {
    icon: MessagesSquare,
    title: "3. Request the AI verdict",
    text: "Anyone (including you) triggers moderate_case. A leader proposes a verdict and independent validators re-judge the same content against the same rules. Only agreement is stored: verdict, violated rule, severity 0–10, action, and reasoning. This takes minutes — wait for FINALIZED.",
  },
  {
    icon: Eye,
    title: "4. Read the evidence trail",
    text: "Every decided case shows its full trail: the reported content, the rule cited, the reasoning, the severity, and the rules version it was judged under. If the rulebook moved on since, a badge says so.",
  },
  {
    icon: RotateCcw,
    title: "5. Appeal (up to 3×)",
    text: "Disagree? Each case allows 3 appeals. Every appeal re-runs full consensus with your reason attached — a bogus appeal cannot flip a sound verdict. The appeal count is on-chain for everyone to see.",
  },
];

const VERDICTS: Array<[string, string]> = [
  ["ALLOW", "No violation. Nothing happens."],
  ["WARN", "Minor breach. The user is warned."],
  ["REMOVE", "Content comes down."],
  ["BAN", "Serious breach. Content removed, user banned."],
  ["ESCALATE", "Validators were unsure. A human should review."],
];

const NOTES = [
  {
    icon: Wallet,
    title: "Wallet & network",
    text: "StudioNet only (gasless — zero balance works). Connect a browser wallet, or use the local dev key for demos. Reads are free and need no wallet at all.",
  },
  {
    icon: Timer,
    title: "Why verdicts take minutes",
    text: "A verdict is not one AI call — it is a leader plus a validator committee reaching consensus, then finalization. The UI says exactly which stage your transaction is in.",
  },
  {
    icon: ShieldCheck,
    title: "What the contract enforces",
    text: "Only a community's admin can update its rules. Only DECIDED cases can be appealed, with a 10+ character reason, max 3 times. Guards reject everything else with the reason shown.",
  },
];

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-50">Guide</p>
      <h1 className="font-display mt-1 text-3xl uppercase tracking-tight md:text-4xl">How it works</h1>
      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed opacity-70">
        OpenGavel replaces single-admin moderation with open validator consensus. No one decides
        alone — and every decision shows its work. Follow the five steps below.
      </p>

      <div className="mt-8 space-y-4">
        {STEPS.map((s) => (
          <Card key={s.title} className="flex gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gavel text-court">
              <s.icon size={18} />
            </span>
            <div>
              <h2 className="font-bold">{s.title}</h2>
              <p className="mt-1 text-sm leading-relaxed opacity-75">{s.text}</p>
            </div>
          </Card>
        ))}
      </div>

      <h2 className="font-display mt-10 text-xl uppercase">Verdicts, plainly</h2>
      <Card className="mt-3 divide-y divide-court/10 !p-0">
        {VERDICTS.map(([v, d]) => (
          <div key={v} className="flex items-center gap-4 px-5 py-3">
            <code className="w-24 shrink-0 font-mono text-sm font-bold">{v}</code>
            <p className="text-sm opacity-75">{d}</p>
          </div>
        ))}
      </Card>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {NOTES.map((n) => (
          <Card key={n.title}>
            <n.icon size={18} />
            <h3 className="mt-2 font-bold">{n.title}</h3>
            <p className="mt-1 text-sm leading-relaxed opacity-75">{n.text}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-8 flex flex-wrap items-center gap-3 border-gavel-deep/40">
        <CircleHelp size={18} className="shrink-0" />
        <p className="grow text-sm">
          Still curious? Open a real case and inspect its trail — that is the whole point.
        </p>
        <Link
          to="/communities"
          className="inline-flex items-center gap-1 rounded-full border border-court bg-gavel px-5 py-2.5 text-sm font-bold transition hover:bg-court hover:text-parchment"
        >
          Browse courts <ArrowRight size={14} />
        </Link>
      </Card>
    </div>
  );
}
