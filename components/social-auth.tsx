"use client";

import { GoogleSignInButton } from "@/components/google-one-tap";

interface SocialAuthProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function SocialAuth({ onSuccess, onError }: SocialAuthProps) {
  return (
    <div className="space-y-3">
      <div className="text-center mb-4">
        <p className="text-white/70 text-sm">Continue with Google</p>
      </div>
      <GoogleSignInButton onSuccess={onSuccess} onError={onError} />
    </div>
  );
}
