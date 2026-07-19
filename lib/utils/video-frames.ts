/**
 * Extract a single still frame from a video URL as a base64 JPEG data URI —
 * the mechanism behind last-frame chaining (a shot's last frame becomes the
 * next shot's start frame) and fill-between anchoring.
 *
 * Primary path: a detached <video crossOrigin="anonymous"> is seeked and drawn
 * to a canvas. That requires the CDN to permit CORS; if it doesn't,
 * canvas.toDataURL throws a SecurityError. Fallback: fetch the clip through our
 * OWN same-origin proxy (/api/download, host-allowlisted) as a blob and decode
 * that — a blob: URL is same-origin, so the canvas never taints. No ffmpeg or
 * extra server decoding needed.
 */

export type FramePosition = 'first' | 'last';

/** Same-origin proxy used for the CORS fallback (must allowlist the video host). */
const PROXY_PATH = '/api/download';

/** Hosts whose canvas tainted once — skip the direct path and proxy straight away. */
const taintedHosts = new Set<string>();

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function onceEvent(el: HTMLMediaElement, name: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      el.removeEventListener(name, onOk);
      el.removeEventListener('error', onErr);
      clearTimeout(timer);
    };
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`video "${name}" failed to load`));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`video "${name}" timed out`));
    }, timeoutMs);
    el.addEventListener(name, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });
}

async function extractInBrowser(url: string, position: FramePosition): Promise<string> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await onceEvent(video, 'loadedmetadata');
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    // Last frame: seek INSIDE the final frame's display interval. A frame at
    // 24fps is ~41.7ms, so a 50ms epsilon would land on the second-to-last
    // frame — the chained join would start one frame early.
    video.currentTime = position === 'first' ? 0 : Math.max(0, duration - 0.01);
    await onceEvent(video, 'seeked');

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 768;
    canvas.height = video.videoHeight || 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d canvas context');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Throws SecurityError if the canvas is tainted (host lacks CORS headers).
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

/** Decode via a same-origin blob so the canvas can't taint. */
async function extractViaProxy(url: string, position: FramePosition): Promise<string> {
  const res = await fetch(`${PROXY_PATH}?url=${encodeURIComponent(url)}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`proxy fetch failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await extractInBrowser(objectUrl, position);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Extract the first or last frame of `url`. Tries the direct (CORS) path; on a
 * tainted canvas (SecurityError) it remembers the host and re-decodes the clip
 * through the same-origin proxy.
 */
export async function extractFrame(url: string, position: FramePosition): Promise<string> {
  const host = hostOf(url);

  if (!taintedHosts.has(host)) {
    try {
      return await extractInBrowser(url, position);
    } catch (err) {
      const tainted = err instanceof DOMException && err.name === 'SecurityError';
      if (!tainted) throw err;
      taintedHosts.add(host);
      // fall through to the same-origin proxy
    }
  }

  return extractViaProxy(url, position);
}
