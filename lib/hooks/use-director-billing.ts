import { useEffect, useState } from "react";
import {
  fetchCredits,
  fetchCreditQuote,
  type GridCredits,
  type GridCreditQuote,
} from "@/lib/api";
import { DIRECTOR_FPS, type DirectorSegment } from "@/lib/types/director";
import {
  DIRECTOR_MODEL_ID,
  FALLBACK_MODEL_ID,
  FIRST_FRAME_MODEL_ID,
} from "@/lib/create/director-payload";

interface DirectorBillingOptions {
  authenticated: boolean;
  selected: DirectorSegment | null;
  hasAudio: boolean;
  modelAvailability: {
    checked: boolean;
    director: boolean;
    fallback: boolean;
  };
}

export function useDirectorBilling({
  authenticated,
  selected,
  hasAudio,
  modelAvailability,
}: DirectorBillingOptions) {
  const [credits, setCredits] = useState<GridCredits | null>(null);
  const [firstFrameQuote, setFirstFrameQuote] =
    useState<GridCreditQuote | null>(null);
  const [segmentQuote, setSegmentQuote] = useState<GridCreditQuote | null>(
    null,
  );
  const selectedStatus = selected?.status;
  const selectedStartImageStatus = selected?.startImageStatus;
  const selectedId = selected?.id;
  const selectedLengthFrames = selected?.lengthFrames;

  useEffect(() => {
    if (!authenticated) {
      setCredits(null);
      return;
    }
    void fetchCredits()
      .then(setCredits)
      .catch(() => setCredits(null));
  }, [authenticated, selectedStatus, selectedStartImageStatus]);

  useEffect(() => {
    if (!authenticated) {
      setFirstFrameQuote(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchCreditQuote(
        { modelId: FIRST_FRAME_MODEL_ID, n: 1 },
        controller.signal,
      )
        .then((quote) => {
          setFirstFrameQuote(quote);
          setCredits(quote);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setFirstFrameQuote(null);
          }
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !selectedId || selectedLengthFrames === undefined) {
      setSegmentQuote(null);
      return;
    }
    const controller = new AbortController();
    const useFallback =
      modelAvailability.checked &&
      !modelAvailability.director &&
      !hasAudio &&
      modelAvailability.fallback;
    const modelId = useFallback ? FALLBACK_MODEL_ID : DIRECTOR_MODEL_ID;
    const timer = window.setTimeout(() => {
      void fetchCreditQuote(
        {
          modelId,
          n: 1,
          length: selectedLengthFrames,
          fps: DIRECTOR_FPS,
        },
        controller.signal,
      )
        .then((quote) => {
          setSegmentQuote(quote);
          setCredits(quote);
        })
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setSegmentQuote(null);
          }
        });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    authenticated,
    selectedId,
    selectedLengthFrames,
    hasAudio,
    modelAvailability.checked,
    modelAvailability.director,
    modelAvailability.fallback,
  ]);

  return { credits, firstFrameQuote, segmentQuote };
}
