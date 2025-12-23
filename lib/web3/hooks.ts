'use client';

import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { useCallback, useMemo, useEffect, useState } from 'react';
import { CHAIN_NAMES, MODELVAULT_CONTRACTS, SUPPORTED_CHAINS, DEFAULT_CHAIN_ID } from '../wagmi';
import type { NetworkState, WalletState } from './types';
import { NETWORKS } from './types';

// SSR-safe hook to check if we're mounted on client
function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

// Try to use network context, but handle case where it's not available
function useSafeNetworkContext() {
  const [selectedType, setSelectedType] = useState<'mainnet' | 'testnet'>(() => {
    // Default based on env
    return DEFAULT_CHAIN_ID === baseSepolia.id ? 'testnet' : 'mainnet';
  });
  
  // Load saved preference from localStorage on mount
  useEffect(() => {
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
    rpcUrl: selectedType === 'mainnet' ? 'https://mainnet.base.org' : 'https://sepolia.base.org',
  }), [selectedType]);
  
  return {
    selectedNetwork,
    selectNetwork,
  };
}

/**
 * Hook for managing wallet connection and state
 * Integrates with network context for coordinated network switching
 */
export function useWallet(): WalletState & {
  switchToMainnet: () => Promise<void>;
  switchToTestnet: () => Promise<void>;
  switchNetwork: (chainId: number) => Promise<void>;
  switchToSelectedNetwork: () => Promise<void>;
} {
  const isMounted = useIsMounted();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { selectedNetwork, selectNetwork } = useSafeNetworkContext();

  // Check if on a supported chain
  const isCorrectChain = chainId === NETWORKS.BASE_MAINNET || chainId === NETWORKS.BASE_SEPOLIA;
  
  // Check if wallet network matches selected network preference
  const isMatchingSelectedNetwork = chainId === selectedNetwork.chainId;

  // Update selected network when wallet chain changes (if connected)
  useEffect(() => {
    if (isMounted && isConnected && isCorrectChain) {
      const type = chainId === NETWORKS.BASE_MAINNET ? 'mainnet' : 'testnet';
      selectNetwork(type);
    }
  }, [chainId, isConnected, isCorrectChain, selectNetwork, isMounted]);

  const switchToMainnet = useCallback(async () => {
    if (switchChainAsync) {
      await switchChainAsync({ chainId: base.id });
    }
  }, [switchChainAsync]);

  const switchToTestnet = useCallback(async () => {
    if (switchChainAsync) {
      await switchChainAsync({ chainId: baseSepolia.id });
    }
  }, [switchChainAsync]);

  const switchNetwork = useCallback(async (targetChainId: number) => {
    if (switchChainAsync) {
      await switchChainAsync({ chainId: targetChainId as 8453 | 84532 });
    }
  }, [switchChainAsync]);

  // Switch wallet to the currently selected network preference
  const switchToSelectedNetwork = useCallback(async () => {
    if (switchChainAsync && !isMatchingSelectedNetwork) {
      await switchChainAsync({ chainId: selectedNetwork.chainId as 8453 | 84532 });
    }
  }, [switchChainAsync, selectedNetwork.chainId, isMatchingSelectedNetwork]);

  return {
    isConnected,
    address,
    chainId,
    isCorrectChain,
    switchToMainnet,
    switchToTestnet,
    switchNetwork,
    switchToSelectedNetwork,
  };
}

/**
 * Hook for getting current network information
 * Returns the connected wallet's network info, or falls back to selected network
 */
export function useNetwork(): NetworkState & {
  selectedNetwork: ReturnType<typeof useSafeNetworkContext>['selectedNetwork'];
  isNetworkMatched: boolean;
} {
  const isMounted = useIsMounted();
  const chainId = useChainId();
  const { isConnected } = useAccount();
  const { selectedNetwork } = useSafeNetworkContext();
  
  return useMemo(() => {
    // If not mounted (SSR), use selected network
    if (!isMounted) {
      return {
        chainId: selectedNetwork.chainId,
        chainName: selectedNetwork.name,
        isMainnet: selectedNetwork.type === 'mainnet',
        contractAddress: selectedNetwork.contractAddress,
        selectedNetwork,
        isNetworkMatched: true,
      };
    }
    
    // If connected, use the wallet's chain ID
    // If not connected, use the selected network preference
    const effectiveChainId = isConnected ? chainId : selectedNetwork.chainId;
    const isNetworkMatched = !isConnected || chainId === selectedNetwork.chainId;
    
    return {
      chainId: effectiveChainId,
      chainName: CHAIN_NAMES[effectiveChainId] || 'Unknown Network',
      isMainnet: effectiveChainId === NETWORKS.BASE_MAINNET,
      contractAddress: MODELVAULT_CONTRACTS[effectiveChainId] || MODELVAULT_CONTRACTS[NETWORKS.BASE_MAINNET],
      selectedNetwork,
      isNetworkMatched,
    };
  }, [chainId, isConnected, selectedNetwork, isMounted]);
}

/**
 * Hook for getting supported chains for the network selector
 */
export function useSupportedChains() {
  return useMemo(() => SUPPORTED_CHAINS.map(chain => ({
    id: chain.id,
    name: chain.name,
    isTestnet: chain.testnet || false,
  })), []);
}

/**
 * Hook for network selection (can be used before wallet connection)
 */
export function useNetworkSelection() {
  const { selectedNetwork, selectNetwork } = useSafeNetworkContext();
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const selectAndSwitch = useCallback(async (type: 'mainnet' | 'testnet') => {
    selectNetwork(type);
    
    // If wallet is connected, also switch the wallet network
    if (isConnected && switchChainAsync) {
      try {
        const targetChainId = type === 'mainnet' ? base.id : baseSepolia.id;
        await switchChainAsync({ chainId: targetChainId });
      } catch (error) {
        console.error('Failed to switch wallet network:', error);
        // Network preference is still saved even if wallet switch fails
      }
    }
  }, [selectNetwork, isConnected, switchChainAsync]);

  const networks = useMemo(() => ({
    mainnet: {
      chainId: base.id,
      name: 'Base',
      type: 'mainnet' as const,
      contractAddress: MODELVAULT_CONTRACTS[base.id],
      rpcUrl: 'https://mainnet.base.org',
    },
    testnet: {
      chainId: baseSepolia.id,
      name: 'Base Sepolia',
      type: 'testnet' as const,
      contractAddress: MODELVAULT_CONTRACTS[baseSepolia.id],
      rpcUrl: 'https://sepolia.base.org',
    },
  }), []);

  return {
    selectedNetwork,
    selectAndSwitch,
    isConnected,
    networks,
  };
}
