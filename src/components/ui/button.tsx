import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 font-medium select-none whitespace-nowrap text-center transition-[background-color,color,border-color,opacity,transform] duration-150 ease-out active:not-disabled:translate-y-px disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-ink text-ink-fg hover:bg-ink/85",
        outline: "border border-hairline bg-surface text-fg hover:bg-elevated",
        ghost: "bg-transparent text-muted hover:bg-elevated hover:text-fg",
        subtle: "bg-elevated text-fg hover:bg-raised",
        danger: "bg-danger text-ink-fg hover:bg-danger/88",
        paper: "bg-paper-ink text-paper hover:opacity-90",
      },
      size: {
        sm: "min-h-8 rounded-md px-2.5 text-[0.8125rem] pointer-coarse:min-h-10",
        md: "min-h-9 rounded-md px-3.5 text-sm pointer-coarse:min-h-11",
        lg: "min-h-11 rounded-md px-5 text-[0.9375rem]",
        icon: "size-9 rounded-md pointer-coarse:size-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  type,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: type ?? "button" })}
      {...props}
    />
  );
}
