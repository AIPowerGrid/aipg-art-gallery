"use client";

import { useAccount } from "wagmi";
import { DirectorConsole } from "@/components/create/director";
import { useStylesConfig } from "@/lib/hooks/use-styles-config";
import { isAuthenticated } from "@/lib/auth";

export function DirectorPageContent() {
  const { address, isConnected } = useAccount();
  const authenticated = isConnected && isAuthenticated();
  const { styles } = useStylesConfig();

  return <DirectorConsole styles={styles} walletAddress={address} authenticated={authenticated} />;
}
