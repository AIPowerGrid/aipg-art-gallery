// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addToGallery,
  fetchCreditQuote,
  fetchModels,
  GridCreditQuote,
} from "@/lib/api";
import {
  buildShotImage,
  DEFAULT_SHOT_MODEL,
  shotImageCeiling,
  shotModelAvailable,
} from "@/lib/create/shot-image";
import { useJobStore } from "@/lib/stores/job-store";
import { cropImageToRenderSize } from "@/lib/utils/crop-image";
import { GalleryModel } from "@/types/models";

export function useShotImage(options: {
  owner?: string;
  authenticated: boolean;
  videoSize: string;
  disabled: boolean;
  openingImage?: string | null;
  onSelect: (file: File) => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const owner = options.authenticated
    ? options.owner?.toLowerCase()
    : undefined;
  const [models, setModels] = useState<GalleryModel[]>([]);
  const [modelId, setModelId] = useState(DEFAULT_SHOT_MODEL);
  const [prompt, setPrompt] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [referenceName, setReferenceName] = useState("");
  const [selectedJobId, setSelectedJobId] = useState<string>();
  const [requestId, setRequestId] = useState<string>();
  const [working, setWorking] = useState(false);
  const [formOwner, setFormOwner] = useState(owner);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; image: string } | null>(
    null,
  );
  const [quoteState, setQuoteState] = useState<{
    key: string;
    value: GridCreditQuote | null;
    error: string | null;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const operation = useRef(0);
  const inFlight = useRef(false);
  const live = useRef(options);
  useEffect(() => {
    live.current = options;
  }, [options]);
  const model = models.find((item) => item.id === modelId);
  const available = shotModelAvailable(
    model,
    Boolean(reference),
    options.videoSize,
  );
  const store = useJobStore();
  const jobs = owner
    ? store.jobs.filter(
        (job) => job.walletAddress === owner && job.type === "image",
      )
    : [];
  const currentJob = jobs.find((job) =>
    selectedJobId
      ? job.jobId === selectedJobId
      : requestId && job.requestId === requestId,
  );
  const pending = owner
    ? store.requests.filter(
        (item) => item.owner === owner && item.job.type === "image",
      )
    : [];
  const generating =
    pending.length > 0 ||
    jobs.some((job) => job.status === "queued" || job.status === "processing");
  const busy = working || generating;
  const quoteKey =
    owner && available ? JSON.stringify([owner, modelId, refresh]) : null;
  const quote =
    quoteKey && quoteState?.key === quoteKey ? quoteState.value : null;
  const quoteError =
    quoteKey && quoteState?.key === quoteKey ? quoteState.error : null;
  const ceiling = shotImageCeiling(quote, owner, modelId);
  const canCompose =
    !!owner &&
    formOwner === owner &&
    available &&
    !busy &&
    !options.disabled &&
    !!prompt.trim() &&
    prompt.length <= 4000 &&
    ceiling !== null &&
    quote?.estimate.balance_sufficient === true;
  const image =
    currentJob?.status === "completed"
      ? currentJob.result?.generations.find(
          (item) => item.kind === "image" && item.url,
        )?.url
      : undefined;
  const previewKey =
    owner && image
      ? JSON.stringify([owner, currentJob?.jobId, image, options.videoSize])
      : null;
  const imagePreview =
    previewKey && preview?.key === previewKey ? preview.image : null;
  const selected = !!imagePreview && options.openingImage === imagePreview;
  const awaitingSelection = currentJob?.status === "completed" && !selected;

  useEffect(() => {
    let active = true;
    void fetchModels()
      .then((data) => {
        if (active)
          setModels(data.models.filter((item) => item.type === "image"));
      })
      .catch(() => {
        if (active) setError("Image models are unavailable.");
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (!quoteKey) return;
    const abort = new AbortController();
    let active = true;
    void fetchCreditQuote({ modelId, n: 1 }, abort.signal)
      .then((value) => {
        if (shotImageCeiling(value, owner, modelId) === null)
          throw new Error("Unbound image quote");
        if (active) setQuoteState({ key: quoteKey, value, error: null });
      })
      .catch(() => {
        if (active)
          setQuoteState({
            key: quoteKey,
            value: null,
            error:
              "Image quote unavailable. Refresh the quote or sign in again.",
          });
      });
    return () => {
      active = false;
      abort.abort();
    };
  }, [quoteKey, modelId, owner]);
  useEffect(() => {
    live.current.onBusy(busy || awaitingSelection);
  }, [busy, awaitingSelection]);
  useEffect(
    () => () => {
      operation.current++;
      live.current.onBusy(false);
    },
    [],
  );
  useEffect(() => {
    operation.current++;
    setReference(null);
    setReferenceName("");
    setPreview(null);
    setSelectedJobId(undefined);
    setRequestId(undefined);
    setError(null);
    setPrompt("");
    setWorking(false);
    setFormOwner(owner);
  }, [owner]);
  const terminal =
    currentJob && ["completed", "faulted"].includes(currentJob.status)
      ? `${currentJob.jobId}:${currentJob.status}`
      : null;
  useEffect(() => {
    if (terminal) setRefresh((value) => value + 1);
  }, [terminal]);
  useEffect(() => {
    if (!previewKey || !image) return;
    let active = true;
    const [width, height] = options.videoSize.split("x").map(Number);
    void cropImageToRenderSize(
      `/api/download?image=1&url=${encodeURIComponent(image)}`,
      width,
      height,
    )
      .then((value) => {
        if (active) setPreview({ key: previewKey, image: value });
      })
      .catch(() => {
        if (active)
          setError(
            "The shot image could not be prepared. Its original job is still saved.",
          );
      });
    return () => {
      active = false;
    };
  }, [previewKey, image, options.videoSize]);

  async function loadReference(file?: File) {
    if (inFlight.current || options.disabled || generating) return;
    const attempt = ++operation.current;
    setReference(null);
    setReferenceName("");
    setError(null);
    if (!file) return;
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size <= 0 ||
      file.size > 10 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG or WebP reference of at most 10 MB.");
      return;
    }
    setWorking(true);
    live.current.onBusy(true);
    try {
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === "string"
            ? resolve(reader.result)
            : reject(new Error("Invalid reference"));
        reader.onerror = () => reject(new Error("Unreadable reference"));
        reader.readAsDataURL(file);
      });
      if (
        attempt !== operation.current ||
        useJobStore.getState().activeOwner !== owner
      )
        return;
      setReference(value);
      setReferenceName(file.name);
    } catch {
      if (attempt === operation.current)
        setError("The reference image could not be read.");
    } finally {
      if (attempt === operation.current) setWorking(false);
    }
  }

  async function compose() {
    if (
      inFlight.current ||
      !canCompose ||
      !owner ||
      !model ||
      useJobStore.getState().activeOwner !== owner
    )
      return;
    inFlight.current = true;
    setWorking(true);
    live.current.onBusy(true);
    setError(null);
    try {
      const payload = buildShotImage({
        model,
        prompt,
        reference,
        videoSize: options.videoSize,
        ceiling: ceiling!,
      });
      const accepted = await useJobStore
        .getState()
        .submitJob(payload, owner, (id) => {
          setRequestId(id);
          setSelectedJobId(undefined);
        });
      if (useJobStore.getState().activeOwner !== owner) return;
      setSelectedJobId(accepted.jobId);
      try {
        await addToGallery({
          jobId: accepted.jobId,
          modelId,
          modelName: model.displayName,
          prompt: payload.prompt,
          type: "image",
          isNsfw: false,
          isPublic: false,
          mediaUrls: [],
          params: payload.params,
        });
      } catch {
        if (useJobStore.getState().activeOwner === owner)
          setError(
            "Shot submitted. Its library entry could not be saved; keep the job receipt.",
          );
      }
    } catch (failure) {
      if (useJobStore.getState().activeOwner === owner)
        setError(
          failure instanceof Error
            ? failure.message
            : "Shot composition is unavailable.",
        );
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }

  async function select() {
    if (
      inFlight.current ||
      options.disabled ||
      busy ||
      !imagePreview ||
      !owner ||
      useJobStore.getState().activeOwner !== owner
    )
      return;
    const key = previewKey;
    inFlight.current = true;
    setWorking(true);
    live.current.onBusy(true);
    setError(null);
    try {
      const bytes = Uint8Array.from(atob(imagePreview.split(",")[1]), (char) =>
        char.charCodeAt(0),
      );
      if (
        previewKey !== key ||
        live.current.videoSize !== options.videoSize ||
        useJobStore.getState().activeOwner !== owner
      )
        return;
      await live.current.onSelect(
        new File([bytes], `shot-${currentJob!.jobId}.jpg`, {
          type: "image/jpeg",
        }),
      );
    } catch {
      if (useJobStore.getState().activeOwner === owner)
        setError("The opening frame could not be selected.");
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }
  const refreshQuote = useCallback(() => setRefresh((value) => value + 1), []);
  function chooseJob(jobId?: string) {
    setRequestId(undefined);
    setSelectedJobId(jobId);
  }
  return {
    models,
    modelId,
    setModelId,
    available,
    prompt: formOwner === owner ? prompt : "",
    setPrompt,
    reference: formOwner === owner ? reference : null,
    referenceName: formOwner === owner ? referenceName : "",
    loadReference,
    jobs,
    currentJob,
    pending,
    busy,
    working,
    error,
    quote,
    quoteError,
    ceiling,
    canCompose,
    compose,
    select,
    selected,
    awaitingSelection,
    imagePreview,
    setSelectedJobId: chooseJob,
    refreshQuote,
  };
}
