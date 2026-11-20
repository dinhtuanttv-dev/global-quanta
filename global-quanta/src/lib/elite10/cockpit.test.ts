// BUỒNG LÁI (20/11/2026): lõi diễn giải trên DỮ LIỆU THẬT Gateway phiên 19/11 và 20/11 (rút gọn trường).
import { describe, expect, it } from "vitest";
import fx from "./__fixtures__/cockpit-2026-11-19-20.json";
import type { EliteDecision } from "./decisionTypes";
import { funnelModel, PRIMARY_ORDER, resolveBoardState, sessionSeal, transitionsFrom, type HistSessionLite, type WatchLogEntry } from "./cockpit";

const d19 = fx.d19 as unknown as EliteDecision, d20 = fx.d20 as unknown as EliteDecision;
const log = fx.log as WatchLogEntry[], hist = fx.history.sessions as unknown as HistSessionLite[];

describe("sessionSeal", () => {
  it("phiên, phiên bản, PZ chỉ hiển thị; nguồn phụ cũ hơn phiên -> lệch; chưa tải -> không lệch", () => {
    const s = sessionSeal(d20, [{ key: "news", label: "Tin", date: "2026-11-20T09:02:00Z" }, { key: "sig", label: "Dòng tiền", date: "2026-11-19" }, { key: "risk", label: "Rủi ro", date: null }]);
    expect([s.date, s.pzMode, s.frozen, s.rebalance]).toEqual(["2026-11-20", "DISPLAY", false, false]);
    expect(s.version).toMatch(/E4-HL v1/);
    expect(s.sources.find((x) => x.key === "pz")!.lag).toBe(false);
    expect(s.sources.find((x) => x.key === "news")!.lag).toBe(false);
    expect(s.sources.find((x) => x.key === "sig")!.lag).toBe(true);
    expect(s.sources.find((x) => x.key === "risk")!.lag).toBe(false);
  });
});

describe("funnelModel — đúng số thật, nhánh giữ lại, bất biến", () => {
  it("19/11: 279·165·34·11·9·4·7; bước 2, 3 song song; bước 6 chỉ hiển thị; 7 = giữ lại 7 + mua mới 0; không vi phạm", () => {
    const m = funnelModel(d19)!;
    expect(m.steps.map((s) => s.n)).toEqual([279, 165, 34, 11, 9, 4, 7]);
    expect(m.steps.filter((s) => s.parallel).map((s) => s.label)).toEqual(["Giao dịch được", "Đạt tầng 1"]);
    expect(m.steps[5].displayOnly).toBe(true);
    expect(m.branch).toEqual({ prevHeld: 7, kept: 7, added: 0, exited: 0, held: 7 });
    expect(m.checks).toEqual([]);
  });
  it("20/11: bước 6 (10) lớn hơn bước 7 (7) là hợp lệ; 12 hàng chờ đều 'wait'; 3 chưa giao dịch được", () => {
    const m = funnelModel(d20)!;
    expect(m.steps.map((s) => s.n)).toEqual([279, 163, 35, 21, 18, 10, 7]);
    expect(m.queueByCode).toEqual([["wait", 12]]); expect(m.illiquid).toBe(3); expect(m.checks).toEqual([]);
  });
  it("phát hiện vi phạm: danh mục ≠ giữ lại + mua mới; mua mới ngoài phiên đầu tuần", () => {
    const bad = { ...d20, hl: { ...d20.hl!, funnel: { ...d20.hl!.funnel, held: 9 }, changes: { ...d20.hl!.changes, added: ["XYZ"] } } } as EliteDecision;
    expect(funnelModel(bad)!.checks).toEqual(["danh mục 9 ≠ giữ lại 7 + mua mới 1", "có mua mới ở phiên không phải đầu tuần"]);
  });
});

describe("resolveBoardState — một trạng thái chính (D1) + nhãn phụ", () => {
  it("20/11: VPI = Hàng chờ (phụ: Chờ nền); HDA = Chưa giao dịch được (phụ: Chờ nền); VCP = Danh mục · chạy lãi", () => {
    const s = resolveBoardState(d20);
    expect(s.byTicker.get("VPI")).toMatchObject({ primary: "QUEUE", secondary: ["Chờ nền"] });
    expect(s.byTicker.get("HDA")).toMatchObject({ primary: "BLOCKED", secondary: ["Chờ nền"] });
    expect(s.byTicker.get("VCP")!.primary).toBe("PORTFOLIO_RUNNER");
    expect(s.byTicker.get("MSH")!.primary).toBe("PORTFOLIO_CORE");
    expect(s.multi).toEqual(expect.arrayContaining(["HDA", "VPI"]));
  });
  it("mỗi mã đúng một trạng thái chính; tổng đếm = số mã; danh mục khớp payload", () => {
    for (const d of [d19, d20]) {
      const s = resolveBoardState(d);
      expect(Object.values(s.counts).reduce((a, b) => a + b, 0)).toBe(s.byTicker.size);
      expect(s.counts.PORTFOLIO_CORE + s.counts.PORTFOLIO_RUNNER).toBe(d.portfolio.filter((p) => (p as { hl?: unknown }).hl).length);
      for (const x of s.byTicker.values()) expect(PRIMARY_ORDER).toContain(x.primary);
    }
  });
  it("20/11 đếm: lõi 6 · chạy lãi 1 · hàng chờ 12 · chưa giao dịch được 3", () => {
    const c = resolveBoardState(d20).counts;
    expect([c.PORTFOLIO_CORE, c.PORTFOLIO_RUNNER, c.QUEUE, c.BLOCKED]).toEqual([6, 1, 12, 3]);
  });
});

describe("transitionsFrom — chuỗi chuyển trạng thái từ dữ liệu đã khoá", () => {
  it("CTD (dữ liệu thật): vào danh mục 12/11, ra 17/11 kèm lý do; HL-H1 không có hàng chờ -> không bịa bước Hàng chờ", () => {
    const tr = transitionsFrom("CTD", hist, [], 10);
    expect(tr.map((x) => `${x.date} ${x.kind}`)).toEqual(["2026-11-12 ENTER", "2026-11-17 EXIT"]);
    expect(tr[1].reason).toMatch(/LS-v1|ngưỡng|Tụt hậu|TA/);
    expect(tr.some((x) => x.label.includes("Hàng chờ"))).toBe(false);
  });
  it("nhật ký PZ thật: mã có chuyển PZ -> nhãn 'A → B' kèm lý do, đúng thứ tự thời gian; giới hạn 4 bước gần nhất", () => {
    const tk = log[log.length - 1].ticker;
    const tr = transitionsFrom(tk, hist, log, 4);
    expect(tr.length).toBeGreaterThan(0); expect(tr.length).toBeLessThanOrEqual(4);
    expect([...tr].map((x) => x.date)).toEqual([...tr].map((x) => x.date).sort());
    expect(tr.filter((x) => x.kind === "PZ").every((x) => / → /.test(x.label))).toBe(true);
  });
  it("HL-H2 (có queue): Hàng chờ phiên trước rồi vào danh mục -> 'Hàng chờ → Danh mục'", () => {
    const s: HistSessionLite[] = [
      { date: "2026-11-20", held: [], added: [], exits: [], queue: [{ t: "AAA", code: "wait" }], ill: [] },
      { date: "2026-11-23", held: [{ t: "AAA" }], added: ["AAA"], exits: [], queue: [], ill: [] },
    ];
    expect(transitionsFrom("AAA", s, [], 5).map((x) => x.label)).toEqual(["Vào hàng chờ", "Hàng chờ → Danh mục"]);
  });
});

// C6 (20/11/2026): lịch sử HL-H2 thật (dựng bằng backend hlHistory từ tài liệu phiên 12–19/11 đã lưu trên Gateway).
import h2 from "./__fixtures__/hl-history-h2-2026-11-19.json";
describe("transitionsFrom — HL-H2 dữ liệu thật", () => {
  const sessions = h2.sessions as unknown as HistSessionLite[];
  it("VPI: vào hàng chờ 13/11 (chờ phiên đầu tuần), giữ trong hàng chờ các phiên sau -> chỉ một bước", () => {
    expect(transitionsFrom("VPI", sessions, [], 10).map((x) => `${x.date} ${x.label} · ${x.reason}`)).toEqual(["2026-11-13 Vào hàng chờ · Chờ phiên đầu tuần"]);
  });
  it("HDA: trước LQ1 nằm trong hàng chờ với code 'illiquid' -> đọc đúng là 'Chưa giao dịch được', không phải 'Vào hàng chờ'", () => {
    const tr = transitionsFrom("HDA", sessions, [], 10);
    expect(tr.map((x) => `${x.date} ${x.label}`)).toEqual(["2026-11-12 Chưa giao dịch được"]);
  });
  it("CTD: vào danh mục 12/11 (phiên dựng đầu tiên), ra 17/11", () => {
    expect(transitionsFrom("CTD", sessions, [], 10).map((x) => `${x.date} ${x.kind}`)).toEqual(["2026-11-12 ENTER", "2026-11-17 EXIT"]);
  });
});
