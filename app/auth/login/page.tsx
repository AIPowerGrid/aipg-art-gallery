"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ConnectWalletCard } from "@/components/wallet-button";
import { SocialAuth } from "@/components/social-auth";
import { useAuthStore } from "@/lib/stores/auth-store";

// Disable SSR for this page since it uses wagmi hooks
export const dynamic = 'force-dynamic';

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
            <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-zinc-400 rounded-full" />
          </div>
        </div>
      </main>
    );
  }
  
  return <LoginPageClient />;
}

function LoginPageClient() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  // Both wallet SIWE and Google issue the same server session.
  useEffect(() => {
    if (isAuthenticated) {
      router.push("/create");
    }
  }, [isAuthenticated, router]);

  return (
    <main className="flex-1 w-full px-4 md:px-10 py-8 flex items-center justify-center">
      <div className="panel max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-gradient mb-2">Sign In</h1>
          <p className="text-white/70">Continue with Google or verify your wallet</p>
        </div>

        {/* Wallet Connection */}
        <div className="space-y-4">
          <div className="text-center mb-2">
            <p className="text-white/70 text-sm font-medium">Connect Wallet</p>
          </div>
          <ConnectWalletCard />
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-black text-white/50">OR</span>
          </div>
        </div>

        {/* Social Authentication */}
        <SocialAuth 
          onSuccess={() => router.push("/profile")}
          onError={(error) => console.error("Social auth error:", error)}
        />

        <div className="space-y-3 text-sm text-white/60">
          <div className="flex items-start gap-3">
            <span className="text-lg">💡</span>
            <p>Choose Google or a Base wallet. Both create the same secure gallery session.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-lg">🔒</span>
            <p>Wallet sign-in asks for an off-chain signature and never submits a transaction.</p>
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
