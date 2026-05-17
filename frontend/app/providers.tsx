"use client";

import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount } from "wagmi";
import { wagmiConfig } from "@/lib/config";
import { DevAccountProvider, useDevAccount, ANVIL_ACCOUNTS } from "@/contexts/DevAccountContext";
import { Toaster } from "sonner";
import { useState } from "react";

function DevAccountSync() {
  const { address } = useAccount();
  const { setSelectedIndex } = useDevAccount();

  useEffect(() => {
    if (!address) return;
    const idx = ANVIL_ACCOUNTS.findIndex(
      (a) => a.address.toLowerCase() === address.toLowerCase()
    );
    if (idx !== -1) setSelectedIndex(idx);
  }, [address, setSelectedIndex]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DevAccountProvider>
          <DevAccountSync />
          {children}
          <Toaster richColors position="top-right" />
        </DevAccountProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
