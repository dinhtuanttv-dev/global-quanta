import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGatewayResilience, CACHE_NAME, createResilientFetch, getGatewayHealth, MAX_AGE_MS, subscribeGatewayHealth } from "./gatewayResilience";

const BASE = "https://gw.test";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Cache Storage giả: đủ open / match / put / keys / delete. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: async (url: string) => store.get(url)?.clone(),
    put: async (url: string, res: Response) => { store.set(url, res); },
    keys: async () => [...store.keys()].map((u) => new Request(u)),
    delete: async (req: Request | string) => store.delete(typeof req === "string" ? req : req.url),
  };
  return { store, api: { open: async (name: string) => { expect(name).toBe(CACHE_NAME); return cache; } } as unknown as CacheStorage };
}

let t = Date.parse("2026-11-21T03:00:00Z");
const now = () => t;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { __resetGatewayResilience(); t = Date.parse("2026-11-21T03:00:00Z"); });
afterEach(() => vi.restoreAllMocks());

describe("Lớp chịu lỗi Gateway", () => {
  it("bình thường: trả nguyên phản hồi, lưu một bản, KHÔNG gọi thêm request", async () => {
    const c = fakeCaches(), fetchImpl = vi.fn(async () => json({ v: 1 }));
    const f = createResilientFetch({ base: BASE, fetchImpl, caches: c.api, now });
    const r = await f(`${BASE}/api/market/topbar`);
    expect(await r.json()).toEqual({ v: 1 });
    await flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(c.store.has(`${BASE}/api/market/topbar`)).toBe(true);
    expect(getGatewayHealth().mode).toBe("ok");
  });

  it("mỗi URL lưu tối đa 1 lần/phút (polling dày không ghi liên tục)", async () => {
    const c = fakeCaches(); const put = vi.spyOn(c.store, "set");
    const f = createResilientFetch({ base: BASE, fetchImpl: async () => json({ v: 1 }), caches: c.api, now });
    await f(`${BASE}/a`); await flush(); t += 15_000; await f(`${BASE}/a`); await flush();
    expect(put).toHaveBeenCalledTimes(1);
    t += 60_000; await f(`${BASE}/a`); await flush();
    expect(put).toHaveBeenCalledTimes(2);
  });

  it("mất kết nối: trả bản lưu ≤ 24 giờ, đánh dấu và báo 'offline-copy'", async () => {
    const c = fakeCaches(); let fail = false;
    const f = createResilientFetch({ base: BASE, fetchImpl: async () => { if (fail) throw new TypeError("Failed to fetch"); return json({ v: 1 }); }, caches: c.api, now });
    await f(`${BASE}/api/x`); await flush();
    const seen: string[] = []; subscribeGatewayHealth((h) => seen.push(h.mode));
    fail = true; t += 3_600_000;
    const r = await f(`${BASE}/api/x`);
    expect(await r.json()).toEqual({ v: 1 });
    expect(r.headers.get("x-gq-offline-copy")).toBe("2026-11-21T03:00:00.000Z");
    expect(getGatewayHealth()).toMatchObject({ mode: "offline-copy", savedAt: "2026-11-21T03:00:00.000Z" });
    expect(seen).toEqual(["offline-copy"]);
  });

  it("Railway 502/504 (ứng dụng sập) cũng dùng bản lưu; 500/404 của ứng dụng thì giữ nguyên", async () => {
    const c = fakeCaches(); let status = 200;
    const f = createResilientFetch({ base: BASE, fetchImpl: async () => json({ s: status }, status), caches: c.api, now });
    await f(`${BASE}/api/y`); await flush();
    status = 502; expect(await (await f(`${BASE}/api/y`)).json()).toEqual({ s: 200 });
    status = 500; expect((await f(`${BASE}/api/y`)).status).toBe(500);
    status = 404; expect((await f(`${BASE}/api/y`)).status).toBe(404);
  });

  it("bản lưu quá 24 giờ không được dùng; không có bản lưu thì báo lỗi và sau 3 lần thành 'down'", async () => {
    const c = fakeCaches(); let fail = false;
    const f = createResilientFetch({ base: BASE, fetchImpl: async () => { if (fail) throw new TypeError("Failed to fetch"); return json({ v: 1 }); }, caches: c.api, now });
    await f(`${BASE}/old`); await flush();
    fail = true; t += MAX_AGE_MS + 1;
    await expect(f(`${BASE}/old`)).rejects.toThrow("Failed to fetch");
    await expect(f(`${BASE}/none`)).rejects.toThrow();
    expect(getGatewayHealth().mode).toBe("ok");
    await expect(f(`${BASE}/none`)).rejects.toThrow();
    expect(getGatewayHealth().mode).toBe("down");
  });

  it("hồi phục: lần gọi thành công đưa trạng thái về 'ok'", async () => {
    const c = fakeCaches(); let fail = true;
    const f = createResilientFetch({ base: BASE, fetchImpl: async () => { if (fail) throw new TypeError("x"); return json({}); }, caches: c.api, now });
    for (let i = 0; i < 3; i++) await f(`${BASE}/z`).catch(() => {});
    expect(getGatewayHealth().mode).toBe("down");
    fail = false; await f(`${BASE}/z`);
    expect(getGatewayHealth().mode).toBe("ok");
  });

  it("không đụng tới: request có Authorization, POST, luồng /stream, /api/auth, host khác; người dùng huỷ (AbortError)", async () => {
    const c = fakeCaches(), fetchImpl = vi.fn(async () => json({ v: 1 }));
    const f = createResilientFetch({ base: BASE, fetchImpl, caches: c.api, now });
    await f(`${BASE}/api/market/watchlists`, { headers: { authorization: "Bearer x" } });
    await f(`${BASE}/api/x`, { method: "POST" });
    await f(`${BASE}/api/market/stream`);
    await f(`${BASE}/api/auth/refresh`);
    await f("https://other.test/api/x");
    await flush();
    expect(c.store.size).toBe(0);
    const abort = createResilientFetch({ base: BASE, fetchImpl: async () => { throw new DOMException("aborted", "AbortError"); }, caches: c.api, now });
    await expect(abort(`${BASE}/q`)).rejects.toThrow("aborted");
    expect(getGatewayHealth().mode).toBe("ok");
  });

  it("trình duyệt không có Cache Storage: vẫn chạy bình thường, chỉ còn báo trạng thái", async () => {
    const f = createResilientFetch({ base: BASE, fetchImpl: async () => { throw new TypeError("x"); }, caches: null, now });
    for (let i = 0; i < 3; i++) await expect(f(`${BASE}/n`)).rejects.toThrow();
    expect(getGatewayHealth().mode).toBe("down");
  });
});
