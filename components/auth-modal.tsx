"use client";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
}

export function AuthModal({ isOpen, onClose, title, message }: AuthModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full border border-zinc-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-6">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-white mb-3">{title}</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            {message}
          </p>
        </div>
        
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              document.querySelector<HTMLButtonElement>('[data-wallet-button]')?.click();
              onClose();
            }}
            className="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all shadow-lg"
          >
            Connect Wallet
          </button>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
