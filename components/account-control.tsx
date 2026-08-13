"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { ChevronDown, Link2, Loader2, LogOut, Unplug, UserRound } from "lucide-react";
import { toast } from "sonner";
import { GoogleSignInButton } from "@/components/google-one-tap";
import { WalletAuthButton } from "@/components/wallet-auth-button";
import { useAuthStore } from "@/lib/stores/auth-store";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function AccountControl() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { address: connectedAddress, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    authMethod,
    address: linkedAddress,
    googleId,
    email,
    name,
    clearAuth,
  } = useAuthStore();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const label = name || email || (linkedAddress ? shortAddress(linkedAddress) : "Account");
  const initial = label.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 max-w-64 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-black">
          {initial}
        </span>
        <span className="hidden max-w-36 truncate sm:block">{label}</span>
        <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-[100] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900 shadow-2xl">
          <div className="border-b border-zinc-800 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <UserRound className="h-4 w-4 text-zinc-400" />
              AIPG account
            </div>
            <p className="mt-1 truncate text-xs text-zinc-400">{label}</p>
          </div>

          <div className="space-y-4 p-4">
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">Google</span>
                <span className="max-w-52 truncate text-zinc-200">{googleId ? email || "Linked" : "Not linked"}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-500">Wallet</span>
                <span className="font-mono text-xs text-zinc-200">
                  {linkedAddress ? shortAddress(linkedAddress) : "Not linked"}
                </span>
              </div>
            </div>

            {!googleId && authMethod === "wallet" && (
              <div className="space-y-2 border-t border-zinc-800 pt-4">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <Link2 className="h-4 w-4" /> Link Google
                </div>
                <p className="text-xs leading-5 text-zinc-400">
                  Add Google to this same Grid account and balance.
                </p>
                <GoogleSignInButton onSuccess={() => setOpen(false)} />
              </div>
            )}

            {!linkedAddress && authMethod === "google" && (
              <div className="space-y-2 border-t border-zinc-800 pt-4">
                <p className="text-xs leading-5 text-zinc-400">
                  Prove a wallet once to attach it to this same Grid account.
                </p>
                <WalletAuthButton mode="link" onSuccess={() => setOpen(false)} />
              </div>
            )}

            {isConnected && connectedAddress && (
              <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-4">
                <div>
                  <p className="text-xs text-zinc-500">Browser wallet</p>
                  <p className="font-mono text-xs text-zinc-300">{shortAddress(connectedAddress)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
                >
                  <Unplug className="h-3.5 w-3.5" /> Disconnect
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800 p-2">
            <button
              type="button"
              onClick={async () => {
                setSigningOut(true);
                try {
                  await clearAuth();
                  setOpen(false);
                } catch {
                  toast.error("Could not sign out. Please try again.");
                } finally {
                  setSigningOut(false);
                }
              }}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Sign out of AIPG
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
