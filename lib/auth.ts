import { SiweMessage } from 'siwe';

const getApiBase = () =>
  process.env.NEXT_PUBLIC_GALLERY_API ?? "http://localhost:4000/api";

// ============================================================================
// Token Storage
// ============================================================================

const TOKEN_KEY = 'aipg_auth_token';
const ADDRESS_KEY = 'aipg_auth_address';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getAuthAddress(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADDRESS_KEY);
}

function setAuthToken(token: string, address: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ADDRESS_KEY, address.toLowerCase());
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ADDRESS_KEY);
}

export function isAuthenticated(): boolean {
  const token = getAuthToken();
  if (!token) return false;
  
  // Check if token is expired
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

// ============================================================================
// API Calls
// ============================================================================

async function getNonce(): Promise<string> {
  const response = await fetch(`${getApiBase()}/auth/nonce`, {
    method: 'POST',
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
): Promise<{ token: string; address: string }> {
  const response = await fetch(`${getApiBase()}/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, signature, address }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Failed to verify signature');
  }
  
  return response.json();
}

// ============================================================================
// Sign-In Function
// ============================================================================

export interface SignInParams {
  address: string;
  signMessageAsync: (args: { message: string }) => Promise<string>;
  chainId?: number;
}

export async function signIn({ address, signMessageAsync, chainId = 8453 }: SignInParams): Promise<string> {
  // 1. Get nonce from backend
  const nonce = await getNonce();

  // 2. Create SIWE message
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

  // 3. Sign message with wallet
  const signature = await signMessageAsync({
    message: preparedMessage,
  });

  // 4. Verify signature and get JWT
  const { token } = await verifySignature(preparedMessage, signature, address);

  // 5. Store token
  setAuthToken(token, address);

  return token;
}

// ============================================================================
// Sign-Out Function
// ============================================================================

export function signOut() {
  clearAuthToken();
}
