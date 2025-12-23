"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { config } from "@/lib/wagmi";
import { useState, type ReactNode, useEffect } from "react";

// Extend Window interface for ethereum provider
declare global {
  interface Window {
    ethereum?: {
      isCoinbaseWallet?: boolean;
      selectedAddress?: string;
      providers?: Array<{ isCoinbaseWallet?: boolean }>;
      request: (args: { method: string }) => Promise<unknown>;
    };
  }
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 2,
      },
    },
  }));
  const [mounted, setMounted] = useState(false);

  // Ensure we're mounted before rendering wagmi provider to avoid hydration issues
  useEffect(() => {
    setMounted(true);
    
    // Auto-connect to Coinbase Wallet if already connected
    if (typeof window !== 'undefined' && window.ethereum) {
      const ethereum = window.ethereum;
      const isCoinbase =
        ethereum.isCoinbaseWallet ||
        (Array.isArray(ethereum.providers) &&
          ethereum.providers.some((p) => p.isCoinbaseWallet));

      if (isCoinbase && ethereum.selectedAddress) {
        console.log('Coinbase Wallet already connected, auto-connecting...');
        ethereum.request({ method: 'eth_accounts' }).catch(console.error);
      }
    }
  }, []);

  // Show a loading state while mounting to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="min-h-screen bg-black">
        {children}
      </div>
    );
  }

  return (
    <WagmiProvider config={config} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
