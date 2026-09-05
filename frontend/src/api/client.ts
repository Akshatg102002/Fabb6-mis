import { useSessionStore } from '@/stores/sessionStore';
import { useQueueStore } from '@/stores/queueStore';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Number of retries on 5xx. Default: 2 */
  retries?: number;
}

async function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Core fetch wrapper with:
 *   - Auth token injection from session store
 *   - JSON request / response handling
 *   - 5xx retry with exponential backoff
 *   - Offline detection → throws with `isOffline: true` flag
 *   - 401 → triggers logout
 */
export async function apiClient<T = unknown>(
  path: string,
  opts: ApiRequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, signal, retries = 2 } = opts;
  const { token, deviceId } = useSessionStore.getState();

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Device-Id': deviceId,
    ...headers,
  };

  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  let attempt = 0;

  while (attempt <= retries) {
    if (!navigator.onLine) {
      useQueueStore.getState().setSyncState('offline');
      const err = new Error('Network is offline') as Error & { isOffline: boolean };
      err.isOffline = true;
      throw err;
    }

    try {
      const response = await fetch(url, {
        method,
        headers: reqHeaders,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal,
        credentials: 'same-origin',
      });

      if (response.status === 401) {
        useSessionStore.getState().logout();
        throw new ApiError(401, null, 'Unauthorized — please log in again');
      }

      if (response.status === 409) {
        const errBody = await response.json().catch(() => null);
        throw new ApiError(
          409,
          errBody,
          (errBody as { message?: string })?.message ?? 'Conflict',
        );
      }

      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          attempt++;
          await delay(500 * 2 ** attempt);
          continue;
        }
        const errBody = await response.json().catch(() => null);
        throw new ApiError(
          response.status,
          errBody,
          (errBody as { message?: string })?.message ?? response.statusText,
        );
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (err) {
      if ((err as { isOffline?: boolean }).isOffline) throw err;
      if (err instanceof ApiError) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;

      // Network failure — retry
      if (attempt < retries) {
        attempt++;
        await delay(500 * 2 ** attempt);
        continue;
      }

      throw err;
    }
  }

  throw new ApiError(0, null, 'Request failed after retries');
}
