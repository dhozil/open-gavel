import { Ban, CheckCircle2, ChevronUp, Flag, HelpCircle, Trash2 } from "lucide-react";
import { Badge } from "./ui/card";
import { cn } from "../lib/utils";

const MAP: Record<string, { icon: typeof Flag; cls: string }> = {
  ALLOW: { icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-900 border-emerald-800/30" },
  WARN: { icon: Flag, cls: "bg-amber-100 text-amber-900 border-amber-800/30" },
  REMOVE: { icon: Trash2, cls: "bg-orange-100 text-orange-900 border-orange-800/30" },
  BAN: { icon: Ban, cls: "bg-red-100 text-red-900 border-red-800/30" },
  ESCALATE: { icon: ChevronUp, cls: "bg-violet-100 text-violet-900 border-violet-800/30" },
};

export function VerdictBadge({ verdict, empty = "PENDING" }: { verdict: string; empty?: string }) {
  if (!verdict) {
    return (
      <Badge className="bg-court/5 text-court/70">
        <HelpCircle size={12} /> {empty}
      </Badge>
    );
  }
  const m = MAP[verdict] ?? MAP.ESCALATE;
  const Icon = m.icon;
  return (
    <Badge className={cn(m.cls)}>
      <Icon size={12} /> {verdict}
    </Badge>
  );
}

export function SeverityMeter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2" title={`Severity ${value}/10`}>
      <div className="h-2 w-28 overflow-hidden rounded-full bg-court/10">
        <div
          className={cn(
            "h-full rounded-full",
            value <= 2 ? "bg-emerald-500" : value <= 5 ? "bg-gavel" : "bg-red-600",
          )}
          style={{ width: `${value * 10}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums">{value}/10</span>
    </div>
  );
}
