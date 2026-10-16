import { useEffect, useState } from "react";
import { Toaster } from "sonner";

export function ClientToaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Toaster
      
      position="bottom-center"
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          color: "var(--color-fg)",
          border: "1px solid var(--color-hairline)",
        },
      }}
    />
  );
}
