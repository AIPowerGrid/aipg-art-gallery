"use client";

/**
 * Right-rail segment inspector (mockup B, 1-1): thumbnail + chain meta,
 * segment prompt, exact length (numeric, seconds), seed, chain toggle,
 * start-image strength, and the segment actions.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import {
  DirectorSegment,
  MIN_SEGMENT_SECONDS,
  MAX_SEGMENT_SECONDS,
  framesToSeconds,
  secondsToFrames,
} from "@/lib/types/director";
import { ChainIcon } from "./chain-icon";
import { IconChevronLeft, IconChevronRight, IconDownload } from "./icons";

export type SegmentCoachStep = "source-image" | "prompt" | "render" | null;

interface SegmentInspectorProps {
  segment: DirectorSegment;
  index: number;
  count: number;
  blockers: string[];
  onUpdate: (patch: Partial<DirectorSegment>) => void;
  onToggleChain: () => void;
  onUploadImage: (file: File) => void;
  onGenerateImage: () => void;
  kreaAvailable: boolean;
  canGenerateImage: boolean;
  onRender: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  onDownload?: () => void;
  coachStep?: SegmentCoachStep;
}

const STATUS_LABEL: Record<DirectorSegment["status"], { text: string; cls: string }> = {
  idle: { text: "not rendered", cls: "text-tertiary" },
  queued: { text: "queued…", cls: "text-primary" },
  rendering: { text: "rendering", cls: "text-primary" },
  done: { text: "rendered ●", cls: "text-success" },
  error: { text: "failed", cls: "text-destructive" },
};

export function SegmentInspector({
  segment,
  index,
  count,
  blockers,
  onUpdate,
  onToggleChain,
  onUploadImage,
  onGenerateImage,
  kreaAvailable,
  canGenerateImage,
  onRender,
  onDuplicate,
  onRemove,
  onMove,
  onDownload,
  coachStep = null,
}: SegmentInspectorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const seconds = framesToSeconds(segment.lengthFrames);
  const [lenText, setLenText] = useState(seconds.toFixed(1));
  const [copiedReceipt, setCopiedReceipt] = useState<"frame" | "segment" | null>(null);
  useEffect(() => setLenText(seconds.toFixed(1)), [seconds]);

  const copyReceipt = async (kind: "frame" | "segment", receipt: string) => {
    await navigator.clipboard.writeText(receipt);
    setCopiedReceipt(kind);
    window.setTimeout(() => setCopiedReceipt(null), 1500);
  };

  const commitLength = (raw: string) => {
    const v = parseFloat(raw.replace(",", "."));
    if (Number.isFinite(v)) {
      const clamped = Math.min(MAX_SEGMENT_SECONDS, Math.max(MIN_SEGMENT_SECONDS, v));
      onUpdate({ lengthFrames: secondsToFrames(clamped) });
      setLenText(clamped.toFixed(1));
    } else {
      setLenText(seconds.toFixed(1));
    }
  };
  const nudgeLength = (d: number) => {
    const next = Math.min(MAX_SEGMENT_SECONDS, Math.max(MIN_SEGMENT_SECONDS, seconds + d));
    onUpdate({ lengthFrames: secondsToFrames(next) });
  };

  const status = STATUS_LABEL[segment.status];
  const chained = segment.chained && index > 0;
  const sourceBusy =
    segment.startImageStatus === "queued" || segment.startImageStatus === "generating";
  const renderBusy = segment.status === "queued" || segment.status === "rendering";

  return (
    <div className="rounded-[10px] border border-border bg-background p-4">
      <h3 className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.08em] text-primary">
            Segment {index + 1}
          </span>
          {chained && <ChainIcon className="h-[10px] w-[10px] text-primary/70" />}
        </span>
        <span className={`text-[10.5px] ${status.cls}`}>
          {status.text}
          {segment.status === "rendering" && segment.progress !== undefined && ` ${segment.progress}%`}
        </span>
      </h3>

      {/* thumbnail + meta */}
      <div className="mb-3 flex gap-3">
        <div
          className="relative aspect-[3/2] w-[104px] flex-shrink-0 rounded-lg border border-border bg-cover bg-center"
          style={{
            backgroundImage: segment.startImage
              ? `url(${segment.startImage})`
              : "linear-gradient(135deg,hsl(var(--card)),hsl(var(--background)))",
          }}
        >
          {chained && (
            <span className="absolute left-1 top-1 flex items-center gap-1 rounded border border-primary/45 bg-primary/15 px-[5px] text-[9.5px] text-primary">
              <ChainIcon className="h-[9px] w-[9px]" /> #{index}
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5 text-[11.5px] leading-[1.5] text-muted-foreground">
          {chained ? (
            <>
              <b className="text-foreground">Last frame of #{index}</b>
              {!segment.startImage && <span className="text-tertiary">waiting for #{index}</span>}
              <button
                type="button"
                onClick={onToggleChain}
                className="rounded-md border border-border bg-card px-2 py-[3px] text-[11px] text-foreground hover:border-edge"
              >
                Use own image
              </button>
            </>
          ) : (
            <>
              <b className="max-w-full truncate text-foreground">
                {sourceBusy
                  ? "Krea 2 Turbo is generating…"
                  : segment.startImageName ?? (segment.startImage ? "start image" : "no image yet")}
              </b>
              <span className="flex w-full flex-col gap-1.5">
                <button
                  type="button"
                  onClick={onGenerateImage}
                  disabled={!canGenerateImage || !kreaAvailable || sourceBusy || renderBusy}
                  title={
                    !canGenerateImage
                      ? "Add a segment or global prompt first"
                      : !kreaAvailable
                        ? "Krea 2 Turbo is offline"
                        : "Generate a private first frame with Krea 2 Turbo"
                  }
                  aria-describedby={coachStep === "source-image" ? "director-coach-source" : undefined}
                  className={`rounded-md border border-primary/50 bg-primary/10 px-2 py-[3px] text-[11px] text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                    coachStep === "source-image"
                      ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-background motion-safe:animate-pulse"
                      : ""
                  }`}
                >
                  {sourceBusy ? "Generating…" : "Generate with Krea 2 Turbo"}
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={sourceBusy || renderBusy}
                  aria-describedby={coachStep === "source-image" ? "director-coach-source" : undefined}
                  className="rounded-md border border-border bg-card px-2 py-[3px] text-[11px] text-foreground hover:border-edge disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {segment.startImage ? "Upload replacement" : "Upload image"}
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={onToggleChain}
                    className="rounded-md border border-border bg-card px-2 py-[3px] text-[11px] text-foreground hover:border-edge"
                  >
                    Chain from #{index}
                  </button>
                )}
              </span>
            </>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadImage(f);
            e.target.value = "";
          }}
        />
      </div>
      {segment.startImageStatus === "error" && segment.startImageError && (
        <p className="mb-3 text-[11px] text-destructive">{segment.startImageError}</p>
      )}
      {(segment.startImageGridJobId || segment.gridJobId) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {segment.startImageGridJobId && (
            <button
              type="button"
              onClick={() => copyReceipt("frame", segment.startImageGridJobId!)}
              title={`Copy first-frame Core receipt ${segment.startImageGridJobId}`}
              className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              {copiedReceipt === "frame" ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Frame receipt {segment.startImageGridJobId.slice(0, 8)}…
            </button>
          )}
          {segment.gridJobId && (
            <button
              type="button"
              onClick={() => copyReceipt("segment", segment.gridJobId!)}
              title={`Copy segment Core receipt ${segment.gridJobId}`}
              className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[10.5px] text-muted-foreground hover:text-foreground"
            >
              {copiedReceipt === "segment" ? (
                <Check className="h-3 w-3 text-success" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Segment receipt {segment.gridJobId.slice(0, 8)}…
            </button>
          )}
        </div>
      )}

      <div className="mb-3 space-y-2">
        <textarea
          id={`segment-prompt-${segment.id}`}
          rows={3}
          value={segment.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          placeholder="Describe this segment…"
          aria-label="Segment prompt"
          className={`w-full resize-y rounded-md border bg-card px-2.5 py-2 text-[12.5px] text-foreground placeholder:text-tertiary outline-none focus:border-edge ${
            coachStep === "prompt"
              ? "border-primary/70 ring-2 ring-primary/45 ring-offset-2 ring-offset-background"
              : "border-border"
          }`}
        />
        <textarea
          id={`segment-negative-${segment.id}`}
          rows={2}
          value={segment.negativePrompt ?? ""}
          onChange={(e) => onUpdate({ negativePrompt: e.target.value || undefined })}
          placeholder="Negative prompt (optional)"
          aria-label="Negative prompt for this segment"
          className="w-full resize-y rounded-md border border-border bg-card px-2.5 py-1.5 text-[11.5px] text-foreground placeholder:text-tertiary outline-none focus:border-edge"
        />
      </div>

      <div className="mb-3 grid grid-cols-[112px,1fr] gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Length <span className="text-tertiary numeric">s</span>
          </label>
          <div className="flex items-center overflow-hidden rounded-md border border-border bg-card">
            <button type="button" onClick={() => nudgeLength(-0.5)} className="h-[29px] w-6 text-muted-foreground">
              −
            </button>
            <input
              value={lenText}
              onChange={(e) => setLenText(e.target.value)}
              onBlur={(e) => commitLength(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitLength((e.target as HTMLInputElement).value)}
              className="w-full min-w-0 flex-1 bg-transparent text-center text-[12.5px] tabular-nums text-foreground outline-none"
            />
            <button type="button" onClick={() => nudgeLength(0.5)} className="h-[29px] w-6 text-muted-foreground">
              +
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            Image strength <b className="tabular-nums text-foreground">{segment.strength.toFixed(2)}</b>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(segment.strength * 100)}
            onChange={(e) => onUpdate({ strength: Number(e.target.value) / 100 })}
            className="mt-[9px] w-full accent-primary"
          />
        </div>
      </div>

      {index > 0 && (
        <label className="mb-3 flex cursor-pointer items-center justify-between rounded-md border border-border bg-card px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[12px] text-foreground">
            <ChainIcon className="h-[11px] w-[11px] text-muted-foreground" /> Chain from previous
          </span>
          <button
            type="button"
            onClick={onToggleChain}
            className={`relative h-[18px] w-[32px] flex-shrink-0 rounded-full transition-colors ${
              segment.chained ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-background transition-all ${
                segment.chained ? "right-[2px]" : "left-[2px] bg-muted-foreground"
              }`}
            />
          </button>
        </label>
      )}

      {segment.anchorStale && (
        <p className="mb-2 rounded-md border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] text-primary">
          Segment {index} was re-rendered — re-render this one for a clean join.
        </p>
      )}
      {segment.status === "error" && segment.error && (
        <p className="mb-2 text-[11px] text-destructive">{segment.error}</p>
      )}
      {blockers.length > 0 && segment.status === "idle" && (
        <p className="mb-2 text-[11px] text-tertiary">This segment {blockers.join("; ")}.</p>
      )}

      <div className="flex flex-wrap items-center gap-[7px]">
        <button
          type="button"
          onClick={onRender}
          disabled={blockers.length > 0 || segment.status === "queued" || segment.status === "rendering"}
          aria-describedby={coachStep === "render" ? "director-coach-render" : undefined}
          className={`rounded-lg bg-primary px-3 py-[5px] text-[11.5px] font-semibold text-background disabled:opacity-40 ${
            coachStep === "render"
              ? "ring-2 ring-primary/70 ring-offset-2 ring-offset-background motion-safe:animate-pulse"
              : ""
          }`}
        >
          {segment.status === "done" ? "Re-render" : "Render segment"}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-lg border border-border bg-card px-2.5 py-[5px] text-[11.5px] text-foreground"
        >
          Duplicate
        </button>
        {segment.status === "done" && onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-[5px] text-[11.5px] text-foreground"
          >
            <IconDownload className="h-[11px] w-[11px]" /> Clip
          </button>
        )}
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Move left"
            className="flex h-[24px] w-[24px] items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-30"
          >
            <IconChevronLeft className="h-[12px] w-[12px]" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            title="Move right"
            className="flex h-[24px] w-[24px] items-center justify-center rounded-md border border-border text-muted-foreground disabled:opacity-30"
          >
            <IconChevronRight className="h-[12px] w-[12px]" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-destructive/40 px-2 py-[4px] text-[11px] text-destructive"
          >
            Delete
          </button>
        </span>
      </div>
    </div>
  );
}
