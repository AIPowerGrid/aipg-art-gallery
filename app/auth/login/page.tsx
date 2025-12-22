"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useConnect, useSignMessage } from "wagmi";
import { ConnectWalletCard } from "@/components/wallet-button";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<"wallet" | "social">("wallet");
  const router = useRouter();
  
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Redirect if wallet connected
  useEffect(() => {
    if (isConnected && address) {
      // Store wallet address in localStorage for now
      // In production, you'd verify the signature server-side
      localStorage.setItem("walletAddress", address);
      router.push("/");
    }
  }, [isConnected, address, router]);

  async function handleOAuthLogin(provider: "github" | "google" | "facebook" | "twitter" | "apple") {
    try {
      setLoading(true);
      setError(null);
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 w-full px-4 md:px-10 py-8 flex items-center justify-center">
      <div className="panel max-w-md w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-gradient mb-2">Welcome Back</h1>
          <p className="text-white/70">Sign in to view and manage your creations</p>
        </div>

        {/* Auth method toggle */}
        <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
          <button
            onClick={() => setAuthMethod("wallet")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
              authMethod === "wallet"
                ? "bg-gradient-to-r from-orange-500 to-yellow-400 text-black"
                : "text-white/70 hover:text-white"
            }`}
          >
            🔗 Wallet
          </button>
          <button
            onClick={() => setAuthMethod("social")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
              authMethod === "social"
                ? "bg-gradient-to-r from-orange-500 to-yellow-400 text-black"
                : "text-white/70 hover:text-white"
            }`}
          >
            👤 Social
          </button>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
            {error}
          </div>
        )}

        {authMethod === "wallet" ? (
          <ConnectWalletCard />
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => handleOAuthLogin("github")}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              Continue with GitHub
            </button>

            <button
              onClick={() => handleOAuthLogin("google")}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuthLogin("twitter")}
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-white/10 border border-white/20 text-white hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
              Continue with X (Twitter)
            </button>
          </div>
        )}

        <p className="text-center text-sm text-white/50">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>

        <div className="text-center">
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Back to Gallery
          </Link>
        </div>
      </div>
    </main>
  );
}

