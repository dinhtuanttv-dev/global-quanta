/** world-client.ts — typed fetch wrapper for /api/world/*; fetch is injectable. */
import { MacroApiError } from './macro-client';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createWorldClient(baseUrl = '', fetchImpl?: FetchLike) {
  const f: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await f(`${baseUrl}/api/world/${path}`, { method, signal, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) throw new MacroApiError(res.status, payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `Lỗi ${res.status}`);
    return payload as T;
  }
  const qs = (o: Record<string, string | number | undefined>) => {
    const e = Object.entries(o).filter(([, v]) => v !== undefined) as [string, string | number][];
    return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
  };
  return {
    series: <T = unknown>(signal?: AbortSignal) => call<T>('GET', 'series', undefined, signal),
    overview: <T = unknown>(asOf?: string, signal?: AbortSignal) => call<T>('GET', `overview${qs({ asOf })}`, undefined, signal),
    matrix: <T = unknown>(body: Record<string, unknown> = {}, signal?: AbortSignal) => call<T>('POST', 'matrix', body, signal),
    connectedness: <T = unknown>(opts: { window?: number; H?: number; step?: number } = {}, signal?: AbortSignal) => call<T>('GET', `connectedness${qs(opts)}`, undefined, signal),
    events: <T = unknown>(signal?: AbortSignal) => call<T>('GET', 'events', undefined, signal),
    event: <T = unknown>(id: string, signal?: AbortSignal) => call<T>('GET', `events/${encodeURIComponent(id)}`, undefined, signal),
    stock: <T = unknown>(code: string, signal?: AbortSignal) => call<T>('GET', `stock/${encodeURIComponent(code)}`, undefined, signal),
    scenario: <T = unknown>(body: Record<string, unknown>, signal?: AbortSignal) => call<T>('POST', 'scenario', body, signal),
  };
}
export type WorldClient = ReturnType<typeof createWorldClient>;
