'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';
import { cookieStorage, createStorage } from 'wagmi';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '';

// Network configuration lives in lib/chains.ts (wagmi-free) so prerendered
// components can import it without dragging in getDefaultConfig() below.
export {
  SUPPORTED_CHAINS,
  CHAIN_NAMES,
  CHAIN_TYPES,
  MODELVAULT_CONTRACTS,
  RPC_URLS,
  DEFAULT_CHAIN_ID,
} from '@/lib/chains';
export type { SupportedChainId } from '@/lib/chains';

export const config = getDefaultConfig({
  appName: 'AIPG Gallery',
  projectId,
  chains: [base, baseSepolia],
  ssr: false,
  storage: createStorage({
    storage: cookieStorage,
  }),
});

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
