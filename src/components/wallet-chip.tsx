import { Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import type { OutputLang } from "@/lib/lang";
import { formatInr } from "@/lib/wallet/pricing";
import { useWallet } from "@/lib/wallet/use-wallet";
import { cn } from "@/lib/utils";

/** Balance in the sidebar (or a compact pill in the phone header), linking to the wallet. */
export function WalletChip({ lang, compact = false }: { lang: OutputLang; compact?: boolean }) {
  const { wallet } = useWallet();
  const hi = lang === "hi";
  const low = wallet ? wallet.balancePaise < 2_500 : false;

  if (compact) {
    return (
      <Link
        to="/wallet"
        className={cn("chip tabular-nums", low && "!bg-warn/14 !text-warn")}
        aria-label={hi ? "वॉलेट बैलेंस" : "Wallet balance"}
      >
        <Wallet className="size-3.5" aria-hidden />
        {wallet ? formatInr(wallet.balancePaise) : "…"}
      </Link>
    );
  }

  return (
    <Link to="/wallet" className="side-trial">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{hi ? "वॉलेट" : "Wallet"}</span>
        <span className={cn("tabular-nums", low ? "text-warn" : "text-fg")}>
          {wallet ? formatInr(wallet.balancePaise) : "…"}
        </span>
      </span>
      <span className="mt-0.5 block text-xs text-muted">
        {low ? (hi ? "बैलेंस कम है · टॉप-अप करें" : "Running low · top up") : hi ? "हर ड्राफ्ट पर कटौती" : "Debited per draft"}
      </span>
    </Link>
  );
}
