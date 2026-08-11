"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import Script from "next/script";
import { useAccount } from "wagmi";
import { useAuthStore } from "@/lib/stores/auth-store";
import {
  initializeGoogleIdentity,
  subscribeToGoogleAuth,
} from "@/lib/google-identity";

const HIDE_ONETAP_KEY = "aipg_hide_google_onetap";

export function GoogleOneTap() {
  const { isConnected } = useAccount();
  const { isAuthenticated, sessionChecked } = useAuthStore();
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

  useEffect(
    () =>
      subscribeToGoogleAuth({
        onError: (error) =>
          console.error("Google One Tap: Authentication failed", error),
      }),
    [],
  );

  const initializeGoogleOneTap = useCallback(() => {
    if (!window.google || !shouldShow) return;

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.warn(
        "Google One Tap: NEXT_PUBLIC_GOOGLE_CLIENT_ID not configured",
      );
      return;
    }

    try {
      initializeGoogleIdentity(clientId);

      // FedCM does not expose the legacy display/skipped/dismissed moment
      // notifications. Authentication success still arrives through the
      // page-wide credential callback initialized in google-identity.ts.
      window.google.accounts.id.prompt();
    } catch (error) {
      console.error("Google One Tap: Error initializing", error);
    }
  }, [shouldShow]);

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
      onReady={() => setScriptLoaded(true)}
      strategy="afterInteractive"
    />
  );
}

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeToGoogleAuth({
        onSuccess: () => {
          setError(null);
          onSuccess?.();
        },
        onError: (authError) => {
          setError(authError.message);
          onError?.(authError);
        },
      }),
    [onError, onSuccess],
  );

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    const container = containerRef.current;
    if (!scriptReady || !clientId || !container || !window.google) return;

    try {
      initializeGoogleIdentity(clientId);
      container.replaceChildren();
      window.google.accounts.id.renderButton(container, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: 320,
      });
    } catch (err) {
      const authError =
        err instanceof Error ? err : new Error("Google sign-in unavailable");
      setError(authError.message);
      onError?.(authError);
    }
  }, [onError, scriptReady]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
    return (
      <p className="text-sm text-zinc-500">Google sign-in is unavailable.</p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} className="min-h-10" />
      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
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
    }
    setHidden(newValue);
  };

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
      <input
        type="checkbox"
        checked={hidden}
        onChange={toggleHide}
        className="rounded border-zinc-600 bg-zinc-800 text-indigo-500 focus:ring-indigo-500"
      />
      <span>Don&apos;t show Google sign-in prompt</span>
    </label>
  );
}
