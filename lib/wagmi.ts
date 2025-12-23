'use client';

import { createConfig, http } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'

// WalletConnect project ID - get one at https://cloud.walletconnect.com
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || ''

// Network configuration
export const SUPPORTED_CHAINS = [base, baseSepolia] as const;
export type SupportedChainId = typeof base.id | typeof baseSepolia.id;

// Chain ID to name mapping
export const CHAIN_NAMES: Record<number, string> = {
  8453: 'Base',
  84532: 'Base Sepolia',
};

// Chain ID to network type
export const CHAIN_TYPES: Record<number, 'mainnet' | 'testnet'> = {
  8453: 'mainnet',
  84532: 'testnet',
};

// Contract addresses per network
export const MODELVAULT_CONTRACTS: Record<number, string> = {
  8453: process.env.NEXT_PUBLIC_MODELVAULT_CONTRACT_MAINNET || '0x79F39f2a0eA476f53994812e6a8f3C8CFe08c609',
  84532: process.env.NEXT_PUBLIC_MODELVAULT_CONTRACT_SEPOLIA || '0xe660455D4A83bbbbcfDCF4219ad82447a831c8A1',
};

// RPC URLs
export const RPC_URLS: Record<number, string> = {
  8453: process.env.NEXT_PUBLIC_BASE_RPC_URL || 'https://mainnet.base.org',
  84532: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',
};

// Default chain - can be set via env or defaults to mainnet
export const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID) || 8453;

// Create wagmi config - wagmi 3.x auto-detects browser wallets
export const config = createConfig({
  chains: [base, baseSepolia],
  transports: {
    [base.id]: http(RPC_URLS[8453]),
    [baseSepolia.id]: http(RPC_URLS[84532]),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
