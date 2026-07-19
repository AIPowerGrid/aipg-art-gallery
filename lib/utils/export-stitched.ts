/**
 * Client-side stitched export: plays the rendered clips back-to-back into a
 * canvas + WebAudio graph and records the combined stream with MediaRecorder.
 * Produces a WebM (VP9/VP8 + Opus) in real time — an N-second cut takes ~N
 * seconds to export. No server round-trip, no ffmpeg.
 *
 * Clips are fetched through the same-origin download proxy so the media
 * element never taints the canvas (same trick as video-frames.ts).
 */

export interface StitchProgress {
  /** 0..1 across the whole export. */
  fraction: number;
  clipIndex: number;
  clipCount: number;
}

export async function exportStitched(
  urls: string[],
  opts: {
    width: number;
    height: number;
    onProgress?: (p: StitchProgress) => void;
    signal?: AbortSignal;
  }
): Promise<Blob> {
  if (urls.length === 0) throw new Error('nothing to export');
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder unsupported');

  const { width, height, onProgress, signal } = opts;

  // Fetch every clip via the proxy up front (also warms playback).
  const blobUrls: string[] = [];
  try {
    for (const url of urls) {
      const res = await fetch(`/api/download?url=${encodeURIComponent(url)}`, {
        credentials: 'include',
        signal,
      });
      if (!res.ok) throw new Error(`clip fetch failed (${res.status})`);
      const raw = await res.blob();
      // The proxy forwards upstream's content-type, often octet-stream — a
      // <video> element refuses to decode a typeless blob ("metadata failed").
      // All grid clips are MP4, so force the type.
      const typed = raw.type.startsWith('video/') ? raw : new Blob([raw], { type: 'video/mp4' });
      blobUrls.push(URL.createObjectURL(typed));
    }

    const video = document.createElement('video');
    video.muted = false;
    video.playsInline = true;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d canvas context');

    const AudioCtx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const source = audioCtx.createMediaElementSource(video);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest); // recorded, not played out loud

    const stream = canvas.captureStream(30);
    const audioTrack = dest.stream.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);

    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(
      (m) => MediaRecorder.isTypeSupported(m)
    );
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    // Total duration for progress (read metadata first).
    const durations: number[] = [];
    for (const u of blobUrls) durations.push(await probeDuration(video, u));
    const total = durations.reduce((a, b) => a + b, 0) || 1;

    recorder.start(250);

    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      if (video.readyState >= 2) ctx.drawImage(video, 0, 0, width, height);
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);

    try {
      let elapsed = 0;
      for (let i = 0; i < blobUrls.length; i++) {
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
        await playThrough(video, blobUrls[i], audioCtx, (t) => {
          onProgress?.({
            fraction: Math.min(1, (elapsed + t) / total),
            clipIndex: i,
            clipCount: blobUrls.length,
          });
        });
        elapsed += durations[i];
      }
    } finally {
      drawing = false;
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });
      if (recorder.state !== 'inactive') recorder.stop();
      await stopped;
      audioCtx.close().catch(() => {});
    }

    return new Blob(chunks, { type: mime ?? 'video/webm' });
  } finally {
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
  }
}

function probeDuration(video: HTMLVideoElement, url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onMeta = () => {
      cleanup();
      resolve(Number.isFinite(video.duration) ? video.duration : 0);
    };
    const onErr = () => {
      cleanup();
      reject(new Error('clip metadata failed'));
    };
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onMeta);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.src = url;
  });
}

function playThrough(
  video: HTMLVideoElement,
  url: string,
  audioCtx: AudioContext,
  onTime: (t: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEnded = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('clip playback failed'));
    };
    const onTimeUpdate = () => onTime(video.currentTime);
    const cleanup = () => {
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onErr);
      video.removeEventListener('timeupdate', onTimeUpdate);
    };
    video.addEventListener('ended', onEnded, { once: true });
    video.addEventListener('error', onErr, { once: true });
    video.addEventListener('timeupdate', onTimeUpdate);
    if (video.src !== url) video.src = url;
    video.currentTime = 0;
    audioCtx.resume().catch(() => {});
    video.play().catch(onErr);
  });
}
