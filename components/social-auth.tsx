"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type SocialProvider = 'google' | 'facebook' | 'github' | 'twitter';

interface SocialAuthProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function SocialAuth({ onSuccess, onError }: SocialAuthProps) {
  const [loading, setLoading] = useState<SocialProvider | null>(null);

  const handleSocialLogin = async (provider: SocialProvider) => {
    try {
      setLoading(provider);
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      // Note: The actual redirect happens automatically, so onSuccess may not be called
      // This is handled by the callback route
    } catch (error) {
      console.error(`Error signing in with ${provider}:`, error);
      onError?.(error as Error);
      setLoading(null);
    }
  };

  const socialProviders: Array<{ provider: SocialProvider; name: string; icon: string; color: string }> = [
    {
      provider: 'google',
      name: 'Google',
      icon: '🔵',
      color: 'from-blue-500 to-blue-600',
    },
    {
      provider: 'facebook',
      name: 'Facebook',
      icon: '📘',
      color: 'from-blue-600 to-blue-700',
    },
    {
      provider: 'github',
      name: 'GitHub',
      icon: '⚫',
      color: 'from-gray-800 to-gray-900',
    },
    {
      provider: 'twitter',
      name: 'Twitter',
      icon: '🐦',
      color: 'from-blue-400 to-blue-500',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="text-center mb-4">
        <p className="text-white/70 text-sm">Or sign in with social account</p>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        {socialProviders.map(({ provider, name, icon, color }) => (
          <button
            key={provider}
            onClick={() => handleSocialLogin(provider)}
            disabled={loading !== null}
            className={`
              py-3 px-4 rounded-xl border border-white/20 text-white 
              hover:bg-white/10 transition disabled:opacity-50 disabled:cursor-not-allowed
              flex items-center justify-center gap-2 font-medium
              bg-gradient-to-r ${color} hover:opacity-90
            `}
          >
            {loading === provider ? (
              <div className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
            ) : (
              <>
                <span className="text-lg">{icon}</span>
                <span className="text-sm">{name}</span>
              </>
            )}
          </button>
        ))}
      </div>
      
      {loading && (
        <p className="text-center text-white/50 text-xs mt-2">
          Redirecting to {socialProviders.find(p => p.provider === loading)?.name}...
        </p>
      )}
    </div>
  );
}
