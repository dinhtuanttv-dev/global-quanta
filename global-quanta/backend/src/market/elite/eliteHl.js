// E4-HL (12/11/2026) — DANH MỤC ELITE HL: danh mục chính thức dựng trên quy tắc Hợp lưu đa yếu tố HL-v1 của chủ dự án
// (thay danh mục E3 "dòng tiền"; danh mục cũ vẫn dựng song song để so sánh). Hàm thuần — có test.
//
// CHỌN MÃ (đúng HL-v1): tầng 1 (LS-v1 top 20% + ≥ 2/7 mô hình TA) -> tầng 2 (RRG ngành Cải thiện / Dẫn dắt ủng hộ) -> tầng 3 (tích điểm).
// CẤU TRÚC DANH MỤC — bộ tham số G2r chọn ở K0 (docs: Ho-so-360-v2/10_ELITE_HL_K0.md; mô phỏng 2020–2026 trên vũ trụ đúng thời điểm):
//   • MUA chỉ ở phiên cân bằng (phiên đầu mỗi tuần): mã Hợp lưu theo thứ tự xếp hạng, giao dịch được (GTGD TB20 ≥ 5 tỷ, giá ≥ 5.000đ,
//     giá không bị neo), tối đa 10 mã, tối đa 3 mã / ngành, tổng tỷ trọng một ngành ≤ 30%.
//   • ĐỊNH CỠ THEO RỦI RO lúc mua: w = 10% × σ_trung vị / σ_mã, kẹp [5%, 15%]; KHÔNG cân lại tỷ trọng mã đang giữ (K0: cân lại hằng
//     tuần làm xoay vòng 21 lần/năm và lỗ). Ô trống = TIỀN MẶT, không lấy mã yếu cho đủ số.
//   • BÁN xét MỖI PHIÊN, bán chậm: LS-v1 dưới phân vị 60, HOẶC không còn mô hình TA nào đạt, HOẶC ngành rơi vào góc Tụt hậu,
//     HOẶC mã không còn dữ liệu. Ngành Suy yếu chưa phải lý do bán (chỉ cảnh báo).
//     N0b (14/11/2026): mã thiếu LS-v1 của RIÊNG nó được coi là mất dữ liệu (giữ 1 phiên, vắng 2 phiên liên tiếp mới ra) — không còn bị
//     bán ngay như "LS < 60"; điều kiện RRG ngành vẫn xét ngay. Ngưỡng, tham số HL_PF và phiên bản không đổi.
// K0 KHÔNG cho thấy lợi thế so với thị trường (G2r 12,5%/năm so với VN-Index 13,5%, t ≈ 0) -> nhãn THĂM DÒ; sổ theo dõi tiến quyết định.
import { hlScores, HL_RULES, HL_TA_MODEL_COUNT, HL_VERSION } from "./confluence.js";

export const HL_PF_VERSION = "E4-HL v1 (G2r, 12/11/2026)";
export const HL_PF = Object.freeze({
  slots: 10, slotW: 0.1, wMin: 0.05, wMax: 0.15, wDust: 0.02, sectorCap: 0.3, maxPerSector: 3,
  minAdvBn: 5, minPrice: 5000, minSigma20: 0.005,
  exitLsPct: 60, exitTaMin: 1, exitRrg: -2, warnLsPct: 70,
  costBuy: 0.002, costSell: 0.0025, stopK: 2, targetK: 3, bandSessions: 20, sigmaFloor: 0.01, queue: 12,
  // N0 (12/11/2026) — CHỐT DỮ LIỆU: thiếu nguồn thì danh mục GIỮ NGUYÊN (không vào, không ra); mã vắng mặt phải vắng 2 phiên liên tiếp mới ra.
  guardMinShare: 0.35, guardMinTaPass: 5, missSessions: 2,
});
/** Ngưỡng tầng 1 của HL-v1 (chỉ để HIỂN THỊ — giao diện dựng câu chữ từ đây thay vì gõ cứng "top 20%", "≥ 2/7", "/10"). */
export const HL_TIER1 = Object.freeze({ lsLeaderPct: HL_RULES.lsLeaderPct, taMin: HL_RULES.taMin, taModels: HL_TA_MODEL_COUNT, maxScore: 5 + Math.min(5, HL_TA_MODEL_COUNT) });
const GUARD_SOURCES = { scanner: "Siêu quét", rrg: "RRG ngành", taxonomy: "phân ngành", "strategies:sepa": "SEPA", "strategies:patterns": "mô hình giá Pring", "strategies:convergence": "Hợp lưu v2", "strategies:base-breakout": "Base Breakout" };

/**
 * Kiểm tra bảng tín hiệu trước khi áp quy tắc ra / vào. Trả danh sách lý do (rỗng = đủ dữ liệu).
 * Lý do tồn tại: quy tắc ra dựa trên LS-v1 và số mô hình TA — một phiên lỗi nguồn sẽ làm MỌI mã "chạm ngưỡng ra".
 */
export function hlDataGuard({ panelRows, missingSources = [], hl }, cfg = HL_PF) {
  const why = [];
  for (const s of missingSources) if (GUARD_SOURCES[s]) why.push(`Thiếu nguồn ${GUARD_SOURCES[s]}`);
  const cnt = (k) => panelRows.filter((r) => fin(r.values?.[k])).length;
  // Độ phủ tối thiểu theo tỷ lệ bảng (bình thường ≈ 97%): dưới ngưỡng coi như nguồn hỏng.
  const need = Math.ceil(panelRows.length * cfg.guardMinShare);
  for (const [k, name] of [["ls_v1", "LS-v1"], ["structure_score", "Cấu trúc xu hướng"], ["rrg_quadrant", "RRG ngành"]]) {
    const n = cnt(k);
    if (n < need) why.push(`${name} chỉ có ${n}/${panelRows.length} mã (cần ≥ ${need})`);
  }
  const taPass = hl.filter((x) => x.taCount >= 2).length;
  if (taPass < cfg.guardMinTaPass) why.push(`Chỉ ${taPass} mã đạt ≥ 2 mô hình TA trên toàn bảng — nghi nguồn TA rỗng`);
  return why;
}
/** Kết quả K0 (cố định theo tệp 10_ELITE_HL_K0.md) — hiển thị cạnh danh mục để không ai hiểu nhầm là đã được chứng minh. */
export const HL_K0 = Object.freeze({
  period: "28/07/2020 → 05/11/2026", cagr: 0.125, vol: 0.199, maxDd: -0.468, turnover: 6.9, excess20: -0.0002, t: -0.02,
  vnIndexCagr: 0.135, equalWeightCagr: 0.109,
  noteVi: "Mô phỏng khám phá (K0) với 5 mô hình TA đại diện tính từ giá, có phí và mã tăng sát trần không mua được: 12,5%/năm, sụt giảm lớn nhất −46,8%, xoay vòng 6,9 lần/năm — NGANG thị trường (VN-Index 13,5%/năm; bình quân đều 300 mã 10,9%/năm), chênh lệch không có ý nghĩa thống kê (t ≈ 0).",
});
const RRG_VI = { 2: "Dẫn dắt", 1: "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2) : null; };

/** Tuần ISO (năm-tuần) của một ngày yyyy-mm-dd — phiên đầu của tuần mới là phiên cân bằng. */
export function isoWeek(date) {
  const d = new Date(`${date}T00:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear(), w = 1 + Math.round((d - Date.UTC(y, 0, 4)) / 604_800_000);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
export const isRebalanceSession = (date, prevDate) => !prevDate || isoWeek(date) !== isoWeek(prevDate);

/** Mã giao dịch được cho Elite HL (ngưỡng thanh khoản riêng 5 tỷ). */
export function hlTradable(score, cfg = HL_PF) {
  if (!score || !(score.close > 0)) return "không có giá";
  if (!(score.advBn >= cfg.minAdvBn)) return `GTGD TB20 < ${cfg.minAdvBn} tỷ`;
  if (score.close < cfg.minPrice) return `giá < ${cfg.minPrice.toLocaleString("vi-VN")}đ`;
  if (!(score.sigma20 >= cfg.minSigma20)) return "giá bị neo (σ20 < 0,5%/ngày)";
  return null;
}

/** Lý do bán của một mã đang giữ theo G2r; null = giữ. */
/**
 * N0b (14/11/2026) — mã CÓ trong bảng và có giá nhưng KHÔNG có điểm LS-v1 của riêng nó ở phiên này (LS-v1 cần ≥ 4/5 thành phần;
 * thiếu lịch sử giá, tạm ngừng giao dịch, lỗi nguồn của riêng mã…). Đây là THIẾU DỮ LIỆU, không phải "sức mạnh dẫn dắt suy yếu":
 * trước đây điều kiện `lsPct == null` rơi vào nhánh bán "ls" và mã bị bán ngay trong phiên, với lý do sai ("xuống phân vị —").
 * Chốt dữ liệu toàn bảng (hlDataGuard) không bắt được trường hợp này vì độ phủ cả bảng vẫn bình thường.
 */
export const hlLsGap = (h) => Boolean(h) && h.lsPct == null;

export function exitReason(h, score, cfg = HL_PF) {
  if (!h || !score || !(score.close > 0)) return { code: "no_data", reasonVi: "Không còn trong bảng tín hiệu hoặc không có giá" };
  // Thiếu LS-v1 của riêng mã -> cùng nhóm "mất dữ liệu": đi qua bộ đếm vắng mặt (missSessions) thay vì bán ngay.
  // Điều kiện TA cũng hoãn (các cột TA của mã mặc định 0 khi thiếu dữ liệu nên không phân biệt được "0 mô hình đạt" với "không có số").
  // Điều kiện RRG là dữ liệu của NGÀNH, không phụ thuộc dữ liệu của mã -> vẫn xét ngay.
  if (hlLsGap(h) && h.rrg != null && h.rrg <= cfg.exitRrg) return { code: "rrg", reasonVi: "Ngành rơi vào góc Tụt hậu trên RRG" };
  if (hlLsGap(h)) return { code: "no_data", reasonVi: `Không có điểm LS-v1 của mã ${cfg.missSessions} phiên liên tiếp` };
  if (h.lsPct < cfg.exitLsPct) return { code: "ls", reasonVi: `Sức mạnh dẫn dắt LS-v1 xuống phân vị ${Math.round(h.lsPct)} (ngưỡng bán < ${cfg.exitLsPct})` };
  if (h.taCount < cfg.exitTaMin) return { code: "ta", reasonVi: "Không còn mô hình TA nào đạt" };
  if (h.rrg != null && h.rrg <= cfg.exitRrg) return { code: "rrg", reasonVi: "Ngành rơi vào góc Tụt hậu trên RRG" };
  return null;
}
const warnings = (h, cfg) => {
  const w = [];
  if (h.lsPct != null && h.lsPct < cfg.warnLsPct) w.push(`LS-v1 phân vị ${Math.round(h.lsPct)} — cách ngưỡng bán ${Math.round(h.lsPct - cfg.exitLsPct)} điểm`);
  if (h.taCount === cfg.exitTaMin) w.push("Chỉ còn 1 mô hình TA đạt");
  if (h.rrg === -1) w.push("Ngành chuyển sang Suy yếu");
  return w;
};

/**
 * Dựng danh mục Elite HL của một phiên.
 * @param panelRows  bảng tín hiệu E1 (rows) của phiên
 * @param scores     bảng điểm E3 của phiên: [{ ticker, Z, rank, close, advBn, sigma20, sectorKey, alpha5Pct, pOutperform, … }]
 * @param prev       danh mục HL đã khoá của phiên liền trước: [{ ticker, weight, since }]
 * @param rebalance  true = phiên cân bằng (được mua mới)
 */
export function buildHlPortfolio({ panelRows, scores, prev = [], rebalance = true, date, cfg = HL_PF, missingSources = [] }) {
  const hl = hlScores(panelRows), hlBy = new Map(hl.map((x) => [x.ticker, x])), scBy = new Map(scores.map((x) => [x.ticker, x]));
  const guardWhy = hlDataGuard({ panelRows, missingSources, hl }, cfg), frozen = guardWhy.length > 0;
  if (frozen) rebalance = false;
  const tradable = hl.filter((x) => !hlTradable(scBy.get(x.ticker), cfg));
  const sigMed = median(tradable.map((x) => scBy.get(x.ticker).sigma20)) ?? 0.02;
  const selected = hl.filter((x) => x.cls === "STRONG" || x.cls === "CONFLUENCE");

  // 1) Mã đang giữ: bán (lý do) hoặc giữ nguyên tỷ trọng.
  const exits = [], held = [];
  for (const p of prev) {
    const h = hlBy.get(p.ticker), sc = scBy.get(p.ticker);
    let why = frozen ? null : exitReason(h, sc, cfg);
    // Mã vắng mặt (không có trong bảng / không có giá / không có LS-v1 của riêng mã): chỉ ra khi vắng đủ `missSessions` phiên liên tiếp.
    const lsGap = hlLsGap(h);
    const miss = !h || !sc || !(sc.close > 0) || lsGap ? (p.miss ?? 0) + 1 : 0;
    if (why?.code === "no_data" && miss < cfg.missSessions) why = null;
    if (!why) { held.push({ ticker: p.ticker, weight: p.weight, since: p.since ?? null, ref: p.ref ?? null, status: "HOLD", miss, lsGap }); continue; }
    if (why) exits.push({ ticker: p.ticker, weight: r4(p.weight), since: p.since ?? null, ...why, hlRank: h?.rank ?? null, lsPct: r4(h?.lsPct), taCount: h?.taCount ?? null, rrg: h?.rrg ?? null });
  }
  // 2) Phiên cân bằng: mua mã Hợp lưu theo thứ tự xếp hạng, định cỡ theo rủi ro, trong giới hạn tiền mặt / ngành.
  const picks = [...held], inSet = new Set(picks.map((x) => x.ticker)), queue = [];
  const secOf = (t) => scBy.get(t)?.sectorKey ?? "?";
  const secN = {}, secW = {}; let used = 0;
  for (const x of picks) { const s = secOf(x.ticker); secN[s] = (secN[s] ?? 0) + 1; secW[s] = (secW[s] ?? 0) + x.weight; used += x.weight; }
  const push = (x, code, reasonVi) => { if (queue.length < cfg.queue) queue.push({ ticker: x.ticker, hlRank: x.rank, cls: x.cls, t1: x.t1, t2: x.t2, t3: x.t3, lsPct: r4(x.lsPct), taCount: x.taCount, rrg: x.rrg, sectorKey: secOf(x.ticker), advBn: r4(scBy.get(x.ticker)?.advBn), code, reasonVi }); };
  for (const x of frozen ? [] : selected) {
    if (inSet.has(x.ticker)) continue;
    const sc = scBy.get(x.ticker), bad = hlTradable(sc, cfg), s = secOf(x.ticker);
    if (bad) { push(x, "illiquid", `Chưa giao dịch được: ${bad}`); continue; }
    if (!rebalance) { push(x, "wait", "Chờ phiên cân bằng đầu tuần kế tiếp"); continue; }
    if (picks.length >= cfg.slots) { push(x, "full", `Danh mục đã đủ ${cfg.slots} mã`); continue; }
    if ((secN[s] ?? 0) >= cfg.maxPerSector) { push(x, "sector_cap", `Ngành đã đủ ${cfg.maxPerSector} mã`); continue; }
    let w = Math.max(cfg.wMin, Math.min(cfg.wMax, cfg.slotW * sigMed / Math.max(sc.sigma20, cfg.sigmaFloor)));
    w = Math.min(w, 1 - used, cfg.sectorCap - (secW[s] ?? 0));
    if (!(w >= cfg.wDust)) { push(x, "no_room", (secW[s] ?? 0) >= cfg.sectorCap - cfg.wDust ? `Ngành đã chạm trần ${cfg.sectorCap * 100}% tỷ trọng` : "Hết tiền mặt"); continue; }
    picks.push({ ticker: x.ticker, weight: w, since: date, ref: sc.close ?? null, status: "NEW" }); inSet.add(x.ticker);
    secN[s] = (secN[s] ?? 0) + 1; secW[s] = (secW[s] ?? 0) + w; used += w;
  }
  // 3) Dòng danh mục (giữ hình dạng danh mục E3 để mọi nơi đang đọc `portfolio` tiếp tục chạy) + chi tiết HL.
  const riskRaw = picks.map((x) => x.weight * Math.max(scBy.get(x.ticker)?.sigma20 ?? 0, cfg.sigmaFloor)), riskSum = riskRaw.reduce((a, b) => a + b, 0);
  const band = (sig) => Math.max(sig ?? 0, cfg.sigmaFloor) * Math.sqrt(cfg.bandSessions);
  const portfolio = picks.map((x, i) => {
    const sc = scBy.get(x.ticker) ?? {}, h = hlBy.get(x.ticker) ?? { rank: 9999, cls: "NOT_T1", t1: 0, t2: 0, t3: 0, lsPct: null, lsPts: 0, taCount: 0, taPts: 0, rrg: null };
    const miss = x.miss ?? 0;
    return {
      ticker: x.ticker, weight: r4(x.weight), Z: sc.Z ?? null, rank: sc.rank ?? null, alpha5Pct: sc.alpha5Pct ?? null, pOutperform: sc.pOutperform ?? null, sectorKey: sc.sectorKey ?? null,
      ...(sc.zModel !== undefined ? { zModel: sc.zModel, rrgQuadrant: sc.rrgQuadrant ?? null, rrgPenalty: Boolean(sc.rrgPenalty) } : {}),
      close: sc.close ?? null, stop: sc.close ? sc.close * (1 - cfg.stopK * band(sc.sigma20)) : null, target: sc.close ? sc.close * (1 + cfg.targetK * band(sc.sigma20)) : null,
      holdSessions: null, retained: x.status === "HOLD", riskContribution: riskSum > 0 ? riskRaw[i] / riskSum : null,
      hl: { rank: h.rank, cls: h.cls, t1: h.t1, t2: h.t2, t3: h.t3, lsPct: r4(h.lsPct), lsPts: h.lsPts, taCount: h.taCount, taPts: h.taPts, rrg: h.rrg, status: x.status, since: x.since, advBn: r4(sc.advBn), sigma20: r4(sc.sigma20), exitBufferLs: h.lsPct == null ? null : r4(h.lsPct - cfg.exitLsPct), miss,
        // N2 "Vì sao": điều kiện tầng 1, phiếu tầng 3, giá tham chiếu phiên khoá và lãi/lỗ từ phiên khoá (giá đóng cửa điều chỉnh).
        ta: h.ta ?? null, votes: h.votes ?? null, ref: x.ref ?? null, sinceRet: x.ref > 0 && sc.close > 0 ? r4(sc.close / x.ref - 1) : null,
        warnings: frozen ? ["Dữ liệu phiên không đủ — giữ nguyên, chưa xét ngưỡng ra"] : miss > 0 ? [x.lsGap ? `Không có điểm LS-v1 của mã phiên này (lần ${miss}/${cfg.missSessions}) — giữ nguyên, chưa xét ngưỡng LS và TA` : `Không có dữ liệu của mã phiên này (lần ${miss}/${cfg.missSessions}) — chưa ra`] : warnings(h, cfg) },
    };
  }).sort((a, b) => a.hl.rank - b.hl.rank);
  const invested = portfolio.reduce((a, x) => a + x.weight, 0);
  const prevW = new Map(prev.map((p) => [p.ticker, p.weight]));
  const buys = picks.filter((x) => x.status === "NEW").reduce((a, x) => a + x.weight, 0), sells = exits.reduce((a, x) => a + (prevW.get(x.ticker) ?? 0), 0);
  const sectors = Object.entries(secW).map(([sectorKey, w]) => ({ sectorKey, weight: r4(w), names: secN[sectorKey] })).sort((a, b) => b.weight - a.weight);
  return {
    portfolio,
    hl: {
      version: HL_PF_VERSION, ruleVersion: HL_VERSION, rule: cfg, tier1: HL_TIER1, k0: HL_K0, date, rebalance, week: isoWeek(date),
      dataGuard: { frozen, reasonsVi: guardWhy },
      funnel: { panel: panelRows.length, tradable: tradable.length, tier1: hl.filter((x) => x.pass1).length, selected: selected.length, selectedTradable: selected.filter((x) => !hlTradable(scBy.get(x.ticker), cfg)).length, held: portfolio.length },
      invested: r4(invested), cash: r4(1 - invested), sigmaMedian: r4(sigMed),
      changes: { added: picks.filter((x) => x.status === "NEW").map((x) => x.ticker), exits, kept: held.length, turnover: r4((buys + sells) / 2), costEst: r4(buys * cfg.costBuy + sells * cfg.costSell) },
      sectors, queue,
      against: hl.filter((x) => x.cls === "T1_SECTOR_AGAINST").slice(0, 8).map((x) => ({ ticker: x.ticker, hlRank: x.rank, t1: x.t1, rrg: x.rrg, rrgVi: RRG_VI[x.rrg] ?? null })),
      labelVi: "THĂM DÒ — quy tắc chọn do chủ dự án đặt; K0 cho kết quả ngang thị trường; hiệu quả thật đo bằng sổ theo dõi tiến.",
    },
  };
}
