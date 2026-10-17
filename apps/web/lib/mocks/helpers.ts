import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

export function bodyOf(config: InternalAxiosRequestConfig): Record<string, unknown> {
  if (typeof config.data !== 'string') return {};
  try {
    return JSON.parse(config.data);
  } catch {
    return {};
  }
}

// same JSON shape as the Nest default error: { statusCode, message, error }
export function errorBody(statusCode: number, message: string, error: string) {
  return { statusCode, message, error };
}

export function respond(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response = { data, status, statusText: String(status), headers: {}, config, request: {} } as AxiosResponse;
  if (status >= 200 && status < 300) return Promise.resolve(response);
  const code = status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
  return Promise.reject(new AxiosError(`Request failed with status code ${status}`, code, config, null, response));
}