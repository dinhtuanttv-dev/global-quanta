// Chịu lỗi Gateway (21/11/2026, RESILIENCE_PLAN_HOBBY.md C1 + C2).
//
// Một lớp chặn duy nhất cho mọi GET tới Gateway (24 nơi gọi `fetch(marketUrl(...))` không phải sửa):
//  - Thành công: lưu một bản vào Cache Storage của trình duyệt (mỗi URL tối đa 1 lần/phút, tối đa MAX_ENTRIES bản).
//  - CHỈ khi mất kết nối / quá thời gian chờ / Railway trả 502 hoặc 504 (ứng dụng sập): trả bản lưu ≤ 24 giờ, đánh dấu header
//    `x-gq-offline-copy`, và báo trạng thái "đang hiện bản lưu" cho băng thông báo.
//  - Lúc bình thường hành vi KHÔNG đổi và KHÔNG phát sinh request mới (không tăng tải Gateway / Vercel).
//  - Không lưu: request có Authorization (dữ liệu riêng từng người), luồng /stream, /api/auth, /admin; phản hồi không phải JSON.
//  - Lỗi do người dùng huỷ (AbortError) không tính là sự cố.

export type GatewayMode = "ok" | "offline-copy" | "down";
export interface GatewayHealth { mode: GatewayMode; since: number | null; savedAt: string | null }

export const CACHE_NAME = "gq-gateway-last-good-v1";
export const MAX_AGE_MS = 24 * 3_600_000;
const SAVE_EVERY_MS = 60_000;
const MAX_ENTRIES = 400;
const FAIL_WINDOW_MS = 60_000;
const FAILS_FOR_DOWN = 3;
const EXCLUDE = /\/stream(\?|$)|\/api\/auth\/|\/admin\//;
const COPY_HEADER = "x-gq-offline-copy";

let health: GatewayHealth = { mode: "ok", since: null, savedAt: null };
const listeners = new Set<(h: GatewayHealth) => void>();
let failures: number[] = [];
const lastSaved = new Map<string, number>();
let saves = 0;

export const getGatewayHealth = (): GatewayHealth => health;
export function subscribeGatewayHealth(fn: (h: GatewayHealth) => void): () => void { listeners.add(fn); return () => listeners.delete(fn); }
function setHealth(next: GatewayHealth) {
  if (next.mode === health.mode && next.savedAt === health.savedAt) return;
  health = next; for (const fn of listeners) fn(health);
}

interface Deps { base: string; fetchImpl: typeof fetch; caches: CacheStorage | null; now: () => number }

function markOk() { failures = []; if (health.mode !== "ok") setHealth({ mode: "ok", since: null, savedAt: null }); }
function markFail(d: Deps) {
  const t = d.now(); failures = [...failures.filter((x) => t - x < FAIL_WINDOW_MS), t];
  if (failures.length >= FAILS_FOR_DOWN && health.mode === "ok") setHealth({ mode: "down", since: t, savedAt: null });
}
function markCopy(d: Deps, savedAt: string) {
  const t = d.now(); failures = [...failures.filter((x) => t - x < FAIL_WINDOW_MS), t];
  // Bản lưu cũ nhất đang hiển thị là mốc trung thực nhất cho người xem.
  const oldest = health.savedAt && Date.parse(health.savedAt) < Date.parse(savedAt) ? health.savedAt : savedAt;
  setHealth({ mode: "offline-copy", since: health.since ?? t, savedAt: oldest });
}

async function readCopy(d: Deps, url: string): Promise<Response | null> {
  if (!d.caches) return null;
  try {
    const cache = await d.caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    const savedAt = hit?.headers.get(COPY_HEADER);
    if (!hit || !savedAt || d.now() - Date.parse(savedAt) > MAX_AGE_MS) return null;
    markCopy(d, savedAt);
    return new Response(await hit.text(), { status: 200, headers: hit.headers });
  } catch { return null; }
}

async function saveCopy(d: Deps, url: string, res: Response) {
  if (!d.caches || !(res.headers.get("content-type") ?? "").includes("json")) return;
  const t = d.now();
  if (t - (lastSaved.get(url) ?? 0) < SAVE_EVERY_MS) return;
  lastSaved.set(url, t);
  try {
    const headers = new Headers(res.headers); headers.set(COPY_HEADER, new Date(t).toISOString());
    const cache = await d.caches.open(CACHE_NAME);
    await cache.put(url, new Response(await res.text(), { status: 200, headers }));
    if (++saves % 50 === 0) {
      const keys = await cache.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(k);
    }
  } catch { /* hết dung lượng / trình duyệt chặn: bỏ qua, không ảnh hưởng luồng chính */ }
}

const urlOf = (input: RequestInfo | URL) => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

/** Bọc fetch: dùng cho window.fetch (installGatewayResilience) và cho test. */
export function createResilientFetch(d: Deps): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = urlOf(input);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (method !== "GET" || !url.startsWith(d.base) || EXCLUDE.test(url) || headers.has("authorization")) return d.fetchImpl(input, init);
    let res: Response;
    try {
      res = await d.fetchImpl(input, init);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") throw err;
      const copy = await readCopy(d, url);
      if (copy) return copy;
      markFail(d); throw err;
    }
    if (res.status === 502 || res.status === 504) {
      const copy = await readCopy(d, url);
      if (copy) return copy;
      markFail(d); return res;
    }
    if (res.ok) { markOk(); void saveCopy(d, url, res.clone()); }
    return res;
  };
}

let installed = false;
/** Gọi một lần lúc khởi động ứng dụng. Không có Cache Storage (trình duyệt cũ / không phải https) thì chỉ còn băng thông báo. */
export function installGatewayResilience(base: string) {
  if (installed || typeof window === "undefined" || !base) return;
  installed = true;
  const fetchImpl = window.fetch.bind(window);
  window.fetch = createResilientFetch({ base, fetchImpl, caches: "caches" in window ? window.caches : null, now: Date.now });
}

/** Chỉ dùng trong test. */
export function __resetGatewayResilience() { health = { mode: "ok", since: null, savedAt: null }; failures = []; lastSaved.clear(); saves = 0; listeners.clear(); }
