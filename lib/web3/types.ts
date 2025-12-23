// Network and wallet state types

export interface NetworkState {
  chainId: number;
  chainName: string;
  isMainnet: boolean;
  contractAddress: string;
}

export interface WalletState {
  isConnected: boolean;
  address: `0x${string}` | undefined;
  chainId: number;
  isCorrectChain: boolean;
}

// Supported networks
export const NETWORKS = {
  BASE_MAINNET: 8453,
  BASE_SEPOLIA: 84532,
} as const;

export type NetworkId = typeof NETWORKS[keyof typeof NETWORKS];

