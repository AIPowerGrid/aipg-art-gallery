"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Header } from "@/components/header";
import { isAuthenticated } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export default function JoinPage() {
  const { isConnected } = useAccount();

  // If already authenticated, show nothing while WalletButton handles redirect
  if (isConnected && isAuthenticated()) {
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
            Connect your Base wallet to save your creations and access unlimited generations.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
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
          {/* Active Model */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Flux 1.1 Pro Image Generation</h3>
                <p className="text-white/60 text-sm mb-3">
                  State-of-the-art image generation with incredible detail and prompt accuracy
                </p>
                <span className="inline-block px-2 py-1 bg-white/10 text-white/80 text-xs rounded">
                  Available Now
                </span>
              </div>
            </div>
          </div>

          {/* Coming Soon: Batch */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Batch Image Generation</h3>
                <p className="text-white/60 text-sm mb-3">
                  Generate multiple variations at once to explore different creative directions
                </p>
                <span className="inline-block px-2 py-1 bg-white/5 text-white/50 text-xs rounded">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>

          {/* Qwen Image */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Qwen Image Model</h3>
                <p className="text-white/60 text-sm mb-3">
                  Advanced AI model optimized for photorealistic and artistic image creation
                </p>
                <span className="inline-block px-2 py-1 bg-white/5 text-white/50 text-xs rounded">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>

          {/* Flux 2.dev */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Flux 2.dev Image Generation</h3>
                <p className="text-white/60 text-sm mb-3">
                  Next-generation Flux model with enhanced creative capabilities
                </p>
                <span className="inline-block px-2 py-1 bg-white/5 text-white/50 text-xs rounded">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>

          {/* Wan 2.2 Video */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Wan 2.2 Video Generation</h3>
                <p className="text-white/60 text-sm mb-3">
                  Create stunning AI-generated videos from text prompts
                </p>
                <span className="inline-block px-2 py-1 bg-white/5 text-white/50 text-xs rounded">
                  Coming Soon
                </span>
              </div>
            </div>
          </div>

          {/* LTX2 Video */}
          <div className="bg-[#1a1a1a] border border-[#333] rounded-xl p-6 hover:border-[#444] transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">LTX2 Video Generation</h3>
                <p className="text-white/60 text-sm mb-3">
                  High-quality video synthesis with advanced motion control
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
          <h2 className="text-xl font-semibold text-white mb-6 text-center">Why Connect Your Wallet?</h2>
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
              <p className="text-white/50 text-sm">Access to video models (coming soon)</p>
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
