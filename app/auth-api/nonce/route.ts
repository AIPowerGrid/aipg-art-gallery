import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { cleanupNonces, storeNonce } from '@/lib/nonce-store';

export async function POST() {
  cleanupNonces();
  
  const nonce = crypto.randomBytes(16).toString('hex');
  storeNonce(nonce);
  
  return NextResponse.json({ nonce });
}
