"use client";

/**
 * Bottom-docked timeline of the Director console (mockup B, 1-1).
 * Seconds ruler + zoom, contiguous segment blocks with drag-resize handles,
 * chain-toggle joints between segments, click-to-seek playhead, and an audio
 * lane with a live waveform underneath the track.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DirectorSegment,
  DirectorAudio,
  DirectorAudioSlice,
  DIRECTOR_FPS,
  MIN_SEGMENT_FRAMES,
  MAX_SEGMENT_FRAMES,
  framesToSeconds,
  segmentOffsets,
  totalFrames,
  audioSlices,
} from "@/lib/types/director";
import { ChainIcon } from "./chain-icon";
import { IconMusic, IconX } from "./icons";

const STATUS_DOT: Record<DirectorSegment["status"], string> = {
  idle: "bg-[#5a5a64]",
  queued: "bg-[#f5b544]",
  rendering: "bg-[#f5b544] animate-pulse",
  done: "bg-[#34d399]",
  error: "bg-[#f87171]",
};

interface ConsoleTimelineProps {
  segments: DirectorSegment[];
  audios: DirectorAudio[];
  selectedId: string | null;
  pxPerSec: number;
  playheadSec: number;
  onSelect: (id: string) => void;
  onZoom: (pxPerSec: number) => void;
  onResize: (id: string, lengthFrames: number) => void;
  onToggleChain: (id: string) => void;
  onAddSegment: () => void;
  onAddAudio: () => void;
  onRemoveAudio: (trackId: string) => void;
  /** Update one audio track (slice crops, splits, removals). */
  onAudioChange: (trackId: string, patch: Partial<DirectorAudio>) => void;
  onSeek: (sec: number) => void;
}

export function ConsoleTimeline({
  segments,
  audios,
  selectedId,
  pxPerSec,
  playheadSec,
  onSelect,
  onZoom,
  onResize,
  onToggleChain,
  onAddSegment,
  onAddAudio,
  onRemoveAudio,
  onAudioChange,
  onSeek,
}: ConsoleTimelineProps) {
  // Live drag-resize preview: {id, frames} while a handle is being dragged.
  const [preview, setPreview] = useState<{ id: string; frames: number } | null>(null);
  // Live audio-crop preview while a slice's trim handle is being dragged.
  const [trimDrag, setTrimDrag] = useState<{ sliceId: string; start: number; end: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const effFrames = (s: DirectorSegment) =>
    preview?.id === s.id ? preview.frames : s.lengthFrames;

  const previewSegments = useMemo(
    () => segments.map((s) => ({ ...s, lengthFrames: effFrames(s) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments, preview]
  );
  const offsets = segmentOffsets(previewSegments);
  const total = totalFrames(previewSegments);
  const totalSec = framesToSeconds(total);
  // The scroll content must span the LONGER of the video timeline and the
  // longest audio track (a 4-min song over a 4-s cut still needs full reach,
  // and the lane width governs how far the sticky lane controls can travel).
  const audioMaxSec = audios.reduce((max, track) => {
    const used = audioSlices(track).reduce((a, s) => a + (s.trimEndSec - s.trimStartSec), 0);
    const secs = used > 0 ? used : track.durationSec ?? 0;
    return Math.max(max, secs);
  }, 0);
  const contentSec = Math.max(totalSec, audioMaxSec);
  const contentWidth = Math.max(contentSec * pxPerSec + 140, 300);

  const startResize = (
    e: React.PointerEvent,
    seg: DirectorSegment,
    edge: "l" | "r"
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startFrames = seg.lengthFrames;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dFrames = Math.round(((edge === "r" ? dx : -dx) / pxPerSec) * DIRECTOR_FPS);
      const frames = Math.min(
        MAX_SEGMENT_FRAMES,
        Math.max(MIN_SEGMENT_FRAMES, startFrames + dFrames)
      );
      setPreview({ id: seg.id, frames });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const dx = ev.clientX - startX;
      const dFrames = Math.round(((edge === "r" ? dx : -dx) / pxPerSec) * DIRECTOR_FPS);
      const frames = Math.min(
        MAX_SEGMENT_FRAMES,
        Math.max(MIN_SEGMENT_FRAMES, startFrames + dFrames)
      );
      setPreview(null);
      if (frames !== startFrames) onResize(seg.id, frames);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const genSliceId = () =>
    `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  /** Normalized slice list with real ids; index-aligned with the rendered
   *  blocks (the legacy 'full' pseudo-slice gets an id on first edit). */
  const materializeSlices = (track: DirectorAudio): DirectorAudioSlice[] =>
    audioSlices(track).map((s) => (s.id === "full" ? { ...s, id: genSliceId() } : s));

  const startAudioTrim = (
    e: React.PointerEvent,
    track: DirectorAudio,
    index: number,
    edge: "l" | "r"
  ) => {
    if (!track.durationSec || !track.id) return;
    e.preventDefault();
    e.stopPropagation();
    const dur = track.durationSec;
    const slice = audioSlices(track)[index];
    if (!slice) return;
    const s0 = slice.trimStartSec;
    const e0 = slice.trimEndSec;
    const startX = e.clientX;
    let last = { start: s0, end: e0 };
    const calc = (dx: number): { start: number; end: number } => {
      const dSec = dx / pxPerSec;
      if (edge === "l") {
        // Crop (drag right) or expand (drag left, down to the file start).
        return { start: Math.min(Math.max(0, s0 + dSec), e0 - 0.25), end: e0 };
      }
      return { start: s0, end: Math.max(Math.min(dur, e0 + dSec), s0 + 0.25) };
    };
    const move = (ev: PointerEvent) => {
      last = calc(ev.clientX - startX);
      setTrimDrag({ sliceId: slice.id, ...last });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setTrimDrag(null);
      if (last.start !== s0 || last.end !== e0) {
        const slices = materializeSlices(track).map((s, i) =>
          i === index ? { ...s, trimStartSec: last.start, trimEndSec: last.end } : s
        );
        onAudioChange(track.id!, { slices });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** Breakpoint: split a track's slice `index` at a fraction of its window. */
  const splitSlice = (track: DirectorAudio, index: number, frac: number) => {
    if (!track.id) return;
    const slices = materializeSlices(track);
    const s = slices[index];
    if (!s) return;
    const at = s.trimStartSec + (s.trimEndSec - s.trimStartSec) * frac;
    if (at - s.trimStartSec < 0.25 || s.trimEndSec - at < 0.25) return;
    slices.splice(
      index,
      1,
      { ...s, trimEndSec: at },
      { id: genSliceId(), trimStartSec: at, trimEndSec: s.trimEndSec }
    );
    onAudioChange(track.id, { slices });
  };

  const removeSlice = (track: DirectorAudio, index: number) => {
    if (!track.id) return;
    const slices = materializeSlices(track);
    if (slices.length <= 1) return;
    slices.splice(index, 1);
    onAudioChange(track.id, { slices });
  };

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0) * 0;
    onSeek(Math.max(0, Math.min(totalSec, x / pxPerSec)));
  };

  // Ruler ticks: label every 1s (>=56px/s) else every 2s.
  const labelEvery = pxPerSec >= 56 ? 1 : 2;
  const ticks = useMemo(() => {
    const arr: { sec: number; labeled: boolean }[] = [];
    for (let s = 0; s <= Math.ceil(totalSec); s++) {
      arr.push({ sec: s, labeled: s % labelEvery === 0 });
    }
    return arr;
  }, [totalSec, labelEvery]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#121215] px-5 pb-4 pt-3">
      {/* toolbar */}
      <div className="mb-2.5 flex flex-shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAddSegment}
            className="rounded-lg border border-[#313138] bg-[#17171b] px-2.5 py-1 text-[11.5px] text-[#e9e9ec] hover:border-[#4a4a53]"
          >
            + Segment
          </button>
          <span className="flex items-center gap-1.5 text-[11px] text-[#5a5a64]">
            Zoom
            <input
              type="range"
              min={36}
              max={200}
              value={pxPerSec}
              onChange={(e) => onZoom(Number(e.target.value))}
              className="w-[90px] accent-[#f5b544]"
            />
          </span>
          <span className="text-[11px] tabular-nums text-[#5a5a64]">{totalSec.toFixed(1)}s total</span>
        </div>
        <span className="hidden items-center gap-1.5 text-[11px] text-[#5a5a64] md:flex">
          <ChainIcon className="h-[10px] w-[10px]" /> = chained join
        </span>
      </div>

      {/* scrollable ruler + track + audio lane */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="relative flex h-full flex-col" style={{ width: contentWidth }}>
          {/* ruler — 21px tall so the 9.5px labels never clip against the top;
              the "0s" label is left-anchored so the scroll edge can't cut it. */}
          <div
            className="relative h-[21px] flex-shrink-0 cursor-pointer border-b border-[#242429]"
            onClick={seekFromEvent}
          >
            {ticks.map((t) => (
              <span key={t.sec}>
                <i
                  className="absolute bottom-0 w-px bg-[#313138]"
                  style={{ left: t.sec * pxPerSec, height: t.labeled ? 6 : 4 }}
                />
                {t.labeled && (
                  <span
                    className={`absolute bottom-[6px] text-[9.5px] leading-none tabular-nums text-[#5a5a64] ${
                      t.sec === 0 ? "" : "-translate-x-1/2"
                    }`}
                    style={{ left: t.sec === 0 ? 1 : t.sec * pxPerSec }}
                  >
                    {t.sec}s
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* playhead (spans ruler + track) */}
          {playheadSec > 0 && playheadSec <= totalSec && (
            <div
              className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-[#f5b544]"
              style={{ left: playheadSec * pxPerSec }}
            >
              <span className="absolute -left-[5px] top-0 border-[5px] border-transparent border-t-[#f5b544]" />
            </div>
          )}

          {/* track */}
          <div className="relative mt-[6px] min-h-[56px] flex-1 rounded-lg border border-[#242429] bg-[#17171b]">
            {segments.length === 0 && (
              <button
                type="button"
                onClick={onAddSegment}
                className="absolute inset-0 flex items-center justify-center text-[12px] text-[#5a5a64] hover:text-[#8f8f99]"
              >
                + Add your first segment
              </button>
            )}

            {previewSegments.map((seg, i) => {
              const left = framesToSeconds(offsets[i]) * pxPerSec;
              const width = framesToSeconds(seg.lengthFrames) * pxPerSec;
              const selected = seg.id === selectedId;
              const thumb = seg.startImage || seg.lastFrame;
              return (
                <div key={seg.id}>
                  <div
                    onClick={() => onSelect(seg.id)}
                    className={`absolute bottom-[5px] top-[5px] flex cursor-pointer items-end rounded-lg border bg-cover bg-center ${
                      selected
                        ? "z-[15] border-[#f5b544] shadow-[0_0_0_1px_#f5b544]"
                        : "overflow-hidden border-[#313138] hover:border-[#4a4a53]"
                    }`}
                    style={{
                      left,
                      width: Math.max(width - 2, 24),
                      backgroundImage: thumb
                        ? `url(${thumb})`
                        : "linear-gradient(135deg,#1c1c22,#111114)",
                    }}
                  >
                    <span className="absolute left-[5px] top-[4px] flex items-center gap-1 rounded bg-black/65 px-[5px] py-[1px] text-[9.5px] text-[#cfcfd7]">
                      {i + 1}
                      <i className={`h-[6px] w-[6px] rounded-full ${STATUS_DOT[seg.status]}`} />
                      {seg.chained && <ChainIcon className="h-[9px] w-[9px] text-[#f5b544]" />}
                    </span>
                    <span className="absolute right-[5px] top-[4px] rounded bg-black/65 px-[5px] text-[9.5px] tabular-nums text-[#cfcfd7]">
                      {framesToSeconds(seg.lengthFrames).toFixed(1)}s
                    </span>
                    <div className="w-full truncate bg-gradient-to-t from-black/80 to-transparent px-[7px] py-[3px] text-[10.5px] text-[#d6d6dd]">
                      {seg.prompt || <span className="text-[#5a5a64]">no segment prompt</span>}
                    </div>

                    {selected && (
                      // Handles paint/hit ABOVE the chain joints (z-30 vs z-10)
                      // and stick out past the edge so the joint can't eat the
                      // drag; the parent drops overflow-hidden when selected.
                      <>
                        <span
                          onPointerDown={(e) => startResize(e, seg, "l")}
                          className="absolute -left-[5px] top-0 z-30 h-full w-[12px] cursor-ew-resize"
                        >
                          <span className="absolute bottom-[3px] left-[6px] top-[3px] w-[3px] rounded-sm bg-[#f5b544]" />
                        </span>
                        <span
                          onPointerDown={(e) => startResize(e, seg, "r")}
                          className="absolute -right-[5px] top-0 z-30 h-full w-[12px] cursor-ew-resize"
                        >
                          <span className="absolute bottom-[3px] right-[6px] top-[3px] w-[3px] rounded-sm bg-[#f5b544]" />
                        </span>
                      </>
                    )}
                  </div>

                  {/* chain joint on the boundary to the NEXT segment */}
                  {i < segments.length - 1 && (
                    <button
                      type="button"
                      title={
                        segments[i + 1].chained
                          ? "Chained — starts from this segment's last frame (click to break)"
                          : "Hard cut — own start image (click to chain)"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleChain(segments[i + 1].id);
                      }}
                      className={`absolute top-1/2 z-40 flex h-[20px] w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border ${
                        segments[i + 1].chained
                          ? "border-[#f5b544] bg-[#171204] text-[#f5b544]"
                          : "border-[#313138] bg-[#101014] text-[#4a4a53]"
                      }`}
                      style={{ left: framesToSeconds(offsets[i + 1]) * pxPerSec }}
                    >
                      <ChainIcon broken={!segments[i + 1].chained} />
                    </button>
                  )}
                </div>
              );
            })}

            {/* trailing add button */}
            {segments.length > 0 && (
              <button
                type="button"
                onClick={onAddSegment}
                className="absolute top-1/2 flex h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-lg border border-dashed border-[#313138] text-[14px] text-[#5a5a64] hover:border-[#4a4a53] hover:text-[#8f8f99]"
                style={{ left: totalSec * pxPerSec + 12 }}
              >
                +
              </button>
            )}
          </div>

          {/* audio lanes — ONE ROW PER TRACK. Each track's slices lay
              contiguously at REAL (cropped) length; drag the amber edges to
              crop/expand a slice, double-click a slice to set a breakpoint
              (split), hover a slice for its remove button. */}
          {audios.map((track) => {
            const dur = track.durationSec;
            const slices = audioSlices(track).map((s) =>
              trimDrag?.sliceId === s.id
                ? { ...s, trimStartSec: trimDrag.start, trimEndSec: trimDrag.end }
                : s
            );
            const legacy = slices.length === 0; // duration unknown → no crop UI
            const widths = legacy
              ? [Math.max(totalSec * pxPerSec, 60)]
              : slices.map((s) => Math.max((s.trimEndSec - s.trimStartSec) * pxPerSec, 22));
            const usedSec = legacy ? 0 : slices.reduce((a, s) => a + s.trimEndSec - s.trimStartSec, 0);
            return (
              <div key={track.id ?? track.fileName} className="mt-[6px] h-[34px] flex-shrink-0">
                <div className="relative flex h-full items-stretch">
                  {/* zero-width sticky wrapper: the control chip overlays the
                      START of the lane WITHOUT pushing the slices, so the
                      waveform stays aligned to timeline second 0 under the
                      video track. Always visible and pinned at the left however
                      far you scroll — remove is one reachable click. */}
                  <div className="sticky left-0 z-30 flex h-full w-0 min-w-0 items-center overflow-visible">
                    <div className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-[#2a2a31] bg-[#17171b]/95 py-[3px] pl-2 pr-1.5 shadow-[2px_0_8px_rgba(0,0,0,0.6)]">
                      <IconMusic className="h-[11px] w-[11px] text-[#8f8f99]" />
                      <span className="max-w-[86px] truncate text-[10px] text-[#cfcfd7]" title={track.fileName}>
                        {track.fileName}
                      </span>
                      {dur !== undefined && (
                        <span className="text-[9px] tabular-nums text-[#5a5a64]">
                          {usedSec.toFixed(1)}/{dur.toFixed(1)}s
                        </span>
                      )}
                      {!track.audioB64 && !track.id && (
                        <span className="text-[9px] text-[#f5b544]">re-add</span>
                      )}
                      <button
                        type="button"
                        title="Remove this audio track"
                        onClick={() => track.id && onRemoveAudio(track.id)}
                        className="flex h-[16px] w-[16px] items-center justify-center rounded text-[#8f8f99] hover:bg-[#f87171]/15 hover:text-[#f87171]"
                      >
                        <IconX className="h-[10px] w-[10px]" />
                      </button>
                    </div>
                  </div>
                  {(legacy ? [null] : slices).map((s, i) => (
                    <div
                      key={s ? `${s.id}:${i}` : "legacy"}
                      onDoubleClick={(e) => {
                        if (!s) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        splitSlice(track, i, (e.clientX - rect.left) / rect.width);
                      }}
                      title={s ? "Double-click to split (breakpoint)" : undefined}
                      className="group/slice relative h-full flex-shrink-0 rounded-lg border border-[#242429] bg-[#101014]"
                      style={{ width: widths[i], marginLeft: i > 0 ? 2 : 0 }}
                    >
                      <div className="h-full overflow-hidden rounded-lg">
                        <Waveform
                          audio={track}
                          width={widths[i]}
                          height={32}
                          startFrac={s && dur ? s.trimStartSec / dur : 0}
                          endFrac={s && dur ? s.trimEndSec / dur : 1}
                        />
                      </div>
                      {s && (
                        <span className="pointer-events-none absolute right-[7px] top-[2px] rounded bg-black/65 px-[4px] text-[9px] tabular-nums text-[#8f8f99] opacity-0 transition-opacity group-hover/slice:opacity-100">
                          {(s.trimEndSec - s.trimStartSec).toFixed(1)}s
                        </span>
                      )}
                      {s && !legacy && slices.length > 1 && (
                        <button
                          type="button"
                          title="Remove this audio section"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeSlice(track, i);
                          }}
                          className="absolute left-1/2 top-1/2 z-20 flex h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#313138] bg-black/80 text-[#8f8f99] opacity-0 transition-opacity hover:text-[#f87171] group-hover/slice:opacity-100"
                        >
                          <IconX className="h-[9px] w-[9px]" />
                        </button>
                      )}
                      {s && (
                        <>
                          <span
                            title="Drag to crop or expand this section's start"
                            onPointerDown={(e) => startAudioTrim(e, track, i, "l")}
                            className="absolute -left-[4px] top-0 z-10 h-full w-[10px] cursor-ew-resize"
                          >
                            <span className="absolute bottom-[2px] left-[4px] top-[2px] w-[3px] rounded-sm bg-[#f5b544]" />
                          </span>
                          <span
                            title="Drag to crop or expand this section's end"
                            onPointerDown={(e) => startAudioTrim(e, track, i, "r")}
                            className="absolute -right-[4px] top-0 z-10 h-full w-[10px] cursor-ew-resize"
                          >
                            <span className="absolute bottom-[2px] right-[4px] top-[2px] w-[3px] rounded-sm bg-[#f5b544]" />
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* add-audio: a compact button pinned to the START of the audio area
              (sticky so it stays reachable), not a full-width bar hogging space */}
          <div className={`mt-[6px] flex-shrink-0 ${audios.length === 0 ? "h-[34px]" : "h-[24px]"}`}>
            <button
              type="button"
              onClick={onAddAudio}
              className="sticky left-0 flex h-full items-center gap-1.5 rounded-lg border border-dashed border-[#242429] px-3 text-[11px] text-[#5a5a64] hover:border-[#313138] hover:text-[#8f8f99]"
            >
              <IconMusic className="h-[11px] w-[11px]" /> Add audio track
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Canvas waveform of the uploaded track. Peaks are decoded once per file;
 *  [startFrac, endFrac] draws only the cropped slice at full width. */
function Waveform({
  audio,
  width,
  height,
  startFrac = 0,
  endFrac = 1,
}: {
  audio: DirectorAudio;
  width: number;
  height: number;
  startFrac?: number;
  endFrac?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const peaksRef = useRef<{ key: string; peaks: number[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas || !audio.audioB64) return;

    const draw = (allPeaks: number[]) => {
      const from = Math.max(0, Math.floor(startFrac * allPeaks.length));
      const to = Math.min(allPeaks.length, Math.ceil(endFrac * allPeaks.length));
      const peaks = allPeaks.slice(from, Math.max(to, from + 1));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Cap the backing store: a long track at timeline scale × dpr easily
      // exceeds the browser's max canvas dimension (~32k px), after which the
      // canvas silently goes blank. Draw at a capped pixel width and let CSS
      // stretch it to the full lane width.
      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.min(Math.round(width * dpr), 16000);
      canvas.width = pxW;
      canvas.height = Math.round(height * dpr);
      ctx.scale(pxW / width, canvas.height / height);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(245,181,68,0.55)";
      const mid = height / 2;
      const step = width / peaks.length;
      peaks.forEach((p, i) => {
        const h = Math.max(1, p * (height - 4));
        ctx.fillRect(i * step, mid - h / 2, Math.max(1, step - 0.5), h);
      });
    };

    const key = `${audio.fileName}:${audio.audioB64.length}`;
    if (peaksRef.current?.key === key) {
      draw(peaksRef.current.peaks);
      return;
    }

    (async () => {
      try {
        // Decode the data URI by hand — fetch(data:) is blocked by the CSP's
        // connect-src, atob is not.
        const b64 = audio.audioB64.includes(',')
          ? audio.audioB64.slice(audio.audioB64.indexOf(',') + 1)
          : audio.audioB64;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const buf = bytes.buffer;
        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(buf);
        ctx.close().catch(() => {});
        const data = decoded.getChannelData(0);
        // ~20 buckets per second (so slices stay detailed), capped for memory.
        const buckets = Math.min(6000, Math.max(600, Math.round(decoded.duration * 20)));
        const per = Math.max(1, Math.floor(data.length / buckets));
        const peaks: number[] = [];
        for (let i = 0; i < buckets; i++) {
          let max = 0;
          const start = i * per;
          for (let j = start; j < Math.min(start + per, data.length); j += 16) {
            const v = Math.abs(data[j]);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        if (!cancelled) {
          peaksRef.current = { key, peaks };
          draw(peaks);
        }
      } catch (err) {
        console.warn("[Director] waveform decode failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [audio.audioB64, audio.fileName, width, height, startFrac, endFrac]);

  if (!audio.audioB64) return null;
  return <canvas ref={canvasRef} style={{ width, height }} className="block" />;
}
