/** macro-client.ts — typed fetch wrapper for /api/macro/*; fetch is injectable for tests/SSR. */
export class MacroApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export function createMacroClient(baseUrl = '', fetchImpl?: FetchLike) {
  const f: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));
  async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await f(`${baseUrl}/api/macro/${path}`, {
      method, signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) {
      const msg = payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `Lỗi ${res.status}`;
      throw new MacroApiError(res.status, msg);
    }
    return payload as T;
  }
  const qs = (o: Record<string, string | number | undefined>) => {
    const e = Object.entries(o).filter(([, v]) => v !== undefined) as [string, string | number][];
    return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
  };
  return {
    health: <T = unknown>(signal?: AbortSignal) => call<T>('GET', 'health', undefined, signal),
    series: <T = unknown>(asOf?: string, signal?: AbortSignal) => call<T>('GET', `series${qs({ asOf })}`, undefined, signal),
    impact: <T = unknown>(body: Record<string, unknown> = {}, signal?: AbortSignal) => call<T>('POST', 'impact', body, signal),
    cell: <T = unknown>(body: Record<string, unknown>, signal?: AbortSignal) => call<T>('POST', 'cell', body, signal),
    scenario: <T = unknown>(body: Record<string, unknown>, signal?: AbortSignal) => call<T>('POST', 'scenario', body, signal),
    score: <T = unknown>(body: Record<string, unknown> = {}, signal?: AbortSignal) => call<T>('POST', 'score', body, signal),
    regime: <T = unknown>(asOf?: string, signal?: AbortSignal) => call<T>('GET', `regime${qs({ asOf })}`, undefined, signal),
    alerts: <T = unknown>(asOf?: string, signal?: AbortSignal) => call<T>('GET', `alerts${qs({ asOf })}`, undefined, signal),
    calendar: <T = unknown>(asOf?: string, signal?: AbortSignal) => call<T>('GET', `calendar${qs({ asOf })}`, undefined, signal),
    regimeImpact: <T = unknown>(body: Record<string, unknown>, signal?: AbortSignal) => call<T>('POST', 'regime-impact', body, signal),
    report: <T = unknown>(asOf?: string, signal?: AbortSignal) => call<T>('GET', `report${qs({ asOf })}`, undefined, signal),
    /** Gateway: chế độ dữ liệu (thật / mô phỏng), độ phủ và nguồn từng chuỗi. */
    source: <T = unknown>(signal?: AbortSignal) => call<T>('GET', 'source', undefined, signal),
  };
}
export type MacroClient = ReturnType<typeof createMacroClient>;
