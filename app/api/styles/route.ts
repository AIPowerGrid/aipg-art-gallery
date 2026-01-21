import { NextResponse } from 'next/server';
import stylesConfig from '@/config/styles.json';

export async function GET() {
  return NextResponse.json(stylesConfig);
}
