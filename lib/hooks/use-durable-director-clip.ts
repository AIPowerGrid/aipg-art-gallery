// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

import { useEffect, useRef, useState } from "react";
import { addToGallery, prepareVideoSource, PreparedVideoSource } from "@/lib/api";
import { buildDurableSegmentPayload } from "@/lib/create/durable-director-payload";
import { useDurableVideoQuote } from "@/lib/hooks/use-durable-video-quote";
import { useJobStore } from "@/lib/stores/job-store";
import { DurableVideoRequest } from "@/types/models";

export const isDurableVideoModel = (model: string) =>
  model === "LTX-2.5 Distilled BF16" || model === "LTX-2.5 Distilled NVFP4";

export function useDurableDirectorClip(options: {
  ownerIdentifier?: string;
  authenticated: boolean;
  enabled: boolean;
  models: Array<{ id: DurableVideoRequest["model"]; onlineWorkers: number }>;
  sourceModes?: Array<"audio" | "video">;
}) {
  const owner = options.authenticated ? options.ownerIdentifier?.toLowerCase() : undefined;
  const [chosenModel, setModel] = useState<DurableVideoRequest["model"]>("LTX-2.5 Distilled BF16");
  // Never silently switch an explicit NVFP4 choice to BF16 or a legacy model.
  const model = chosenModel;
  const available = options.enabled && options.models.some((item) => item.id === model);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [frames, setFrames] = useState(81);
  const [size, setSize] = useState("960x544");
  const [steps, setSteps] = useState(8);
  const [cfgScale, setCfgScale] = useState(1);
  const [seed, setSeed] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const imageRead = useRef(0);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setModeState] = useState<"text" | "audio" | "video">("text");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceURL, setSourceURL] = useState<string | null>(null);
  const [startSeconds, setStartSeconds] = useState(0);
  const [motionStrength, setMotionStrength] = useState(0.85);
  const preparation = useRef<AbortController | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!sourceFile) { setSourceURL(null); return; }
    const url = URL.createObjectURL(sourceFile);
    setSourceURL(url);
    return () => URL.revokeObjectURL(url);
  }, [sourceFile]);
  useEffect(() => () => preparation.current?.abort(), []);
  const store = useJobStore();
  const jobs = owner ? store.jobs.filter((job) => job.walletAddress === owner && isDurableVideoModel(job.modelId)) : [];
  const pending = owner ? store.requests.filter((request) => request.owner === owner && isDurableVideoModel(request.job.modelId)) : [];
  const busy = submitting || imageLoading || pending.length > 0 || jobs.some((job) => job.status === "queued" || job.status === "processing");
  const quote = useDurableVideoQuote({ enabled: available, authenticated: options.authenticated, ownerIdentifier: owner, model, frames });
  const terminal = jobs[0] && ["completed", "faulted"].includes(jobs[0].status) ? `${jobs[0].jobId}:${jobs[0].status}` : null;
  const originalRequestConfirmed = submittedRequest !== undefined && jobs.some((job) =>
    job.requestId === submittedRequest && !job.pollFailures &&
    job.result !== undefined && ["queued", "processing", "completed", "faulted"].includes(job.result.status));
  const refreshQuote = quote.refresh;
  useEffect(() => { if (terminal) refreshQuote(); }, [terminal, refreshQuote]);
  useEffect(() => {
    if (originalRequestConfirmed) {
      setError((value) => value?.startsWith("Generation outcome is unknown.") ? null : value);
    }
  }, [originalRequestConfirmed]);
  const sourceEnabled = mode === "text" || (model === "LTX-2.5 Distilled BF16" && options.sourceModes?.includes(mode) === true);
  const canSubmit = options.authenticated && available && sourceEnabled && !busy && !!prompt.trim() &&
    (mode === "text" || (!!sourceFile && Number.isFinite(startSeconds) && startSeconds >= 0 && startSeconds <= 600)) &&
    quote.costCeilingMicro !== null && quote.quote?.estimate.balance_sufficient === true;

  function setMode(next: "text" | "audio" | "video") {
    if (inFlight.current) return;
    preparation.current?.abort(); setModeState(next); setSourceFile(null); setStartSeconds(0); setError(null);
    if (next === "video" && size !== "512x512") setSize("960x512");
    if (next !== "video" && ["960x512", "512x960"].includes(size)) setSize("960x544");
  }

  function loadSource(file?: File) {
    setSourceFile(null); setError(null);
    if (!file) return;
    if (file.size <= 0 || file.size > 64 * 1024 * 1024) { setError("Choose a source file up to 64 MB."); return; }
    setSourceFile(file);
  }

  async function loadImage(file?: File) {
    const attempt = ++imageRead.current;
    setImage(null); setImageName(""); setError(null);
    if (!file) { setImageLoading(false); return; }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setImageLoading(false); setError("Choose a PNG, JPEG or WebP image up to 10 MB."); return;
    }
    setImageLoading(true);
    try {
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Invalid image"));
        reader.onerror = () => reject(new Error("Unreadable image"));
        reader.readAsDataURL(file);
      });
      if (attempt !== imageRead.current || useJobStore.getState().activeOwner !== owner) return;
      setImage(value); setImageName(file.name);
    } catch {
      if (attempt === imageRead.current && useJobStore.getState().activeOwner === owner) setError("The image could not be read.");
    } finally {
      if (attempt === imageRead.current) setImageLoading(false);
    }
  }

  async function submit() {
    if (inFlight.current || !canSubmit || !owner || useJobStore.getState().activeOwner !== owner) return;
    inFlight.current = true; setSubmitting(true); setError(null);
    setSubmittedRequest(undefined);
    const abort = new AbortController();
    preparation.current = abort;
    try {
      const [width, height] = size.split("x").map(Number);
      if (seed && !/^\d+$/.test(seed)) throw new Error("Seed must be a non-negative integer.");
      let source: PreparedVideoSource | undefined;
      if (mode !== "text") {
        source = await prepareVideoSource(sourceFile!, { mode, frames, width, height, startSeconds }, abort.signal);
        if (abort.signal.aborted || useJobStore.getState().activeOwner !== owner) return;
        if (source.frames !== frames || source.width !== width || source.height !== height || source.startSeconds !== startSeconds ||
            !source.audio?.startsWith("data:audio/wav;base64,") ||
            (mode === "video" ? !source.video?.startsWith("data:video/mp4;base64,") : source.video !== undefined)) {
          throw new Error("Source preparation did not match the selected clip.");
        }
      }
      const payload = buildDurableSegmentPayload({
        model, frames, maxCostMicroUSD: quote.costCeilingMicro!,
        segment: { prompt, negativePrompt }, globalPrompt: "",
        settings: { width, height, steps, cfgScale, negativePrompt, lockSeed: false },
        ...(seed ? { seed: Number(seed) } : {}),
        ...(image ? { keyframes: [{ image, frame: 0, strength: 1 }] } : {}),
        ...(source ? { source: { audio: source.audio, ...(source.video ? { video: source.video, motionStrength } : {}) } } : {}),
      });
      if (abort.signal.aborted || useJobStore.getState().activeOwner !== owner) return;
      const accepted = await useJobStore.getState().submitJob(payload, owner, (requestId) => {
        setSubmittedRequest(requestId);
      });
      if (useJobStore.getState().activeOwner !== owner) return;
      // The job is already tracked; failure to add its private library row is
      // not permission to repeat a paid generation.
      try {
        await addToGallery({ jobId: accepted.jobId, modelId: model, modelName: model, prompt: payload.video.prompt,
          negativePrompt, type: "video", isNsfw: false, isPublic: false, mediaUrls: [] });
      } catch {
        if (useJobStore.getState().activeOwner === owner) setError("Video submitted. Its library entry could not be saved; keep the job receipt.");
      }
    } catch (failure) {
      if (useJobStore.getState().activeOwner === owner) setError(failure instanceof Error ? failure.message : "Video submission unavailable.");
    } finally {
      inFlight.current = false; setSubmitting(false);
      if (preparation.current === abort) preparation.current = null;
    }
  }

  return { model, setModel, available, prompt, setPrompt, negativePrompt, setNegativePrompt, frames, setFrames,
    size, setSize, steps, setSteps, cfgScale, setCfgScale, seed, setSeed, image, imageName, imageLoading, loadImage,
    mode, setMode, sourceFile, sourceURL, loadSource, sourceEnabled, startSeconds, setStartSeconds, motionStrength, setMotionStrength,
    jobs, pending, busy, submitting, error, quote, canSubmit, submit };
}
