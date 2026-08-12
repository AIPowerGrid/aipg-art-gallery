"use client";

import { useRouter } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { GoogleSignInButton } from "@/components/google-one-tap";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export function AuthModal({ isOpen, onClose, title, message }: AuthModalProps) {
  const router = useRouter();
  const { openConnectModal } = useConnectModal();
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-[#1a1a1a] rounded-xl p-8 max-w-md w-full border border-[#333]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-white mb-3">{title}</h2>
          <p className="text-white/60 text-sm leading-relaxed">
            {message}
          </p>
        </div>
        
        <div className="flex flex-col gap-3">
          <GoogleSignInButton onSuccess={() => {
            onClose();
            router.refresh();
          }} />
          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-[#1a1a1a] px-3 text-white/40">OR</span></div>
          </div>
          <button
            onClick={(e) => {
              e.preventDefault();
              openConnectModal?.();
              onClose();
            }}
            disabled={!openConnectModal}
            className="w-full px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl transition-all border border-white/20"
          >
            Continue with wallet
          </button>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium rounded-xl transition-colors border border-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
