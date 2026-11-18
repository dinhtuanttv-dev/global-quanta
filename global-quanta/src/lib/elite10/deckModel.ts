// Command Deck (A1, 18/11/2026) — mô hình hiển thị THUẦN cho Bảng quyết định Elite HL. Chỉ trình bày trường có sẵn của
// /api/elite/decision, /api/elite/risk, /api/world-sectors/strategy và bảng tín hiệu E1; không công thức quyết định mới.
// Mọi hằng số ngưỡng trích từ mã nguồn Gateway (ghi tệp:dòng) — tài liệu Ho-so-360-v2/Apex-HL/04 + 07.
import type { EliteDecision, EliteRisk, HlPick, LedgerSummary } from "./decisionTypes";
import { HL_RULES, hlScores, type HlResult, type HlRowIn } from "./confluence";

/** Ngưỡng độ rộng của regimeAt (backend leadership.js:101–104): > 65 kèm MA xếp tăng = tăng; < 35 kèm MA xếp giảm = giảm. */
export const REGIME_BREADTH = Object.freeze({ down: 35, up: 65 });
/** VIX căng thẳng (backend worldSectors/strategy.js:120): VIX ≥ 20 hoặc tăng ≥ 15% trong phiên. Thang hiển thị 10–40. */
export const VIX_SCALE = Object.freeze({ min: 10, max: 40, stress: 20, high: 30 });

export type SealTone = "pass" | "partial" | "fail" | "desc";
export interface Seal { tone: SealTone; text: string; title: string }
/** Dấu bằng chứng của sổ: chỉ "EVIDENCE" mới xanh. Sổ Elite HL (decisionService.js hlLedgerSummary) luôn EXPERIMENTAL. */
export function ledgerSeal(s: LedgerSummary | null | undefined): Seal {
  return s?.label === "EVIDENCE"
    ? { tone: "pass", text: "ĐẠT TIÊU CHÍ ĐĂNG KÝ TRƯỚC", title: s.labelVi ?? "" }
    : { tone: "desc", text: "THĂM DÒ", title: s?.labelVi ?? "Sổ theo dõi tiến chưa có tiêu chí đăng ký trước." };
}
export function verdictTone(v: string): SealTone {
  return v === "ĐẠT" ? "pass" : v === "MỘT PHẦN" ? "partial" : v === "KHÔNG ĐẠT" ? "fail" : "desc";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Vị trí 0–1 của VIX trên thang hiển thị. */
export const vixPos = (vix: number | null | undefined) => (vix == null || !Number.isFinite(vix) ? 0 : clamp((vix - VIX_SCALE.min) / (VIX_SCALE.max - VIX_SCALE.min), 0, 1));
export const breadthTone = (b: number | null | undefined): "neg" | "warn" | "pos" => (b == null ? "warn" : b < REGIME_BREADTH.down ? "neg" : b > REGIME_BREADTH.up ? "pos" : "warn");

/** Dải biến động — giống hệt eliteHl.js:167: max(σ20, sàn) · √bandSessions. */
export function volBand(sigma20: number | null | undefined, rule: { sigmaFloor?: number; bandSessions: number }): number {
  return Math.max(sigma20 ?? 0, rule.sigmaFloor ?? 0.01) * Math.sqrt(rule.bandSessions);
}
/** Vị trí giá hiện tại so với giá lúc vào, tính bằng số dải (kẹp ±3 để vẽ). */
export function corridorPos(p: HlPick, rule: { sigmaFloor?: number; bandSessions: number }) {
  const band = volBand(p.hl.sigma20, rule), ret = p.hl.sinceRet;
  return { band, ret, units: ret == null ? null : ret / band, drawn: ret == null ? 0 : clamp(ret / band, -3, 3) };
}

/** Khoảng cách tới ngưỡng bán (eliteHl.js:176), sắp tăng dần; cảnh báo khi < warnLsPct − exitLsPct. */
export function exitRadar(picks: HlPick[], rule: { exitLsPct: number; warnLsPct: number }) {
  const warnGap = rule.warnLsPct - rule.exitLsPct;
  return picks.filter((p) => p.hl.exitBufferLs != null).map((p) => ({ ticker: p.ticker, buffer: p.hl.exitBufferLs as number, lsPct: p.hl.lsPct, warn: (p.hl.exitBufferLs as number) < warnGap }))
    .sort((a, b) => a.buffer - b.buffer);
}

/** Đóng góp rủi ro Euler từ /api/elite/risk (riskCore.js:176, cộng = 1). KHÔNG dùng portfolio[].riskContribution (w·σ20/Σ, bỏ tương quan). */
export function eulerBy(risk: EliteRisk | null | undefined) {
  return new Map((risk?.available ? risk.holdings ?? [] : []).map((h) => [h.ticker, h]));
}

/** Bất biến hợp đồng (tài liệu 04 §6). Lỗi chỉ cảnh báo, không chặn hiển thị. */
export function deckInvariants(d: EliteDecision, risk: EliteRisk | null | undefined): string[] {
  const out: string[] = [], hl = d.hl; if (!hl) return out;
  const picks = (d.portfolio as unknown as HlPick[]).filter((p) => p.hl);
  const sw = picks.reduce((a, p) => a + p.weight, 0);
  if (Math.abs(sw + hl.cash - 1) > 1e-3) out.push(`Σ tỷ trọng + tiền mặt = ${(sw + hl.cash).toFixed(4)}`);
  if (risk?.available && risk.holdings?.length) { const s = risk.holdings.reduce((a, h) => a + h.riskContribution, 0); if (Math.abs(s - 1) > 1e-3) out.push(`Σ đóng góp Euler = ${s.toFixed(4)}`); }
  for (const p of picks) if (p.hl.exitBufferLs != null && p.hl.lsPct != null && Math.abs(p.hl.exitBufferLs - (p.hl.lsPct - hl.rule.exitLsPct)) > 1e-3) out.push(`${p.ticker}: cách ngưỡng bán lệch công thức`);
  const f = hl.funnel; if (!(f.panel >= f.tradable && f.tradable >= f.tier1 && f.tier1 >= f.selected && f.selected >= f.selectedTradable)) out.push("phễu không giảm dần");
  if (f.held !== picks.length) out.push(`phễu giữ ${f.held} ≠ ${picks.length} dòng`);
  for (const p of picks) if (p.stop && p.close && p.hl.sigma20 != null) { const implied = (1 - p.stop / p.close) / (hl.rule.stopK ?? 2); if (Math.abs(implied - volBand(p.hl.sigma20, hl.rule)) > 1e-3) out.push(`${p.ticker}: dải biến động lệch dải của stop`); }
  return out;
}

/** Điều kiện của quy tắc cho thẻ hàng chờ (confluence.js:64–77, eliteHl.js hlTradable). */
export function queueChecks(q: { lsPct: number | null; taCount: number; rrg: number | null; advBn: number | null }, tier1: { lsLeaderPct: number; taMin: number; taModels: number }, rule: { minAdvBn: number }) {
  return [
    { id: "ls", ok: q.lsPct != null && q.lsPct >= tier1.lsLeaderPct, text: `LS ${q.lsPct == null ? "—" : Math.round(q.lsPct)}`, need: `LS ≥ ${tier1.lsLeaderPct}` },
    { id: "ta", ok: q.taCount >= tier1.taMin, text: `TA ${q.taCount}/${tier1.taModels}`, need: `TA ≥ ${tier1.taMin}` },
    { id: "rrg", ok: q.rrg != null && q.rrg >= 1, text: q.rrg == null ? "RRG —" : ({ 2: "Dẫn dắt", 1: "Cải thiện", [-1]: "Suy yếu", [-2]: "Tụt hậu" } as Record<number, string>)[q.rrg] ?? "—", need: "ngành Cải thiện / Dẫn dắt" },
    { id: "adv", ok: (q.advBn ?? 0) >= rule.minAdvBn, text: `${q.advBn == null ? "—" : q.advBn.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tỷ`, need: `GTGD TB20 ≥ ${rule.minAdvBn} tỷ` },
  ];
}

export type SpaceRole = "held" | "queue" | "sel" | "t1" | "rest";
export interface SpacePoint { t: string; ls: number; ta: number; rrg: number | null; cls: HlResult["cls"]; role: SpaceRole; j: number }
/** Rải dọc xác định theo mã (−0,5…0,5) — chỉ để các điểm có cùng số mô hình TA không chồng nhau. */
export const jitterOf = (t: string) => { let x = 0; for (const c of t) x = (x * 31 + c.charCodeAt(0)) >>> 0; return (x % 1000) / 1000 - 0.5; };
/**
 * Không gian quy tắc: chạy CHÍNH hlScores (đã đối chiếu 279/279 mã với hàm Gateway) trên bảng E1; vai trò điểm theo danh mục / hàng chờ.
 * Trả kèm số kiểm: tier1 / selected phải bằng hl.funnel.tier1 / selected.
 */
export function ruleSpace(rows: HlRowIn[], held: Set<string>, queued: Set<string>) {
  const all = [...hlScores(rows).values()];
  const points: SpacePoint[] = all.filter((r) => r.lsPct != null).map((r) => ({
    t: r.ticker, ls: r.lsPct as number, ta: r.taCount, rrg: r.rrg, cls: r.cls, j: jitterOf(r.ticker),
    role: held.has(r.ticker) ? "held" : queued.has(r.ticker) ? "queue" : r.cls === "STRONG" || r.cls === "CONFLUENCE" ? "sel" : r.pass1 ? "t1" : "rest",
  }));
  return { points, total: all.length, tier1: all.filter((r) => r.pass1).length, selected: all.filter((r) => r.cls === "STRONG" || r.cls === "CONFLUENCE").length, rules: HL_RULES };
}
