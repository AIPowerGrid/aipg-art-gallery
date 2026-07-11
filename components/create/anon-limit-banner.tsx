"use client";

import { GENERATION_LIMIT } from '@/lib/generation-limits';

interface AnonLimitBannerProps {
  remainingGenerations: number;
  authenticated: boolean;
  onSignIn: () => void;
}

export function AnonLimitBanner({ remainingGenerations, authenticated, onSignIn }: AnonLimitBannerProps) {
  if (authenticated) {
    return null;
  }

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
              onClick={onSignIn}
              className="text-white hover:underline"
            >
              Sign in
            </button>
            {' '}for unlimited access.
          </p>
        </div>
      </div>
    </div>
  );
}
