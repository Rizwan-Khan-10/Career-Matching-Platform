import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  role: 'ADMIN' | 'COMPANY' | 'APPLICANT' | null;
  userId: string | null;
  hasHydrated: boolean;
  setAuth: (token: string, role: AuthState['role'], userId: string) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      role: null,
      userId: null,
      hasHydrated: false,
      setAuth: (token, role, userId) => set({ token, role, userId }),
      logout: () => set({ token: null, role: null, userId: null }),
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