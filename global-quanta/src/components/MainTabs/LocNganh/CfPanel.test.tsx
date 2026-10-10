// CF0 — Cycle Fingerprint: nhãn EXPERIMENTAL + kiểm định, 2 chế độ vẽ, ngày từng giai đoạn, nhãn số liệu trung thực.
// Dữ liệu thật NT2 (Project A /api/cycle-fingerprint/analyze sau QMS #16) lưu làm fixture.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import fixture from "./__fixtures__/cycle-fingerprint-nt2.json";
import type { CycleFingerprintResponse, PersonalizationSettings } from "../../../types/cycleFingerprint";

vi.mock("../../../hooks/useClusterAnalysis", () => ({
  useClusterAnalysis: () => ({ data: { labels: [-1, 0, 0, 1, 1], probabilities: [0, 1, 1, 1, 1], nClusters: 2 }, isLoading: false, isError: false, error: undefined }),
}));
const { CycleFingerprintPanel } = await import("./CfPanel");
const { CfI18nProvider } = await import("../../../i18n/CfI18nProvider");

const data = fixture as unknown as CycleFingerprintResponse;
const settings: PersonalizationSettings = { qualityScoreThreshold: 0.4, weights: { similarity: 0.4, liquidity: 0.2, regime: 0.2, sampleSize: 0.2 } };
const show = () => render(
  <CfI18nProvider>
    <CycleFingerprintPanel data={data} isLoading={false} isError={false} isEmpty={false} onRetry={() => {}}
      windowSize={30} onWindowSizeChange={() => {}} timeframe="daily" onTimeframeChange={() => {}}
      useAtrAxis={false} onUseAtrAxisChange={() => {}} personalization={settings} onPersonalizationChange={() => {}} />
  </CfI18nProvider>,
);

afterEach(cleanup);

describe("Cycle Fingerprint — CF0", () => {
  it("nhãn EXPERIMENTAL kèm kết quả kiểm định của đúng cửa sổ đang xem", () => {
    show();
    const ev = screen.getByTestId("cf-evidence").textContent ?? "";
    expect(ev).toContain("EXPERIMENTAL");
    expect(ev).toContain("Chưa có năng lực dự báo");
    expect(ev).toContain("cửa sổ 30: -0,061");
  });

  it("mặc định: mẫu chồng lên hiện tại + diễn biến thật 60 phiên sau (5 đường + trung vị); chuyển sang kiểu cũ thì không còn đường diễn biến sau", () => {
    show();
    const chart = () => screen.getByTestId("cf-main-chart");
    expect(chart().getAttribute("data-mode")).toBe("overlay");
    expect(screen.getAllByTestId("cf-match-path")).toHaveLength(data.topMatches.length);
    expect(screen.getAllByTestId("cf-forward-path")).toHaveLength(data.topMatches.length);
    expect(screen.getByTestId("cf-forward-median")).toBeTruthy();
    expect(screen.getByTestId("cf-today-line")).toBeTruthy();
    expect(screen.getByTestId("cf-chart-caption").textContent).toContain("không phải dự báo");

    fireEvent.click(screen.getByTestId("cf-mode-shape"));
    expect(chart().getAttribute("data-mode")).toBe("shape");
    expect(screen.queryAllByTestId("cf-forward-path")).toHaveLength(0);
    expect(screen.getByTestId("cf-chart-caption").textContent).toContain("KHÔNG phải diễn biến sau đó");
    fireEvent.click(screen.getByTestId("cf-mode-overlay"));
    expect(chart().getAttribute("data-mode")).toBe("overlay");
  });

  it("đường mẫu nằm trong khung: trục y bao mọi đường đang vẽ", () => {
    show();
    for (const p of screen.getByTestId("cf-main-chart").querySelectorAll("path")) {
      for (const m of (p.getAttribute("d") ?? "").matchAll(/[ML] ([\d.]+) ([\d.-]+)/g)) {
        const yv = Number(m[2]);
        expect(yv).toBeGreaterThanOrEqual(0);
        expect(yv).toBeLessThanOrEqual(320);
      }
    }
  });

  it("bảng giai đoạn có ngày; highlight theo từng giai đoạn chứ không theo mã", () => {
    show();
    const periods = screen.getAllByTestId("cf-topk-period").map((e) => e.textContent);
    expect(periods).toHaveLength(data.topMatches.length);
    expect(periods[0]).toBe("22/04/2025 → 02/06/2025");
    const rows = screen.getAllByTestId("cf-topk-row");
    fireEvent.click(rows[1]);
    expect(rows.filter((r) => r.className.includes("highlighted"))).toHaveLength(1);
  });

  it("nhãn trung thực: không còn 'Dữ liệu thật'; ghi chú mẫu nhỏ; mục tiêu âm ghi là GIẢM; ẩn thanh trượt trọng số vô tác dụng", () => {
    show();
    const root = document.body.textContent ?? "";
    expect(root).not.toContain("Dữ liệu thật");
    expect(root).toContain("Lịch sử");
    expect(screen.getByTestId("cf-summary-note").textContent).toContain("không độc lập");
    expect(screen.getByTestId("cf-timing-title").textContent).toContain("giảm 3%");
    expect(screen.getByTestId("cf-timing-note").textContent).toContain("Tính trên 20 giai đoạn");
    expect(document.querySelectorAll('.cf-personalization-panel input[type="range"]')).toHaveLength(1);
    expect(root).toContain("Tương đồng (tương đối)");
    expect(root).not.toMatch(/Cac chu ky|Khoi luong|Do tin cay/);
  });
});
