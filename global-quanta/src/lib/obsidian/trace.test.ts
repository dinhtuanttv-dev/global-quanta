import { describe, expect, it } from "vitest";
import { summarizeInput, traceEvent, tracedStream, type LaneTraceMap, type StreamEventLike } from "./trace";

describe("Bản vết song song", () => {
  it("chuyển NGUYÊN mọi sự kiện, đúng thứ tự, cho callback gốc; ghi startedAt / meta / công cụ / done / finishedAt", async () => {
    let t = 1000; const now = () => (t += 10);
    const events: StreamEventLike[] = [
      { type: "meta", host: "gateway", macroMode: "synthetic", worldMode: "real", model: "m" },
      { type: "tool_call", id: "a", name: "elite_ticker", input: { ticker: "HPG", apiKey: "x" } },
      { type: "text", delta: "xin " }, { type: "text", delta: "chào" },
      { type: "done", stopReason: "end_turn", rounds: 3, fallback: false, model: "m" },
    ];
    const base = async (_m: string, on: (e: StreamEventLike) => void) => { for (const e of events) on(e); };
    let map: LaneTraceMap = {};
    const seen: StreamEventLike[] = [];
    await tracedStream(base, (k, fn) => { map = { ...map, [k]: fn(map[k]) }; }, now)("bull")("q", (e) => seen.push(e));
    expect(seen).toEqual(events);
    expect(seen[2]).toBe(events[2]);
    expect(map.bull).toEqual({ startedAt: 1010, toolInputs: { a: "ticker=HPG" }, host: "gateway", macroMode: "synthetic", worldMode: "real", stopReason: "end_turn", rounds: 3, finishedAt: 1020 });
  });
  it("lỗi / dừng giữa chừng: vẫn ghi finishedAt và ném lại lỗi gốc", async () => {
    let map: LaneTraceMap = {};
    const boom = async () => { throw new Error("abort"); };
    await expect(tracedStream(boom, (k, fn) => { map = { ...map, [k]: fn(map[k]) }; }, () => 5)("judge")("q", () => {})).rejects.toThrow("abort");
    expect(map.judge?.finishedAt).toBe(5);
  });
  it("đầu vào công cụ: bỏ khoá nhạy cảm và object lồng, rút gọn ≤ 200 ký tự", () => {
    expect(summarizeInput({ ticker: "HPG", token: "t", password: "p", nested: { a: 1 }, n: 3, ok: true })).toBe("ticker=HPG, n=3, ok=true");
    expect(summarizeInput({ q: "x".repeat(500), r: "y".repeat(500), s: "z".repeat(500), u: "w".repeat(500) }).length).toBeLessThanOrEqual(200);
    expect(summarizeInput(null)).toBe(""); expect(summarizeInput(["a"])).toBe("");
    expect(traceEvent(undefined, { type: "text", delta: "x" })).toEqual({});
  });
});
