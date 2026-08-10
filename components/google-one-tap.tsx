"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import Script from "next/script";
import { useAccount } from "wagmi";
import { useAuthStore } from "@/lib/stores/auth-store";
import { getApiBase } from "@/lib/auth";

// Extend window type for Google Identity Services
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleOneTapConfig) => void;
          prompt: (callback?: (notification: PromptNotification) => void) => void;
          renderButton: (parent: HTMLElement, options: GoogleButtonConfig) => void;
          cancel: () => void;
          revoke: (hint: string, callback: () => void) => void;
        };
      };
    };
  }
}

interface GoogleOneTapConfig {
  client_id: string;
  callback: (response: CredentialResponse) => void;
  context?: "signin" | "signup" | "use";
  ux_mode?: "popup" | "redirect";
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

interface CredentialResponse {
  credential: string;
  select_by: string;
}

interface GoogleButtonConfig {
  type: "standard";
  theme: "outline" | "filled_blue" | "filled_black";
  size: "large";
  text: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape: "rectangular" | "pill" | "circle" | "square";
  width?: number;
}

interface PromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason: () => string;
  getSkippedReason: () => string;
  getDismissedReason: () => string;
}

const HIDE_ONETAP_KEY = "aipg_hide_google_onetap";
const DISMISS_COUNT_KEY = "aipg_google_onetap_dismiss_count";

type SetGoogleAuth = ReturnType<typeof useAuthStore.getState>["setGoogleAuth"];

async function authenticateGoogleCredential(credential: string, setGoogleAuth: SetGoogleAuth) {
  const res = await fetch(`${getApiBase()}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ credential }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error || "Google authentication failed");
  }

  const data = await res.json();
  setGoogleAuth(data.googleId, data.email, data.name, data.picture);
  return data;
}

export function GoogleOneTap() {
  const { isConnected } = useAccount();
  const { isAuthenticated, sessionChecked, setGoogleAuth } = useAuthStore();
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [shouldShow, setShouldShow] = useState(false);

  // Check if we should show the prompt
  useEffect(() => {
    // Don't show if:
    // - The session check hasn't completed yet (avoid flashing One Tap at an
    //   already-logged-in user during startup)
    // - User has wallet connected
    // - User is already authenticated
    // - User chose "never show again"
    // - Google Client ID not configured
    const hideForever = localStorage.getItem(HIDE_ONETAP_KEY) === "true";
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    const show =
      sessionChecked &&
      !isConnected &&
      !isAuthenticated &&
      !hideForever &&
      !!clientId;
    setShouldShow(show);
  }, [isConnected, isAuthenticated, sessionChecked]);

  const handleCredentialResponse = useCallback(async (response: CredentialResponse) => {
    try {
      const data = await authenticateGoogleCredential(response.credential, setGoogleAuth);
      console.log("Google One Tap: Successfully authenticated as", data.email);
    } catch (error) {
      console.error("Google One Tap: Authentication failed", error);
    }
  }, [setGoogleAuth]);

  const initializeGoogleOneTap = useCallback(() => {
    if (!window.google || !shouldShow) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn("Google One Tap: NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured");
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
        context: "signin",
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: true,
        use_fedcm_for_prompt: true, // Required for Chrome's third-party cookie phase-out
      });

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          console.log("Google One Tap: Not displayed -", notification.getNotDisplayedReason());
        } else if (notification.isSkippedMoment()) {
          console.log("Google One Tap: Skipped -", notification.getSkippedReason());
        } else if (notification.isDismissedMoment()) {
          const reason = notification.getDismissedReason();
          console.log("Google One Tap: Dismissed -", reason);
          
          // Track dismiss count - after 3 dismisses, stop showing for this session
          if (reason === "credential_returned") {
            // User signed in successfully - don't count as dismiss
            return;
          }
          
          const dismissCount = parseInt(localStorage.getItem(DISMISS_COUNT_KEY) || "0", 10) + 1;
          localStorage.setItem(DISMISS_COUNT_KEY, dismissCount.toString());
          
          if (dismissCount >= 3) {
            // User has dismissed 3 times, stop showing for this session
            setShouldShow(false);
          }
        }
      });
    } catch (error) {
      console.error("Google One Tap: Error initializing", error);
    }
  }, [shouldShow, handleCredentialResponse]);

  // Initialize when script loads and conditions are met
  useEffect(() => {
    if (scriptLoaded && shouldShow) {
      // Small delay to ensure Google's script is ready
      const timer = setTimeout(initializeGoogleOneTap, 500);
      return () => clearTimeout(timer);
    }
  }, [scriptLoaded, shouldShow, initializeGoogleOneTap]);

  // Cancel prompt if user connects wallet or authenticates
  useEffect(() => {
    if ((isConnected || isAuthenticated) && window.google) {
      window.google.accounts.id.cancel();
    }
  }, [isConnected, isAuthenticated]);

  // Don't render anything if conditions aren't met
  if (!shouldShow) return null;

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  return (
    <Script
      id="google-identity-services"
      src="https://accounts.google.com/gsi/client"
      async
      defer
      onLoad={() => setScriptLoaded(true)}
      strategy="afterInteractive"
    />
  );
}

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { setGoogleAuth } = useAuthStore();
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Google's widget renders at a fixed pixel width; measure the container so it
  // fills the same width as the sibling wallet button (no size mismatch).
  const [btnWidth, setBtnWidth] = useState(0);

  const handleCredentialResponse = useCallback(async (response: CredentialResponse) => {
    try {
      setError(null);
      await authenticateGoogleCredential(response.credential, setGoogleAuth);
      onSuccess?.();
    } catch (err) {
      const authError = err instanceof Error ? err : new Error("Google authentication failed");
      setError(authError.message);
      onError?.(authError);
    }
  }, [onError, onSuccess, setGoogleAuth]);

  // Track the container width so the Google button matches its siblings.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () =>
      setBtnWidth(Math.min(400, Math.max(240, Math.round(el.offsetWidth || 320))));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const container = containerRef.current;
    if (!scriptReady || !clientId || !container || !window.google || !btnWidth) return;

    container.replaceChildren();
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleCredentialResponse,
      context: "signin",
      ux_mode: "popup",
      auto_select: false,
      use_fedcm_for_prompt: true,
    });
    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "continue_with",
      shape: "rectangular",
      width: btnWidth,
    });
  }, [handleCredentialResponse, scriptReady, btnWidth]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return <p className="text-sm text-zinc-500">Google sign-in is unavailable.</p>;
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="min-h-10 w-full [&>div]:!w-full [&_iframe]:!w-full" />
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}

// Helper component to show "Never show again" option
// This can be used in settings or shown after multiple dismisses
export function GoogleOneTapSettings() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(localStorage.getItem(HIDE_ONETAP_KEY) === "true");
  }, []);

  const toggleHide = () => {
    const newValue = !hidden;
    if (newValue) {
      localStorage.setItem(HIDE_ONETAP_KEY, "true");
    } else {
      localStorage.removeItem(HIDE_ONETAP_KEY);
      localStorage.removeItem(DISMISS_COUNT_KEY);
    }
    setHidden(newValue);
  };

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
      <input
        type="checkbox"
        checked={hidden}
        onChange={toggleHide}
        className="rounded border-zinc-600 bg-zinc-800 text-primary focus:ring-primary"
      />
      <span>Don&apos;t show Google sign-in prompt</span>
    </label>
  );
}
