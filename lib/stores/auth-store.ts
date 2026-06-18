import { create } from 'zustand';
import { getAuthAddress, isAuthenticated, fetchSession } from '@/lib/auth';

interface AuthState {
  isAuthenticated: boolean;
  address: string | null;

  // Call this after sign-in to update state
  setAuthenticated: (address: string) => void;

  // Call this on sign-out
  clearAuth: () => void;

  // Optimistic sync from the local (non-sensitive) session marker. Synchronous.
  syncFromStorage: () => void;

  // Authoritative reconcile against the server session cookie (/auth/me).
  syncFromServer: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  address: null,

  setAuthenticated: (address: string) => {
    set({ isAuthenticated: true, address: address.toLowerCase() });
  },

  clearAuth: () => {
    set({ isAuthenticated: false, address: null });
  },

  syncFromStorage: () => {
    if (isAuthenticated()) {
      set({ isAuthenticated: true, address: getAuthAddress() });
    } else {
      set({ isAuthenticated: false, address: null });
    }
  },

  syncFromServer: async () => {
    const address = await fetchSession();
    if (address) {
      set({ isAuthenticated: true, address });
    } else {
      set({ isAuthenticated: false, address: null });
    }
  },
}));
