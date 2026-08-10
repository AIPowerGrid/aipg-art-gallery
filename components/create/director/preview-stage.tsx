"use client";

/**
 * The big preview stage: rendered segments play back-to-back as an assembled
 * cut. Two stacked <video> elements double-buffer playback — while segment N
 * plays on the front element, segment N+1 preloads on the back one and swaps
 * in on 'ended' with no visible gap. The scrubber supports click AND drag and
 * maps the whole timeline (rendered ranges highlighted; gaps are skipped).
 * Export lives in the console's top bar, not here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DirectorSegment,
  framesToSeconds,
  segmentOffsets,
  totalFrames,
} from "@/lib/types/director";
import { IconPlay, IconPause } from "./icons";
import { ChainIcon } from "./chain-icon";

interface PreviewStageProps {
  segments: DirectorSegment[];
  onPlayhead: (sec: number) => void;
  /** External seek command (from the timeline ruler); `n` disambiguates repeats. */
  seekRequest?: { sec: number; n: number } | null;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function PreviewStage({ segments, onPlayhead, seekRequest }: PreviewStageProps) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  /** Which element is in front (0 = A, 1 = B). */
  const [front, setFront] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [curIdx, setCurIdx] = useState<number | null>(null);
  const [globalSec, setGlobalSec] = useState(0);

  const frontVideo = () => (front === 0 ? videoARef.current : videoBRef.current);
  const backVideo = () => (front === 0 ? videoBRef.current : videoARef.current);

  const offsets = segmentOffsets(segments);
  const totalSec = framesToSeconds(totalFrames(segments));
  const renderedCount = useMemo(
    () => segments.filter((s) => s.status === "done" && s.outputUrl).length,
    [segments]
  );

  /** First playable segment covering `sec` or after it. */
  const segAtOrAfter = useCallback(
    (sec: number): { index: number; localSec: number } | null => {
      for (let i = 0; i < segments.length; i++) {
        const start = framesToSeconds(offsets[i]);
        const end = start + framesToSeconds(segments[i].lengthFrames);
        if (sec < end && segments[i].status === "done" && segments[i].outputUrl) {
          return { index: i, localSec: Math.max(0, sec - start) };
        }
      }
      return null;
    },
    [segments, offsets]
  );

  const nextRenderedAfter = useCallback(
    (idx: number): number | null => {
      for (let i = idx + 1; i < segments.length; i++) {
        if (segments[i].status === "done" && segments[i].outputUrl) return i;
      }
      return null;
    },
    [segments]
  );

  /** Warm the back buffer with the next rendered clip after `idx`. */
  const preloadNext = useCallback(
    (idx: number) => {
      const next = nextRenderedAfter(idx);
      const back = backVideo();
      if (!back) return;
      if (next !== null) {
        const url = segments[next].outputUrl!;
        if (back.src !== url) {
          back.src = url;
          back.preload = "auto";
          back.load();
        }
        back.currentTime = 0;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nextRenderedAfter, segments, front]
  );

  const loadAndMaybePlay = useCallback(
    (index: number, localSec: number, play: boolean) => {
      const video = frontVideo();
      const seg = segments[index];
      if (!video || !seg?.outputUrl) return;
      setCurIdx(index);
      if (video.src !== seg.outputUrl) video.src = seg.outputUrl;
      const apply = () => {
        video.currentTime = localSec;
        if (play) video.play().catch(() => setPlaying(false));
      };
      if (video.readyState >= 1) apply();
      else video.addEventListener("loadedmetadata", apply, { once: true });
      preloadNext(index);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segments, front, preloadNext]
  );

  const handlePlayPause = () => {
    const video = frontVideo();
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
      return;
    }
    const target = segAtOrAfter(globalSec) ?? segAtOrAfter(0);
    if (!target) return;
    setPlaying(true);
    loadAndMaybePlay(target.index, target.localSec, true);
  };

  const handleSeek = useCallback(
    (sec: number, keepPlaying?: boolean) => {
      const target = segAtOrAfter(sec);
      setGlobalSec(sec);
      onPlayhead(sec);
      if (target) {
        loadAndMaybePlay(target.index, target.localSec, keepPlaying ?? playing);
      } else {
        frontVideo()?.pause();
        setPlaying(false);
        setCurIdx(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segAtOrAfter, loadAndMaybePlay, onPlayhead, playing, front]
  );

  // Playback progress + seamless clip hand-off (swap to the preloaded buffer).
  useEffect(() => {
    const video = frontVideo();
    if (!video) return;
    const onTime = () => {
      if (curIdx === null) return;
      const sec = framesToSeconds(offsets[curIdx]) + video.currentTime;
      setGlobalSec(sec);
      onPlayhead(sec);
    };
    const onEnded = () => {
      if (curIdx === null) return;
      const next = nextRenderedAfter(curIdx);
      if (next !== null && playing) {
        const back = backVideo();
        const url = segments[next].outputUrl!;
        if (back && back.src === url && back.readyState >= 2) {
          // Preloaded and decodable: swap buffers with no load gap.
          back.currentTime = 0;
          back.play().catch(() => setPlaying(false));
          setFront((f) => (f === 0 ? 1 : 0));
          setCurIdx(next);
          setGlobalSec(framesToSeconds(offsets[next]));
        } else {
          loadAndMaybePlay(next, 0, true);
          setGlobalSec(framesToSeconds(offsets[next]));
        }
      } else {
        setPlaying(false);
      }
    };
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("ended", onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curIdx, offsets, segments, playing, front, nextRenderedAfter, loadAndMaybePlay, onPlayhead]);

  // After a buffer swap, warm the following clip into the (new) back buffer.
  useEffect(() => {
    if (curIdx !== null) preloadNext(curIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [front]);

  // External seeks from the timeline ruler.
  const lastSeekN = useRef(0);
  useEffect(() => {
    if (seekRequest && seekRequest.n !== lastSeekN.current) {
      lastSeekN.current = seekRequest.n;
      handleSeek(seekRequest.sec);
    }
  }, [seekRequest, handleSeek]);

  // Scrubber: click AND drag with pointer capture.
  const scrubRef = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const secFromEvent = (clientX: number): number => {
    const el = scrubRef.current;
    if (!el || totalSec === 0) return 0;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return frac * totalSec;
  };
  const onScrubDown = (e: React.PointerEvent) => {
    scrubbing.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handleSeek(secFromEvent(e.clientX));
  };
  const onScrubMove = (e: React.PointerEvent) => {
    if (scrubbing.current) handleSeek(secFromEvent(e.clientX));
  };
  const onScrubUp = () => {
    scrubbing.current = false;
  };

  const curSegLabel = curIdx !== null ? curIdx + 1 : "–";
  const videoCls = (mine: number) =>
    `absolute inset-0 m-auto max-h-full max-w-full ${front === mine ? "" : "invisible"} ${
      renderedCount === 0 ? "hidden" : ""
    }`;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col px-5 py-4">
      {/* player */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-black">
        <span className="absolute left-3 top-3 z-10 rounded-[5px] border border-border bg-black/60 px-2 py-[3px] text-[11px] text-muted-foreground">
          Segment <b className="text-primary">{curSegLabel}</b> of {segments.length}
        </span>

        <video ref={videoARef} playsInline className={videoCls(0)} onClick={handlePlayPause} />
        <video ref={videoBRef} playsInline className={videoCls(1)} onClick={handlePlayPause} />

        {renderedCount === 0 && (
          <div className="text-center">
            {/* mini chained timeline — mirrors the Director entry card */}
            <div className="mx-auto mb-4 flex w-fit items-center">
              <span className="h-[30px] w-[52px] rounded-md border border-secondary bg-gradient-to-br from-card to-background" />
              <span className="z-10 -mx-[7px] flex h-[16px] w-[16px] items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary">
                <ChainIcon className="h-[8px] w-[8px]" />
              </span>
              <span className="h-[30px] w-[52px] rounded-md border border-primary/35 bg-gradient-to-br from-primary/15 to-primary/10" />
              <span className="z-10 -mx-[7px] flex h-[16px] w-[16px] items-center justify-center rounded-full border border-primary/50 bg-primary/10 text-primary">
                <ChainIcon className="h-[8px] w-[8px]" />
              </span>
              <span className="h-[30px] w-[52px] rounded-md border border-secondary bg-gradient-to-br from-card to-background" />
            </div>
            <p className="text-[13px] text-tertiary">Render a segment to preview the cut.</p>
          </div>
        )}
      </div>

      {/* transport */}
      <div className="mt-3 flex flex-shrink-0 items-center gap-3 text-[12px] text-muted-foreground">
        <button
          type="button"
          onClick={handlePlayPause}
          disabled={renderedCount === 0}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-foreground disabled:text-edge"
        >
          {playing ? <IconPause className="h-3 w-3" /> : <IconPlay className="ml-[2px] h-3 w-3" />}
        </button>
        <span className="tabular-nums">{fmt(globalSec)}</span>
        <div
          ref={scrubRef}
          onPointerDown={onScrubDown}
          onPointerMove={onScrubMove}
          onPointerUp={onScrubUp}
          onPointerCancel={onScrubUp}
          className="relative h-[14px] flex-1 cursor-pointer touch-none"
        >
          <div className="absolute inset-x-0 top-1/2 h-[4px] -translate-y-1/2 rounded-[2px] bg-border">
            {segments.map((s, i) =>
              s.status === "done" && s.outputUrl && totalSec > 0 ? (
                <span
                  key={s.id}
                  className="absolute bottom-0 top-0 rounded-[2px] bg-edge"
                  style={{
                    left: `${(framesToSeconds(offsets[i]) / totalSec) * 100}%`,
                    width: `${(framesToSeconds(s.lengthFrames) / totalSec) * 100}%`,
                  }}
                />
              ) : null
            )}
            {totalSec > 0 && (
              <span
                className="absolute bottom-0 top-0 rounded-[2px] bg-primary"
                style={{ width: `${Math.min(100, (globalSec / totalSec) * 100)}%` }}
              />
            )}
          </div>
          {/* drag knob */}
          {totalSec > 0 && (
            <span
              className="absolute top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
              style={{ left: `${Math.min(100, (globalSec / totalSec) * 100)}%` }}
            />
          )}
        </div>
        <span className="tabular-nums">{fmt(totalSec)}</span>
      </div>
    </div>
  );
}
