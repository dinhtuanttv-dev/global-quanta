// E4-HL v1.1 (21/11/2026) — NÂNG CẤP TRỰC TIẾP danh mục Elite HL (docs: Ho-so-360-v2/21 + 22). Lớp BỌC NGOÀI, hàm thuần, có test.
//
// KHÔNG sửa `buildHlPortfolio`, `exitReason`, `HL_PF`, HL-v1 (`hlScores`) hay PZ-v2: mọi nâng cấp chỉ biến đổi BẢN SAO đầu vào, gọi lại
// hàm gốc, rồi ghi chú đầu ra. Khi không có sự kiện nào của U1–U3, đầu ra trùng hàm gốc (trừ chuỗi phiên bản và trường mô tả mới).
//
//   U0 · NHỊP 2,5–3 PHIÊN: hai phiên cân bằng mỗi tuần — phiên đầu tiên của nửa tuần A (thứ Hai → thứ Tư) và của nửa tuần B (thứ Năm →
//        thứ Sáu). Thứ Hai → thứ Năm = 3 phiên, thứ Năm → thứ Hai = 2 phiên (bình quân 2,5). Chỉ CHIỀU MUA đổi nhịp; chiều bán vẫn xét
//        mỗi phiên như cũ. Tỷ trọng mã đang giữ vẫn KHÔNG cân lại (K0: cân lại làm xoay vòng 21 lần/năm và lỗ).
//   U1 · XÁC NHẬN RRG NGÀNH: lệnh bán "ngành rơi vào góc Tụt hậu" chỉ có hiệu lực khi ngành Tụt hậu ở ≥ 2 TUẦN ĐÃ ĐÓNG liên tiếp
//        (≤ phiên đang dựng). Chưa xác nhận -> bản sao bảng tín hiệu ghi Suy yếu (−1) cho ngành đó: theo HL-v1, Suy yếu và Tụt hậu cùng
//        điểm tầng 2 (−1) nên chiều mua KHÔNG đổi; chỉ lệnh bán hàng loạt theo ngành do nhiễu quanh mốc 100 bị hoãn. Luật bán theo từng
//        mã (LS-v1 < 60, hết mô hình TA, mất dữ liệu) giữ nguyên mỗi phiên.
//   U2 · MUA BÙ NGAY: phiên KHÔNG phải phiên cân bằng mà có lệnh bán -> mua bù trong cùng phiên đúng số ô vừa trống, từ hàng chờ, qua
//        mọi điều kiện cũ (thanh khoản, ≤ 3 mã / ngành, ≤ 30% / ngành, định cỡ theo rủi ro, tiền mặt còn lại).
//   U3 · CẦU DAO PHÁP LÝ (KS-A): sự kiện CHÍNH THỨC VNDirect (diện cảnh báo, diện kiểm soát, hạn chế / tạm ngừng giao dịch, huỷ niêm yết,
//        ngày giao dịch cuối) -> KHÔNG mua mới, cảnh báo đỏ cho mã đang giữ (KHÔNG tự bán — người quyết định xác nhận). Không đủ điều kiện
//        ký quỹ, nhắc nhở công bố thông tin -> cảnh báo vàng. Chặn mua đi qua cổng có sẵn của hàm gốc (`gate` + `zoneBy`), không đánh dấu
//        mã "không giao dịch được" (việc đó làm đổi σ trung vị dùng để định cỡ).
//   U4 · CHẠY LÃI (chỉ mô tả): mã đang giữ có lãi từ phiên khoá ≥ 8% -> trường `hl.runner`; không đổi lệnh.
//
// Mọi ngưỡng là "khởi điểm", CHƯA kiểm định trên lịch sử -> nhãn THĂM DÒ giữ nguyên; hiệu quả đo bằng sổ theo dõi tiến của phiên bản này.
import { buildHlPortfolio, HL_PF, isoWeek } from "./eliteHl.js";
import { icbFor } from "./signalRegistry.js";

// Giữ tiền tố "E4-HL v1" (test dịch vụ cũ và giao diện nhận diện sổ HL theo tiền tố "E4-HL"). Sổ v1 lưu trữ ở `elite:ledger:archive:E4-HL`
// (khoá lấy từ chữ đầu của phiên bản) — LẦN ĐỔI PHIÊN BẢN SAU phải đổi cách đặt khoá lưu trữ, nếu không bản lưu v1 bị ghi đè.
export const HL_V11_VERSION = "E4-HL v1.1 (G2r + U0–U4, 21/11/2026)";
export const HL_V11 = Object.freeze({
  cadence: "half-week", rrgConfirmWeeks: 2, refill: true,
  legalRedDays: 180, legalNoticeDays: 30, runnerMinRet: 0.08,
});
const RED_CATS = new Set(["WARNING", "CONTROL", "HALT", "DELIST", "LAST_TRADE"]);
const RRG_OF = { LEADING: 2, IMPROVING: 1, WEAKENING: -1, LAGGING: -2 };
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Nửa tuần của một phiên: "<tuần ISO>-A" (thứ Hai → thứ Tư) hoặc "-B" (thứ Năm → thứ Sáu). */
export function halfWeek(date) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${isoWeek(date)}-${dow >= 4 || dow === 0 ? "B" : "A"}`;
}
/** U0: phiên cân bằng = chưa có phiên cân bằng nào (đã khoá, trước phiên này) trong cùng nửa tuần. */
export function isRebalanceV11(date, entries = []) {
  const h = halfWeek(date);
  return !entries.some((e) => e.date < date && e.rebalance && !e.frozen && halfWeek(e.date) === h);
}

/** U1: các tuần đã đóng của một ngành tính tới phiên `date` (point-in-time). */
function closedWeeks(sector, date, closedThrough) {
  const cut = closedThrough && closedThrough < date ? closedThrough : date;
  return (sector?.tail ?? []).filter((p) => p?.date && p.date <= cut).sort((a, b) => (a.date < b.date ? -1 : 1));
}
/** U1: ngành Tụt hậu đã được xác nhận (≥ n tuần đã đóng liên tiếp) chưa. null = không đủ dữ liệu (giữ hành vi gốc). */
export function rrgLaggingConfirmed(sector, date, closedThrough, n = HL_V11.rrgConfirmWeeks) {
  const w = closedWeeks(sector, date, closedThrough);
  if (w.length < n) return null;
  return w.slice(-n).every((p) => RRG_OF[p.quadrant] === -2);
}

/** U3: trạng thái pháp lý của từng mã tại phiên `date` từ sự kiện STATUS chính thức. Map(mã -> { level, labelVi, date, title }). */
export function legalStatus(events = [], date, cfg = HL_V11) {
  const out = new Map(), marginOk = new Map();
  const st = events.filter((e) => e?.group === "STATUS" && e.t && (e.date ?? e.disclosed) && (e.date ?? e.disclosed) <= date);
  for (const e of st) if (e.cat === "MARGIN_OK") { const d = e.date ?? e.disclosed; if (!marginOk.has(e.t) || marginOk.get(e.t) < d) marginOk.set(e.t, d); }
  const sorted = [...st].sort((a, b) => ((a.date ?? a.disclosed) < (b.date ?? b.disclosed) ? -1 : 1));
  for (const e of sorted) {
    const d = e.date ?? e.disclosed;
    let level = null;
    if (RED_CATS.has(e.cat) && d >= addDays(date, -cfg.legalRedDays)) level = "red";
    else if (e.cat === "NO_MARGIN" && !(marginOk.get(e.t) > d)) level = "yellow";
    else if (e.cat === "NOTICE" && d >= addDays(date, -cfg.legalNoticeDays)) level = "yellow";
    if (!level) continue;
    const cur = out.get(e.t);
    if (!cur || cur.level !== "red" || level === "red") out.set(e.t, { level, labelVi: e.label ?? e.cat, date: d, title: e.title ?? null });
  }
  return out;
}

/**
 * Dựng danh mục Elite HL bản E4-HL v1.1. Tham số giống `buildHlPortfolio`, cộng `ctx`:
 * @param {object} args          như buildHlPortfolio; `rebalance` = nhịp tuần cũ (chỉ để ghi dòng đối chiếu v1)
 * @param {object} ctx
 * @param {Array}  ctx.entries   bản ghi đã khoá của sổ (để xác định nửa tuần đã cân bằng chưa)
 * @param {object} ctx.rrg       tài liệu RRG ngành (KV sectors:rrg): { sectors: [{ code, tail }], closedThrough }
 * @param {object} ctx.taxonomy  phân ngành ICB: { symbols: { [mã]: { l1, l2, l3 } } }
 * @param {Array}  ctx.events    sự kiện doanh nghiệp đã chuẩn hoá (corpEvents)
 */
export function buildHlPortfolioV11(args, ctx = {}, opts = HL_V11) {
  const { date, panelRows, prev = [], rebalance: weeklyRebalance = true } = args;
  const notes = [];

  // U1 — bản sao bảng tín hiệu: Tụt hậu chưa xác nhận -> Suy yếu.
  const pending = new Map(); // mã -> mã ngành chờ xác nhận
  const sectors = ctx.rrg?.sectors ?? null, symbols = ctx.taxonomy?.symbols ?? null;
  let rows = panelRows;
  if (sectors && symbols) {
    const byCode = new Map(sectors.map((s) => [s.code, s])), codes = new Set(byCode.keys()), memo = new Map();
    rows = panelRows.map((r) => {
      if (r.values?.rrg_quadrant !== -2) return r;
      const code = icbFor(symbols, r.ticker, codes);
      if (!code) return r;
      if (!memo.has(code)) memo.set(code, rrgLaggingConfirmed(byCode.get(code), date, ctx.rrg.closedThrough, opts.rrgConfirmWeeks));
      if (memo.get(code) !== false) return r; // đã xác nhận, hoặc không đủ tuần -> giữ nguyên hành vi gốc
      pending.set(r.ticker, code);
      return { ...r, values: { ...r.values, rrg_quadrant: -1 } };
    });
  } else notes.push("U1 tắt phiên này: thiếu tài liệu RRG ngành hoặc phân ngành — dùng luật gốc");

  // U3 — cầu dao pháp lý: chặn mua mới qua cổng có sẵn (gate + zoneBy).
  const legal = legalStatus(ctx.events ?? [], date, opts);
  const red = new Set([...legal].filter(([, v]) => v.level === "red").map(([t]) => t));
  const heldSet = new Set(prev.map((p) => p.ticker));
  const blockBuy = [...red].filter((t) => !heldSet.has(t));
  let gate = args.gate, zoneBy = args.zoneBy;
  if (blockBuy.length) {
    const base = args.gate && args.zoneBy ? args.zoneBy : null;
    zoneBy = new Map(panelRows.map((r) => [r.ticker, base ? base.get(r.ticker) ?? "UNKNOWN" : "BUY_ZONE"]));
    for (const t of blockBuy) zoneBy.set(t, "UNKNOWN");
    gate = true;
  }

  // U0 + U2 — nhịp mua.
  const cadence = isRebalanceV11(date, ctx.entries ?? []);
  const core = (rebalance, cfg = args.cfg ?? HL_PF) => buildHlPortfolio({ ...args, panelRows: rows, rebalance, gate, zoneBy, cfg });
  let H = core(cadence), refill = null;
  if (!cadence && opts.refill && !H.hl.dataGuard.frozen && H.hl.changes.exits.length) {
    const cfg0 = args.cfg ?? HL_PF, freed = H.hl.changes.exits.length;
    const slots = Math.min(cfg0.slots, H.portfolio.length + freed);
    const H2 = core(true, { ...cfg0, slots });
    refill = { freed, bought: H2.hl.changes.added.length, slots, reasonVi: `Mua bù ${H2.hl.changes.added.length}/${freed} ô vừa trống trong phiên (U2)` };
    H = H2;
    H.hl.rule = cfg0;
    for (const q of H.hl.queue) if (q.code === "full") { q.code = "wait"; q.reasonVi = "Đã mua bù đủ số ô vừa trống — chờ phiên cân bằng kế tiếp"; }
  }
  if (!H.hl.rebalance) for (const q of H.hl.queue) if (q.code === "wait") q.reasonVi = "Chờ phiên cân bằng kế tiếp (thứ Hai hoặc thứ Năm)";

  // Ghi chú đầu ra: khôi phục góc RRG thật cho mã đang chờ xác nhận, cảnh báo pháp lý, chạy lãi.
  for (const x of H.portfolio) {
    const code = pending.get(x.ticker);
    if (code) {
      x.hl.rrg = -2;
      x.hl.warnings = [...x.hl.warnings.filter((w) => w !== "Ngành chuyển sang Suy yếu"), `Ngành ${code} vào Tụt hậu nhưng chưa đủ ${opts.rrgConfirmWeeks} tuần đã đóng liên tiếp — chưa bán theo ngành (U1)`];
      x.hl.rrgPending = { code, weeks: opts.rrgConfirmWeeks };
    }
    const lg = legal.get(x.ticker);
    if (lg) {
      x.hl.legal = lg;
      x.hl.warnings = [...x.hl.warnings, lg.level === "red"
        ? `Sự kiện pháp lý: ${lg.labelVi} (${lg.date}, VNDirect) — không mua thêm; người quyết định xem xét bán (U3)`
        : `Lưu ý: ${lg.labelVi} (${lg.date}, VNDirect) (U3)`];
    }
    const ret = x.hl.sinceRet;
    if (fin(ret) && ret >= opts.runnerMinRet) x.hl.runner = { sinceRet: ret, minRet: opts.runnerMinRet };
  }
  for (const q of H.hl.queue) {
    if (blockBuy.includes(q.ticker)) { const lg = legal.get(q.ticker); q.code = "legal_block"; q.reasonVi = `Sự kiện pháp lý: ${lg.labelVi} (${lg.date}, VNDirect) — không mua (U3)`; q.legal = lg; }
    else if (legal.get(q.ticker)) q.legal = legal.get(q.ticker);
  }
  for (const a of H.hl.against ?? []) if (pending.has(a.ticker)) { a.rrg = -2; a.rrgVi = "Tụt hậu (chưa xác nhận)"; }

  // Dòng đối chiếu v1 (không phải sổ): cùng danh mục phiên trước, luật E4-HL v1 nguyên bản hôm nay khác gì.
  let v1Diff = null;
  try {
    const V1 = buildHlPortfolio({ ...args, rebalance: weeklyRebalance });
    const a = new Set(V1.portfolio.map((x) => x.ticker)), b = new Set(H.portfolio.map((x) => x.ticker));
    v1Diff = {
      onlyV1: [...a].filter((t) => !b.has(t)), onlyV11: [...b].filter((t) => !a.has(t)),
      v1Exits: V1.hl.changes.exits.map((e) => `${e.ticker}:${e.code}`), v1Added: V1.hl.changes.added, v1Cash: V1.hl.cash,
      noteVi: "Cùng danh mục phiên trước, áp luật E4-HL v1 cho riêng phiên này — chỉ để tra cứu, không phải sổ theo dõi.",
    };
  } catch { /* đối chiếu không được thì bỏ qua, không ảnh hưởng danh mục */ }

  H.hl.version = HL_V11_VERSION;
  H.hl.rebalance = (cadence && !H.hl.dataGuard.frozen) || Boolean(refill?.bought);
  H.hl.upgrade = {
    version: HL_V11_VERSION, rules: opts, cadence: { session: cadence, halfWeek: halfWeek(date), refill },
    rrgPending: [...new Set(pending.values())], legal: Object.fromEntries([...legal].filter(([t]) => heldSet.has(t) || H.hl.queue.some((q) => q.ticker === t))),
    legalBlocked: blockBuy.filter((t) => H.hl.queue.some((q) => q.ticker === t)), notes, v1Diff,
    labelVi: "THĂM DÒ — U0–U4 là thay đổi của chủ dự án, ngưỡng khởi điểm chưa kiểm định; hiệu quả đo bằng sổ theo dõi tiến của E4-HL v1.1.",
  };
  return H;
}
