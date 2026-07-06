import { NextRequest, NextResponse } from 'next/server';

// Per-request Content-Security-Policy with a unique nonce.
//
// Why middleware instead of a static header: a nonce lets us drop 'unsafe-inline'
// from script-src. Modern browsers ignore 'unsafe-inline' once a nonce or
// 'strict-dynamic' is present, so inline-script injection (the main XSS vector)
// is blocked while Next.js's own scripts — which inherit the nonce — keep working.
//
// 'unsafe-eval' is intentionally kept: the wallet/web3 stack (wagmi / WalletConnect)
// relies on it. https://accounts.google.com stays allowed for Google One Tap.
//
// NOTE: enabling a nonce opts pages into dynamic rendering. Verify in a browser
// (wallet connect + Google One Tap + navigation) before relying on this; to roll
// back, delete this file and restore the static CSP in next.config.mjs.
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV !== 'production';

  // In dev, Next's HMR needs 'unsafe-inline'/'unsafe-eval'; in prod we rely on the
  // nonce + strict-dynamic and only keep 'unsafe-eval' for web3.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    "'unsafe-eval'",
    'https://accounts.google.com',
    isDev ? "'unsafe-inline'" : '',
  ]
    .filter(Boolean)
    .join(' ');

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://accounts.google.com",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  // Pass the CSP (with nonce) on the request headers so Next.js applies the nonce
  // to its own <script> tags, and set it on the response so the browser enforces it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  // Run on all routes except static assets (CSP is irrelevant for those and we
  // don't want to force dynamic rendering of cached static files).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)'],
};
