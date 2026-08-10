"use client";

import type { ReactNode } from "react";
import { GoogleSignInButton } from "@/components/google-one-tap";
import { ConnectWalletCard } from "@/components/wallet-button";

interface AuthPanelProps {
  title: string;
  subtitle?: string;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  /** "inline" renders the full wallet list; "trigger" opens the header menu. */
  walletMode?: "inline" | "trigger";
  footer?: ReactNode;
  className?: string;
}

/**
 * The single sign-in surface, shared by /auth/login, /join and the in-app modal
 * so every entry point looks and behaves the same. Google reads as the primary
 * path; the wallet sits below as the clearly secondary option.
 */
export function AuthPanel({
  title,
  subtitle,
  onSuccess,
  onError,
  walletMode = "inline",
  footer,
  className = "",
}: AuthPanelProps) {
  const triggerWalletMenu = () => {
    document
      .querySelector<HTMLButtonElement>("button[data-wallet-button]")
      ?.click();
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-border bg-card/80 p-6 backdrop-blur-xl sm:p-7 shadow-[0_30px_80px_-24px_rgba(0,0,0,0.7)] ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-20 h-36 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, hsl(var(--primary) / 0.28), transparent 70%)",
        }}
      />

      <div className="relative">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-[26px]">
            {title}
          </h1>
          {subtitle && (
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>

        {/* Google — the primary path */}
        <GoogleSignInButton onSuccess={onSuccess} onError={onError} />

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-tertiary">
              or
            </span>
          </div>
        </div>

        {/* Wallet — the secondary path */}
        {walletMode === "inline" ? (
          <ConnectWalletCard />
        ) : (
          <button
            type="button"
            onClick={triggerWalletMenu}
            className="btn btn-outline w-full"
          >
            Connect a wallet
          </button>
        )}

        <ul className="mt-6 space-y-2 text-xs leading-relaxed text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Google and wallet open the same account — link them anytime.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>Wallet sign-in is a signature only, never a transaction.</span>
          </li>
        </ul>

        {footer && <div className="mt-5">{footer}</div>}
      </div>
    </div>
  );
}
