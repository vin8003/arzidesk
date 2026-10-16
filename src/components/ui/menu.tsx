import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuRadioGroup = DropdownMenu.RadioGroup;

export function MenuContent({
  className,
  sideOffset = 6,
  align = "start",
  children,
  ...props
}: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content className={cn("menu", className)} sideOffset={sideOffset} align={align} {...props}>
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  );
}

export function MenuItem({
  icon,
  hint,
  shortcut,
  children,
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & { icon?: ReactNode; hint?: ReactNode; shortcut?: string }) {
  return (
    <DropdownMenu.Item className={cn("menu-item", className)} {...props}>
      {icon}
      {hint ? (
        <span className="menu-item-text">
          <span>{children}</span>
          <span className="menu-item-hint">{hint}</span>
        </span>
      ) : (
        <span className="min-w-0 flex-1">{children}</span>
      )}
      {shortcut ? (
        <kbd className="kbd ml-auto shrink-0" aria-hidden>
          {shortcut}
        </kbd>
      ) : null}
    </DropdownMenu.Item>
  );
}

export function MenuRadioItem({
  icon,
  children,
  className,
  ...props
}: ComponentProps<typeof DropdownMenu.RadioItem> & { icon?: ReactNode }) {
  return (
    <DropdownMenu.RadioItem className={cn("menu-item", className)} {...props}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      <DropdownMenu.ItemIndicator>
        <Check className="menu-check size-4" aria-hidden />
      </DropdownMenu.ItemIndicator>
    </DropdownMenu.RadioItem>
  );
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn("menu-label", className)} {...props} />;
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="menu-sep" />;
}
