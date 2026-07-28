"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import { GoogleSignInButton } from "@/components/google-one-tap";
import { useAuthStore } from "@/lib/stores/auth-store";

export const dynamic = 'force-dynamic';

export default function JoinPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { isAuthenticated, authMethod } = useAuthStore();
  const hasSession = isAuthenticated && (authMethod === "google" || isConnected);

  useEffect(() => {
    if (hasSession) {
      router.replace("/create");
    }
  }, [hasSession, router]);

  if (hasSession) {
    return (
      <main className="flex-1 w-full min-h-screen bg-black">
        <Header />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-white/30 border-t-zinc-400 rounded-full" />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 w-full min-h-screen bg-black">
      <Header />

      <div className="max-w-[1200px] mx-auto px-6 md:px-12 py-12">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Unlock Unlimited Access
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto mb-8">
            Continue with Google or verify a Base wallet to save creations and unlock member features.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <GoogleSignInButton />
            <button
              onClick={(e) => {
                e.preventDefault();
                const walletBtn = document.querySelector<HTMLButtonElement>('button[data-wallet-button]');
                if (walletBtn) {
                  walletBtn.click();
                }
              }}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all border border-white/20"
            >
              Connect Wallet Now
            </button>
            <Link
              href="/create"
              className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium rounded-xl transition-all border border-white/10"
            >
              Try as Guest (5 Free)
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 gap-4 mb-12">
          {/* Krea 2 Turbo — image (live) */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Krea 2 Turbo</h3>
                <p className="text-white/60 text-sm mb-3">
                  Fast, high-quality image generation — a great all-round default for realistic and artistic prompts
                </p>
                <span className="inline-block px-2 py-1 bg-white/10 text-white/80 text-xs rounded">
                  Available Now
                </span>
              </div>
            </div>
          </div>

          {/* z-image-turbo — image (live) */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">z-image-turbo</h3>
                <p className="text-white/60 text-sm mb-3">
                  Ultra-fast image generation tuned for speed and clean, coherent results
                </p>
                <span className="inline-block px-2 py-1 bg-white/10 text-white/80 text-xs rounded">
                  Available Now
                </span>
              </div>
            </div>
          </div>

          {/* FLUX.2 Klein 4B FP8 — image (live) */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">FLUX.2 Klein 4B FP8</h3>
                <p className="text-white/60 text-sm mb-3">
                  The open FLUX.2 Klein model — strong on fine detail and prompt accuracy
                </p>
                <span className="inline-block px-2 py-1 bg-white/10 text-white/80 text-xs rounded">
                  Available Now
                </span>
              </div>
            </div>
          </div>

          {/* LTX-2.3 — video (live) */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">LTX-2.3 Video</h3>
                <p className="text-white/60 text-sm mb-3">
                  Text-to-video generation — turn a prompt into a short AI-generated clip
                </p>
                <span className="inline-block px-2 py-1 bg-white/10 text-white/80 text-xs rounded">
                  Available Now
                </span>
              </div>
            </div>
          </div>

          {/* Batch generation — feature (live: n up to 4) */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Batch Image Generation</h3>
                <p className="text-white/60 text-sm mb-3">
                  Generate multiple variations at once to explore different creative directions
                </p>
                <span className="inline-block px-2 py-1 bg-white/10 text-white/80 text-xs rounded">
                  Available Now
                </span>
              </div>
            </div>
          </div>

          {/* More models + LoRAs — forward looking */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">More Models &amp; LoRAs</h3>
                <p className="text-white/60 text-sm mb-3">
                  New image and video models plus custom LoRAs are being added to the grid
                </p>
                <span className="inline-block px-2 py-1 bg-white/5 text-white/50 text-xs rounded">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Benefits Section */}
        <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-8 mb-12">
          <h2 className="text-xl font-semibold text-white mb-6 text-center">Why Sign In?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <h3 className="text-white font-medium mb-2">Unlimited Generations</h3>
              <p className="text-white/50 text-sm">Create as much as you want without limits</p>
            </div>
            <div className="text-center">
              <h3 className="text-white font-medium mb-2">Save Your Work</h3>
              <p className="text-white/50 text-sm">All creations stored in your profile</p>
            </div>
            <div className="text-center">
              <h3 className="text-white font-medium mb-2">Video Generation</h3>
              <p className="text-white/50 text-sm">Turn prompts into short clips with LTX-2.3 video</p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={(e) => {
              e.preventDefault();
              const walletBtn = document.querySelector<HTMLButtonElement>('button[data-wallet-button]');
              if (walletBtn) {
                walletBtn.click();
              }
            }}
            className="px-10 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all border border-white/20"
          >
            Connect Wallet Now
          </button>
        </div>
      </div>
    </main>
  );
}
