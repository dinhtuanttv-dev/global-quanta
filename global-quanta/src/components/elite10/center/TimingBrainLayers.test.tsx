// BỘ NÃO THỜI ĐIỂM CT2/CT3 (20/11/2026) — lớp "Thời điểm hợp nhất" trên dữ liệu SỐNG 20/11: hai làn cổ tức có nhãn, phần thêm mang
// data-hl-layer="timing" (gỡ đi thì y như cũ), tắt lớp -> giao diện cũ, không chữ khuyến nghị.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import fx from "../../../lib/timing-brain/__fixtures__/timing-2026-11-20.json";
import { toLaneRows, withToRows } from "../../../lib/elite10/toTiming";
import type { ToRadarRow } from "../../../lib/cotuc/to";
import type { TimelineRow } from "../../../lib/cotuc/buy-timeline";

const raw = fx.gateway.rows as unknown as TimelineRow[];
const to = toLaneRows(fx.to.radar.rows as unknown as ToRadarRow[], fx.gateway.today, fx.gateway.sessions);
const elite = withToRows(raw, to) as TimelineRow[];
const M = vi.hoisted(() => ({ raw: true }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({
  useEliteTiming: () => ({ data: { rows: elite, counts: fx.gateway.counts, coverage: fx.gateway.coverage }, rawRows: M.raw ? raw : undefined, toRows: to, sessions: fx.gateway.sessions, meta: null, loading: false, error: null }),
}));
import HlBuyCalendar from "./HlBuyCalendar";
import TimelineZonesBlock from "../profile/TimelineZonesBlock";
import { HL_LAYERS_EVENT, HL_LAYERS_KEY } from "../../../hooks/elite10/useHlRowSignals";

const strip = (el: Element) => { const c = el.cloneNode(true) as Element; c.querySelectorAll("[data-hl-layer='timing']").forEach((e) => e.remove()); return (c.textContent ?? "").replace(/\s+/g, " "); };
const setLayer = (on: boolean) => act(() => { window.localStorage.setItem(HL_LAYERS_KEY, JSON.stringify({ timing: on })); window.dispatchEvent(new Event(HL_LAYERS_EVENT)); });
beforeEach(() => { window.localStorage.clear(); M.raw = true; });
afterEach(() => cleanup());

const HELD = ["BMP", "VGR", "SAB", "MSH", "VPL"];

describe("Lớp Thời điểm hợp nhất — dữ liệu thật 20/11", () => {
  it("Lịch vùng mua: hai làn cổ tức (W1–W5 MÔ TẢ, TO THĂM DÒ), engine giữ bậc gốc, nhãn phiên bổ sung; không chữ khuyến nghị", () => {
    render(<HlBuyCalendar tickers={HELD} picked={null} onPick={() => {}} />);
    expect((screen.getByTestId("hl-buy-cal-BMP").textContent ?? "")).toMatch(/Cổ tức W1–W5 — MÔ TẢ.*engine: đạt/);
    expect((screen.getByTestId("hl-buy-cal-SAB").textContent ?? "")).toMatch(/Săn cổ tức TO — THĂM DÒ/);
    expect(screen.getByTestId("hl-buy-cal-lanes").textContent).toMatch(/Hai làn cổ tức.*không có lợi thế ngoài mẫu/);
    const all = screen.getByTestId("hl-buy-cal").textContent ?? "";
    expect(all).not.toMatch(/-\d+ phiên/);
    for (const bad of [/mua ngay/i, /chắc thắng/i]) expect(all).not.toMatch(bad);
  });

  it("phần thêm chỉ nằm trong data-hl-layer='timing' ở các dòng cũ; tắt lớp -> bảng đúng như đường Elite cũ (W1–W5 biến mất)", () => {
    const { unmount } = render(<HlBuyCalendar tickers={HELD} picked={null} onPick={() => {}} />);
    const onMsh = strip(screen.getByTestId("hl-buy-cal-MSH"));
    unmount();
    M.raw = false; // không có dòng gốc = đường cũ
    render(<HlBuyCalendar tickers={HELD} picked={null} onPick={() => {}} />);
    const base = strip(screen.getByTestId("hl-buy-cal-MSH"));
    expect(onMsh).toBe(base);
    expect(screen.getByTestId("hl-buy-cal-BMP").textContent).toMatch(/Không có vùng Timeline/);
    cleanup(); M.raw = true;
    render(<HlBuyCalendar tickers={HELD} picked={null} onPick={() => {}} />);
    setLayer(false);
    expect(screen.getByTestId("hl-buy-cal-BMP").textContent).toMatch(/Không có vùng Timeline/);
    expect(screen.queryByTestId("hl-buy-cal-lanes")).toBeNull();
    setLayer(true);
    expect(screen.getByTestId("hl-buy-cal-BMP").textContent).toMatch(/MÔ TẢ/);
  });

  it("Hồ sơ 360°: BMP có làn 'Cổ tức · cửa sổ W1–W5' nhãn MÔ TẢ; VGR đã qua ghi ngày thoát, không số âm", () => {
    render(<TimelineZonesBlock ticker="BMP" />);
    expect(screen.getByTestId("pfa-timeline-table").textContent).toMatch(/MÔ TẢ · W1–W5.*engine: đạt.*Cổ tức · cửa sổ W1–W5/);
    cleanup();
    render(<TimelineZonesBlock ticker="VGR" />);
    const t = screen.getByTestId("pfa-timeline-table").textContent ?? "";
    expect(t).toMatch(/đã qua · thoát \d\d\/\d\d/); expect(t).not.toMatch(/-\d/);
  });
});
