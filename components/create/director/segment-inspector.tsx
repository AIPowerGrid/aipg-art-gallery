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
import { CoachTip } from "./coach-tip";
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
  idle: { text: "not rendered", cls: "text-[#5a5a64]" },
  queued: { text: "queued…", cls: "text-[#f5b544]" },
  rendering: { text: "rendering", cls: "text-[#f5b544]" },
  done: { text: "rendered ●", cls: "text-[#34d399]" },
  error: { text: "failed", cls: "text-[#f87171]" },
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
    <div className="rounded-[10px] border border-[#242429] bg-[#121215] p-4">
      <h3 className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="rounded border border-[#f5b544]/40 bg-[#f5b544]/10 px-1.5 py-[1px] text-[9.5px] uppercase tracking-[0.08em] text-[#f5b544]">
            Segment {index + 1}
          </span>
          {chained && <ChainIcon className="h-[10px] w-[10px] text-[#f5b544]/70" />}
        </span>
        <span className={`text-[10.5px] ${status.cls}`}>
          {status.text}
          {segment.status === "rendering" && segment.progress !== undefined && ` ${segment.progress}%`}
        </span>
      </h3>

      {/* thumbnail + meta */}
      {coachStep === "source-image" && (
        <CoachTip id="director-coach-source" label="Required">
          Generate the first frame with Krea 2 Turbo, or upload your own image.
        </CoachTip>
      )}
      <div className="mb-3 flex gap-3">
        <div
          className="relative aspect-[3/2] w-[104px] flex-shrink-0 rounded-lg border border-[#313138] bg-cover bg-center"
          style={{
            backgroundImage: segment.startImage
              ? `url(${segment.startImage})`
              : "linear-gradient(135deg,#1c1c22,#111114)",
          }}
        >
          {chained && (
            <span className="absolute left-1 top-1 flex items-center gap-1 rounded border border-[#f5b544]/45 bg-[#f5b544]/15 px-[5px] text-[9.5px] text-[#f5b544]">
              <ChainIcon className="h-[9px] w-[9px]" /> #{index}
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1.5 text-[11.5px] leading-[1.5] text-[#8f8f99]">
          {chained ? (
            <>
              <b className="text-[#e9e9ec]">Last frame of #{index}</b>
              {!segment.startImage && <span className="text-[#5a5a64]">waiting for #{index}</span>}
              <button
                type="button"
                onClick={onToggleChain}
                className="rounded-md border border-[#313138] bg-[#17171b] px-2 py-[3px] text-[11px] text-[#e9e9ec] hover:border-[#4a4a53]"
              >
                Use own image
              </button>
            </>
          ) : (
            <>
              <b className="max-w-full truncate text-[#e9e9ec]">
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
                  className={`rounded-md border border-[#f5b544]/50 bg-[#f5b544]/10 px-2 py-[3px] text-[11px] text-[#f5b544] hover:bg-[#f5b544]/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                    coachStep === "source-image"
                      ? "ring-2 ring-[#f5b544]/70 ring-offset-2 ring-offset-[#121215] motion-safe:animate-pulse"
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
                  className="rounded-md border border-[#313138] bg-[#17171b] px-2 py-[3px] text-[11px] text-[#e9e9ec] hover:border-[#4a4a53] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {segment.startImage ? "Upload replacement" : "Upload image"}
                </button>
                {index > 0 && (
                  <button
                    type="button"
                    onClick={onToggleChain}
                    className="rounded-md border border-[#313138] bg-[#17171b] px-2 py-[3px] text-[11px] text-[#e9e9ec] hover:border-[#4a4a53]"
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
        <p className="mb-3 text-[11px] text-[#f87171]">{segment.startImageError}</p>
      )}
      {(segment.startImageGridJobId || segment.gridJobId) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {segment.startImageGridJobId && (
            <button
              type="button"
              onClick={() => copyReceipt("frame", segment.startImageGridJobId!)}
              title={`Copy first-frame Core receipt ${segment.startImageGridJobId}`}
              className="flex min-w-0 items-center gap-1 rounded-md border border-[#313138] bg-[#17171b] px-2 py-1 text-[10.5px] text-[#8f8f99] hover:text-[#e9e9ec]"
            >
              {copiedReceipt === "frame" ? (
                <Check className="h-3 w-3 text-[#34d399]" />
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
              className="flex min-w-0 items-center gap-1 rounded-md border border-[#313138] bg-[#17171b] px-2 py-1 text-[10.5px] text-[#8f8f99] hover:text-[#e9e9ec]"
            >
              {copiedReceipt === "segment" ? (
                <Check className="h-3 w-3 text-[#34d399]" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Segment receipt {segment.gridJobId.slice(0, 8)}…
            </button>
          )}
        </div>
      )}

      <div className="mb-3">
        {coachStep === "prompt" && (
          <CoachTip id="director-coach-prompt" label="Required">
            Describe what should happen during this segment.
          </CoachTip>
        )}
        <label
          htmlFor={`segment-prompt-${segment.id}`}
          className="mb-1 block text-[11px] text-[#8f8f99]"
        >
          Segment prompt
        </label>
        <textarea
          id={`segment-prompt-${segment.id}`}
          rows={3}
          value={segment.prompt}
          onChange={(e) => onUpdate({ prompt: e.target.value })}
          aria-describedby={coachStep === "prompt" ? "director-coach-prompt" : undefined}
          className={`w-full resize-y rounded-md border bg-[#17171b] px-2.5 py-2 text-[12.5px] text-[#e9e9ec] outline-none focus:border-[#4a4a53] ${
            coachStep === "prompt"
              ? "border-[#f5b544]/70 ring-2 ring-[#f5b544]/45 ring-offset-2 ring-offset-[#121215]"
              : "border-[#242429]"
          }`}
        />
        <label
          htmlFor={`segment-negative-${segment.id}`}
          className="mb-1 mt-2 block text-[11px] text-[#8f8f99]"
        >
          Negative — this segment
        </label>
        <textarea
          id={`segment-negative-${segment.id}`}
          rows={2}
          value={segment.negativePrompt ?? ""}
          onChange={(e) => onUpdate({ negativePrompt: e.target.value || undefined })}
          className="w-full resize-y rounded-md border border-[#242429] bg-[#17171b] px-2.5 py-1.5 text-[11.5px] text-[#e9e9ec] outline-none focus:border-[#4a4a53]"
        />
      </div>

      <div className="mb-3 grid grid-cols-[112px,1fr] gap-3">
        <div>
          <label className="mb-1 block text-[11px] text-[#8f8f99]">
            Length (s) <span className="text-[#5a5a64]">1–{MAX_SEGMENT_SECONDS}</span>
          </label>
          <div className="flex items-center overflow-hidden rounded-md border border-[#242429] bg-[#17171b]">
            <button type="button" onClick={() => nudgeLength(-0.5)} className="h-[29px] w-6 text-[#8f8f99]">
              −
            </button>
            <input
              value={lenText}
              onChange={(e) => setLenText(e.target.value)}
              onBlur={(e) => commitLength(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitLength((e.target as HTMLInputElement).value)}
              className="w-full min-w-0 flex-1 bg-transparent text-center text-[12.5px] tabular-nums text-[#e9e9ec] outline-none"
            />
            <button type="button" onClick={() => nudgeLength(0.5)} className="h-[29px] w-6 text-[#8f8f99]">
              +
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 flex justify-between text-[11px] text-[#8f8f99]">
            Image strength <b className="tabular-nums text-[#e9e9ec]">{segment.strength.toFixed(2)}</b>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(segment.strength * 100)}
            onChange={(e) => onUpdate({ strength: Number(e.target.value) / 100 })}
            className="mt-[9px] w-full accent-[#f5b544]"
          />
        </div>
      </div>

      {index > 0 && (
        <label className="mb-3 flex cursor-pointer items-center justify-between rounded-md border border-[#242429] bg-[#17171b] px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[12px] text-[#e9e9ec]">
            <ChainIcon className="h-[11px] w-[11px] text-[#8f8f99]" /> Chain from previous
          </span>
          <button
            type="button"
            onClick={onToggleChain}
            className={`relative h-[18px] w-[32px] flex-shrink-0 rounded-full transition-colors ${
              segment.chained ? "bg-[#f5b544]" : "bg-[#313138]"
            }`}
          >
            <span
              className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-[#141414] transition-all ${
                segment.chained ? "right-[2px]" : "left-[2px] bg-[#8f8f99]"
              }`}
            />
          </button>
        </label>
      )}

      {segment.anchorStale && (
        <p className="mb-2 rounded-md border border-[#f5b544]/40 bg-[#f5b544]/10 px-2.5 py-1.5 text-[11px] text-[#f5b544]">
          Segment {index} was re-rendered — re-render this one for a clean join.
        </p>
      )}
      {segment.status === "error" && segment.error && (
        <p className="mb-2 text-[11px] text-[#f87171]">{segment.error}</p>
      )}
      {blockers.length > 0 && segment.status === "idle" && (
        <p className="mb-2 text-[11px] text-[#5a5a64]">This segment {blockers.join("; ")}.</p>
      )}

      {coachStep === "render" && (
        <CoachTip id="director-coach-render" label="Ready">
          Render this segment. Sign-in will open here if needed.
        </CoachTip>
      )}
      <div className="flex flex-wrap items-center gap-[7px]">
        <button
          type="button"
          onClick={onRender}
          disabled={blockers.length > 0 || segment.status === "queued" || segment.status === "rendering"}
          aria-describedby={coachStep === "render" ? "director-coach-render" : undefined}
          className={`rounded-lg bg-[#f5b544] px-3 py-[5px] text-[11.5px] font-semibold text-[#141414] disabled:opacity-40 ${
            coachStep === "render"
              ? "ring-2 ring-[#f5b544]/70 ring-offset-2 ring-offset-[#121215] motion-safe:animate-pulse"
              : ""
          }`}
        >
          {segment.status === "done" ? "Re-render" : "Render segment"}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          className="rounded-lg border border-[#313138] bg-[#17171b] px-2.5 py-[5px] text-[11.5px] text-[#e9e9ec]"
        >
          Duplicate
        </button>
        {segment.status === "done" && onDownload && (
          <button
            type="button"
            onClick={onDownload}
            className="flex items-center gap-1 rounded-lg border border-[#313138] bg-[#17171b] px-2.5 py-[5px] text-[11.5px] text-[#e9e9ec]"
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
            className="flex h-[24px] w-[24px] items-center justify-center rounded-md border border-[#313138] text-[#8f8f99] disabled:opacity-30"
          >
            <IconChevronLeft className="h-[12px] w-[12px]" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            title="Move right"
            className="flex h-[24px] w-[24px] items-center justify-center rounded-md border border-[#313138] text-[#8f8f99] disabled:opacity-30"
          >
            <IconChevronRight className="h-[12px] w-[12px]" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-[#3d2626] px-2 py-[4px] text-[11px] text-[#f87171]"
          >
            Delete
          </button>
        </span>
      </div>
    </div>
  );
}
