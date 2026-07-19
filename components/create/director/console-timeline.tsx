"use client";

/**
 * Bottom-docked timeline of the Director console.
 *
 * Layout: a FIXED left gutter of per-row track controls (never scrolls, never
 * overlays the waveform) + a horizontally-scrollable track area holding the
 * seconds ruler, the video segment track, and one lane per audio track.
 *
 * Video segments are contiguous (they play back-to-back): drag a block to
 * reorder, double-click to split it into two (a breakpoint; the second half
 * chains from the first), resize from the edges, and delete/duplicate inline.
 *
 * Audio clips are FREELY POSITIONED: each carries its own timeline position, so
 * clips can sit anywhere with gaps (silence) between them. Drag a clip to move
 * it, drag its left edge to crop-in (the clip slides right, keeping its right
 * edge), its right edge to crop-out, and double-click to split.
 */

import { useMemo, useRef, useState } from "react";
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
  sliceTimelineEnd,
} from "@/lib/types/director";
import { ChainIcon } from "./chain-icon";
import { IconMusic, IconPlus, IconX } from "./icons";
import { Waveform } from "./waveform";

const GUTTER_W = 84;
const ROW_GAP = 6;
const LANE_H = 34;

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
  onDuplicateSegment: (id: string) => void;
  onRemoveSegment: (id: string) => void;
  /** Drag-to-reorder: move segment `id` to `toIndex`. */
  onReorderSegment: (id: string, toIndex: number) => void;
  /** Breakpoint: split segment `id` at a 0..1 fraction of its length. */
  onSplitSegment: (id: string, atFraction: number) => void;
  onAddAudio: () => void;
  onRemoveAudio: (trackId: string) => void;
  /** Update one audio track (clip crops, moves, splits, removals). */
  onAudioChange: (trackId: string, patch: Partial<DirectorAudio>) => void;
  onSeek: (sec: number) => void;
}

/** Live drag state for an audio clip (move or edge trim). */
interface AudioDrag {
  trackId: string;
  sliceId: string;
  timelineStartSec: number;
  trimStartSec: number;
  trimEndSec: number;
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
  onDuplicateSegment,
  onRemoveSegment,
  onReorderSegment,
  onSplitSegment,
  onAddAudio,
  onRemoveAudio,
  onAudioChange,
  onSeek,
}: ConsoleTimelineProps) {
  const [preview, setPreview] = useState<{ id: string; frames: number } | null>(null);
  const [audioDrag, setAudioDrag] = useState<AudioDrag | null>(null);
  const [segDrag, setSegDrag] = useState<{ id: string; targetIndex: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const effFrames = (s: DirectorSegment) => (preview?.id === s.id ? preview.frames : s.lengthFrames);
  const previewSegments = useMemo(
    () => segments.map((s) => ({ ...s, lengthFrames: effFrames(s) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments, preview]
  );
  const offsets = segmentOffsets(previewSegments);
  const total = totalFrames(previewSegments);
  const totalSec = framesToSeconds(total);

  // Effective clips for a track (apply the live drag to the dragged clip).
  const clipsOf = (track: DirectorAudio): DirectorAudioSlice[] =>
    audioSlices(track).map((s) =>
      audioDrag && audioDrag.sliceId === s.id
        ? { ...s, timelineStartSec: audioDrag.timelineStartSec, trimStartSec: audioDrag.trimStartSec, trimEndSec: audioDrag.trimEndSec }
        : s
    );

  const audioMaxSec = audios.reduce((max, track) => {
    const end = clipsOf(track).reduce((m, s) => Math.max(m, sliceTimelineEnd(s)), 0);
    return Math.max(max, end || track.durationSec || 0);
  }, 0);
  const contentSec = Math.max(totalSec, audioMaxSec);
  const contentWidth = Math.max(contentSec * pxPerSec + 140, 300);

  // ---- segment resize (edges) ----
  const startResize = (e: React.PointerEvent, seg: DirectorSegment, edge: "l" | "r") => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startFrames = seg.lengthFrames;
    const calc = (dx: number) =>
      Math.min(MAX_SEGMENT_FRAMES, Math.max(MIN_SEGMENT_FRAMES, startFrames + Math.round(((edge === "r" ? dx : -dx) / pxPerSec) * DIRECTOR_FPS)));
    const move = (ev: PointerEvent) => setPreview({ id: seg.id, frames: calc(ev.clientX - startX) });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const frames = calc(ev.clientX - startX);
      setPreview(null);
      if (frames !== startFrames) onResize(seg.id, frames);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- segment reorder (body drag) ----
  const targetIndexAt = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const x = clientX - rect.left;
    let idx = 0;
    for (let i = 0; i < segments.length; i++) {
      const centerSec = framesToSeconds(offsets[i]) + framesToSeconds(segments[i].lengthFrames) / 2;
      if (x > centerSec * pxPerSec) idx = i + 1;
    }
    return Math.max(0, Math.min(idx, segments.length - 1));
  };

  const startSegDrag = (e: React.PointerEvent, seg: DirectorSegment, index: number) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      moved = true;
      setSegDrag({ id: seg.id, targetIndex: targetIndexAt(ev.clientX) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setSegDrag(null);
      if (moved) {
        const to = targetIndexAt(ev.clientX);
        if (to !== index) onReorderSegment(seg.id, to);
      } else {
        onSelect(seg.id);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // ---- audio clip drag (move / trim) ----
  const genSliceId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const materialize = (track: DirectorAudio): DirectorAudioSlice[] =>
    audioSlices(track).map((s) => (s.id === "full" ? { ...s, id: genSliceId() } : s));

  const startAudioDrag = (
    e: React.PointerEvent,
    track: DirectorAudio,
    index: number,
    mode: "move" | "l" | "r"
  ) => {
    if (!track.id || !track.durationSec) return;
    e.preventDefault();
    e.stopPropagation();
    const dur = track.durationSec;
    const slice = audioSlices(track)[index];
    if (!slice) return;
    const { timelineStartSec: t0, trimStartSec: ts0, trimEndSec: te0 } = slice;
    const startX = e.clientX;
    let live = { timelineStartSec: t0, trimStartSec: ts0, trimEndSec: te0 };
    const calc = (dx: number): typeof live => {
      const d = dx / pxPerSec;
      if (mode === "move") {
        return { timelineStartSec: Math.max(0, t0 + d), trimStartSec: ts0, trimEndSec: te0 };
      }
      if (mode === "l") {
        // crop-in: slide right (right edge fixed) / expand left down to file+timeline start
        const maxLeft = Math.min(ts0, t0);
        const eff = Math.max(-maxLeft, Math.min(d, te0 - 0.25 - ts0));
        return { timelineStartSec: t0 + eff, trimStartSec: ts0 + eff, trimEndSec: te0 };
      }
      // crop-out: right edge only
      return { timelineStartSec: t0, trimStartSec: ts0, trimEndSec: Math.min(dur, Math.max(ts0 + 0.25, te0 + d)) };
    };
    const move = (ev: PointerEvent) => {
      live = calc(ev.clientX - startX);
      setAudioDrag({ trackId: track.id!, sliceId: slice.id, ...live });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      live = calc(ev.clientX - startX);
      setAudioDrag(null);
      const changed = live.timelineStartSec !== t0 || live.trimStartSec !== ts0 || live.trimEndSec !== te0;
      if (changed) {
        const slices = materialize(track).map((s, i) => (i === index ? { ...s, ...live } : s));
        onAudioChange(track.id!, { slices });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const splitClip = (track: DirectorAudio, index: number, frac: number) => {
    if (!track.id) return;
    const slices = materialize(track);
    const s = slices[index];
    if (!s) return;
    const len = s.trimEndSec - s.trimStartSec;
    const at = s.trimStartSec + len * frac;
    if (at - s.trimStartSec < 0.25 || s.trimEndSec - at < 0.25) return;
    slices.splice(
      index,
      1,
      { ...s, trimEndSec: at },
      { id: genSliceId(), timelineStartSec: s.timelineStartSec + (at - s.trimStartSec), trimStartSec: at, trimEndSec: s.trimEndSec }
    );
    onAudioChange(track.id, { slices });
  };

  const removeClip = (track: DirectorAudio, index: number) => {
    if (!track.id) return;
    const slices = materialize(track);
    slices.splice(index, 1);
    // Removing the last clip removes the whole (now-empty) track.
    if (slices.length === 0) onRemoveAudio(track.id);
    else onAudioChange(track.id, { slices });
  };

  const seekFromEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(contentSec, (e.clientX - rect.left) / pxPerSec)));
  };

  const labelEvery = pxPerSec >= 56 ? 1 : 2;
  const ticks = useMemo(() => {
    const arr: { sec: number; labeled: boolean }[] = [];
    for (let s = 0; s <= Math.ceil(contentSec); s++) arr.push({ sec: s, labeled: s % labelEvery === 0 });
    return arr;
  }, [contentSec, labelEvery]);

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
        <span className="hidden items-center gap-3 text-[11px] text-[#5a5a64] md:flex">
          <span className="flex items-center gap-1.5">
            <ChainIcon className="h-[10px] w-[10px]" /> chained join
          </span>
          <span>drag to move · double-click to split</span>
        </span>
      </div>

      {/* gutter + scrollable body */}
      <div className="flex min-h-0 flex-1">
        {/* ===== fixed left gutter (per-row controls) ===== */}
        <div
          className="flex flex-shrink-0 flex-col border-r border-[#242429] pr-2"
          style={{ width: GUTTER_W, gap: ROW_GAP }}
        >
          <div className="h-[21px] flex-shrink-0" />
          <div className="flex min-h-[56px] flex-1 items-center text-[10px] font-semibold uppercase tracking-wider text-[#5a5a64]">
            Video
          </div>
          {audios.map((track) => (
            <div
              key={track.id ?? track.fileName}
              className="flex flex-shrink-0 items-center gap-1"
              style={{ height: LANE_H }}
            >
              <button
                type="button"
                title="Remove this audio track"
                onClick={() => track.id && onRemoveAudio(track.id)}
                className="flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded text-[#8f8f99] hover:bg-[#f87171]/15 hover:text-[#f87171]"
              >
                <IconX className="h-[11px] w-[11px]" />
              </button>
              <span className="min-w-0 truncate text-[10px] text-[#8f8f99]" title={track.fileName}>
                {track.fileName}
              </span>
            </div>
          ))}
          <div className="flex flex-shrink-0 items-center" style={{ height: 24 }}>
            <button
              type="button"
              title="Add audio track"
              onClick={onAddAudio}
              className="flex h-[20px] w-[20px] items-center justify-center rounded-md border border-dashed border-[#313138] text-[#8f8f99] hover:border-[#f5b544] hover:text-[#f5b544]"
            >
              <IconPlus className="h-[11px] w-[11px]" />
            </button>
          </div>
        </div>

        {/* ===== scrollable track area ===== */}
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pl-2">
          <div className="relative flex h-full flex-col" style={{ width: contentWidth, gap: ROW_GAP }}>
            {/* ruler */}
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
                      className={`absolute bottom-[6px] text-[9.5px] leading-none tabular-nums text-[#5a5a64] ${t.sec === 0 ? "" : "-translate-x-1/2"}`}
                      style={{ left: t.sec === 0 ? 1 : t.sec * pxPerSec }}
                    >
                      {t.sec}s
                    </span>
                  )}
                </span>
              ))}
            </div>

            {/* playhead */}
            {playheadSec > 0 && playheadSec <= contentSec && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-[#f5b544]"
                style={{ left: playheadSec * pxPerSec }}
              >
                <span className="absolute -left-[5px] top-0 border-[5px] border-transparent border-t-[#f5b544]" />
              </div>
            )}

            {/* ===== video segment track ===== */}
            <div ref={trackRef} className="relative min-h-[56px] flex-1 rounded-lg border border-[#242429] bg-[#17171b]">
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
                const dragging = segDrag?.id === seg.id;
                const thumb = seg.startImage || seg.lastFrame;
                return (
                  <div key={seg.id}>
                    <div
                      onPointerDown={(e) => startSegDrag(e, seg, i)}
                      onDoubleClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        onSplitSegment(seg.id, (e.clientX - rect.left) / rect.width);
                      }}
                      title="Drag to reorder · double-click to split"
                      className={`group/seg absolute bottom-[5px] top-[5px] flex cursor-grab select-none items-end rounded-lg border bg-cover bg-center active:cursor-grabbing ${
                        selected ? "z-[15] border-[#f5b544] shadow-[0_0_0_1px_#f5b544]" : "overflow-hidden border-[#313138] hover:border-[#4a4a53]"
                      } ${dragging ? "opacity-60" : ""}`}
                      style={{
                        left,
                        width: Math.max(width - 2, 24),
                        backgroundImage: thumb ? `url(${thumb})` : "linear-gradient(135deg,#1c1c22,#111114)",
                      }}
                    >
                      <span className="absolute left-[5px] top-[4px] flex items-center gap-1 rounded bg-black/65 px-[5px] py-[1px] text-[9.5px] text-[#cfcfd7]">
                        {i + 1}
                        <i className={`h-[6px] w-[6px] rounded-full ${STATUS_DOT[seg.status]}`} />
                        {seg.chained && <ChainIcon className="h-[9px] w-[9px] text-[#f5b544]" />}
                      </span>

                      {/* inline actions (duplicate / delete) */}
                      <span className="absolute right-[4px] top-[3px] flex items-center gap-[3px] opacity-0 transition-opacity group-hover/seg:opacity-100">
                        <button
                          type="button"
                          title="Duplicate segment"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicateSegment(seg.id);
                          }}
                          className="flex h-[15px] w-[15px] items-center justify-center rounded bg-black/70 text-[#cfcfd7] hover:text-white"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" className="h-[9px] w-[9px]">
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          title="Delete segment"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveSegment(seg.id);
                          }}
                          className="flex h-[15px] w-[15px] items-center justify-center rounded bg-black/70 text-[#cfcfd7] hover:text-[#f87171]"
                        >
                          <IconX className="h-[9px] w-[9px]" />
                        </button>
                      </span>

                      <span className="pointer-events-none absolute bottom-[22px] right-[5px] rounded bg-black/65 px-[5px] text-[9.5px] tabular-nums text-[#cfcfd7]">
                        {framesToSeconds(seg.lengthFrames).toFixed(1)}s
                      </span>
                      <div className="pointer-events-none w-full truncate bg-gradient-to-t from-black/80 to-transparent px-[7px] py-[3px] text-[10.5px] text-[#d6d6dd]">
                        {seg.prompt || <span className="text-[#5a5a64]">no segment prompt</span>}
                      </div>

                      {selected && (
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
                        title={segments[i + 1].chained ? "Chained — starts from this segment's last frame (click to break)" : "Hard cut — own start image (click to chain)"}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleChain(segments[i + 1].id);
                        }}
                        className={`absolute top-1/2 z-40 flex h-[20px] w-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border ${
                          segments[i + 1].chained ? "border-[#f5b544] bg-[#171204] text-[#f5b544]" : "border-[#313138] bg-[#101014] text-[#4a4a53]"
                        }`}
                        style={{ left: framesToSeconds(offsets[i + 1]) * pxPerSec }}
                      >
                        <ChainIcon broken={!segments[i + 1].chained} />
                      </button>
                    )}
                  </div>
                );
              })}

              {/* drop indicator while reordering */}
              {segDrag && (
                <div
                  className="pointer-events-none absolute bottom-[2px] top-[2px] z-50 w-[2px] rounded bg-[#f5b544]"
                  style={{ left: framesToSeconds(offsets[Math.min(segDrag.targetIndex, offsets.length - 1)] ?? 0) * pxPerSec }}
                />
              )}

              {/* trailing add button */}
              {segments.length > 0 && (
                <button
                  type="button"
                  onClick={onAddSegment}
                  title="Add a segment at the end"
                  className="absolute top-1/2 flex h-[26px] w-[26px] -translate-y-1/2 items-center justify-center rounded-lg border border-dashed border-[#313138] text-[14px] text-[#5a5a64] hover:border-[#4a4a53] hover:text-[#8f8f99]"
                  style={{ left: totalSec * pxPerSec + 12 }}
                >
                  +
                </button>
              )}
            </div>

            {/* ===== audio lanes (one per track) ===== */}
            {audios.map((track) => {
              const dur = track.durationSec;
              const clips = clipsOf(track);
              const legacy = clips.length === 0; // duration unknown → no positioning
              return (
                <div key={track.id ?? track.fileName} className="relative flex-shrink-0 rounded-md bg-[#0d0d10]/40" style={{ height: LANE_H }}>
                  {legacy ? (
                    <div className="absolute inset-0 overflow-hidden rounded-lg border border-[#242429] bg-[#101014]">
                      <Waveform audio={track} width={Math.max(totalSec * pxPerSec, 60)} height={32} />
                    </div>
                  ) : (
                    clips.map((s, i) => {
                      const clipLeft = s.timelineStartSec * pxPerSec;
                      const clipW = Math.max((s.trimEndSec - s.trimStartSec) * pxPerSec, 20);
                      return (
                        <div
                          key={s.id}
                          onPointerDown={(e) => startAudioDrag(e, track, i, "move")}
                          onDoubleClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            splitClip(track, i, (e.clientX - rect.left) / rect.width);
                          }}
                          title="Drag to move · edges to crop · double-click to split"
                          className="group/clip absolute top-0 flex h-full cursor-grab items-center overflow-hidden rounded-lg border border-[#3a2f12] bg-[#141006] active:cursor-grabbing"
                          style={{ left: clipLeft, width: clipW }}
                        >
                          <Waveform
                            audio={track}
                            width={clipW}
                            height={32}
                            startFrac={dur ? s.trimStartSec / dur : 0}
                            endFrac={dur ? s.trimEndSec / dur : 1}
                          />
                          <span className="pointer-events-none absolute bottom-[2px] left-[6px] rounded bg-black/65 px-[4px] text-[9px] tabular-nums text-[#8f8f99] opacity-0 transition-opacity group-hover/clip:opacity-100">
                            {(s.trimEndSec - s.trimStartSec).toFixed(1)}s
                          </span>
                          {/* remove in the top-right corner so the body stays draggable */}
                          <button
                            type="button"
                            title="Remove this clip"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeClip(track, i);
                            }}
                            className="absolute right-[3px] top-[3px] z-20 flex h-[15px] w-[15px] items-center justify-center rounded bg-black/70 text-[#cfcfd7] opacity-0 transition-opacity hover:text-[#f87171] group-hover/clip:opacity-100"
                          >
                            <IconX className="h-[9px] w-[9px]" />
                          </button>
                          <span
                            title="Crop in (slides the clip right)"
                            onPointerDown={(e) => startAudioDrag(e, track, i, "l")}
                            className="absolute -left-[3px] top-0 z-10 h-full w-[10px] cursor-ew-resize"
                          >
                            <span className="absolute bottom-[2px] left-[4px] top-[2px] w-[3px] rounded-sm bg-[#f5b544]" />
                          </span>
                          <span
                            title="Crop out"
                            onPointerDown={(e) => startAudioDrag(e, track, i, "r")}
                            className="absolute -right-[3px] top-0 z-10 h-full w-[10px] cursor-ew-resize"
                          >
                            <span className="absolute bottom-[2px] right-[4px] top-[2px] w-[3px] rounded-sm bg-[#f5b544]" />
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}

            {/* spacer row aligning with the gutter's add button */}
            <div className="flex-shrink-0" style={{ height: 24 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
