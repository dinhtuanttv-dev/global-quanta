// NHỊP QUYẾT ĐỊNH — mô hình thuần trên dữ liệu SỐNG 20/11/2026 (docs/elite-hl-pulse 03: KP2–KP5).
import { describe, expect, it } from "vitest";
import fx from "./__fixtures__/pulse-2026-11-20.json";
import type { EliteDecision } from "./decisionTypes";
import { pulseModel, PZ_ORDER, type PulseHistSession } from "./decisionPulse";

const d0 = fx.decision as unknown as EliteDecision;
const hist = fx.history.sessions as unknown as PulseHistSession[];
const clone = (): EliteDecision => JSON.parse(JSON.stringify(d0));
const row = (vm: ReturnType<typeof pulseModel>, id: string) => vm.rows.find((r) => r.id === id)!;

describe("pulseModel — phiên 20/11 thật", () => {
  it("số chép nguyên văn nguồn; tổng thể ỔN ĐỊNH; hàng chờ CÓ THAY ĐỔI so với 19/11 (3 → 12)", () => {
    const vm = pulseModel(d0, hist);
    expect(vm.overall).toBe("STABLE");
    expect(vm.session).toMatchObject({ date: "2026-11-20", prevDate: "2026-11-19", histPrev: "2026-11-19" });
    expect(row(vm, "portfolio").current).toMatchObject({ held: 7, slots: 10, kept: 7, core: 6, runner: 1, cash: d0.hl!.cash });
    expect(row(vm, "portfolio").delta).toMatchObject({ added: [], exits: [] });
    const q = row(vm, "queue");
    expect([q.current.queue, q.current.prevQueue, q.status]).toEqual([12, 3, "CHANGED"]);
    expect(vm.overallWhy.join(" ")).toMatch(/Có thay đổi: Hàng chờ/);
  });

  it("KP2 vị trí giá đủ 8 trạng thái; tổng = số mã theo dõi (37 = 37); 9 mã ngoài 4 nhóm cũ = NO_SETUP 8 + FAILED 1", () => {
    const p = row(pulseModel(d0, hist), "pz");
    expect(PZ_ORDER.length).toBe(8);
    expect([p.current.total, p.current.tracked, p.current.priced, p.status]).toEqual([37, 37, 37, "STABLE"]);
    expect([p.current.NO_SETUP, p.current.FAILED]).toEqual([8, 1]);
    expect(p.coverage).toEqual({ shown: 37, total: 37 });
  });

  it("pha loãng: toàn thị trường 15 = 13 chưa giao dịch + 2 đã giao dịch (PVS, HDB); giao với danh mục/hàng chờ = VPI", () => {
    const c = row(pulseModel(d0, hist), "dilution").current;
    expect([c.total, c.pending, c.listed, c.listedList, c.mine]).toEqual([15, 13, 2, "HDB, PVS", "VPI"]);
  });

  it("KP3 null khác 0: thiếu phiên trước / thiếu lịch sử / thiếu PZ / thiếu pha loãng / turnover null -> không ra số 0 giả", () => {
    const d = clone(); d.hl!.prevDate = null; (d.hl!.changes as { turnover: number | null }).turnover = null; delete (d.hl as { pz?: unknown }).pz; d.dilution = null;
    const vm = pulseModel(d, null);
    expect(vm.overall).toBe("NO_BASELINE");
    expect(row(vm, "portfolio")).toMatchObject({ status: "NO_BASELINE", delta: null });
    expect(row(vm, "queue")).toMatchObject({ status: "NO_BASELINE", delta: null });
    expect(row(vm, "pz")).toMatchObject({ status: "PARTIAL", current: {} });
    expect(row(vm, "turnover")).toMatchObject({ status: "PARTIAL", current: { turnover: null } });
    expect(row(vm, "dilution")).toMatchObject({ status: "PARTIAL", current: {} });
  });

  it("KP4 thứ tự trạng thái: đóng băng > dữ liệu cũ > chưa có đối chiếu > có thay đổi > ổn định; lý do phụ không bị che", () => {
    const mk = (o: { frozen?: boolean; behind?: number; overdue?: boolean; noBase?: boolean; added?: string[] }) => {
      const d = clone();
      d.hl!.dataGuard = { frozen: Boolean(o.frozen), reasonsVi: o.frozen ? ["Thiếu RRG ngành"] : [] };
      d.freshness = { latestSession: "2026-11-21", sessionsBehind: o.behind ?? 0, overdue: Boolean(o.overdue) };
      if (o.noBase) d.hl!.prevDate = null;
      d.hl!.changes.added = o.added ?? [];
      return pulseModel(d, hist);
    };
    expect(mk({ frozen: true, behind: 2, noBase: true, added: ["VPI"] }).overall).toBe("FROZEN");
    expect(mk({ frozen: true, behind: 2, noBase: true }).overallWhy).toEqual(["Chốt dữ liệu đang bật", "Bảng chậm 2 phiên", "Chưa có phiên đối chiếu"]); // đóng băng: hàng chờ mang nhãn ĐÓNG BĂNG, không "có thay đổi"
    expect(mk({ behind: 2, noBase: true }).overall).toBe("STALE");
    expect(mk({ behind: 1, overdue: false }).overall).toBe("STABLE"); // chậm 1 phiên chưa quá hạn = đang chờ dựng, không phải cũ
    expect(mk({ behind: 1, overdue: true }).overall).toBe("STALE");
    expect(mk({ noBase: true }).overall).toBe("NO_BASELINE");
    expect(mk({ added: ["VPI"] }).overall).toBe("CHANGED");
    expect(mk({}).overall).toBe("STABLE");
    const f = mk({ frozen: true });
    expect(row(f, "portfolio")).toMatchObject({ status: "FROZEN", reason: expect.stringMatching(/chốt dữ liệu/) });
    expect(row(f, "schedule").status).toBe("FROZEN");
  });

  it("KP5 hai miền tách bạch: mã ra danh mục + mã đổi PZ không đếm trùng; PZ không vào hàng Danh mục", () => {
    const d = clone();
    d.hl!.changes.exits = [{ ticker: "HSG", weight: 0.1, since: "2026-11-12", code: "ls", reasonVi: "LS-v1 dưới 60", hlRank: null, lsPct: null, taCount: null, rrg: null }];
    d.hl!.changes.toWatch = ["HSG"]; d.hl!.changes.backToZone = ["VJC"];
    const vm = pulseModel(d, hist);
    expect(row(vm, "portfolio").delta).toMatchObject({ added: [], exits: [{ t: "HSG", weight: 0.1 }] });
    expect(row(vm, "pz").delta).toMatchObject({ removed: ["HSG"], added: ["VJC"] });
    expect(JSON.stringify(row(vm, "portfolio").delta)).not.toMatch(/VJC/);
    expect(vm.overall).toBe("CHANGED");
  });

  it("mã đang giữ đổi vùng so với lịch sử phiên trước (dữ liệu thật: 19/11 -> 20/11 không đổi; 18/11 -> 19/11 VIC, AAS đổi)", () => {
    expect(row(pulseModel(d0, hist), "pz").delta?.moved).toEqual([]);
    const h19 = hist.filter((s) => s.date <= "2026-11-18");
    const moved = row(pulseModel(d0, h19), "pz").delta!.moved!;
    expect(moved.find((m) => m.t === "VIC")).toEqual({ t: "VIC", from: "BUY_ZONE", to: "IN_BASE" });
  });

  it("thuần và tất định; không sửa đầu vào", () => {
    const before = JSON.stringify(d0);
    expect(JSON.stringify(pulseModel(d0, hist))).toBe(JSON.stringify(pulseModel(clone(), hist)));
    expect(JSON.stringify(d0)).toBe(before);
  });
});
