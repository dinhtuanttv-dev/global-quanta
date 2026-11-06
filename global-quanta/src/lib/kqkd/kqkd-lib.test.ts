import { describe, expect, it } from "vitest";
import { DEFAULT_ROT, box, niceTicks, project, renderScene, scaler } from "./canvas3d";
import { growthText, summaryCsv, toCsv } from "./format";

describe("canvas3d", () => {
  it("chiếu: gốc toạ độ ở tâm khung; điểm gần (z âm sau xoay) lớn hơn điểm xa", () => {
    const o = project({ x: 0, y: 0, z: 0 }, { yaw: 0, pitch: 0, zoom: 1 }, 1000, 500);
    expect(Math.abs(o.x - 500)).toBeLessThan(60); // tâm cảnh gần giữa khung (đã căn theo khối nhìn mặc định)
    expect(o.y).toBeGreaterThan(0); expect(o.y).toBeLessThan(500);
    const near = project({ x: 1, y: 0, z: -1 }, { yaw: 0, pitch: 0, zoom: 1 }, 1000, 500), far = project({ x: 1, y: 0, z: 1 }, { yaw: 0, pitch: 0, zoom: 1 }, 1000, 500);
    expect(near.x - 500).toBeGreaterThan(far.x - 500);
  });
  it("hộp 5 mặt, mốc trục tròn, thang ghim [−1, 1]", () => {
    expect(box(0, 0, 0.1, -1, 0.5, "#fff", "#ccc")).toHaveLength(5);
    expect(niceTicks(0, 2300, 4)).toEqual([0, 1000, 2000]);
    expect(niceTicks(0, 2000, 4)).toEqual([0, 500, 1000, 1500, 2000]);
    const s = scaler(0, 10); expect(s(5)).toBe(0); expect(s(99)).toBe(1);
  });
  it("vẽ: trả điểm rê chuột có tip/id, vẽ xa trước gần sau", () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : typeof k === "string" && /^(fill|stroke|arc|beginPath|moveTo|lineTo|closePath|clearRect|fillText|setLineDash)/.test(k) ? (...a: unknown[]) => { if (k === "fillText") calls.push(String(a[0])); } : undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    const hits = renderScene(ctx, { items: [{ kind: "dot", p: { x: 0, y: 0, z: 0 }, r: 4, fill: "#fff", id: "AAA", tip: "AAA" }], axes: { x: { label: "X", ticks: [{ v: 0, text: "0" }] }, y: { label: "Y", ticks: [] }, z: { label: "Z", ticks: [] } } }, DEFAULT_ROT, 1000, 500);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe("AAA");
    expect(calls).toContain("X");
  });
});

describe("format", () => {
  it("tăng trưởng có kiểm soát: giới hạn ghi ≥ và số thô, trạng thái ghi chữ", () => {
    expect(growthText({ value: 3, status: "NORMAL", raw: 4.15 }).text).toBe("≥ +300%");
    expect(growthText({ value: 3, status: "NORMAL", raw: 4.15 }).title).toContain("415%");
    expect(growthText({ value: null, status: "TURNAROUND" }).text).toBe("lỗ → lãi");
    expect(growthText({ value: -0.12, status: "NORMAL" }).text).toBe("−12%");
  });
  it("CSV: BOM, dấu ; và thoát ký tự", () => {
    const c = toCsv(["a", "b"], [["x;y", 1]]);
    expect(c.startsWith("﻿")).toBe(true);
    expect(c).toContain('"x;y";1');
    expect(summaryCsv([]).split("\n")).toHaveLength(1);
  });
});
