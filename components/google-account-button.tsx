"use client";

import { LogOut } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";

export function GoogleAccountButton() {
  const { authMethod, name, email, clearAuth } = useAuthStore();
  if (authMethod !== "google") return null;

  const label = name || email || "Google account";
  const initial = label.trim().charAt(0).toUpperCase() || "G";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-sm font-semibold text-zinc-900">
        {initial}
      </span>
      <span className="max-w-36 truncate text-sm font-medium text-white" title={label}>
        {label}
      </span>
      <button
        type="button"
        onClick={clearAuth}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-700 hover:text-white"
        title="Sign out"
        aria-label="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
