import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/lib/toast';

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
export const apiClient = axios.create({ baseURL });

// a wrong password is also a 401: those calls must show their own error, not trigger "session expired"
const AUTH_PATHS = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    // plain axios: no interceptors, so a failing refresh cannot loop
    const res = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
    useAuthStore.getState().setTokens(res.data.accessToken, res.data.refreshToken);
    return res.data.accessToken as string;
  } catch {
    return null;
  }
}

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = original?.url ?? '';
    if (error.response?.status !== 401 || !original || AUTH_PATHS.some((p) => url.startsWith(p))) {
      return Promise.reject(error);
    }

    if (!original._retried) {
      original._retried = true;
      if (!refreshing) refreshing = refreshAccessToken().finally(() => { refreshing = null; });
      const token = await refreshing;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return apiClient(original);
      }
    }

    toast.error('Session expired, please log in again');
    useAuthStore.getState().logout();
    // full reload on purpose: clears all client state once the session is lost
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (typeof window !== 'undefined') window.location.href = '/login';
    return Promise.reject(error);
  },
);