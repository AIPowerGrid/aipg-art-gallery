import { useCallback, useEffect, useState } from "react";
import { fetchDurableVideoQuote, GridCreditQuote } from "@/lib/api";
import { DurableVideoRequest } from "@/types/models";
import { validDurableVideoFrames } from "@/lib/create/durable-video-limits";

interface VideoQuoteOptions {
  enabled: boolean;
  authenticated: boolean;
  ownerIdentifier?: string;
  model: DurableVideoRequest["model"];
  frames: number;
}

interface QuoteState {
  key: string;
  quote: GridCreditQuote | null;
  error: string | null;
}

/** Owner/timing changes invalidate a displayed ceiling before effects run. */
export function useDurableVideoQuote(options: VideoQuoteOptions) {
  const { enabled, authenticated, ownerIdentifier, model, frames } = options;
  const owner = ownerIdentifier?.trim().toLowerCase();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<QuoteState | null>(null);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const validFrames = validDurableVideoFrames(model, frames);
  const key = enabled && authenticated && owner && validFrames
    ? JSON.stringify([owner, model, frames, attempt]) : null;

  useEffect(() => {
    if (!key || !owner) {
      setState(null);
      return;
    }
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchDurableVideoQuote({ model, frames, fps: 24 }, controller.signal)
        .then((quote) => {
          if (!active) return;
          const estimate = quote?.estimate;
          if (quote.account_id !== owner || estimate?.model !== model || estimate?.modality !== "video" ||
              estimate?.frames !== frames || estimate?.fps !== 24 || !quote.charging_enabled || !estimate.priced ||
              !Number.isSafeInteger(estimate.cost_micro) || estimate.cost_micro! <= 0) {
            throw new Error("Unbound video quote");
          }
          setState({ key, quote, error: null });
        })
        .catch(() => {
          if (active) setState({ key, quote: null, error: "Video quote unavailable. Refresh your account or try again." });
        });
    }, 150);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [key, owner, model, frames]);

  const current = key && state?.key === key ? state : null;
  return {
    quote: current?.quote ?? null,
    costCeilingMicro: current?.quote?.estimate.cost_micro ?? null,
    loading: !!key && current === null,
    error: current?.error ?? null,
    refresh,
  };
}
