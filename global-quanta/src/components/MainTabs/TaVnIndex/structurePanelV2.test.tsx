// MTF v2 — bảng Cấu trúc theo chuẩn Pattern Scanner v2: dữ liệu mẫu của TÀI LIỆU GỐC (du_lieu_mau_1h.csv, đánh lại ngày như nến ngày)
// qua đúng engine + kết quả kiểm định thật (backend validation.js). Kiểm: thẻ chỉ số, mô phỏng ghim theo nến, sơ đồ chu kỳ,
// kết luận bằng lời mô tả (kiểm định chưa đạt), bảng V1–V5, lịch sử giai đoạn.
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import StructurePanel from "./StructurePanel";
import { analyzeStructureMtf, compactStructure } from "../../../lib/quant-core/mtf";
// @ts-expect-error — hằng số JS sinh tự động của Gateway (không có khai báo kiểu)
import { STRUCTURE_VALIDATION as V } from "../../../../backend/src/market/structure/validation.js";
import type { StructureDoc } from "../../../hooks/useStructure";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.unstubAllGlobals(); });

const csv = readFileSync(path.resolve(process.cwd(), "src/lib/quant-core/mtf/__fixtures__/source_demo_1h.csv"), "utf8");
const day = (i: number) => new Date(Date.UTC(2023, 0, 2 + i)).toISOString().slice(0, 10);
const bars: OhlcvBar[] = csv.trim().split(/\r?\n/).slice(1).map((l, i) => {
  const [, o, h, lo, c, v] = l.split(",");
  return { date: day(i), open: +o, high: +h, low: +lo, close: +c, volume: +v };
});

function docOf(): StructureDoc {
  const base = compactStructure(analyzeStructureMtf({ d: bars.map((b) => ({ ...b, volume: b.volume ?? 0 })) }));
  return {
    ...(base as unknown as StructureDoc), symbol: "DEMO", generatedAt: "",
    dataSource: { daily: { source: "SSI", priceBasis: "ADJUSTED_CUMULATIVE", bars: bars.length, warnings: [] }, h1: { unavailable: "test" } },
    cone: null, probability: null, stageOdds: null,
    evidence: {
      prereg: V.prereg, status: V.status, verdicts: V.verdicts, summary: V.summary, verdictValidated: V.verdictValidated, ranAt: V.ranAt, engine: V.engine, period: V.period,
      labels: { alignment: "THỰC NGHIỆM", rrGate: "THỰC NGHIỆM", entryDaily: "THỰC NGHIỆM", stageB: "THỰC NGHIỆM", sellSignal: "THỰC NGHIỆM" },
      history: { tests: V.stats, stageTable: V.stageTable, ext: V.ext, patternContext: V.patternContext, v1ByDayStage: V.v1ByDayStage } as StructureDoc["evidence"]["history"],
      previous: V.previous,
    },
  };
}

async function mount() {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  const doc = docOf();
  await act(async () => {
    root!.render(<SWRConfig value={{ provider: () => new Map(), fetcher: () => new Promise(() => {}) }}>
      <StructurePanel doc={doc} isLoading={false} mode="trade" onModeChange={() => {}} timeframeKey="D" bars={bars} timeframe="D" />
    </SWRConfig>);
  });
  return { el, doc };
}

describe("MTF v2 — bảng Cấu trúc (chuẩn Pattern Scanner v2)", () => {
  it("thẻ chỉ số + kết luận bằng LỜI MÔ TẢ (kiểm định V1–V5 chưa đạt), không hiện chữ MUA / BÁN làm kết luận", async () => {
    const { el, doc } = await mount();
    expect(el.querySelectorAll("[data-testid=structure-tiles] > div")).toHaveLength(6);
    const verdict = el.querySelector("[data-testid=structure-verdict-text]")!.textContent!;
    expect(["Cấu trúc thuận tăng", "Chờ tín hiệu tăng", "Trung tính", "Cấu trúc suy yếu", "Cấu trúc giảm"]).toContain(verdict);
    expect(verdict).not.toBe(doc.align.verdict);
    expect(el.querySelector("[data-testid=structure-verdict-warning]")).not.toBeNull();
  });

  it("mô phỏng trên giá thật: MA nhanh / MA chậm, dải giai đoạn, vùng giữa hai MA, tín hiệu — mọi dải giai đoạn ghim vào nến có thật", async () => {
    const { el, doc } = await mount();
    const sk = el.querySelector("[data-testid=structure-sketch]")!;
    expect(sk).not.toBeNull();
    expect(sk.querySelector("[data-testid=structure-sketch-ma-fast]")).not.toBeNull();
    expect(sk.querySelector("[data-testid=structure-sketch-ma-slow]")).not.toBeNull();
    expect(sk.querySelectorAll("[data-testid=structure-sketch-zone]").length).toBeGreaterThan(0);
    const bands = [...sk.querySelectorAll("[data-testid=structure-sketch-band]")];
    expect(bands.length).toBeGreaterThan(0);
    expect(bands[bands.length - 1].getAttribute("data-stage")).toBe(doc.tfs.D!.stage);
    expect(sk.querySelectorAll("[data-testid=structure-sketch-granville], [data-testid=structure-sketch-core]").length).toBeGreaterThan(0);
    expect(el.querySelector("[data-testid=structure-sketch-legend]")!.textContent).toMatch(/Granville/);
  });

  it("sơ đồ chu kỳ theo tài liệu: tô giai đoạn hiện tại, có lợi suất ngoài mẫu theo giai đoạn; giai đoạn B ghi đúng số kiểm định (âm)", async () => {
    const { el } = await mount();
    const sc = el.querySelector("[data-testid=structure-schematic]")!;
    expect(sc.querySelectorAll("[data-testid=structure-schematic-stat]").length).toBeGreaterThanOrEqual(6);
    expect(sc.textContent).toContain("−0,96%");
    expect(el.querySelector("[data-testid=structure-stage-text]")!.textContent!.length).toBeGreaterThan(40);
  });

  it("kiểm định đặt trước MTF v2: 5 dòng V1–V5 đều KHÔNG ĐẠT; cờ quá đà ghi kết quả dương; kế hoạch theo tài liệu có R:R", async () => {
    const { el } = await mount();
    const rows = el.querySelectorAll("[data-testid=structure-validation] tbody tr");
    expect(rows).toHaveLength(5);
    for (const r of rows) expect(r.textContent).toMatch(/KHÔNG ĐẠT/);
    expect(el.querySelector("[data-testid=structure-ext-history]")!.textContent).toContain("+0,79%");
    expect(el.querySelector("[data-testid=structure-checklist]")!.children.length).toBe(8);
    expect(el.querySelector("[data-testid=structure-risk]")).not.toBeNull();
  });
});

describe("MTF — sổ thời gian thực M1 'đà tăng tiếp diễn'", () => {
  it("hiện tiến độ tới mốc 120 phiên, nhãn ĐANG TÍCH LŨY MẪU, không kết luận khi chưa đủ mẫu", async () => {
    const momentum = { prereg: "structure/MTF-momentum-prereg-2026-10-24", firstDay: "2026-10-26", recordedDays: 30, scoredDays: 10, pendingDays: 20, minDays: 120,
      meanS: 1.2, ciS: [-0.8, 3.1], meanL: 0.4, hitS: 60, meanOn: 0.9, meanOff: -0.3, lastGroup: { d: "2026-12-04", on: 12, off: 40 }, verdict: "PENDING", confirm: null, label: "ĐANG TÍCH LŨY MẪU", updatedAt: null };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ engine: "2.0.0", generatedAt: "", asOf: "2026-12-04", evidence: {}, rows: [], skipped: [], momentum }) })));
    const { el } = await mount();
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const card = el.querySelector("[data-testid=structure-momentum-ledger]")!;
    expect(card).not.toBeNull();
    expect(el.querySelector("[data-testid=structure-momentum-label]")!.textContent).toBe("ĐANG TÍCH LŨY MẪU");
    expect(card.textContent).toMatch(/10\/120 phiên đã chấm/);
    expect(card.textContent).toMatch(/chưa đủ mẫu — không kết luận/);
    expect(card.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("10");
  });
});
