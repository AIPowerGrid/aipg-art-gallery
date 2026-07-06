import { NextResponse } from 'next/server'

/**
 * Auth callback handler for wallet connections
 * This handles redirects back from mobile wallet apps
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const next = requestUrl.searchParams.get('next') ?? '/'

  // Simply redirect back to the app - wagmi handles wallet connection state
  return NextResponse.redirect(new URL(next, requestUrl.origin))
}
