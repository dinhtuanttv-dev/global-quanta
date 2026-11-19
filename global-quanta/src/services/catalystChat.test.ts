// V4 (19/11/2026): client "Hỏi đáp xúc tác" gọi Gateway trước; chỉ chuyển Project A khi Gateway báo chưa có khoá cho mô hình.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ getAccessToken: async () => "tok" }));
vi.mock("../config/marketGateway", () => ({ getMarketGateway: () => ({ baseUrl: "https://gw.test" }) }));

const sse = (...events: object[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""), { status: 200, headers: { "content-type": "text/event-stream" } });
const meta = { type: "meta", remaining: 39, macroMode: "real" };

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

async function load(apiBase: string) {
  vi.stubEnv("VITE_API_BASE_URL", apiBase);
  return import("./catalystChat");
}

describe("streamCatalystChat — Gateway là nơi chính", () => {
  it("Gateway có khoá -> chỉ gọi Gateway, meta gắn host gateway", async () => {
    const { streamCatalystChat } = await load("https://qms.test");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return sse({ ...meta, host: "gateway" }, { type: "done", stopReason: "end_turn", model: "m", rounds: 0, fallback: false }); }));
    const got: { type: string; host?: string }[] = [];
    await streamCatalystChat([{ role: "user", content: "hỏi" }], (e) => got.push(e as never));
    expect(calls).toEqual(["https://gw.test/api/catalysts/chat"]);
    expect(got[0]).toMatchObject({ type: "meta", host: "gateway" });
  });

  it("Gateway chưa có khoá Claude (503 provider-not-configured) -> gọi Project A, meta gắn host project-a", async () => {
    const { streamCatalystChat } = await load("https://qms.test");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return url.startsWith("https://gw.test")
        ? new Response(JSON.stringify({ error: "Gateway chưa cấu hình mô hình Claude.", code: "provider-not-configured" }), { status: 503 })
        : sse(meta);
    }));
    const got: { type: string; host?: string }[] = [];
    await streamCatalystChat([{ role: "user", content: "hỏi" }], (e) => got.push(e as never));
    expect(calls).toEqual(["https://gw.test/api/catalysts/chat", "https://qms.test/api/catalysts/chat"]);
    expect(got[0]).toMatchObject({ type: "meta", host: "project-a" });
  });

  it("lỗi khác của Gateway (429, 401) -> báo lỗi, KHÔNG gọi Project A", async () => {
    const { streamCatalystChat, ChatHttpError } = await load("https://qms.test");
    const f = vi.fn(async () => new Response(JSON.stringify({ error: "Đã dùng hết 40 câu hỏi hôm nay" }), { status: 429 }));
    vi.stubGlobal("fetch", f);
    await expect(streamCatalystChat([{ role: "user", content: "hỏi" }], () => {})).rejects.toBeInstanceOf(ChatHttpError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("không cấu hình Project A -> Gateway 503 được báo thẳng", async () => {
    const { streamCatalystChat } = await load("");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Gateway chưa cấu hình mô hình Claude.", code: "provider-not-configured" }), { status: 503 })));
    await expect(streamCatalystChat([{ role: "user", content: "hỏi" }], () => {})).rejects.toThrow(/chưa cấu hình mô hình Claude/);
  });
});
