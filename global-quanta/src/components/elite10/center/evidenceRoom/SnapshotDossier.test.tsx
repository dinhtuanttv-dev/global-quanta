import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import SnapshotDossier, { ReadableRefs } from "./SnapshotDossier";
import { buildDossier, refPairs, refValueText } from "./dossierModel";
import type { EvidenceRef, EvidenceSnapshot } from "../../../../lib/evidenceBrain/types";
import type { Confirmation, ResearchData } from "../../../../lib/evidenceBrain/research";
import type { HlPick } from "../../../../lib/elite10/decisionTypes";

afterEach(() => cleanup());
const src = (key: string, asOf: string | null, extra: Record<string, unknown> = {}) => ({ key, label: key, endpoint: `/api/${key}`, state: "LOADED", asOf, version: "v1", error: null, warnings: [], ...extra });
const snap = (over: Partial<EvidenceSnapshot> = {}) => ({
  schemaVersion: "vee-1.0", snapshotId: "snap-abc", createdAt: "2026-11-26T09:00:00Z", scope: "ticker", ticker: "HPG", tickerVerified: true,
  decisionSession: "2026-11-26", portfolioKind: "ELITE_HL", completeness: "COMPLETE",
  sources: [src("decision", "2026-11-26"), src("priceAction", "2026-11-25"), src("volume", "2026-11-26"), src("events", "2026-11-26", { warnings: ["2 tin chưa đối chiếu"] })],
  funnel: { mode: "GATE", steps: [], membership: { state: "PORTFOLIO_CORE", rank: 2, reason: null, pz: "BUY_ZONE" }, branch: null, checks: [], frozen: false, frozenReasons: [] },
  data: {}, refs: [], missing: ["Mùa vụ"], stale: [], conflicts: [], limitations: [], ...over,
}) as unknown as EvidenceSnapshot;
const data = (over: Partial<ResearchData> = {}) => ({
  pa: { ticker: "HPG", state: "FORMING", trend: "Tăng", asOf: "2026-11-26", priceBasis: "adjusted", venue: "HOSE", barClosed: true, confirmed: false,
    setup: { kind: "Breakout nền", stateDate: "2026-11-26", entryReference: 28000, invalidationLevel: 26000, target: 32000 }, patterns: [], blockers: ["Chưa vượt đỉnh nền"],
    source: "x", methodVersion: "m", loading: false, error: null, tickerVerified: true },
  price: { bars: [{ date: "2026-11-26", close: 27000 }], priceBasis: "adjusted", warnings: [] },
  volume: { symbol: "HPG", asOf: "2026-11-26", partialToday: false, today: { date: "2026-11-26", price: 27000, changePct: 1, volume: 1, value: null, dealVolume: 0, dealValue: 0, avgVolume20: 1, rvol20: 0.8, rvolMode: "daily", rvolTimeAdjusted: null },
    trend: { bars30: [], ma20Volume: null, upDownVolumeRatio20: 1.3, obvDirection: "up", obvChangeVsAvgVolume: null, cmf20: 0.12, divergence: null }, foreign: null, profile: null, intraday: null, insights: [], notes: [] },
  liquidity: { date: "2026-11-26", ticker: "HPG", liq: { version: "LQ-v1", tier: "L1", reasons: [], n20: 20, n60: 60, med20: 812.4 }, rules: {} },
  events: [], timing: null, sector: "Thép", ...over,
}) as unknown as ResearchData;
const confirmation: Confirmation = { result: "CONTEXT", reason: "Mã đang được giữ. Phiếu này trình bày bối cảnh vị thế.", checks: [
  { id: "decision", state: "CONTEXT", reason: "Mã đang được giữ." }, { id: "priceAction", state: "WAIT", reason: "Chờ setup kích hoạt trên nến đã đóng." },
  { id: "volume", state: "FAIL", reason: "RVOL ngày 0.8×, dưới nền 1×." }, { id: "liquidity", state: "PASS", reason: "L1" }, { id: "events", state: "CONTEXT", reason: "0 cụm tin." }] };
const pick = { ticker: "HPG", weight: 0.12, hl: { rank: 2, lsPct: 88, exitBufferLs: 6, taCount: 3, rrg: 1, since: "2026-11-17", sinceRet: 0.042, warnings: [], pz: { state: "BUY_ZONE", lane: "CORE" } } } as unknown as HlPick;
const official = () => false;

describe("Hồ sơ phân tích Snapshot bằng chứng", () => {
  it("kết luận + điểm các lớp; vị thế lấy từ quyết định cùng phiên; đọc cơ học có số", () => {
    const d = buildDossier({ snap: snap(), data: data(), confirmation, pick, queue: null, official });
    expect(d.verdict.label).toBe("BỐI CẢNH VỊ THẾ");
    expect(d.scoreline).toEqual({ pass: 1, wait: 1, fail: 1, missing: 0, total: 3 });
    const dec = d.domains.find((x) => x.id === "decision")!;
    expect(dec.read).toContain("lãi 4,2% từ phiên khoá");
    expect(dec.facts.find((f) => f.label === "Cách ngưỡng ra (LS)")).toMatchObject({ value: "6 điểm", tone: "warn" });
    const pa = d.domains.find((x) => x.id === "priceAction")!;
    expect(pa.facts.find((f) => f.label === "Mức vô hiệu")?.hint).toBe("cách giá 3,7%");
    expect(pa.facts.find((f) => f.label === "Tỷ lệ lời/lỗ (từ điểm kích hoạt)")?.value).toBe("2 : 1");
    expect(pa.change[0]).toBe("Nến ngày đóng trên 28.000 → setup kích hoạt.");
    expect(pa.facts.find((f) => f.label === "Xu hướng")?.value).toBe("Tăng");
    expect(d.triggers).toContain("LS-v1 giảm thêm 6 điểm phân vị → chạm ngưỡng ra của Elite HL.");
    expect(d.domains.find((x) => x.id === "volume")!.read).toMatch(/thấp hơn nền 20 phiên \(0,8×\); OBV đi lên, CMF dương/);
  });
  it("chất lượng dữ liệu: cờ lệch phiên với nguồn gắn phiên, cảnh báo nguồn, thiếu dữ liệu", () => {
    const d = buildDossier({ snap: snap(), data: data(), confirmation, pick, queue: null, official });
    const pa = d.quality.rows.find((r) => r.key === "priceAction")!;
    expect(pa.tone).toBe("warn"); expect(pa.note).toBe("Lệch phiên: nguồn 25/11, quyết định 26/11");
    expect(d.quality.rows.find((r) => r.key === "events")!.note).toBe("2 tin chưa đối chiếu");
    expect(d.quality.rows.find((r) => r.key === "volume")!.tone).toBe("good");
    expect(d.quality.issues).toEqual(["Thiếu: Mùa vụ"]);
  });
  it("Data Guard chặn: kết luận đỏ, điều kiện mở khoá đứng đầu", () => {
    const frozen = snap({ funnel: { ...snap().funnel, frozen: true, frozenReasons: ["Thiếu Siêu Quét"] } });
    const d = buildDossier({ snap: frozen, data: data(), confirmation: { result: "BLOCKED", reason: "Data Guard", checks: [] }, pick: null, queue: null, official });
    expect(d.verdict).toMatchObject({ label: "DỮ LIỆU ĐANG CHẶN", tone: "bad" });
    expect(d.triggers[0]).toBe("Data Guard mở khoá: Thiếu Siêu Quét.");
  });
  it("hiển thị: kết luận, các thẻ lớp bấm được, chi tiết kỹ thuật thu gọn", () => {
    const onOpen = vi.fn();
    render(<SnapshotDossier dossier={buildDossier({ snap: snap(), data: data(), confirmation, pick, queue: null, official })} onOpen={onOpen} technical={<p>snap-abc · /api/decision</p>} />);
    expect(screen.getByTestId("eb-dos-verdict").textContent).toBe("BỐI CẢNH VỊ THẾ");
    expect(screen.getByTestId("eb-dos-volume").textContent).toContain("CHƯA ĐẠT");
    fireEvent.click(screen.getByText("Price Action ›"));
    expect(onOpen).toHaveBeenCalledWith("priceAction");
    expect(screen.getByTestId("eb-snapshot-dossier").querySelector("details.eb-dos-tech")?.hasAttribute("open")).toBe(false);
  });
  it("ref đọc được thay cho JSON thô", () => {
    expect(refValueText(812.4, "tỷ")).toBe("812,4 tỷ");
    expect(refValueText(true, null)).toBe("Có");
    expect(refPairs({ tier: "L1", med20: 812.4, nested: { a: 1 } })).toEqual([["tier", "L1"], ["med20", "812,4"], ["nested", "1 trường"]]);
    const ref = { id: "r1", domain: "risk", subject: "HPG", fieldPath: "risk.var95", value: 0.021, unit: null, status: "VERIFIED", freshness: "CURRENT", asOf: "2026-11-26",
      source: "Gateway", sourceVersion: "v1", methodVersion: null, limitation: null, url: null } as EvidenceRef;
    render(<ReadableRefs refs={[ref]} link={() => null} />);
    expect(document.body.textContent).toContain("risk.var95 = 0,021");
    expect(document.body.textContent).toContain("Xác minh · Đúng phiên");
    expect(document.querySelector("pre")).toBeNull();
  });
});
