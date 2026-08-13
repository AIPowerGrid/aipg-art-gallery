"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, cookieToInitialState } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { config } from "@/lib/wagmi";
import { type ReactNode, useEffect, useMemo } from "react";
import { base } from "wagmi/chains";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useJobStore } from "@/lib/stores/job-store";
import { GoogleOneTap } from "@/components/google-one-tap";

function WalletManager({ children }: { children: ReactNode }) {
  // Auth store for reactive auth state
  const {
    isAuthenticated: hasSession,
    address: sessionAddress,
    accountId,
    googleId,
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
    const legacyOwners = [
      sessionAddress,
      googleId ? `google:${googleId}` : null,
    ].filter((owner): owner is string => Boolean(owner));
    setActiveOwner(hasSession ? accountId : null, legacyOwners);
  }, [hasSession, accountId, googleId, sessionAddress, setActiveOwner]);

  // Wallet transport and AIPG authentication are intentionally independent.
  // Connecting, reconnecting, locking, or changing a browser wallet never
  // starts SIWE or mutates the cookie-backed session. Signature prompts happen
  // only from the explicit sign-in/link controls.

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
    <WagmiProvider
      config={config}
      initialState={initialState}
      reconnectOnMount={false}
    >
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
