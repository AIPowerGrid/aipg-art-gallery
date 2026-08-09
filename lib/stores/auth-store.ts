import { create } from "zustand";
import {
  getAuthAddress,
  isAuthenticated,
  signOut,
  getApiBase,
} from "@/lib/auth";

// Non-sensitive Google profile, kept in localStorage for UI only. The Google
// JWT itself is NOT stored here — it lives in the httpOnly cookie set by the Go
// /auth/google endpoint.
const GOOGLE_ID_KEY = "aipg_google_id";
const GOOGLE_EMAIL_KEY = "aipg_google_email";
const GOOGLE_NAME_KEY = "aipg_google_name";
const GOOGLE_PICTURE_KEY = "aipg_google_picture";
const GOOGLE_EXPIRY_KEY = "aipg_google_expiry";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

interface AuthState {
  isAuthenticated: boolean;
  // False until the authoritative server check (/auth/me) has completed once.
  // Pages should wait for this before redirecting or showing One Tap, so a
  // logged-in user isn't briefly treated as signed-out during startup.
  sessionChecked: boolean;
  authMethod: "wallet" | "google" | null;
  address: string | null;
  googleId: string | null;
  email: string | null;
  name: string | null;
  picture: string | null;

  setAuthenticated: (address: string) => void;
  setGoogleAuth: (
    googleId: string,
    email: string,
    name: string,
    picture: string,
  ) => void;
  clearAuth: () => void;
  syncFromStorage: () => void;
  syncFromServer: () => Promise<void>;
  getUserIdentifier: () => string | null;
}

function clearGoogleProfile() {
  [
    GOOGLE_ID_KEY,
    GOOGLE_EMAIL_KEY,
    GOOGLE_NAME_KEY,
    GOOGLE_PICTURE_KEY,
    GOOGLE_EXPIRY_KEY,
  ].forEach((k) => localStorage.removeItem(k));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: false,
  sessionChecked: false,
  authMethod: null,
  address: null,
  googleId: null,
  email: null,
  name: null,
  picture: null,

  setAuthenticated: (address: string) => {
    set({
      isAuthenticated: true,
      authMethod: "wallet",
      address: address.toLowerCase(),
      googleId: null,
      email: null,
      name: null,
      picture: null,
    });
  },

  setGoogleAuth: (
    googleId: string,
    email: string,
    name: string,
    picture: string,
  ) => {
    // Store only the non-sensitive profile for UI; the JWT is in the cookie.
    localStorage.setItem(GOOGLE_ID_KEY, googleId);
    localStorage.setItem(GOOGLE_EMAIL_KEY, email || "");
    localStorage.setItem(GOOGLE_NAME_KEY, name || "");
    localStorage.setItem(GOOGLE_PICTURE_KEY, picture || "");
    localStorage.setItem(
      GOOGLE_EXPIRY_KEY,
      String(Date.now() + SESSION_TTL_MS),
    );
    set({
      isAuthenticated: true,
      authMethod: "google",
      address: null,
      googleId,
      email,
      name,
      picture,
    });
  },

  clearAuth: () => {
    clearGoogleProfile();
    // Clears the wallet marker AND clears the httpOnly cookie server-side.
    void signOut();
    set({
      isAuthenticated: false,
      authMethod: null,
      address: null,
      googleId: null,
      email: null,
      name: null,
      picture: null,
    });
  },

  syncFromStorage: () => {
    // Optimistic UI from local markers (no token decode). Server reconciles next.
    if (isAuthenticated()) {
      set({
        isAuthenticated: true,
        authMethod: "wallet",
        address: getAuthAddress(),
      });
      return;
    }
    const googleId = localStorage.getItem(GOOGLE_ID_KEY);
    const googleExpiry = Number(localStorage.getItem(GOOGLE_EXPIRY_KEY) ?? 0);
    if (googleId && googleExpiry > Date.now()) {
      set({
        isAuthenticated: true,
        authMethod: "google",
        googleId,
        email: localStorage.getItem(GOOGLE_EMAIL_KEY),
        name: localStorage.getItem(GOOGLE_NAME_KEY),
        picture: localStorage.getItem(GOOGLE_PICTURE_KEY),
      });
      return;
    }
    set({
      isAuthenticated: false,
      authMethod: null,
      address: null,
      googleId: null,
    });
  },

  syncFromServer: async () => {
    // Authoritative reconcile against the session cookie.
    try {
      const res = await fetch(`${getApiBase()}/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) {
        clearGoogleProfile();
        set({
          isAuthenticated: false,
          authMethod: null,
          address: null,
          googleId: null,
        });
        return;
      }
      const data = await res.json();
      if (data.authMethod === "google" && data.googleId) {
        set({
          isAuthenticated: true,
          authMethod: "google",
          address: data.address?.toLowerCase() ?? null,
          googleId: data.googleId,
          email: data.email,
          name: data.name,
        });
      } else if (data.address) {
        set({
          isAuthenticated: true,
          authMethod: "wallet",
          address: data.address.toLowerCase(),
        });
      } else {
        set({
          isAuthenticated: false,
          authMethod: null,
          address: null,
          googleId: null,
        });
      }
    } catch {
      // network hiccup: keep optimistic state
    } finally {
      // The authoritative check has run at least once, regardless of outcome.
      set({ sessionChecked: true });
    }
  },

  getUserIdentifier: () => {
    const state = get();
    if (state.authMethod === "wallet") return state.address;
    if (state.authMethod === "google") return state.googleId;
    return null;
  },
}));
