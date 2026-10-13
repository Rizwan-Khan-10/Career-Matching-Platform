import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { disconnectSocket } from '@/lib/socket';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  role: 'ADMIN' | 'COMPANY' | 'APPLICANT' | null;
  userId: string | null;
  hasHydrated: boolean;
  setAuth: (token: string, role: AuthState['role'], userId: string, refreshToken?: string | null) => void;
  setTokens: (token: string, refreshToken: string) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      role: null,
      userId: null,
      hasHydrated: false,
      setAuth: (token, role, userId, refreshToken = null) => set({ token, role, userId, refreshToken }),
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      logout: () => {
        disconnectSocket(); // otherwise the next user on this browser inherits the old user's live connection
        set({ token: null, refreshToken: null, role: null, userId: null });
      },
      setHasHydrated: (state) => set({ hasHydrated: state }),
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);