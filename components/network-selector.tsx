"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { base, baseSepolia } from 'wagmi/chains';
import { MODELVAULT_CONTRACTS, DEFAULT_CHAIN_ID } from "@/lib/wagmi";

interface NetworkSelectorProps {
  compact?: boolean;
}

// SSR-safe network selection that doesn't depend on wagmi hooks
function useSafeNetworkSelection() {
  const [selectedType, setSelectedType] = useState<'mainnet' | 'testnet'>(() => {
    return DEFAULT_CHAIN_ID === baseSepolia.id ? 'testnet' : 'mainnet';
  });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load saved preference from localStorage on mount
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('aipg-preferred-network');
        if (saved && (saved === 'mainnet' || saved === 'testnet')) {
          setSelectedType(saved);
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  const selectNetwork = useCallback((type: 'mainnet' | 'testnet') => {
    setSelectedType(type);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('aipg-preferred-network', type);
      } catch {
        // Ignore localStorage errors
      }
    }
  }, []);

  const selectedNetwork = useMemo(() => ({
    chainId: selectedType === 'mainnet' ? base.id : baseSepolia.id,
    name: selectedType === 'mainnet' ? 'Base' : 'Base Sepolia',
    type: selectedType,
    contractAddress: selectedType === 'mainnet' ? MODELVAULT_CONTRACTS[base.id] : MODELVAULT_CONTRACTS[baseSepolia.id],
  }), [selectedType]);

  return {
    selectedNetwork,
    selectNetwork,
    mounted,
  };
}

export function NetworkSelector({ compact = false }: NetworkSelectorProps) {
  const { selectedNetwork, selectNetwork, mounted } = useSafeNetworkSelection();
  const [showDropdown, setShowDropdown] = useState(false);
  const [switching, setSwitching] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setShowDropdown(false);
    if (showDropdown) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [showDropdown]);

  const handleNetworkSwitch = async (type: 'mainnet' | 'testnet') => {
    if (type === selectedNetwork.type) {
      setShowDropdown(false);
      return;
    }
    
    setSwitching(true);
    try {
      selectNetwork(type);
      
      // Try to switch the wallet network if connected
      if (typeof window !== 'undefined' && window.ethereum) {
        const chainId = type === 'mainnet' ? base.id : baseSepolia.id;
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${chainId.toString(16)}` }],
          } as any);
        } catch (switchError: any) {
          // If the chain hasn't been added to the wallet, add it
          if (switchError.code === 4902) {
            const chain = type === 'mainnet' ? base : baseSepolia;
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${chain.id.toString(16)}`,
                chainName: chain.name,
                nativeCurrency: chain.nativeCurrency,
                rpcUrls: chain.rpcUrls.default.http,
                blockExplorerUrls: [chain.blockExplorers?.default?.url],
              }],
            } as any);
          }
        }
      }
    } catch (error) {
      console.error("Failed to switch network:", error);
    } finally {
      setSwitching(false);
      setShowDropdown(false);
    }
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <div className={`px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 ${compact ? 'text-xs' : 'text-sm'}`}>
        <span className="text-white/50">Network</span>
      </div>
    );
  }

  const isMainnet = selectedNetwork.type === 'mainnet';

  // Network indicator colors
  const networkColor = isMainnet ? "bg-green-400" : "bg-yellow-400";
  const networkBorderColor = isMainnet ? "border-green-500/30" : "border-yellow-500/30";
  const networkBgColor = isMainnet ? "bg-green-500/10" : "bg-yellow-500/10";

  const networkItems = [
    { type: 'mainnet' as const, label: 'Base', sublabel: 'Production' },
    { type: 'testnet' as const, label: 'Base Sepolia', sublabel: 'Testnet' },
  ];

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowDropdown(!showDropdown);
        }}
        disabled={switching}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${networkBgColor} ${networkBorderColor} hover:border-white/30 ${compact ? 'text-xs' : 'text-sm'} ${switching ? 'opacity-50 cursor-wait' : ''}`}
      >
        <span className={`w-2 h-2 rounded-full ${networkColor} ${switching ? 'animate-pulse' : ''}`} />
        <span className="text-white/90 font-medium">
          {switching ? "Switching..." : selectedNetwork.name}
        </span>
        <svg 
          className={`w-3 h-3 text-white/50 transition-transform ${showDropdown ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDropdown && (
        <div 
          className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-black/95 border border-white/20 p-2 z-50 shadow-xl backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-2 text-xs text-white/50 border-b border-white/10 mb-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Select Network
          </div>
          
          {networkItems.map((item) => {
            const isActive = item.type === selectedNetwork.type;
            const isTest = item.type === 'testnet';
            
            return (
              <button
                key={item.type}
                onClick={() => handleNetworkSwitch(item.type)}
                disabled={switching}
                className={`w-full px-3 py-3 text-left text-sm rounded-lg transition flex items-center gap-3 ${
                  isActive 
                    ? 'bg-gradient-to-r from-orange-500/20 to-yellow-500/20 border border-orange-500/30 text-white' 
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${isTest ? 'bg-yellow-400' : 'bg-green-400'}`} />
                <div className="flex-1">
                  <div className="font-medium">{item.label}</div>
                  <div className="text-xs text-white/50">
                    {item.sublabel}
                  </div>
                </div>
                {isActive && (
                  <svg className="w-4 h-4 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}

          <div className="mt-2 pt-2 border-t border-white/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-white/40">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Select network before connecting wallet</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
