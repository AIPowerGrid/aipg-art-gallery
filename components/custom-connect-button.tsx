"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useState, useRef, useEffect } from "react";
import { useDisconnect, useBalance, useAccount } from "wagmi";
import { clearAuthToken } from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";
import { base } from "wagmi/chains";

// AIPG token contract on Base
const AIPG_TOKEN_ADDRESS = "0xa1c0deCaFE3E9Bf06A5F29B7015CD373a9854608" as const;

export function CustomConnectButton() {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { disconnect } = useDisconnect();
  const { address } = useAccount();
  
  // Fetch AIPG token balance
  const { data: aipgBalance } = useBalance({
    address,
    token: AIPG_TOKEN_ADDRESS,
    chainId: base.id,
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { clearAuth } = useAuthStore();
  
  const handleDisconnect = () => {
    clearAuthToken();
    clearAuth();
    disconnect();
    setDropdownOpen(false);
  };

  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
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
                      className={`w-4 h-4 text-zinc-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Custom Dropdown */}
                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
                      {/* Header */}
                      <div className="px-4 py-3 bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border-b border-zinc-700">
                        <div className="text-xs text-zinc-400 mb-1">Connected to aipg.art</div>
                        <div className="text-white font-medium">{account.displayName}</div>
                        {aipgBalance && (
                          <div className="text-sm text-zinc-400 mt-1">
                            {Number(aipgBalance.formatted).toLocaleString(undefined, { maximumFractionDigits: 2 })} AIPG
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="p-2">
                        {/* Switch Network */}
                        <button
                          onClick={() => {
                            openChainModal();
                            setDropdownOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                          <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                          <div>
                            <div className="text-sm font-medium">Switch Network</div>
                            <div className="text-xs text-zinc-500">Currently on {chain.name}</div>
                          </div>
                        </button>

                        {/* Disconnect */}
                        <button
                          onClick={handleDisconnect}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-red-400 hover:bg-red-600/10 rounded-lg transition-colors mt-1"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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
