import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-court/20 bg-white/70 p-5 shadow-sm", className)}
      {...props}
    />
  );
}

export function Badge({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-court/25 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider",
        className,
      )}
      {...props}
    />
  );
}
