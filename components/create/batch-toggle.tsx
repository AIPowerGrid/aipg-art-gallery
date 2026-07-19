"use client";

interface BatchToggleProps {
  batchMode: boolean;
  onBatchModeChange: (enabled: boolean) => void;
  authenticated: boolean;
}

/**
 * Auth-gated "generate several at once" switch. Frontend gate is UX only — the
 * server independently enforces the member requirement and the real batch count.
 */
export function BatchToggle({ batchMode, onBatchModeChange, authenticated }: BatchToggleProps) {
  return (
    <label
      className={`flex items-center gap-3 ${authenticated ? "cursor-pointer" : "cursor-not-allowed"}`}
      title={!authenticated ? "Connect your wallet to unlock batch generation" : ""}
    >
      <span className="relative flex items-center">
        <input
          type="checkbox"
          checked={batchMode}
          onChange={(e) => authenticated && onBatchModeChange(e.target.checked)}
          disabled={!authenticated}
          className="sr-only peer"
        />
        <span
          className={`block w-11 h-6 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white ${
            authenticated
              ? "bg-zinc-700 peer-focus:ring-2 peer-focus:ring-indigo-500/50 peer-checked:bg-indigo-600"
              : "bg-zinc-800 opacity-40"
          }`}
        />
      </span>
      <span className={`flex-1 text-sm ${authenticated ? "text-zinc-300" : "text-zinc-500"}`}>
        {authenticated ? "Generate several at once" : "Connect wallet to unlock"}
      </span>
    </label>
  );
}
