"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectWalletCard } from "@/components/wallet-button";

// Wrapper component to ensure we only use wagmi after mounting
export default function LoginPage() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) {
    return (
      <main className="flex-1 w-full px-4 md:px-10 py-8 flex items-center justify-center">
        <div className="panel max-w-md w-full">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-orange-500 rounded-full" />
          </div>
        </div>
      </main>
    );
  }
  
  return <LoginPageClient />;
}

function LoginPageClient() {
  const router = useRouter();
  const { address, isConnected } = useAccount();

  // Redirect if wallet connected
  useEffect(() => {
    if (isConnected && address) {
      router.push("/profile");
    }
  }, [isConnected, address, router]);

  return (
    <main className="flex-1 w-full px-4 md:px-10 py-8 flex items-center justify-center">
      <div className="panel max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-gradient mb-2">Connect Wallet</h1>
          <p className="text-white/70">Connect your wallet to track your creations</p>
        </div>

        <ConnectWalletCard />

        <div className="space-y-3 text-sm text-white/60">
          <div className="flex items-start gap-3">
            <span className="text-lg">💡</span>
            <p>Your wallet address is used to associate jobs with your account. No signature or transaction is required.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-lg">🔒</span>
            <p>Your job history is stored locally in your browser. Connecting a wallet lets you identify your creations across sessions.</p>
          </div>
        </div>

        <div className="text-center">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Back to Gallery
          </Link>
        </div>
      </div>
    </main>
  );
}
