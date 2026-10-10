// CF4 — Cycle Fingerprint engine v2: 30 giai đoạn của nhiều mã (có ngày), nhãn CF3, thẻ chi tiết, sổ theo dõi.
// Dữ liệu thật NT2 từ Gateway /api/market/cycles/NT2 (2026-10-10) lưu làm fixture; sổ theo dõi giả lập.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import fixture from "./__fixtures__/cycle-v2-nt2.json";
import { CfV2Panel } from "./CfV2Panel";
import { CfI18nProvider } from "../../../i18n/CfI18nProvider";
import type { CycleV2Ledger, CycleV2Response } from "../../../types/cycleFingerprintV2";

const base = fixture as unknown as CycleV2Response;
const ledgerEmpty: CycleV2Ledger = { engine: "cycles/CF2", dataAsOf: "2026-10-09", horizon: 20, snapshots: 1, firstDate: "2026-10-09", lastDate: "2026-10-09", maturedDates: 0, scoredRows: 0, pendingRows: 194, meanIc: null, positiveIcShare: null, hitRate: null, brier: null, coverage80: null, meanSpreadNet: null, recent: [], mine: [{ date: "2026-10-09", excessPct: -1.6, pOutperform: 0.39, realizedPct: null }] };
const ledgerScored: CycleV2Ledger = { ...ledgerEmpty, maturedDates: 3, scoredRows: 580, pendingRows: 40, meanIc: 0.012, positiveIcShare: 0.67, hitRate: 0.52, brier: 0.248, coverage80: 0.76, meanSpreadNet: 0.001, mine: [{ date: "2026-09-01", excessPct: 1.2, pOutperform: 0.55, realizedPct: -2.4 }] };
const show = (ledger: CycleV2Ledger | null = ledgerEmpty) => render(<CfI18nProvider><CfV2Panel data={{ ...base, ledger }} sectorNames={new Map([["7500", "Điện, nước & xăng dầu khí đốt"]])} /></CfI18nProvider>);

afterEach(cleanup);

describe("Cycle Fingerprint v2 (CF4)", () => {
  it("nhãn CF3 KHÔNG ĐẠT -> EXPERIMENTAL với 6 điều kiện và số liệu ngoài mẫu", () => {
    show();
    const ev = screen.getByTestId("cf2-evidence").textContent ?? "";
    expect(ev).toContain("EXPERIMENTAL");
    expect(ev).toContain("KHÔNG ĐẠT");
    expect(screen.getByTestId("cf2-checks").querySelectorAll("li")).toHaveLength(6);
    expect(screen.getByTestId("cf2-checks").querySelectorAll('li[data-pass="false"]')).toHaveLength(3);
  });

  it("30 giai đoạn của nhiều mã khác nhau, mỗi dòng có ngày; biểu đồ vẽ đủ 30 đường + diễn biến sau", () => {
    show();
    const rows = screen.getAllByTestId("cf2-neighbor-row");
    expect(rows).toHaveLength(30);
    const tickers = new Set(base.neighbors.map((n) => n.ticker));
    expect(tickers.size).toBeGreaterThan(10);
    for (const p of screen.getAllByTestId("cf2-neighbor-period")) expect(p.textContent).toMatch(/^\d{2}\/\d{2}\/\d{4} → \d{2}\/\d{2}\/\d{4}$/);
    expect(screen.getAllByTestId("cf-match-path")).toHaveLength(30);
    expect(screen.getAllByTestId("cf-forward-path")).toHaveLength(30);
    fireEvent.click(screen.getByTestId("cf2-mode-shape"));
    expect(screen.queryAllByTestId("cf-forward-path")).toHaveLength(0);
  });

  it("dự báo vượt VN-Index 4 kỳ hạn; dải 80% ghi rõ CHƯA hiệu chỉnh (phủ 73% ngoài mẫu)", () => {
    show();
    expect(screen.getByTestId("cf2-forecast").textContent).toContain("Vượt VN-Index 20 phiên");
    expect(screen.getByTestId("cf2-interval").textContent).toContain("CHƯA hiệu chỉnh");
    expect(document.querySelectorAll(".cf2-horizons tbody tr")).toHaveLength(4);
  });

  it("bấm một giai đoạn -> thẻ chi tiết (không mở biểu đồ); bấm lại -> đóng", () => {
    show();
    const row = screen.getAllByTestId("cf2-neighbor-row")[2];
    fireEvent.click(row);
    const d = screen.getByTestId("cf2-detail");
    expect(d.textContent).toContain(base.neighbors[2].ticker);
    expect(d.querySelectorAll("path")).toHaveLength(3);
    fireEvent.click(row);
    expect(screen.queryByTestId("cf2-detail")).toBeNull();
  });

  it("sổ theo dõi: chưa có kết quả -> ghi rõ đang chờ 21 phiên; có kết quả -> IC, đúng hướng, Brier, độ phủ, lịch sử của mã", () => {
    show();
    expect(screen.getByTestId("cf2-ledger-empty").textContent).toContain("21 phiên");
    expect(screen.getByTestId("cf2-ledger-mine").textContent).toContain("đang chờ");
    cleanup();
    show(ledgerScored);
    const l = screen.getByTestId("cf2-ledger").textContent ?? "";
    expect(l).toContain("Ngày đã chấm");
    expect(l).toContain("52%");
    expect(screen.getByTestId("cf2-ledger-mine").textContent).toContain("-2,40%");
  });
});
