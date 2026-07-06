import { NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import { consumeNonce } from '@/lib/nonce-store';

// Create viem client for Base mainnet
const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

// Fail closed: a missing secret must not silently fall back to a guessable key
// (that would let anyone forge tokens). Throw at call time if unset.
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

const AUTH_COOKIE_NAME = 'aipg_auth';
const TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24h, matches the Go server cookie
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000; // reject stale sign-in messages

export async function POST(request: Request) {
  try {
    const { address, message, signature } = await request.json();

    if (!address || !message || !signature) {
      return NextResponse.json(
        { error: 'Missing address, message, or signature' },
        { status: 400 }
      );
    }

    // Parse the EIP-4361 message so we can validate its envelope before trusting it.
    let siwe: SiweMessage;
    try {
      siwe = new SiweMessage(message);
    } catch {
      return NextResponse.json({ error: 'Malformed sign-in message' }, { status: 400 });
    }

    // Address in the body must match the one inside the signed message.
    if (siwe.address.toLowerCase() !== String(address).toLowerCase()) {
      return NextResponse.json({ error: 'Address mismatch' }, { status: 401 });
    }

    // Domain binding: the message must be for THIS site, not some other dApp
    // where the user happened to sign a similar message.
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    if (host && siwe.domain.toLowerCase() !== host.toLowerCase()) {
      return NextResponse.json({ error: 'Unexpected sign-in domain' }, { status: 401 });
    }

    // Freshness: reject stale / future-dated messages.
    const issuedAt = siwe.issuedAt ? Date.parse(siwe.issuedAt) : NaN;
    if (Number.isNaN(issuedAt) || Date.now() - issuedAt > MAX_MESSAGE_AGE_MS || issuedAt - Date.now() > 2 * 60 * 1000) {
      return NextResponse.json({ error: 'Sign-in message expired - please try again' }, { status: 401 });
    }

    // One-time nonce: must have been issued by us and not already used. This is
    // the core replay defense — consume it before the (expensive) signature check.
    if (!siwe.nonce || !consumeNonce(siwe.nonce)) {
      return NextResponse.json({ error: 'Invalid or expired nonce' }, { status: 401 });
    }

    // Verify the signature using viem (handles ECDSA, EIP-1271, and ERC-6492).
    const valid = await client.verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!valid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Mint the JWT (HS256, same secret the Go server validates with).
    const token = jwt.sign(
      { address: String(address).toLowerCase(), iat: Math.floor(Date.now() / 1000) },
      jwtSecret(),
      { expiresIn: TOKEN_TTL_SECONDS }
    );

    console.log(`Auth: Wallet ${address} authenticated successfully via viem`);

    // Deliver the JWT ONLY as an httpOnly cookie — never readable by JS.
    const res = NextResponse.json({ address: String(address).toLowerCase() });
    const proto = request.headers.get('x-forwarded-proto');
    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.AUTH_COOKIE_SECURE === 'true' || proto === 'https',
      sameSite: 'lax',
      path: '/',
      domain: process.env.AUTH_COOKIE_DOMAIN || undefined,
      maxAge: TOKEN_TTL_SECONDS,
    });
    return res;
  } catch (error) {
    console.error('Auth verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
