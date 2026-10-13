import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "gold" | "outline" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  gold: "bg-gavel text-court border-court hover:bg-court hover:text-parchment",
  outline: "bg-transparent text-court border-court hover:bg-court hover:text-parchment",
  ghost: "bg-transparent text-court border-transparent hover:border-court",
  danger: "bg-transparent text-red-800 border-red-800 hover:bg-red-800 hover:text-white",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "gold", className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
        styles[variant],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
