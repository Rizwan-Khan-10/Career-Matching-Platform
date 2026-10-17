import { config } from './config';

export interface ApiResult<T = any> {
  status: number;
  ok: boolean;
  body: T;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  token?: string;
  json?: unknown;
  form?: FormData;
  query?: Record<string, string | number | undefined>;
}

/** fetch through nginx. Never throws on a 4xx/5xx: the caller decides what is expected. */
export async function api<T = any>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
  const url = new URL(config.baseUrl + path);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {};
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  let body: string | FormData | undefined;
  if (options.json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.json);
  } else if (options.form) {
    body = options.form;
  }

  let res: Response;
  try {
    res = await fetch(url, { method: options.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch (err) {
    throw new Error(`${options.method ?? 'GET'} ${url} failed: ${(err as Error).message}. Is the stack running at E2E_BASE_URL (${config.baseUrl})?`);
  }

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON: keep the text */
  }
  return { status: res.status, ok: res.ok, body: parsed as T };
}

/** Body of a 2xx response; otherwise throws with the status and body so the failure explains itself. */
export function ok<T = any>(res: ApiResult<T>, what: string): T {
  if (!res.ok) throw new Error(`${what}: expected 2xx, got ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}