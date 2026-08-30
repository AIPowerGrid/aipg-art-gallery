"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useReconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import { Loader2, Wallet } from "lucide-react";
import { linkWalletToGoogleAccount, signIn } from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";

const WALLET_AUTH_INTENT_KEY = "aipg_wallet_auth_intent";
const WALLET_AUTH_INTENT_TTL_MS = 5 * 60 * 1000;

type WalletAuthMode = "sign-in" | "link";

type PendingWalletAuthIntent = {
  mode: WalletAuthMode;
  expiresAt: number;
};

function rememberWalletAuthIntent(mode: WalletAuthMode) {
  const intent: PendingWalletAuthIntent = {
    mode,
    expiresAt: Date.now() + WALLET_AUTH_INTENT_TTL_MS,
  };
  sessionStorage.setItem(WALLET_AUTH_INTENT_KEY, JSON.stringify(intent));
}

function hasWalletAuthIntent(mode: WalletAuthMode) {
  const stored = sessionStorage.getItem(WALLET_AUTH_INTENT_KEY);
  if (!stored) return false;
  try {
    const intent = JSON.parse(stored) as PendingWalletAuthIntent;
    if (intent.mode === mode && intent.expiresAt > Date.now()) return true;
  } catch {
    // Invalid or stale browser state is not authentication intent.
  }
  sessionStorage.removeItem(WALLET_AUTH_INTENT_KEY);
  return false;
}

function clearWalletAuthIntent() {
  sessionStorage.removeItem(WALLET_AUTH_INTENT_KEY);
}

type WalletAuthButtonProps = {
  mode: WalletAuthMode;
  onSuccess?: () => void;
  className?: string;
};

export function WalletAuthButton({
  mode,
  onSuccess,
  className,
}: WalletAuthButtonProps) {
  const { address, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { reconnectAsync } = useReconnect();
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { setAuthenticated, syncFromServer } = useAuthStore();
  const [intent, setIntent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const resumeInFlight = useRef(false);

  const resumeExplicitConnection = useCallback(async () => {
    if (
      resumeInFlight.current ||
      isConnected ||
      !hasWalletAuthIntent(mode)
    ) {
      return;
    }
    resumeInFlight.current = true;
    let needsChooser = false;
    try {
      const connections = await reconnectAsync();
      needsChooser = connections.length === 0;
    } catch {
      needsChooser = true;
    } finally {
      resumeInFlight.current = false;
    }
    // Base Account may first establish its own session without authorizing the
    // Gallery. Resume silently when possible; otherwise return the user to the
    // chooser while the original explicit sign-in intent is still active.
    if (needsChooser && hasWalletAuthIntent(mode)) {
      openConnectModal?.();
    }
  }, [isConnected, mode, openConnectModal, reconnectAsync]);

  const authenticate = useCallback(async () => {
    if (running.current || !isConnected || !address) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }
      if (mode === "link") {
        await linkWalletToGoogleAccount(address, signMessageAsync);
      } else {
        await signIn({ address, signMessageAsync, chainId: base.id });
        setAuthenticated(address);
      }
      await syncFromServer();
      clearWalletAuthIntent();
      setIntent(false);
      onSuccess?.();
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Wallet authentication failed";
      setError(/rejected/i.test(message) ? "Signature cancelled" : message);
      clearWalletAuthIntent();
      setIntent(false);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [
    address,
    chainId,
    isConnected,
    mode,
    onSuccess,
    setAuthenticated,
    signMessageAsync,
    switchChainAsync,
    syncFromServer,
  ]);

  useEffect(() => {
    if (!hasWalletAuthIntent(mode)) return;
    setIntent(true);
    void resumeExplicitConnection();
  }, [mode, resumeExplicitConnection]);

  useEffect(() => {
    if (!intent || isConnected) return;
    const resumeAfterWalletPopup = () => {
      void resumeExplicitConnection();
    };
    window.addEventListener("focus", resumeAfterWalletPopup);
    return () => window.removeEventListener("focus", resumeAfterWalletPopup);
  }, [intent, isConnected, resumeExplicitConnection]);

  useEffect(() => {
    if (!intent) return;
    if (hasWalletAuthIntent(mode)) {
      void authenticate();
    } else {
      setIntent(false);
    }
  }, [authenticate, intent, mode]);

  const label = mode === "link" ? "Link wallet" : "Continue with wallet";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          rememberWalletAuthIntent(mode);
          setIntent(true);
          if (isConnected) {
            void authenticate();
          } else {
            openConnectModal?.();
          }
        }}
        disabled={busy || (!isConnected && !openConnectModal)}
        className={
          className ??
          "flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
        }
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wallet className="h-4 w-4" />
        )}
        {busy
          ? mode === "link"
            ? "Linking wallet..."
            : "Signing in..."
          : label}
      </button>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
