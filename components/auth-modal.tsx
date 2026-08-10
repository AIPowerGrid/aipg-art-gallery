"use client";

import { useRouter } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export function AuthModal({ isOpen, onClose, title, message }: AuthModalProps) {
  const router = useRouter();
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-rise-in"
        onClick={(e) => e.stopPropagation()}
      >
        <AuthPanel
          title={title}
          subtitle={message}
          walletMode="trigger"
          onSuccess={() => {
            onClose();
            router.refresh();
          }}
          footer={
            <button
              onClick={onClose}
              className="w-full rounded-lg px-6 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Not now
            </button>
          }
        />
      </div>
    </div>
  );
}
