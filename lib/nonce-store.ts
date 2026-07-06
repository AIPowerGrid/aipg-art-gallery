// In-memory nonce store (use Redis in production for multi-instance)
const nonces = new Map<string, number>();

// Clean up old nonces every 5 minutes
const NONCE_TTL = 5 * 60 * 1000; // 5 minutes

export function cleanupNonces() {
  const now = Date.now();
  for (const [nonce, timestamp] of nonces.entries()) {
    if (now - timestamp > NONCE_TTL) {
      nonces.delete(nonce);
    }
  }
}

export function storeNonce(nonce: string) {
  nonces.set(nonce, Date.now());
}

export function consumeNonce(nonce: string): boolean {
  if (nonces.has(nonce)) {
    nonces.delete(nonce);
    return true;
  }
  return false;
}
