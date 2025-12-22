"use client";

import { useAccount, useConnect, useDisconnect, useEnsName } from "wagmi";
import { useState, useEffect } from "react";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const [showDropdown, setShowDropdown] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <button className="px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold opacity-50">
        Connect Wallet
      </button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-yellow-400/20 border border-orange-500/40 text-white hover:border-orange-400 transition"
        >
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          <span className="font-mono text-sm">
            {ensName || formatAddress(address)}
          </span>
        </button>
        
        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-black/90 border border-white/20 p-2 z-50">
            <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10 mb-2">
              Connected Wallet
            </div>
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/10 rounded-lg transition"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    );
  }

  // Filter out any connectors that might cause issues
  const availableConnectors = connectors.filter(
    (c) => c.name !== 'Porto' && c.type !== 'porto'
  );

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
      >
        Connect Wallet
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-black/90 border border-white/20 p-2 z-50">
          <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10 mb-2">
            Select Wallet
          </div>
          {availableConnectors.length === 0 ? (
            <div className="px-3 py-3 text-sm text-white/50 text-center">
              No wallets detected. Install MetaMask or another Web3 wallet.
            </div>
          ) : (
            availableConnectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector });
                  setShowDropdown(false);
                }}
                disabled={isPending}
                className="w-full px-3 py-3 text-left text-sm text-white hover:bg-white/10 rounded-lg transition flex items-center gap-3 disabled:opacity-50"
              >
                {connector.icon && (
                  <img src={connector.icon} alt="" className="w-6 h-6 rounded" />
                )}
                <span>{connector.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectWalletCard() {
  const { connectors, connect, isPending, error } = useConnect();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter out problematic connectors
  const availableConnectors = connectors.filter(
    (c) => c.name !== 'Porto' && c.type !== 'porto'
  );

  if (!mounted) {
    return (
      <div className="space-y-3">
        <div className="text-center mb-4">
          <p className="text-white/70 text-sm">Loading wallet options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-center mb-4">
        <p className="text-white/70 text-sm">Connect your Web3 wallet to sign in</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
          {error.message}
        </div>
      )}

      {availableConnectors.length === 0 ? (
        <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
          <p className="text-white/70 text-sm mb-2">No wallets detected</p>
          <p className="text-white/50 text-xs">
            Install MetaMask, Coinbase Wallet, or another Web3 wallet to continue.
          </p>
        </div>
      ) : (
        availableConnectors.map((connector) => (
          <button
            key={connector.uid}
            onClick={() => connect({ connector })}
            disabled={isPending}
            className="w-full py-3 px-4 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {connector.icon && (
              <img src={connector.icon} alt="" className="w-5 h-5 rounded" />
            )}
            <span>
              {isPending ? "Connecting..." : `Connect with ${connector.name}`}
            </span>
          </button>
        ))
      )}
    </div>
  );
}

