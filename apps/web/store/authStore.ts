import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { disconnectSocket } from '@/lib/socket';
import { queryClient } from '@/lib/queryClient';

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
    (set, get) => ({
      token: null,
      refreshToken: null,
      role: null,
      userId: null,
      hasHydrated: false,
      setAuth: (token, role, userId, refreshToken = null) => {
        // a different user signing in (e.g. the old session just expired): never show the previous user's cached pages
        if (get().userId !== userId) queryClient.clear();
        set({ token, role, userId, refreshToken });
      },
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      logout: () => {
        disconnectSocket(); // otherwise the next user on this browser inherits the old user's live connection
        set({ token: null, refreshToken: null, role: null, userId: null }); // RequireRole unmounts the pages first ...
        // ... then the cache goes: it never goes stale by itself (staleTime: Infinity), so without this the next user
        // on this browser sees the previous user's data (companyProfile, matches, ...) until a manual reload
        queryClient.clear();
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

// Another tab logged out or signed in as someone else: this tab must not keep showing the old user's cached data.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'auth-storage') return;
    const userIdOf = (raw: string | null) => {
      try {
        return (JSON.parse(raw ?? 'null') as { state?: { userId?: string | null } } | null)?.state?.userId ?? null;
      } catch {
        return null;
      }
    };
    if (userIdOf(e.oldValue) !== userIdOf(e.newValue)) {
      queryClient.clear();
      void useAuthStore.persist.rehydrate(); // pick up the other tab's token / role
    }
  });
}
