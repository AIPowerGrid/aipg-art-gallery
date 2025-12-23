"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAccount, useConnect, useDisconnect, useEnsName } from "wagmi";
import { base, baseSepolia } from 'wagmi/chains';
import { MODELVAULT_CONTRACTS, DEFAULT_CHAIN_ID, CHAIN_NAMES } from "@/lib/wagmi";
import { NetworkSelector } from "./network-selector";

// SSR-safe network selection hook
function useSafeNetworkSelection() {
  const [selectedType, setSelectedType] = useState<'mainnet' | 'testnet'>(() => {
    return DEFAULT_CHAIN_ID === baseSepolia.id ? 'testnet' : 'mainnet';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aipg-preferred-network');
        if (saved && (saved === 'mainnet' || saved === 'testnet')) {
          setSelectedType(saved);
        }
      } catch {
        // Ignore
      }
    }
  }, []);

  const selectedNetwork = useMemo(() => ({
    chainId: selectedType === 'mainnet' ? base.id : baseSepolia.id,
    name: selectedType === 'mainnet' ? 'Base' : 'Base Sepolia',
    type: selectedType,
    contractAddress: selectedType === 'mainnet' ? MODELVAULT_CONTRACTS[base.id] : MODELVAULT_CONTRACTS[baseSepolia.id],
  }), [selectedType]);

  return { selectedNetwork };
}

export function WalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render placeholder during SSR
  if (!mounted) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm">
          <span className="text-white/50">Network</span>
        </div>
        <button className="px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold opacity-50">
          Connect Wallet
        </button>
      </div>
    );
  }

  return <WalletButtonClient />;
}

function WalletButtonClient() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { selectedNetwork } = useSafeNetworkSelection();
  const [showDropdown, setShowDropdown] = useState(false);

  // Determine current chain info from wagmi (if connected)
  const chainId = useAccount()?.chainId;
  const chainName = chainId ? CHAIN_NAMES[chainId] || 'Unknown' : selectedNetwork.name;
  const isMainnet = chainId ? chainId === base.id : selectedNetwork.type === 'mainnet';
  const isNetworkMatched = !isConnected || chainId === selectedNetwork.chainId;

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

  const switchToSelectedNetwork = useCallback(async () => {
    if (typeof window !== 'undefined' && window.ethereum) {
      const targetChainId = selectedNetwork.chainId;
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        } as any);
      } catch (error) {
        console.error('Failed to switch network:', error);
      }
    }
  }, [selectedNetwork.chainId]);

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        {/* Network Selector */}
        <NetworkSelector compact />
        
        {/* Network Mismatch Warning */}
        {!isNetworkMatched && (
          <button
            onClick={switchToSelectedNetwork}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/40 text-yellow-300 text-sm hover:bg-yellow-500/30 transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Switch Network
          </button>
        )}
        
        {/* Wallet Button */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(!showDropdown);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-yellow-400/20 border border-orange-500/40 text-white hover:border-orange-400 transition"
          >
            <span className={`w-2 h-2 rounded-full ${isMainnet ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
            <span className="font-mono text-sm">
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
              <div className="px-3 py-2 mb-2 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Address</div>
                <div className="font-mono text-sm text-white break-all">{address}</div>
              </div>
              
              {/* Network Info */}
              <div className="px-3 py-2 mb-2 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">Connected Network</div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${isMainnet ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
                  <span className="text-sm text-white">{chainName}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isMainnet ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                    {isMainnet ? 'Production' : 'Testnet'}
                  </span>
                </div>
              </div>
              
              {/* Contract Info */}
              <div className="px-3 py-2 mb-2 rounded-lg bg-white/5">
                <div className="text-xs text-white/50 mb-1">ModelVault Contract</div>
                <div className="font-mono text-xs text-white/70 break-all">
                  {selectedNetwork.contractAddress.slice(0, 10)}...{selectedNetwork.contractAddress.slice(-8)}
                </div>
              </div>
              
              {/* Disconnect Button */}
              <button
                onClick={() => {
                  disconnect();
                  setShowDropdown(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Filter out any connectors that might cause issues
  const availableConnectors = connectors.filter(
    (c) => c.name !== 'Porto' && c.type !== 'porto'
  );

  return (
    <div className="flex items-center gap-3">
      {/* Network Selector (can be used before connecting) */}
      <NetworkSelector compact />
      
      {/* Connect Wallet Button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
          className="px-4 py-2 rounded-full bg-gradient-to-r from-orange-500 to-yellow-400 text-black font-semibold hover:opacity-90 transition"
        >
          Connect Wallet
        </button>

        {showDropdown && (
          <div 
            className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-black/95 border border-white/20 p-3 z-50 shadow-xl backdrop-blur-sm"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Network Selection Banner */}
            <div className="mb-3 p-3 rounded-lg bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span className="text-sm text-white/90 font-medium">Connecting to</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${selectedNetwork.type === 'mainnet' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                <span className="text-white font-semibold">{selectedNetwork.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${selectedNetwork.type === 'mainnet' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                  {selectedNetwork.type === 'mainnet' ? 'Production' : 'Testnet'}
                </span>
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
                    className="w-full px-3 py-3 text-left text-sm text-white hover:bg-white/10 rounded-lg transition flex items-center gap-3 disabled:opacity-50"
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
            
            <div className="mt-3 pt-2 border-t border-white/10 px-2 py-2">
              <div className="flex items-center gap-2 text-xs text-white/40">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Use the network selector above to choose a different network</span>
              </div>
            </div>
          </div>
        )}
      </div>
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
  const { selectedNetwork } = useSafeNetworkSelection();

  // Filter out problematic connectors
  const availableConnectors = connectors.filter(
    (c) => c.name !== 'Porto' && c.type !== 'porto'
  );

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <p className="text-white/70 text-sm">Connect your Web3 wallet to sign in</p>
        <p className="text-white/50 text-xs mt-1">Supports Base Mainnet and Base Sepolia</p>
      </div>

      {/* Network Selection */}
      <div className="flex justify-center mb-4">
        <NetworkSelector />
      </div>
      
      {/* Selected Network Info */}
      <div className="p-3 rounded-xl bg-gradient-to-r from-orange-500/10 to-yellow-500/10 border border-orange-500/20 text-center">
        <div className="text-xs text-white/50 mb-1">Will connect to</div>
        <div className="flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${selectedNetwork.type === 'mainnet' ? 'bg-green-400' : 'bg-yellow-400'}`} />
          <span className="text-white font-medium">{selectedNetwork.name}</span>
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
