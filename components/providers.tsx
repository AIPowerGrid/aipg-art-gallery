"use client";

import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useSwitchChain, useSignMessage, cookieToInitialState } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { config, SUPPORTED_CHAINS } from "@/lib/wagmi";
import { useState, type ReactNode, useEffect, useRef, useMemo } from "react";
import { base } from "wagmi/chains";
import { signIn, isAuthenticated, getAuthAddress, clearAuthToken } from "@/lib/auth";

// Handle network switching and SIWE auth
function WalletManager({ children }: { children: ReactNode }) {
  const { isConnected, chainId, address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const authAttempted = useRef(false);

  // Auto-switch to Base if on wrong network
  useEffect(() => {
    if (isConnected && chainId) {
      const supportedIds = SUPPORTED_CHAINS.map(c => c.id) as number[];
      if (!supportedIds.includes(chainId)) {
        switchChain?.({ chainId: base.id });
      }
    }
  }, [isConnected, chainId, switchChain]);

  // Handle auth when wallet connects
  useEffect(() => {
    if (!isConnected || !address) {
      authAttempted.current = false;
      return;
    }

    // Clear old auth if address changed
    const storedAddress = getAuthAddress();
    if (storedAddress && storedAddress.toLowerCase() !== address.toLowerCase()) {
      clearAuthToken();
    }

    // Already authenticated for this address
    if (isAuthenticated()) return;

    // Don't retry if already attempted this session
    if (authAttempted.current) return;

    const doAuth = async () => {
      authAttempted.current = true;
      setIsSigningIn(true);
      try {
        await signIn({ address, signMessageAsync, chainId: base.id });
        console.log('SIWE auth successful');
      } catch (err: any) {
        if (!err.message?.includes('rejected')) {
          console.error('Auth failed:', err);
        }
        authAttempted.current = false; // Allow retry on non-rejection errors
      } finally {
        setIsSigningIn(false);
      }
    };

    // Small delay for connection to settle
    const timer = setTimeout(doAuth, 300);
    return () => clearTimeout(timer);
  }, [isConnected, address, signMessageAsync]);

  return <>{children}</>;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
});

export function Providers({ 
  children,
  cookie 
}: { 
  children: ReactNode;
  cookie?: string;
}) {
  // Parse initial state from cookie on client
  const initialState = useMemo(() => {
    if (cookie) {
      return cookieToInitialState(config, cookie);
    }
    return undefined;
  }, [cookie]);

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#6366f1',
            accentColorForeground: 'white',
            borderRadius: 'medium',
            fontStack: 'system',
          })}
          modalSize="compact"
          initialChain={base}
        >
          <WalletManager>
            {children}
          </WalletManager>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
