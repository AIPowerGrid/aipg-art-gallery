import { SiweMessage } from 'siwe';

const getApiBase = () =>
  process.env.NEXT_PUBLIC_GALLERY_API ?? "http://localhost:4000/api";

// ============================================================================
// Session state
// ============================================================================
//
// The JWT itself lives ONLY in an httpOnly cookie set by the Go server, so it is
// never readable by JS (XSS-safe). The browser cannot read that cookie, so we
// keep a small, non-sensitive marker in localStorage — the (public) wallet
// address plus an expiry — purely to drive UI state synchronously. The server
// re-validates the cookie on every protected request, so a tampered marker only
// affects optimistic UI, never authorization.

const ADDRESS_KEY = 'aipg_auth_address';
const EXPIRY_KEY = 'aipg_auth_expiry';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // mirrors the server JWT lifetime

export function getAuthAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADDRESS_KEY);
}

function setSession(address: string) {
  localStorage.setItem(ADDRESS_KEY, address.toLowerCase());
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + SESSION_TTL_MS));
}

// Named clearAuthToken for backwards compatibility with existing callers; it now
// clears the local session marker (the cookie is cleared via signOut()).
export function clearAuthToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADDRESS_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  const address = localStorage.getItem(ADDRESS_KEY);
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  return Boolean(address) && expiry > Date.now();
}

// ============================================================================
// API Calls
// ============================================================================

async function getNonce(): Promise<string> {
  const response = await fetch(`${getApiBase()}/auth/nonce`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to get nonce');
  }

  const data = await response.json();
  return data.nonce;
}

async function verifySignature(
  message: string,
  signature: string,
  address: string
): Promise<{ address: string }> {
  const response = await fetch(`${getApiBase()}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // let the browser store the httpOnly session cookie
    body: JSON.stringify({ message, signature, address }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to verify signature');
  }

  return response.json();
}

/**
 * Reconcile local UI state with the server session. Returns the authenticated
 * address (from the httpOnly cookie) or null. Call on app load.
 */
export async function fetchSession(): Promise<string | null> {
  try {
    const response = await fetch(`${getApiBase()}/auth/me`, {
      credentials: 'include',
    });
    if (!response.ok) {
      clearAuthToken();
      return null;
    }
    const data = await response.json();
    const address: string | undefined = data?.address;
    if (address) {
      setSession(address);
      return address.toLowerCase();
    }
    clearAuthToken();
    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// Sign-In / Sign-Out
// ============================================================================

export interface SignInParams {
  address: string;
  signMessageAsync: (args: { message: string }) => Promise<string>;
  chainId?: number;
}

export async function signIn({ address, signMessageAsync, chainId = 8453 }: SignInParams): Promise<void> {
  // 1. Get a one-time nonce from the backend.
  const nonce = await getNonce();

  // 2. Build the SIWE message.
  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: 'Sign in to AIPG Art Gallery',
    uri: window.location.origin,
    version: '1',
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
  });

  const preparedMessage = message.prepareMessage();

  // 3. Sign with the wallet.
  const signature = await signMessageAsync({ message: preparedMessage });

  // 4. Verify — the server sets the httpOnly session cookie on success.
  await verifySignature(preparedMessage, signature, address);

  // 5. Record only the public marker for UI state.
  setSession(address);
}

export async function signOut() {
  try {
    await fetch(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // best-effort; clear local state regardless
  }
  clearAuthToken();
}
