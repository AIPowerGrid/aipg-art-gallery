import { getApiBase } from "@/lib/auth";
import { useAuthStore } from "@/lib/stores/auth-store";

export interface GoogleCredentialResponse {
  credential: string;
  select_by: string;
}

export interface GoogleButtonConfig {
  type: "standard";
  theme: "outline" | "filled_blue" | "filled_black";
  size: "large";
  text: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape: "rectangular" | "pill" | "circle" | "square";
  width?: number;
}

interface GoogleIdentityConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  context?: "signin" | "signup" | "use";
  ux_mode?: "popup" | "redirect";
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface GoogleAuthResult {
  googleId: string;
  email: string;
  name: string;
  picture: string;
  accountId: string;
  address?: string;
}

interface GoogleAuthListener {
  onSuccess?: (result: GoogleAuthResult) => void;
  onError?: (error: Error) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdentityConfig) => void;
          prompt: () => void;
          renderButton: (
            parent: HTMLElement,
            options: GoogleButtonConfig,
          ) => void;
          cancel: () => void;
          revoke: (hint: string, callback: () => void) => void;
        };
      };
    };
  }
}

const listeners = new Set<GoogleAuthListener>();
let initializedClientId: string | null = null;

async function authenticateGoogleCredential(
  credential: string,
): Promise<GoogleAuthResult> {
  const auth = useAuthStore.getState();
  const isWalletLink =
    auth.isAuthenticated && auth.authMethod === "wallet" && !!auth.address;
  const response = await fetch(
    `${getApiBase()}${isWalletLink ? "/auth/link-google" : "/auth/google"}`,
    {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ credential }),
    },
  );

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Google authentication failed");
  }

  const result = (await response.json()) as GoogleAuthResult;
  useAuthStore
    .getState()
    .setGoogleAuth(
      result.googleId,
      result.email,
      result.name,
      result.picture,
      result.accountId,
      result.address ?? null,
    );
  return result;
}

async function dispatchCredential(response: GoogleCredentialResponse) {
  try {
    const result = await authenticateGoogleCredential(response.credential);
    for (const listener of [...listeners]) listener.onSuccess?.(result);
  } catch (error) {
    const authError =
      error instanceof Error
        ? error
        : new Error("Google authentication failed");
    for (const listener of [...listeners]) listener.onError?.(authError);
  }
}

export function initializeGoogleIdentity(clientId: string): boolean {
  if (!window.google) return false;
  if (initializedClientId === clientId) return true;
  if (initializedClientId) {
    throw new Error(
      "Google Identity was initialized with a different client ID",
    );
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response) => void dispatchCredential(response),
    context: "signin",
    ux_mode: "popup",
    auto_select: false,
    cancel_on_tap_outside: true,
    use_fedcm_for_prompt: true,
  });
  initializedClientId = clientId;
  return true;
}

export function subscribeToGoogleAuth(listener: GoogleAuthListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetGoogleIdentityForTests() {
  initializedClientId = null;
  listeners.clear();
}
