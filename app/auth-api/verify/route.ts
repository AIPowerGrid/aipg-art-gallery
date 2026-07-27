import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Use /api/auth/wallet/exchange for canonical Grid sign-in' },
    { status: 410 },
  );
}
