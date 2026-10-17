import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/lib/toast';
import { getMockResponse } from '@/lib/mocks';

const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
export const apiClient = axios.create({ baseURL });

// a wrong password is also a 401: those calls must show their own error, not trigger "session expired"
const AUTH_PATHS = ['/auth/login', '/auth/signup', '/auth/refresh', '/auth/forgot-password', '/auth/reset-password'];

/** Marker thrown by the request interceptor for a mocked call; the response interceptor resolves/rejects it below. */
interface MockedRejection {
  __mocked: { status: number; data: unknown };
  config: InternalAxiosRequestConfig;
}

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

  // DEV4_task_01: short-circuit a few contract endpoints Dev 1 hasn't merged yet. Remove with lib/mocks.ts post-merge.
  if (USE_MOCKS) {
    const mocked = getMockResponse(config);
    if (mocked) return Promise.reject({ __mocked: mocked, config } as MockedRejection);
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError | MockedRejection) => {
    if ('__mocked' in error) {
      const { status, data } = error.__mocked;
      if (status >= 200 && status < 300) {
        return Promise.resolve({ data, status, statusText: 'OK', headers: {}, config: error.config });
      }
      return Promise.reject({
        isAxiosError: true,
        response: { data, status, statusText: '', headers: {}, config: error.config },
        config: error.config,
        message: (data as { message?: string })?.message || 'Mock error',
      });
    }

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
    if (typeof window !== 'undefined') window.location.href = '/login';
    return Promise.reject(error);
  },
);