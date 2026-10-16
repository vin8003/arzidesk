import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "muted" | "accent" | "ok" | "warn" | "danger" | "paper";

const TONES: Record<BadgeTone, string> = {
  muted: "",
  accent: "!bg-accent-soft !text-accent",
  ok: "!bg-ok/12 !text-ok",
  warn: "!bg-warn/14 !text-warn",
  danger: "!bg-danger/12 !text-danger",
  paper: "!bg-paper-ink/8 !text-paper-muted",
};

export function Badge({
  className,
  tone = "muted",
  dot = false,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span className={cn("chip", TONES[tone], className)} {...props}>
      {dot ? <span className="chip-dot" aria-hidden /> : null}
      {children}
    </span>
  );
}
