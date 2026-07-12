import { SiweMessage } from "siwe";

// Wallet sign-in uses the Next.js /auth-api routes (viem / ERC-6492 support).
const getAuthBase = () => "/auth-api";

// Session checks (/auth/me, /auth/logout) live on the Go API.
export const getApiBase = () =>
  process.env.NEXT_PUBLIC_GALLERY_API ?? "http://localhost:4000/api";

// ============================================================================
// Session state
// ============================================================================
//
// The JWT lives ONLY in an httpOnly cookie (set by /auth-api/verify), so it is
// never readable by JS — XSS can't exfiltrate it. The browser can't read that
// cookie, so we keep a small, non-sensitive marker (the public wallet address +
// an expiry) in localStorage purely to drive UI state synchronously. The server
// re-validates the cookie on every protected request, so a tampered marker only
// affects optimistic UI, never authorization.

const ADDRESS_KEY = "aipg_auth_address";
const EXPIRY_KEY = "aipg_auth_expiry";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // mirrors the server JWT lifetime

export function getAuthAddress(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADDRESS_KEY);
}

function setSession(address: string) {
  localStorage.setItem(ADDRESS_KEY, address.toLowerCase());
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + SESSION_TTL_MS));
}

// Named clearAuthToken for backwards compatibility with existing callers; it now
// clears the local wallet session marker (the cookie is cleared via signOut()).
export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADDRESS_KEY);
  localStorage.removeItem(EXPIRY_KEY);
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  const address = localStorage.getItem(ADDRESS_KEY);
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  return Boolean(address) && expiry > Date.now();
}

// ============================================================================
// API calls
// ============================================================================

async function getNonce(): Promise<string> {
  const response = await fetch(`${getAuthBase()}/nonce`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Failed to get nonce");
  }
  const data = await response.json();
  return data.nonce;
}

async function verifySignature(
  message: string,
  signature: string,
  address: string,
): Promise<{ address: string }> {
  const response = await fetch(`${getAuthBase()}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // let the browser store the httpOnly session cookie
    body: JSON.stringify({ message, signature, address }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Failed to verify signature");
  }
  return response.json();
}

/**
 * Reconcile local UI state with the server session (httpOnly cookie). Returns
 * the authenticated wallet address, or null. Call on app load.
 */
export async function fetchSession(): Promise<string | null> {
  try {
    const response = await fetch(`${getApiBase()}/auth/me`, {
      credentials: "include",
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
    return null;
  } catch {
    return null;
  }
}

export async function linkWalletToGoogleAccount(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<string>,
): Promise<void> {
  const nonceResponse = await fetch(`${getApiBase()}/auth/link-wallet/nonce`, {
    method: "POST",
    credentials: "include",
  });
  if (!nonceResponse.ok) throw new Error("Could not create wallet-link proof");
  const { nonce } = await nonceResponse.json();
  const message = `Link wallet to AIPG Grid identity\n\nNonce: ${nonce}`;
  const signature = await signMessageAsync({ message });
  const response = await fetch(`${getApiBase()}/auth/link-wallet`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature, address }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Wallet link failed");
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

// De-dupe concurrent sign-ins. Multiple effects (providers + wallet button)
// can fire on connect; without this each would prompt the wallet separately.
// Concurrent callers for the same address share one in-flight signature prompt.
let _inflightSignIn: { address: string; promise: Promise<void> } | null = null;

export function signIn(params: SignInParams): Promise<void> {
  const addr = params.address.toLowerCase();
  if (_inflightSignIn && _inflightSignIn.address === addr) {
    return _inflightSignIn.promise;
  }
  const promise = _signIn(params).finally(() => {
    if (_inflightSignIn?.address === addr) _inflightSignIn = null;
  });
  _inflightSignIn = { address: addr, promise };
  return promise;
}

async function _signIn({
  address,
  signMessageAsync,
  chainId = 8453,
}: SignInParams): Promise<void> {
  // 1. Get a one-time nonce.
  const nonce = await getNonce();

  // 2. Build the SIWE message.
  const message = new SiweMessage({
    domain: window.location.host,
    address,
    statement: "Sign in to AIPG Art Gallery",
    uri: window.location.origin,
    version: "1",
    chainId,
    nonce,
    issuedAt: new Date().toISOString(),
  });

  const preparedMessage = message.prepareMessage();

  // 3. Sign with the wallet.
  const signature = await signMessageAsync({ message: preparedMessage });

  // 4. Verify — the server sets the httpOnly cookie on success (handles ERC-6492).
  await verifySignature(preparedMessage, signature, address);

  // 5. Record only the public marker for UI state.
  setSession(address);
}

export async function signOut() {
  try {
    await fetch(`${getApiBase()}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // best-effort; clear local state regardless
  }
  clearAuthToken();
}
