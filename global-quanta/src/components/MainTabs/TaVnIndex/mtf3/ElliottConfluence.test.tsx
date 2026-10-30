// MTF v3 · S3 — thẻ hợp lưu Elliott × dải EMA.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import ElliottConfluence from "./ElliottConfluence";
import type { Elliott3 } from "../../../../hooks/useStructure3";

describe("ElliottConfluence", () => {
  afterEach(() => cleanup());
  it("sóng 2 kết thúc trong vùng Fib và dải EMA50–100 = hợp lưu mạnh; sóng 3 lồng sóng 3; mức vô hiệu + đáy bảo vệ + mục tiêu", () => {
    const e: Elliott3 = {
      day: { label: "Sóng 3 tăng", position: "3 của sóng đẩy tăng (đang chạy)", template: "wave3", dir: "up", provisional: false },
      week: { label: "Sóng 3 tăng", position: "(3) của sóng đẩy tăng (đang chạy)", template: "wave3", dir: "up", provisional: false },
      relation: "aligned", relationText: "Hai khung cùng chiều tăng", nested3: "up", trigger: { price: 27000, text: "vượt đỉnh sóng 1" },
      waveEnd: { wave: "2", price: 25000, date: "2026-09-15", retrace: 0.5, inFibZone: true, inEmaBand: true, band: [24500, 26000], bandName: "EMA50–EMA100" },
      confluence: "strong", invalidation: { price: 22000, side: "below", reason: "gốc sóng 1" },
      stopAgreement: { elliott: 22000, dow: 25000, gapAtr: 3 }, targets: [{ label: "1,618", price: 34000 }],
    };
    render(<ElliottConfluence e={e} />);
    expect(screen.getByTestId("elliott-confluence-level").textContent).toBe("Hợp lưu mạnh");
    expect(screen.getByTestId("elliott-nested3").textContent).toContain("↑");
    expect(screen.getByTestId("elliott-wave-end").textContent).toContain("Hồi 50,0%");
    expect(screen.getByTestId("elliott-wave-end").textContent).toContain("EMA50–EMA100");
    expect(screen.getByTestId("elliott-stop").textContent).toContain("lệch 3 ATR");
  });
});
