"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useRef, useEffect } from "react";
import { useDisconnect, useBalance, useAccount, useSignMessage } from "wagmi";
import {
  clearAuthToken,
  signIn,
  isAuthenticated,
  linkWalletToGoogleAccount,
} from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { base } from "wagmi/chains";

// AIPG token contract on Base
const AIPG_TOKEN_ADDRESS = "0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608" as const;

export function CustomConnectButton() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { disconnect } = useDisconnect();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Fetch AIPG token balance
  const { data: aipgBalance } = useBalance({
    address,
    token: AIPG_TOKEN_ADDRESS,
    chainId: base.id,
  });

  // Close dropdown when clicking/touching outside
  useEffect(() => {
    if (!dropdownOpen) return;

    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    // Use timeout to prevent immediate close on the same tap that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [dropdownOpen]);

  const {
    clearAuth,
    setAuthenticated,
    syncFromServer,
    isAuthenticated: isAuthed,
    authMethod,
    address: linkedAddress,
  } = useAuthStore();

  const handleDisconnect = () => {
    if (authMethod === "google") {
      disconnect();
      setDropdownOpen(false);
      return;
    }
    clearAuthToken();
    clearAuth();
    disconnect();
    setDropdownOpen(false);
  };

  // Manual sign-in (backup for when auto-sign fails)
  const handleSignIn = async () => {
    if (!address || isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signIn({ address, signMessageAsync, chainId: base.id });
      setAuthenticated(address);
      setDropdownOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (!message.includes("rejected") && !message.includes("User rejected")) {
        console.error("Sign in failed:", err);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLinkWallet = async () => {
    if (!address || isSigningIn) return;
    setIsSigningIn(true);
    try {
      await linkWalletToGoogleAccount(address, signMessageAsync);
      await syncFromServer();
      setDropdownOpen(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (!message.toLowerCase().includes("rejected"))
        console.error("Wallet link failed:", err);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Check if connected but not authenticated
  const needsAuth = address && !isAuthed && !isAuthenticated();
  const canLink =
    address &&
    isAuthed &&
    authMethod === "google" &&
    linkedAddress?.toLowerCase() !== address.toLowerCase();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {
                opacity: 0,
                pointerEvents: "none",
                userSelect: "none",
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    data-wallet-button
                    onClick={openConnectModal}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Connect Wallet
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Wrong Network
                  </button>
                );
              }

              return (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors"
                  >
                    {/* Chain icon */}
                    {chain.hasIcon && (
                      <div
                        className="w-5 h-5 rounded-full overflow-hidden"
                        style={{ background: chain.iconBackground }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? "Chain icon"}
                            src={chain.iconUrl}
                            className="w-5 h-5"
                          />
                        )}
                      </div>
                    )}

                    {/* Address */}
                    <span className="text-white text-sm font-medium">
                      {account.displayName}
                    </span>

                    {/* Dropdown arrow */}
                    <svg
                      className={`w-4 h-4 text-zinc-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Custom Dropdown */}
                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-[100]">
                      {/* Header */}
                      <div className="px-4 py-3 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border-b border-zinc-700">
                        <div className="text-xs text-zinc-400 mb-1">
                          Connected to aipg.art
                        </div>
                        <div className="text-white font-medium">
                          {account.displayName}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {aipgBalance && (
                            <div className="text-sm text-zinc-400">
                              {Number(aipgBalance.formatted).toLocaleString(
                                undefined,
                                { maximumFractionDigits: 2 },
                              )}{" "}
                              AIPG
                            </div>
                          )}
                          <a
                            href="https://base.app/swap?contractAddress=0xa1c0decafe3e9bf06a5f29b7015cd373a9854608&chainId=8453&presetFiatAmount=10"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Buy AIPG
                          </a>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-2">
                        {/* Sign In - shown when connected but not authenticated */}
                        {needsAuth && (
                          <button
                            onClick={handleSignIn}
                            disabled={isSigningIn}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-indigo-400 hover:bg-indigo-600/10 rounded-lg transition-colors mb-1 disabled:opacity-50"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                              />
                            </svg>
                            <div>
                              <div className="text-sm font-medium">
                                {isSigningIn ? "Signing..." : "Sign In"}
                              </div>
                              <div className="text-xs text-zinc-500">
                                Verify wallet ownership
                              </div>
                            </div>
                          </button>
                        )}

                        {canLink && (
                          <button
                            onClick={handleLinkWallet}
                            disabled={isSigningIn}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-indigo-400 hover:bg-indigo-600/10 rounded-lg transition-colors mb-1 disabled:opacity-50"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13.828 10.172a4 4 0 010 5.656l-2 2a4 4 0 01-5.656-5.656l1-1m2-2l2-2a4 4 0 015.656 5.656l-1 1"
                              />
                            </svg>
                            <div>
                              <div className="text-sm font-medium">
                                {isSigningIn ? "Linking..." : "Link wallet"}
                              </div>
                              <div className="text-xs text-zinc-500">
                                Use one Grid account and balance
                              </div>
                            </div>
                          </button>
                        )}

                        {/* Switch Network */}
                        <button
                          onClick={() => {
                            openChainModal();
                            setDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <svg
                            className="w-5 h-5 text-zinc-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                            />
                          </svg>
                          <div>
                            <div className="text-sm font-medium">
                              Switch Network
                            </div>
                            <div className="text-xs text-zinc-500">
                              Currently on {chain.name}
                            </div>
                          </div>
                        </button>

                        {/* Disconnect */}
                        <button
                          onClick={handleDisconnect}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-red-400 hover:bg-red-600/10 rounded-lg transition-colors mt-1"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                          <div className="text-sm font-medium">Disconnect</div>
                        </button>
                      </div>

                      {/* Footer */}
                      <div className="px-4 py-2 bg-zinc-800/50 border-t border-zinc-700">
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          Secured by AIPG
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
