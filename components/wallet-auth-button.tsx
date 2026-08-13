"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useSignMessage, useSwitchChain } from "wagmi";
import { base } from "wagmi/chains";
import { Loader2, Wallet } from "lucide-react";
import { linkWalletToGoogleAccount, signIn } from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";

type WalletAuthButtonProps = {
  mode: "sign-in" | "link";
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
  const { signMessageAsync } = useSignMessage();
  const { switchChainAsync } = useSwitchChain();
  const { setAuthenticated, syncFromServer } = useAuthStore();
  const [intent, setIntent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const authenticate = useCallback(async () => {
    if (!intent || running.current || !isConnected || !address) return;
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
      setIntent(false);
      onSuccess?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Wallet authentication failed";
      setError(/rejected/i.test(message) ? "Signature cancelled" : message);
      setIntent(false);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [
    address,
    chainId,
    intent,
    isConnected,
    mode,
    onSuccess,
    setAuthenticated,
    signMessageAsync,
    switchChainAsync,
    syncFromServer,
  ]);

  useEffect(() => {
    void authenticate();
  }, [authenticate]);

  useEffect(() => {
    if (!intent) return;
    const timeout = window.setTimeout(() => setIntent(false), 60_000);
    return () => window.clearTimeout(timeout);
  }, [intent]);

  const label = mode === "link" ? "Link wallet" : "Continue with wallet";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setIntent(true);
          if (!isConnected) openConnectModal?.();
        }}
        disabled={busy || (!isConnected && !openConnectModal)}
        className={
          className ??
          "flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50"
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {busy ? (mode === "link" ? "Linking wallet..." : "Signing in...") : label}
      </button>
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
