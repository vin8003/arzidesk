import { cn } from "@/lib/utils";

type Option<T extends string> = { value: T; label: string };

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="seg seg-fill">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={cn("seg-btn px-2", opt.value === value && "is-on")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
