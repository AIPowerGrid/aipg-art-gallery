"use client";

import { useState, useEffect } from "react";

export function useWalletAddress() {
  const [mounted, setMounted] = useState(false);
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Use window.ethereum directly to avoid WagmiProvider requirement during SSR
    if (typeof window === "undefined") return;
    
    const checkWallet = async () => {
      try {
        const ethereum = (window as any).ethereum;
        if (ethereum) {
          const accounts: string[] = await ethereum.request({ method: "eth_accounts" });
          if (accounts && accounts.length > 0) {
            setAddress(accounts[0]);
            setIsConnected(true);
          }
        }
      } catch (e) {
        // Wallet not available
      }
    };
    
    checkWallet();
    
    // Listen for account changes
    const ethereum = (window as any).ethereum;
    if (ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setAddress(accounts[0]);
          setIsConnected(true);
        } else {
          setAddress(undefined);
          setIsConnected(false);
        }
      };
      ethereum.on("accountsChanged", handleAccountsChanged);
      return () => ethereum.removeListener("accountsChanged", handleAccountsChanged);
    }
  }, []);

  return {
    address: mounted ? address : undefined,
    isConnected: mounted ? isConnected : false,
    mounted,
  };
}
