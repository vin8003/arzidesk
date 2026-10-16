import type {
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-[0.8125rem] font-medium text-fg", className)} {...props} />;
}

export function Hint({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[0.8125rem] leading-snug text-muted", className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input suppressHydrationWarning className={cn("control h-9 px-3 text-sm pointer-coarse:h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      suppressHydrationWarning
      className={cn("control min-h-32 resize-y px-3 py-2.5 text-sm leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("control cite-select h-9 appearance-none pl-3 pr-9 text-sm pointer-coarse:h-11", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-w-0 flex-col gap-1.5", className)} {...props} />;
}
