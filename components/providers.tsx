"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  WagmiProvider,
  useAccount,
  useSwitchChain,
  useSignMessage,
  cookieToInitialState,
} from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { config, SUPPORTED_CHAINS } from "@/lib/wagmi";
import { useState, type ReactNode, useEffect, useRef, useMemo } from "react";
import { base } from "wagmi/chains";
import {
  signIn,
  isAuthenticated,
  getAuthAddress,
  clearAuthToken,
} from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useJobStore } from "@/lib/stores/job-store";
import { GoogleOneTap } from "@/components/google-one-tap";

// Handle network switching and SIWE auth
function WalletManager({ children }: { children: ReactNode }) {
  const { isConnected, chainId, address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const authAttempted = useRef(false);

  // Auth store for reactive auth state
  const {
    isAuthenticated: hasSession,
    authMethod,
    address: sessionAddress,
    googleId,
    setAuthenticated,
    clearAuth,
    syncFromStorage,
    syncFromServer,
  } = useAuthStore();
  const setActiveOwner = useJobStore((state) => state.setActiveOwner);

  // On mount: show optimistic local state immediately, then reconcile with the
  // authoritative server session (httpOnly cookie via /auth/me).
  useEffect(() => {
    syncFromStorage();
    void syncFromServer();
  }, [syncFromStorage, syncFromServer]);

  useEffect(() => {
    const owner = hasSession
      ? googleId
        ? `google:${googleId}`
        : sessionAddress
      : null;
    setActiveOwner(owner ?? null);
  }, [hasSession, googleId, sessionAddress, setActiveOwner]);

  // Auto-switch to Base if on wrong network
  useEffect(() => {
    if (isConnected && chainId) {
      const supportedIds = SUPPORTED_CHAINS.map((c) => c.id) as number[];
      if (!supportedIds.includes(chainId)) {
        switchChain?.({ chainId: base.id });
      }
    }
  }, [isConnected, chainId, switchChain]);

  // Clear wallet auth when wallet disconnects (but preserve Google auth)
  useEffect(() => {
    if (!isConnected && authMethod === "wallet") {
      clearAuth();
    }
  }, [isConnected, authMethod, clearAuth]);

  // Handle auth when wallet connects
  useEffect(() => {
    if (!isConnected || !address) {
      authAttempted.current = false;
      return;
    }

    // Merely connecting a wallet must not replace an active Google session.
    // The account menu exposes an explicit proof-of-both link action instead.
    if (authMethod === "google") {
      authAttempted.current = false;
      return;
    }

    // Clear old auth if address changed
    const storedAddress = getAuthAddress();
    if (
      storedAddress &&
      storedAddress.toLowerCase() !== address.toLowerCase()
    ) {
      clearAuthToken();
      // Only clear if we were using wallet auth
      if (authMethod === "wallet") {
        clearAuth();
      }
    }

    // Already authenticated for this address
    if (isAuthenticated()) {
      setAuthenticated(address);
      return;
    }

    // Don't retry if already attempted this session
    if (authAttempted.current) return;

    let cancelled = false;

    const doAuth = async () => {
      authAttempted.current = true;
      setIsSigningIn(true);
      try {
        // On a fresh connect, wagmi reports isConnected before the connector's
        // provider can actually sign — signMessageAsync throws
        // "Connector not connected". Retry on that (only) until the provider is
        // ready, so the user gets the signature prompt without needing a refresh.
        let lastErr: unknown;
        for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
          try {
            await signIn({ address, signMessageAsync, chainId: base.id });
            if (!cancelled) setAuthenticated(address);
            return;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            // User declined, or a genuine error → stop immediately.
            if (msg.includes("rejected") || msg.includes("User rejected"))
              throw err;
            if (!/not connected|Connector|getChainId|provider/i.test(msg))
              throw err;
            // Connector not ready yet → wait briefly and retry.
            lastErr = err;
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        if (!cancelled) throw lastErr;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "";
        if (
          !message.includes("rejected") &&
          !message.includes("User rejected")
        ) {
          console.error("Auto sign-in failed:", err);
        }
        // Allow manual retry via dropdown
        authAttempted.current = false;
      } finally {
        if (!cancelled) setIsSigningIn(false);
      }
    };

    // Small initial delay for connection to settle, then doAuth retries until ready.
    const timer = setTimeout(doAuth, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    isConnected,
    address,
    signMessageAsync,
    setAuthenticated,
    clearAuth,
    authMethod,
  ]);

  return (
    <>
      {children}
      <GoogleOneTap />
    </>
  );
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
  cookie,
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
            accentColor: "#6366f1",
            accentColorForeground: "white",
            borderRadius: "medium",
            fontStack: "system",
          })}
          modalSize="compact"
          initialChain={base}
        >
          <WalletManager>{children}</WalletManager>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
