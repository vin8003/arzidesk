import { cn } from "@/lib/utils";
import type { OutputLang } from "@/lib/lang";

const LABELS: Record<OutputLang, string> = { hi: "हिन्दी", en: "English" };

/** The one language switch. Used by the app shell, login, and the article. */
export function LangToggle({
  lang,
  onLang,
  ariaLabel,
  className,
}: {
  lang: OutputLang;
  onLang: (next: OutputLang) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("seg", className)}>
      {(["en", "hi"] as const).map((code) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={lang === code}
          onClick={() => onLang(code)}
          className={cn("seg-btn min-w-10", lang === code && "is-on")}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
}
