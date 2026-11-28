// @vitest-environment node
// TA-T8 — chữ trên chart: ghi chú 12px luôn hiện (không qua ngân sách nhãn), chữ kèm dấu mũi tên, vùng bấm khớp ô nền,
// sửa chữ là một bước hoàn tác, chữ đi qua kiểm dữ liệu của giao diện lẫn Gateway.
import { describe, expect, it } from "vitest";
import { DrawingManager, sanitizePrimitives, type ShapeMarking } from "../DrawingManager";
import { NOTE_DY, TEXT_KINDS, shapeHit, shapeScene } from "./shapes";
import { NOTE_FONT_PX, noteWidth } from "../chart/scene";
// @ts-expect-error -- module JS của Gateway (không có khai báo kiểu).
import { sanitizeChartPrimitives } from "../../../../backend/src/market/watchlists/userChartState.js";

const bars = Array.from({ length: 20 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}` }));
const P = (d: number, price: number) => ({ date: `2026-10-${String(d).padStart(2, "0")}`, price });
const proj = (p: { date: string; price: number }) => ({ x: bars.findIndex((b) => b.date === p.date) * 10, y: 500 - p.price });

describe("TA-T8 — chữ trên chart", () => {
  it("Chữ: một ghi chú 12px đúng nội dung; rỗng -> 'Chữ'", () => {
    const sc = shapeScene("text", [P(3, 400)], "  Vùng mua  ", { bars });
    expect(sc).toEqual([{ kind: "note", t: "2026-10-03", price: 400, text: "Vùng mua", color: "#f8fafc" }]);
    const empty = shapeScene("text", [P(3, 400)], undefined, { bars })[0];
    expect(empty.kind === "note" ? empty.text : "").toBe("Chữ");
    expect(NOTE_FONT_PX).toBe(12);
  });

  it("mũi tên có chữ: ghi chú dưới mũi tên lên, trên mũi tên xuống; không chữ -> không ghi chú", () => {
    const up = shapeScene("arrowUp", [P(3, 400)], "Mua", { bars });
    expect(up.map((x) => x.kind)).toEqual(["glyph", "note"]);
    expect(up[1].kind === "note" ? up[1].dy : null).toBe(NOTE_DY.arrowUp);
    const down = shapeScene("arrowDown", [P(3, 400)], "Bán", { bars });
    expect(down[1].kind === "note" ? (down[1].dy ?? 0) < 0 : false).toBe(true);
    expect(shapeScene("arrowUp", [P(3, 400)], undefined, { bars }).map((x) => x.kind)).toEqual(["glyph"]);
    expect(shapeScene("arrowMarker", [P(3, 400), P(6, 420)], "Breakout", { bars }).map((x) => x.kind)).toEqual(["segment", "note"]);
    expect([...TEXT_KINDS].sort()).toEqual(["arrowDown", "arrowMarker", "arrowUp", "text"]);
  });

  it("vùng bấm của Chữ khớp ô nền ghi chú (dài theo nội dung)", () => {
    const text = "Kháng cự mạnh vùng 1.300";
    const at = proj(P(3, 400)); // x 20, y 100 (đường chân chữ)
    expect(shapeHit("text", [P(3, 400)], text, { x: at.x + noteWidth(text) - 6, y: at.y - 6 }, proj, 7)).toMatchObject({ part: "body" });
    expect(shapeHit("text", [P(3, 400)], text, { x: at.x + noteWidth(text) + 30, y: at.y - 6 }, proj, 7)).toBeNull();
    expect(shapeHit("text", [P(3, 400)], text, { x: at.x + 20, y: at.y - NOTE_FONT_PX - 12 }, proj, 7)).toBeNull();
  });

  it("sửa chữ: một bước hoàn tác; giao diện + Gateway giữ chữ (≤ 200 ký tự)", () => {
    const m = new DrawingManager();
    const s = m.createShape("text", [P(3, 400)], "Cũ");
    m.updatePrimitive(s.id, { text: "Mới" });
    expect((m.getPrimitives()[0] as ShapeMarking).text).toBe("Mới");
    m.undo();
    expect((m.getPrimitives()[0] as ShapeMarking).text).toBe("Cũ");
    const long: ShapeMarking = { ...s, text: "x".repeat(300) };
    expect(sanitizePrimitives([long])).toHaveLength(1);
    const gw = sanitizeChartPrimitives([long]);
    expect(gw[0].text).toHaveLength(200);
  });
});
