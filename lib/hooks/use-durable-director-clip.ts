// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid

import { useEffect, useRef, useState } from "react";
import { addToGallery } from "@/lib/api";
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
  const store = useJobStore();
  const jobs = owner ? store.jobs.filter((job) => job.walletAddress === owner && isDurableVideoModel(job.modelId)) : [];
  const pending = owner ? store.requests.filter((request) => request.owner === owner && isDurableVideoModel(request.job.modelId)) : [];
  const busy = submitting || imageLoading || pending.length > 0 || jobs.some((job) => job.status === "queued" || job.status === "processing");
  const quote = useDurableVideoQuote({ enabled: available, authenticated: options.authenticated, ownerIdentifier: owner, model, frames });
  const terminal = jobs[0] && ["completed", "faulted"].includes(jobs[0].status) ? `${jobs[0].jobId}:${jobs[0].status}` : null;
  const refreshQuote = quote.refresh;
  useEffect(() => { if (terminal) refreshQuote(); }, [terminal, refreshQuote]);
  const canSubmit = available && !busy && !!prompt.trim() && quote.costCeilingMicro !== null && quote.quote?.estimate.balance_sufficient === true;

  async function loadImage(file?: File) {
    const attempt = ++imageRead.current;
    setImage(null); setImageName(""); setError(null);
    if (!file) { setImageLoading(false); return; }
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
      setImageLoading(false); setError("Choose a PNG or JPEG smaller than 10 MB."); return;
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
    try {
      const [width, height] = size.split("x").map(Number);
      if (seed && !/^\d+$/.test(seed)) throw new Error("Seed must be a non-negative integer.");
      const payload = buildDurableSegmentPayload({
        model, frames, maxCostMicroUSD: quote.costCeilingMicro!,
        segment: { prompt, negativePrompt }, globalPrompt: "",
        settings: { width, height, steps, cfgScale, negativePrompt, lockSeed: false },
        ...(seed ? { seed: Number(seed) } : {}),
        ...(image ? { keyframes: [{ image, frame: 0, strength: 1 }] } : {}),
      });
      const accepted = await useJobStore.getState().submitJob(payload, owner);
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
    }
  }

  return { model, setModel, available, prompt, setPrompt, negativePrompt, setNegativePrompt, frames, setFrames,
    size, setSize, steps, setSteps, cfgScale, setCfgScale, seed, setSeed, image, imageName, imageLoading, loadImage,
    jobs, pending, busy, error, quote, canSubmit, submit };
}
