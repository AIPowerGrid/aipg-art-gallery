// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
"use client";

import {
  Download,
  Film,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Scissors,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthModal } from "@/components/auth-modal";
import { DurableVideoCapabilities } from "@/lib/api";
import { useDurableDirectorClip } from "@/lib/hooks/use-durable-director-clip";
import { DurableVideoRequest } from "@/types/models";

const field =
  "w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400";
const funding =
  "https://console.aipowergrid.io/dashboard/funding?returnTo=https%3A%2F%2Faipg.art%2Fcreate%3Ftype%3Dvideo";

export function DurableClipConsole(props: {
  ownerIdentifier?: string;
  authenticated?: boolean;
  enabled: boolean;
  models: DurableVideoCapabilities["models"];
  sourceModes?: DurableVideoCapabilities["sourceModes"];
  onAssemble?: (clip: {
    url: string;
    frames: number;
    gridJobId?: string;
  }) => void;
}) {
  const authenticated = props.authenticated ?? true;
  const clip = useDurableDirectorClip({ ...props, authenticated });
  const [showAuth, setShowAuth] = useState(false);
  const [timing, setTiming] = useState<{
    url: string;
    duration: number;
  } | null>(null);
  const latest = clip.jobs[0];
  const resultPanel = useRef<HTMLDivElement>(null);
  const followResult = useRef<{ previous?: string } | null>(null);
  const latestId = latest?.jobId;
  useEffect(() => {
    if (!followResult.current) return;
    if (
      clip.pending.length > 0 ||
      (latestId && latestId !== followResult.current.previous)
    ) {
      resultPanel.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "nearest",
      });
      followResult.current = null;
    } else if (!clip.busy && clip.error) followResult.current = null;
  }, [latestId, clip.pending.length, clip.busy, clip.error]);
  const output = latest?.result?.generations.find(
    (item) => item.kind === "video" && item.url,
  )?.url;
  const uncertain =
    clip.pending.length > 0 ||
    latest?.result?.status === "uncertain" ||
    !!latest?.pollFailures;
  const generating =
    clip.submitting ||
    latest?.status === "queued" ||
    latest?.status === "processing";
  const status = uncertain
    ? "Checking original request"
    : generating
      ? latest?.status === "queued"
        ? "In queue"
        : "Generating clip"
      : latest?.status === "faulted"
        ? "Generation failed"
        : output
          ? "Ready to play"
          : "Video preview";

  return (
    <section
      aria-label="LTX-2.5 clip workspace"
      className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!authenticated) setShowAuth(true);
          else if (clip.canSubmit) {
            followResult.current = { previous: latestId };
            void clip.submit();
          }
        }}
        className="grid min-w-0 grid-cols-1 items-start gap-6 [grid-template-areas:'prompt'_'settings'_'preview'] lg:grid-cols-[minmax(0,1fr)_360px] lg:[grid-template-areas:'prompt_settings'_'preview_settings']"
      >
        <div className="min-w-0 [grid-area:prompt]">
          <label
            htmlFor="video-clip-prompt"
            className="mb-2 block text-sm font-medium text-zinc-200"
          >
            Clip prompt
          </label>
          <textarea
            id="video-clip-prompt"
            placeholder="A slow camera move through a sunlit forest, leaves stirring in the breeze…"
            className={`${field} min-h-32 resize-y bg-zinc-900/70 p-4 leading-relaxed`}
            value={clip.prompt}
            maxLength={8000}
            disabled={clip.busy}
            onChange={(event) => clip.setPrompt(event.target.value)}
          />
          {clip.error && (
            <p role="alert" className="mt-3 break-words text-sm text-amber-300">
              {clip.error}
            </p>
          )}
        </div>

        <aside
          aria-label="Video settings"
          className="min-w-0 space-y-5 border-t border-zinc-800 pt-5 [grid-area:settings] lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
        >
          <div
            role="group"
            aria-label="Generation mode"
            className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1"
          >
            {(
              [
                ["text", "Text to video"],
                ["audio", "Audio to video"],
                ["video", "Video to video"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={clip.mode === mode}
                disabled={clip.busy}
                className={`min-w-0 rounded-md px-1 py-2 text-xs font-medium transition-colors ${clip.mode === mode ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                onClick={() => clip.setMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="block space-y-2 text-sm text-zinc-300">
            Model
            <select
              className={field}
              value={clip.model}
              disabled={clip.busy}
              onChange={(event) =>
                clip.setModel(
                  event.target.value as DurableVideoRequest["model"],
                )
              }
            >
              {(
                ["LTX-2.5 Distilled BF16", "LTX-2.5 Distilled NVFP4"] as const
              ).map((id) => {
                const online = props.models.find((item) => item.id === id);
                return (
                  <option key={id} value={id} disabled={!online}>
                    {id}
                    {online
                      ? ` · ${online.onlineWorkers} online`
                      : authenticated
                        ? " · unavailable"
                        : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-2 text-sm text-zinc-300">
              Clip length
              <select
                className={field}
                value={clip.frames}
                disabled={clip.busy}
                onChange={(event) => clip.setFrames(Number(event.target.value))}
              >
                {Array.from(
                  new Set([9, 33, 81, 121, 169, 241, 337, clip.frames]),
                )
                  .filter(Number.isFinite)
                  .sort((a, b) => a - b)
                  .map((frames) => (
                    <option key={frames} value={frames}>
                      {(frames / 24).toFixed(2)} seconds
                    </option>
                  ))}
              </select>
            </label>
            <label className="block space-y-2 text-sm text-zinc-300">
              Resolution
              <select
                className={field}
                value={clip.size}
                disabled={clip.busy}
                onChange={(event) => clip.setSize(event.target.value)}
              >
                {clip.mode === "video" ? (
                  <>
                    <option value="960x512">960 × 512</option>
                    <option value="512x960">512 × 960</option>
                  </>
                ) : (
                  <>
                    <option value="960x544">960 × 544</option>
                    <option value="544x960">544 × 960</option>
                  </>
                )}
                <option value="512x512">512 × 512</option>
              </select>
            </label>
          </div>
          {clip.mode !== "text" && (
            <div className="space-y-3 border-t border-zinc-800 pt-4">
              <label className="block space-y-2 text-sm text-zinc-300">
                {clip.mode === "audio" ? "Soundtrack" : "Source video"}
                <input
                  key={clip.mode}
                  aria-label={
                    clip.mode === "audio" ? "Soundtrack" : "Source video"
                  }
                  className="block w-full min-w-0 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-zinc-200"
                  type="file"
                  accept={
                    clip.mode === "audio"
                      ? "audio/*"
                      : "video/mp4,video/webm,video/quicktime"
                  }
                  disabled={clip.busy}
                  onChange={(event) => clip.loadSource(event.target.files?.[0])}
                />
              </label>
              {clip.sourceURL &&
                (clip.mode === "audio" ? (
                  <audio
                    aria-label="Source soundtrack preview"
                    src={clip.sourceURL}
                    controls
                    preload="metadata"
                    className="w-full"
                  />
                ) : (
                  <video
                    aria-label="Source video preview"
                    src={clip.sourceURL}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full rounded-md bg-black object-contain"
                  />
                ))}
              <label className="block space-y-2 text-sm text-zinc-300">
                Source start (seconds)
                <input
                  className={field}
                  type="number"
                  min={0}
                  max={600}
                  step={0.001}
                  value={clip.startSeconds}
                  disabled={clip.busy}
                  onChange={(event) =>
                    clip.setStartSeconds(Number(event.target.value))
                  }
                />
              </label>
              <p className="text-xs text-zinc-500">
                {clip.mode === "video"
                  ? "Original soundtrack retained. Picture fitted without cropping."
                  : "Uploaded soundtrack retained."}
              </p>
            </div>
          )}
          <div className="border-t border-zinc-800 pt-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-sm text-zinc-300">
              <span>First frame</span>
              <span className="text-xs text-zinc-500">Optional</span>
            </div>
            <label
              className={`flex min-h-16 items-center justify-center gap-2 rounded-md border border-dashed border-zinc-700 px-3 py-3 text-sm text-zinc-300 hover:border-zinc-500 ${clip.busy ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
              <ImagePlus size={18} aria-hidden="true" />
              {clip.image ? "Replace image" : "Upload image"}
              <input
                aria-label="Opening image"
                className="sr-only"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={clip.busy}
                onChange={(event) => {
                  void clip.loadImage(event.target.files?.[0]);
                }}
              />
            </label>
            {clip.image && (
              <div className="mt-3 flex min-w-0 items-center gap-3">
                {/* Ephemeral input must not pass through the image optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={clip.image}
                  alt="Opening image guide"
                  className="h-16 w-16 shrink-0 rounded-md bg-zinc-900 object-contain"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                  {clip.imageName}
                </span>
                <button
                  type="button"
                  title="Remove opening image"
                  aria-label="Remove opening image"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-zinc-800"
                  disabled={clip.busy}
                  onClick={() => {
                    void clip.loadImage();
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
          <details className="border-t border-zinc-800 pt-4">
            <summary className="cursor-pointer text-sm text-zinc-300">
              Advanced
            </summary>
            <div className="mt-4 space-y-4">
              <label className="block space-y-2 text-sm text-zinc-300">
                Output frames
                <input
                  className={field}
                  type="number"
                  min={9}
                  max={337}
                  step={8}
                  value={clip.frames}
                  disabled={clip.busy}
                  onChange={(event) =>
                    clip.setFrames(Number(event.target.value))
                  }
                />
              </label>
              {clip.mode === "video" && (
                <label className="block space-y-2 text-sm text-zinc-300">
                  Motion strength{" "}
                  <span className="tabular-nums">
                    {clip.motionStrength.toFixed(2)}
                  </span>
                  <input
                    className="w-full accent-indigo-500"
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={clip.motionStrength}
                    disabled={clip.busy}
                    onChange={(event) =>
                      clip.setMotionStrength(Number(event.target.value))
                    }
                  />
                </label>
              )}
              <label className="block space-y-2 text-sm text-zinc-300">
                Negative prompt
                <input
                  className={field}
                  value={clip.negativePrompt}
                  maxLength={8000}
                  disabled={clip.busy}
                  onChange={(event) =>
                    clip.setNegativePrompt(event.target.value)
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-2 text-sm text-zinc-300">
                  Steps
                  <input
                    className={field}
                    type="number"
                    min={4}
                    max={40}
                    value={clip.steps}
                    disabled={clip.busy}
                    onChange={(event) =>
                      clip.setSteps(Number(event.target.value))
                    }
                  />
                </label>
                <label className="block space-y-2 text-sm text-zinc-300">
                  Guidance
                  <input
                    className={field}
                    type="number"
                    min={1}
                    max={5}
                    step={0.1}
                    value={clip.cfgScale}
                    disabled={clip.busy}
                    onChange={(event) =>
                      clip.setCfgScale(Number(event.target.value))
                    }
                  />
                </label>
              </div>
              <label className="block space-y-2 text-sm text-zinc-300">
                Seed
                <input
                  className={field}
                  inputMode="numeric"
                  value={clip.seed}
                  disabled={clip.busy}
                  onChange={(event) => clip.setSeed(event.target.value)}
                  placeholder="Random"
                />
              </label>
            </div>
          </details>
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-zinc-400">Maximum charge</span>
              <span className="ml-auto font-medium tabular-nums">
                {clip.quote.costCeilingMicro !== null
                  ? `$${(clip.quote.costCeilingMicro / 1_000_000).toFixed(4)}`
                  : "—"}
              </span>
              <button
                type="button"
                title="Refresh quote"
                aria-label="Refresh quote"
                className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white"
                onClick={clip.quote.refresh}
                disabled={clip.busy}
              >
                <RefreshCw size={14} />
              </button>
            </div>
            {clip.quote.quote && (
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span>
                  Available $
                  {(clip.quote.quote.total_spendable_micro / 1_000_000).toFixed(
                    4,
                  )}
                </span>
                <a
                  href={funding}
                  className="text-indigo-300 hover:text-indigo-200"
                >
                  Add credits
                </a>
              </div>
            )}
            {!clip.quote.quote && clip.error?.startsWith("402") && (
              <a href={funding} className="block text-sm text-indigo-300">
                Add credits
              </a>
            )}
            {authenticated && (!props.enabled || !clip.sourceEnabled) && (
              <p role="status" className="text-sm text-zinc-400">
                {clip.mode !== "text" && !clip.sourceEnabled
                  ? "This source mode is not yet available."
                  : "New clip submissions are closed."}
              </p>
            )}
            {clip.quote.error && (
              <p role="alert" className="text-sm text-amber-300">
                {clip.quote.error}
              </p>
            )}
            <button
              type="submit"
              disabled={authenticated && !clip.canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {clip.submitting ? (
                <LoaderCircle
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Film size={16} aria-hidden="true" />
              )}
              {!authenticated
                ? "Sign in to generate"
                : clip.submitting
                  ? "Preparing / submitting…"
                  : "Generate clip"}
            </button>
          </div>
        </aside>

        <div
          ref={resultPanel}
          className="min-w-0 scroll-mt-24 space-y-4 [grid-area:preview]"
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <h2 className="flex items-center gap-2 font-medium">
              {generating && (
                <LoaderCircle
                  size={14}
                  className="animate-spin text-indigo-400"
                  aria-hidden="true"
                />
              )}
              {status}
            </h2>
            <a
              href="/profile"
              className="text-indigo-300 hover:text-indigo-200"
            >
              My creations
            </a>
          </div>
          <div className="flex aspect-video min-w-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            {output ? (
              <video
                key={output}
                aria-label="Generated clip"
                src={output}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={(event) =>
                  setTiming({
                    url: output,
                    duration: event.currentTarget.duration,
                  })
                }
                className="h-full w-full object-contain"
              />
            ) : (
              <Film
                size={40}
                strokeWidth={1}
                className="text-zinc-700"
                aria-label="Clip preview"
              />
            )}
          </div>
          {uncertain && (
            <p role="status" className="text-sm text-amber-300">
              Checking the original request. No new generation submitted.
            </p>
          )}
          {latest?.error && (
            <p role="alert" className="break-words text-sm text-amber-300">
              {latest.error}
            </p>
          )}
          {output && (
            <div className="flex flex-wrap items-center gap-3">
              <a
                className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                href={`/api/download?url=${encodeURIComponent(output)}`}
                download
              >
                <Download size={16} aria-hidden="true" />
                Download clip
              </a>
              {props.onAssemble &&
                timing?.url === output &&
                Number.isFinite(timing.duration) && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-900"
                    onClick={() =>
                      props.onAssemble?.({
                        url: output,
                        frames: Math.round(timing.duration * 24),
                        gridJobId: latest?.result?.gridJobId,
                      })
                    }
                  >
                    <Scissors size={16} aria-hidden="true" />
                    Open in Director
                  </button>
                )}
            </div>
          )}
          {(latest || clip.pending.length > 0) && (
            <details className="border-t border-zinc-800 pt-3 text-xs text-zinc-500">
              <summary className="cursor-pointer">Generation details</summary>
              <div className="mt-3 space-y-2">
                {clip.pending.map((request) => (
                  <p key={request.requestId} className="break-all font-mono">
                    Request {request.requestId}
                  </p>
                ))}
                {latest && (
                  <p className="break-all font-mono">
                    Gallery job {latest.jobId}
                  </p>
                )}
                {latest?.result?.gridJobId && (
                  <p className="break-all font-mono">
                    Core receipt {latest.result.gridJobId}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      </form>
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        title="Sign in to AIPG"
        message="Continue with Google or your wallet."
      />
    </section>
  );
}
