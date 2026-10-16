import { cn } from "@/lib/utils";

/** A filed application with a stamp: the arzi, received. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("text-accent", className)} fill="none" aria-hidden>
      <path d="M8 5.5h11l5 5V26.5H8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M19 5.5v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M11.5 14h9M11.5 18h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="20.5" cy="22" r="2.6" fill="currentColor" />
    </svg>
  );
}
