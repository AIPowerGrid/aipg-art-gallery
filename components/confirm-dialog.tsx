"use client";

/**
 * Promise-based confirmation dialog — the site-wide replacement for native
 * `confirm()`. Call `confirmDialog({...})` from any client code; the single
 * <ConfirmDialogHost/> in the root layout renders it. Escape / backdrop /
 * Cancel resolve false; the confirm button resolves true.
 */

import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive action — confirm button renders red. */
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: ((ok: boolean) => void) | null;
}

const useConfirmStore = create<ConfirmState>(() => ({
  open: false,
  title: "",
  message: undefined,
  confirmLabel: undefined,
  cancelLabel: undefined,
  danger: false,
  resolve: null,
}));

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // Settle a still-pending dialog as cancelled before showing the new one.
    useConfirmStore.getState().resolve?.(false);
    useConfirmStore.setState({ ...options, open: true, resolve });
  });
}

export function ConfirmDialogHost() {
  const state = useConfirmStore();

  const settle = useCallback((ok: boolean) => {
    const { resolve } = useConfirmStore.getState();
    useConfirmStore.setState({ open: false, resolve: null });
    resolve?.(ok);
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") settle(false);
      if (e.key === "Enter") settle(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.open, settle]);

  if (!state.open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => settle(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,380px)] rounded-2xl border border-[#2a2a31] bg-[#141418] p-5 shadow-2xl"
      >
        <h2 className="text-[15px] font-semibold text-[#e9e9ec]">{state.title}</h2>
        {state.message && (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8f8f99]">{state.message}</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => settle(false)}
            className="rounded-lg border border-[#313138] bg-[#1a1a1f] px-3.5 py-2 text-[12.5px] text-[#cfcfd7] hover:border-[#4a4a53] hover:text-white"
          >
            {state.cancelLabel ?? "Cancel"}
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={`rounded-lg px-3.5 py-2 text-[12.5px] font-semibold ${
              state.danger
                ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                : "bg-[#f5b544] text-[#141414] hover:bg-[#f7c166]"
            }`}
          >
            {state.confirmLabel ?? "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
