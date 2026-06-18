import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  
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
    parsedUrl.hostname.endsWith('.r2.cloudflarestorage.com');

  if (!isAllowedDomain) {
    return NextResponse.json({ error: 'Domain not allowed' }, { status: 403 });
  }

  try {
    // redirect: 'manual' — the hostname allowlist above only validates the
    // initial URL. If we followed redirects, an open redirect on an allowed
    // origin could bounce us to an internal address (SSRF). Reject any 3xx.
    const response = await fetch(url, { redirect: 'manual' });

    if (response.status >= 300 && response.status < 400) {
      return NextResponse.json({ error: 'Redirects are not allowed' }, { status: 502 });
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch file' }, { status: response.status });
    }

    const blob = await response.blob();

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
      },
    });
  } catch (error) {
    console.error('Download proxy error:', error);
    return NextResponse.json({ error: 'Download failed' }, { status: 500 });
  }
}
