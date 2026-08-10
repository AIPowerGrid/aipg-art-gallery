"use client";

interface BatchToggleProps {
  batchMode: boolean;
  onBatchModeChange: (enabled: boolean) => void;
  authenticated: boolean;
  available?: boolean;
}

/**
 * Auth-gated "generate several at once" switch. Frontend gate is UX only — the
 * server independently enforces the member requirement and the real batch count.
 */
export function BatchToggle({ batchMode, onBatchModeChange, authenticated, available = true }: BatchToggleProps) {
  const enabled = authenticated && available;
  const hint = !authenticated
    ? "Sign in to unlock batch generation"
    : !available
      ? "Batch generation is not available for this workflow"
      : "";
  return (
    <label
      className={`flex items-center gap-3 ${enabled ? "cursor-pointer" : "cursor-not-allowed"}`}
      title={hint}
    >
      <span className="relative flex items-center">
        <input
          type="checkbox"
          checked={batchMode}
          onChange={(e) => enabled && onBatchModeChange(e.target.checked)}
          disabled={!enabled}
          className="sr-only peer"
        />
        <span
          className={`block w-11 h-6 rounded-full peer after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white ${
            enabled
              ? "bg-secondary peer-focus:ring-2 peer-focus:ring-primary/50 peer-checked:bg-primary"
              : "bg-secondary opacity-40"
          }`}
        />
      </span>
      <span className={`flex-1 text-sm ${enabled ? "text-foreground" : "text-tertiary"}`}>
        {!authenticated
          ? "Sign in to unlock"
          : available
            ? "Generate 4 images"
            : "Unavailable for this workflow"}
      </span>
    </label>
  );
}
