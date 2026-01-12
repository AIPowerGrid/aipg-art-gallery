"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useAccount, useConnect, useDisconnect, useEnsName } from "wagmi";
import { base } from 'wagmi/chains';
import { MODELVAULT_CONTRACTS } from "@/lib/wagmi";

// Always use Base mainnet
const BASE_NETWORK = {
  chainId: base.id,
  name: 'Base',
  type: 'mainnet' as const,
  contractAddress: MODELVAULT_CONTRACTS[base.id],
};

export function WalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render placeholder during SSR
  if (!mounted) {
    return (
      <button className="flex items-center gap-2 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full bg-[#2a2a2a] border border-[#444] text-white/70 text-xs sm:text-sm font-medium opacity-50">
        <Image 
          src="/base-logo.svg" 
          alt="Base" 
          width={16} 
          height={16}
          className="w-4 h-4"
        />
        Connect
      </button>
    );
  }

  return <WalletButtonClient />;
}

function WalletButtonClient() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const [showDropdown, setShowDropdown] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowDropdown(false);
    if (showDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showDropdown]);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
          className="flex items-center gap-2 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full bg-[#1a1a1a] border border-[#333] text-white/80 hover:bg-[#222] hover:text-white hover:border-[#444] transition-colors"
        >
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          <span className="font-mono text-xs sm:text-sm">
            {ensName || formatAddress(address)}
          </span>
        </button>
        
        {showDropdown && (
          <div 
            className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-black/95 border border-white/20 p-2 z-50 shadow-xl backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10 mb-2">
              Connected Wallet
            </div>
            
            {/* Wallet Address */}
            <div className="px-3 py-2 mb-2 rounded-xl bg-white/5">
              <div className="text-xs text-white/50 mb-1">Address</div>
              <div className="font-mono text-sm text-white break-all">{address}</div>
            </div>
            
            {/* Network Info */}
            <div className="px-3 py-2 mb-2 rounded-xl bg-white/5">
              <div className="text-xs text-white/50 mb-1">Network</div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400"></span>
                <span className="text-sm text-white">Base</span>
              </div>
            </div>
            
            {/* Disconnect Button */}
            <button
              onClick={() => {
                disconnect();
                setShowDropdown(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-xl transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
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
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        className="flex items-center gap-2 px-4 sm:px-6 py-1.5 sm:py-2 rounded-full bg-[#2a2a2a] border border-[#444] text-white/80 text-xs sm:text-sm font-medium hover:bg-[#333] hover:text-white transition-colors"
      >
        <Image 
          src="/base-logo.svg" 
          alt="Base" 
          width={16} 
          height={16}
          className="w-4 h-4"
        />
        Connect
      </button>

      {showDropdown && (
        <div 
          className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-black/95 border border-white/20 p-3 z-50 shadow-xl backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Network Banner */}
          <div className="mb-3 p-3 rounded-xl bg-gradient-to-r from-zinc-500/10 to-zinc-400/10 border border-zinc-500/20">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
              <span className="text-white font-semibold">Base Network</span>
            </div>
          </div>

          <div className="px-2 py-2 text-xs text-white/50 border-b border-white/10 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Select Wallet
          </div>
          
          {availableConnectors.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <div className="text-white/70 text-sm mb-2">No wallets detected</div>
              <p className="text-white/50 text-xs">
                Install MetaMask, Coinbase Wallet, or another Web3 wallet to continue.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {availableConnectors.map((connector) => (
                <button
                  key={connector.uid}
                  onClick={() => {
                    connect({ connector });
                    setShowDropdown(false);
                  }}
                  disabled={isPending}
                  className="w-full px-3 py-3 text-left text-sm text-white hover:bg-white/10 rounded-xl transition flex items-center gap-3 disabled:opacity-50"
                >
                  {connector.icon && (
                    <img src={connector.icon} alt="" className="w-7 h-7 rounded-lg" />
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{connector.name}</div>
                    <div className="text-xs text-white/50">
                      {isPending ? "Connecting..." : "Click to connect"}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ConnectWalletCard() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="space-y-3">
        <div className="text-center mb-4">
          <p className="text-white/70 text-sm">Loading wallet options...</p>
        </div>
      </div>
    );
  }

  return <ConnectWalletCardClient />;
}

function ConnectWalletCardClient() {
  const { connectors, connect, isPending, error } = useConnect();

  // Filter out problematic connectors
  const availableConnectors = connectors.filter(
    (c) => c.name !== 'Porto' && c.type !== 'porto'
  );

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <p className="text-white/70 text-sm">Connect your Web3 wallet to sign in</p>
        <p className="text-white/50 text-xs mt-1">Base Network</p>
      </div>
      
      {/* Network Info */}
      <div className="p-3 rounded-xl bg-gradient-to-r from-zinc-500/10 to-zinc-400/10 border border-zinc-500/20 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-white font-medium">Base</span>
        </div>
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
