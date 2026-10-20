import { NextRequest, NextResponse } from 'next/server';

const IMAGE_LIMIT = 10 * 1024 * 1024;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  const imageOnly = request.nextUrl.searchParams.get('image') === '1';
  
  if (!url) {
    return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
  }

  // Only allow downloads from our CDN - use exact hostname matching to prevent SSRF
  let parsedUrl: URL;
  
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const isAllowedDomain =
    parsedUrl.hostname === 'images.aipg.art' ||
    parsedUrl.hostname === 'media.aipg.art' ||
    parsedUrl.hostname === 'a9b7416008b496f49b0f021099cc4128.r2.cloudflarestorage.com';

  if (!isAllowedDomain || parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password ||
      (parsedUrl.port && parsedUrl.port !== '443')) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  try {
    // redirect: 'manual' — the hostname allowlist above only validates the
    // initial URL. If we followed redirects, an open redirect on an allowed
    // origin could bounce us to an internal address (SSRF). Reject any 3xx.
    const response = await fetch(url, { redirect: 'manual', ...(imageOnly ? { signal: AbortSignal.timeout(30_000) } : {}) });

    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json({ error: 'Redirects are not allowed' }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: response.status });
    }

    let blob: Blob;
    if (imageOnly) {
      const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
      if (!mime || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
        await response.body?.cancel();
        return NextResponse.json({ error: 'Unsupported shot image' }, { status: 415 });
      }
      const length = response.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length) > IMAGE_LIMIT)) {
        await response.body?.cancel();
        return NextResponse.json({ error: 'Shot image is too large' }, { status: 413 });
      }
      if (!response.body) return NextResponse.json({ error: 'Empty shot image' }, { status: 502 });
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > IMAGE_LIMIT) {
            await reader.cancel();
            return NextResponse.json({ error: 'Shot image is too large' }, { status: 413 });
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      if (size === 0) return NextResponse.json({ error: 'Empty shot image' }, { status: 502 });
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      blob = new Blob([bytes], { type: mime });
    } else blob = await response.blob();

    // Extract filename from URL and strip anything that could break out of the
    // Content-Disposition header (quotes, CR/LF, path separators).
    const pathParts = parsedUrl.pathname.split('/');
    const rawName = pathParts[pathParts.length - 1] || 'download';
    const filename = rawName.replace(/[^\w.\-]/g, '_').slice(0, 200) || 'download';

    return new NextResponse(blob, {
      headers: {
        'Content-Type': blob.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': blob.size.toString(),
        ...(imageOnly ? { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } : {}),
      },
    });
  } catch (error) {
    if (imageOnly) console.error('Shot image download failed:', error instanceof Error ? error.name : 'unknown');
    else console.error('Download proxy error:', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
