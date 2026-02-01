"use client";

import { GENERATION_LIMIT } from '@/lib/generation-limits';

interface AnonLimitBannerProps {
  remainingGenerations: number;
  authenticated: boolean;
}

export function AnonLimitBanner({ remainingGenerations, authenticated }: AnonLimitBannerProps) {
  if (authenticated) {
    return null;
  }

  const handleConnectClick = () => {
    // Find and click the wallet button
    const walletBtn = document.querySelector<HTMLButtonElement>('button[data-wallet-button]');
    if (walletBtn) {
      walletBtn.click();
    }
  };

  return (
    <div className="mb-6 bg-[#1a1a1a] border border-[#333] rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-white/80 text-sm">
            <span className="font-medium">
              {remainingGenerations} of {GENERATION_LIMIT} free generations remaining.
            </span>
            {' '}
            <button
              onClick={handleConnectClick}
              className="text-white hover:underline"
            >
              Connect wallet
            </button>
            {' '}for unlimited access.
          </p>
        </div>
      </div>
    </div>
  );
}
