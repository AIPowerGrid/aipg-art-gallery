"use client";

import '@rainbow-me/rainbowkit/styles.css';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useSwitchChain, useSignMessage, cookieToInitialState } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { config, SUPPORTED_CHAINS } from "@/lib/wagmi";
import { useState, type ReactNode, useEffect, useRef, useMemo } from "react";
import { base } from "wagmi/chains";
import { signIn, isAuthenticated, getAuthAddress, clearAuthToken } from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";

// Handle network switching and SIWE auth
function WalletManager({ children }: { children: ReactNode }) {
  const { isConnected, chainId, address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const authAttempted = useRef(false);
  
  // Auth store for reactive auth state
  const { setAuthenticated, clearAuth, syncFromStorage, syncFromServer } = useAuthStore();

  // On mount: show the optimistic local state immediately, then reconcile with
  // the authoritative server session (httpOnly cookie via /auth/me).
  useEffect(() => {
    syncFromStorage();
    void syncFromServer();
  }, [syncFromStorage, syncFromServer]);

  // Auto-switch to Base if on wrong network
  useEffect(() => {
    if (isConnected && chainId) {
      const supportedIds = SUPPORTED_CHAINS.map(c => c.id) as number[];
      if (!supportedIds.includes(chainId)) {
        switchChain?.({ chainId: base.id });
      }
    }
  }, [isConnected, chainId, switchChain]);

  // Clear auth when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      clearAuth();
    }
  }, [isConnected, clearAuth]);

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
      clearAuth();
    }

    // Already authenticated for this address
    if (isAuthenticated()) {
      setAuthenticated(address);
      return;
    }

    // Don't retry if already attempted this session
    if (authAttempted.current) return;

    const doAuth = async () => {
      authAttempted.current = true;
      setIsSigningIn(true);
      try {
        await signIn({ address, signMessageAsync, chainId: base.id });
        setAuthenticated(address); // Update reactive state
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        if (!message.includes('rejected')) {
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
  }, [isConnected, address, signMessageAsync, setAuthenticated, clearAuth]);

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
