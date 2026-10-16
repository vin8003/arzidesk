import { useCallback, useEffect, useState } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { WalletSnapshot } from "./pricing";
import { getWallet } from "./store";

const EVENT = "arzidesk:wallet";
let cache: { userId: string; wallet: WalletSnapshot } | null = null;

/** Tell every wallet chip on the page to refresh (after a draft or a top-up). */
export function announceWallet(wallet?: WalletSnapshot | { balancePaise: number }) {
  if (typeof window === "undefined") return;
  if (wallet && cache) {
    cache = { ...cache, wallet: { ...cache.wallet, ...wallet } };
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** The signed-in operator's wallet, painted from the last known value and refreshed on mount and on change. */
export function useWallet(): { wallet: WalletSnapshot | null; reload: () => Promise<void> } {
  const { user } = useCurrentUserState();
  const userId = user?.id;
  const [wallet, setWallet] = useState<WalletSnapshot | null>(() => (cache && cache.userId === userId ? cache.wallet : null));

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await getWallet();
      cache = { userId, wallet: next };
      setWallet(next);
    } catch {
      /* signed out or offline; keep the last value */
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setWallet(null);
      return;
    }
    void reload();
    const on = () => {
      if (cache && cache.userId === userId) setWallet(cache.wallet);
      void reload();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [userId, reload]);

  return { wallet: userId ? wallet : null, reload };
}
