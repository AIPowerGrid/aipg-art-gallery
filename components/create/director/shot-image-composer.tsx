// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 AI Power Grid
"use client";

import { Check, ImagePlus, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useShotImage } from "@/lib/hooks/use-shot-image";
import { shotImageSize } from "@/lib/create/shot-image";

const field =
  "w-full min-w-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white";

export function ShotImageComposer(props: Parameters<typeof useShotImage>[0]) {
  const shot = useShotImage(props);
  const dimensions = shotImageSize(props.videoSize);
  const fundingNeeded = shot.quote?.estimate.balance_sufficient === false;
  const failure =
    shot.error ||
    shot.quoteError ||
    (fundingNeeded ? "Insufficient Grid credits for this shot image." : null);
  const status =
    shot.pending.length > 0
      ? "Checking original shot request"
      : shot.currentJob?.status === "queued"
        ? "Shot image queued"
        : shot.currentJob?.status === "processing"
          ? "Composing shot image"
          : shot.currentJob?.status === "faulted"
            ? shot.currentJob.error || "Shot image failed"
            : null;
  return (
    <details open className="mb-6 min-w-0 border-b border-zinc-800 pb-5">
      <summary className="cursor-pointer text-sm font-medium text-zinc-200">
        Compose shot image
        {shot.awaitingSelection && (
          <span className="ml-2 text-xs font-normal text-amber-300">
            Awaiting selection
          </span>
        )}
      </summary>
      <div className="mt-4 min-w-0 space-y-4">
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-3">
            {shot.currentJob && (
              <div className="flex justify-end">
                <button
                  type="button"
                  title="Clear shot preview"
                  aria-label="Clear shot preview"
                  disabled={shot.busy || props.disabled}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800"
                  onClick={() => shot.setSelectedJobId(undefined)}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <label className="block space-y-2 text-sm text-zinc-300">
              Reference image{" "}
              <span className="text-xs text-zinc-500">Optional</span>
              <input
                aria-label="Character reference"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="block w-full min-w-0 text-xs file:mr-2 file:rounded-md file:border-0 file:bg-zinc-800 file:px-3 file:py-2"
                disabled={props.disabled || shot.busy}
                onChange={(event) => {
                  void shot.loadReference(event.target.files?.[0]);
                }}
              />
            </label>
            {shot.reference && (
              <div className="flex min-w-0 items-center gap-2">
                {/* Ephemeral uploads never pass through the optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={shot.reference}
                  alt="Character reference"
                  className="h-20 w-20 shrink-0 rounded-md bg-zinc-900 object-contain"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                  {shot.referenceName}
                </span>
                <button
                  type="button"
                  title="Remove reference"
                  aria-label="Remove reference"
                  disabled={props.disabled || shot.busy}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-zinc-800"
                  onClick={() => {
                    void shot.loadReference();
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <label className="block space-y-2 text-sm text-zinc-300">
              Scene prompt
              <textarea
                aria-label="Scene prompt"
                className={`${field} min-h-28 resize-y`}
                maxLength={4000}
                value={shot.prompt}
                disabled={props.disabled || shot.busy}
                onChange={(event) => shot.setPrompt(event.target.value)}
                placeholder="The character sits at a cabin table, warm sunlight from the left…"
              />
            </label>
            <label className="block space-y-2 text-sm text-zinc-300">
              Shot image model
              <select
                className={field}
                value={shot.modelId}
                disabled={props.disabled || shot.busy}
                onChange={(event) => shot.setModelId(event.target.value)}
              >
                {!shot.models.some((model) => model.id === shot.modelId) && (
                  <option value={shot.modelId}>
                    {shot.modelId} · unavailable
                  </option>
                )}
                {shot.models.map((model) => (
                  <option
                    key={model.id}
                    value={model.id}
                    disabled={
                      model.status !== "online" ||
                      (!!shot.reference &&
                        !model.capabilities.includes("img2img"))
                    }
                  >
                    {model.displayName}
                    {model.status !== "online" ? " · offline" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
              <span>
                {dimensions.width} × {dimensions.height}
              </span>
              <span className="ml-auto">
                Image maximum:{" "}
                {shot.ceiling !== null
                  ? `$${(shot.ceiling / 1_000_000).toFixed(4)}`
                  : "Unavailable"}
              </span>
              <button
                type="button"
                title="Refresh image quote"
                aria-label="Refresh image quote"
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-zinc-800"
                disabled={shot.busy}
                onClick={shot.refreshQuote}
              >
                <RefreshCw size={14} />
              </button>
            </div>
            <button
              type="button"
              disabled={!shot.canCompose}
              onClick={() => {
                void shot.compose();
              }}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 text-sm font-medium text-black disabled:opacity-40"
            >
              {shot.busy ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <ImagePlus size={16} />
              )}
              Compose shot
            </button>
          </div>
          <div className="min-w-0 space-y-3">
            <div
              className="flex min-h-40 items-center justify-center overflow-hidden rounded-md border border-zinc-800 bg-zinc-950"
              style={{ aspectRatio: props.videoSize.replace("x", "/") }}
            >
              {shot.imagePreview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={shot.imagePreview}
                    alt="Shot image preview"
                    className="h-full w-full object-contain"
                  />
                </>
              ) : (
                <span className="px-4 text-center text-xs text-zinc-500">
                  {status || "Shot preview"}
                </span>
              )}
            </div>
            <button
              type="button"
              disabled={
                !shot.imagePreview ||
                shot.busy ||
                props.disabled ||
                shot.selected
              }
              onClick={() => {
                void shot.select();
              }}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-zinc-600 px-3 text-sm text-white disabled:opacity-60"
            >
              <Check size={16} />
              {shot.selected
                ? "Opening frame selected"
                : "Use shot as opening frame"}
            </button>
            {shot.jobs.some((job) => job.status === "completed") && (
              <label className="block space-y-2 text-sm text-zinc-300">
                Recent images
                <select
                  className={field}
                  value={shot.currentJob?.jobId ?? ""}
                  disabled={props.disabled || shot.busy}
                  onChange={(event) =>
                    shot.setSelectedJobId(event.target.value || undefined)
                  }
                >
                  <option value="">Select an image</option>
                  {shot.jobs
                    .filter((job) => job.status === "completed")
                    .slice(0, 8)
                    .map((job) => (
                      <option key={job.jobId} value={job.jobId}>
                        {job.prompt.slice(0, 65)}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
        </div>
        {(failure || status) && (
          <p
            role={failure ? "alert" : "status"}
            className="break-words text-sm text-amber-300"
          >
            {failure || status}
            {fundingNeeded && (
              <a
                className="ml-2 underline"
                href="https://console.aipowergrid.io/dashboard/funding?returnTo=https%3A%2F%2Faipg.art%2Fcreate%3Ftype%3Dvideo"
              >
                Add credits
              </a>
            )}
          </p>
        )}
      </div>
    </details>
  );
}
