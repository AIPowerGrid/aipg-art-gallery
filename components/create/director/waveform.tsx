"use client";

import { useEffect, useRef } from "react";
import { DirectorAudio } from "@/lib/types/director";

/**
 * Canvas waveform of an uploaded track. Peaks are decoded once per file (from
 * the base64 data URI, by hand — fetch(data:) is CSP-blocked); [startFrac,
 * endFrac] draws only the cropped slice at full width. The canvas backing store
 * is capped so a long track at timeline scale can't exceed the browser's max
 * canvas dimension (past which it silently goes blank).
 */
export function Waveform({
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
      const dpr = window.devicePixelRatio || 1;
      const pxW = Math.min(Math.round(width * dpr), 16000);
      canvas.width = pxW;
      canvas.height = Math.round(height * dpr);
      ctx.scale(pxW / width, canvas.height / height);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "rgba(226,137,42,0.55)";
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
        const b64 = audio.audioB64.includes(",")
          ? audio.audioB64.slice(audio.audioB64.indexOf(",") + 1)
          : audio.audioB64;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(bytes.buffer);
        ctx.close().catch(() => {});
        const data = decoded.getChannelData(0);
        // ~20 buckets/sec (keeps slices detailed), capped for memory.
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
