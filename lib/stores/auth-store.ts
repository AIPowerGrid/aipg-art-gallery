import { create } from 'zustand';
import { getAuthToken, getAuthAddress } from '@/lib/auth';

interface AuthState {
  isAuthenticated: boolean;
  address: string | null;
  
  // Call this after sign-in to update state
  setAuthenticated: (address: string) => void;
  
  // Call this on sign-out
  clearAuth: () => void;
  
  // Check localStorage and sync state (call on mount)
  syncFromStorage: () => void;
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
    const token = getAuthToken();
    const address = getAuthAddress();
    
    if (token && address) {
      // Check if token is expired
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const isValid = payload.exp * 1000 > Date.now();
        set({ 
          isAuthenticated: isValid, 
          address: isValid ? address : null 
        });
      } catch {
        set({ isAuthenticated: false, address: null });
      }
    } else {
      set({ isAuthenticated: false, address: null });
    }
  },
}));
