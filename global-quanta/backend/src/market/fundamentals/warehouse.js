// P3 (11/11/2026) — FW-v1: KHO BCTC QUÝ HỢP NHẤT nhiều nguồn + NGÀY CÔNG BỐ THẬT (thay "hết quý + 45 ngày").
// Trước P3 có hai đường ống tách rời: KQKD / Bộ lọc dùng VNDirect (createdDate ≈ ngày công bố); SEPA / CAN SLIM dùng VCI (kho
// market_fundamentals) với độ trễ CỐ ĐỊNH 45 ngày -> ngày 06/11 SEPA vẫn dùng quý 2 dù 281/284 mã đã công bố quý 3.
// FW-v1 (hàm thuần + lớp nối nhẹ):
//   • Nguồn theo tầng: VNDirect (BCTC đủ 3 báo cáo, ngày tạo theo quý) > VCI (dự phòng). Mỗi CHỈ TIÊU lấy NGUYÊN chuỗi từ một nguồn
//     (VNDirect nếu có ≥ 5 quý số, không thì VCI) — không trộn nguồn trong một chuỗi (định nghĩa hai nguồn có thể khác -> tăng trưởng
//     cùng kỳ giả). Quý thiếu ở nguồn chính chỉ được vá bằng nguồn phụ khi hai nguồn KHỚP (≤ 1%) ở các quý trùng.
//   • Ngày dùng được (point-in-time) của mỗi quý = ngày sau ngày công bố sớm nhất đáng tin:
//       tin công bố BCTC của chính doanh nghiệp trên CafeF (lớp FILING, S8 — khớp 98% ngày tin chính thức) / ngày VNDirect tạo báo cáo KQKD;
//     chỉ nhận ngày trong (cuối quý, cuối quý + 120 ngày]. Không có -> ƯỚC TÍNH hết quý + 45 ngày (như cũ).
//     Lấy NGÀY SAU ngày công bố: BCTC thường ra sau giờ giao dịch -> dùng tại phiên đóng cửa cùng ngày là nhìn trước.
//   • Đối chiếu hai nguồn từng quý (doanh thu, LNST công ty mẹ): KHỚP ≤ 1% (hoặc lệch < 1 tỷ) / LỆCH / chỉ một nguồn.
// Đầu ra giữ dạng `fa` của VCI ({ income: { quarters }, balance: { quarters } }) + `availableAt` mỗi quý -> SEPA / CAN SLIM đổi tối thiểu.
export const FW_VERSION = "FW-v1 (2026-11-11)";
export const FW_SOURCE_NOTE = "Kho hợp nhất FW-v1: VNDirect > VCI · quý dùng được từ NGÀY SAU ngày công bố thật (CafeF / VNDirect), thiếu mới ước tính hết quý + 45 ngày";

const DAY = 86_400_000;
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const quarterEnd = (y, q) => iso(Date.UTC(y, q * 3, 0));
const addDays = (d, n) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY);
const daysBetween = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const yq = (fiscal) => { const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(fiscal)); if (!m) return null; const mo = Number(m[2]); return mo % 3 ? null : { year: Number(m[1]), quarter: mo / 3 }; };
const key = (y, q) => y * 4 + (q - 1);

// Tên chỉ tiêu dạng VCI <- tên chuẩn VNDirect (statementsVnd.js). Phải thu: phải thu khách hàng (doanh nghiệp), thiếu thì phải thu ngắn hạn.
const INCOME = { revenue: (v) => v.revenue, netProfit: (v) => v.npatParent, grossProfit: (v) => v.gross };
const BALANCE = { inventory: (v) => v.inventory, receivables: (v) => (fin(v.recvCust) ? v.recvCust : v.stRecv) };

/**
 * Ngày dùng được của một quý. `cafef` = { date, tier } (S8) hoặc null; `created` = ngày VNDirect tạo báo cáo KQKD quý.
 * @returns {{ availableAt: string, basis: "CAFEF"|"VND_CREATED"|"EST45", disclosed: string|null }}
 */
export function availability(fiscal, { cafef = null, created = null } = {}) {
  const ok = (d) => d && daysBetween(d.slice(0, 10), fiscal) > 0 && daysBetween(d.slice(0, 10), fiscal) <= 120;
  const cands = [];
  if (cafef?.tier === "FILING" && ok(cafef.date)) cands.push([cafef.date.slice(0, 10), "CAFEF"]);
  if (ok(created)) cands.push([created.slice(0, 10), "VND_CREATED"]);
  if (!cands.length) return { availableAt: addDays(fiscal, 45), basis: "EST45", disclosed: null };
  cands.sort((a, b) => a[0].localeCompare(b[0]));
  return { availableAt: addDays(cands[0][0], 1), basis: cands[0][1], disclosed: cands[0][0] };
}

/** So hai số: KHỚP nếu lệch tương đối ≤ tol hoặc lệch tuyệt đối < absTol (đồng). */
export function agree(a, b, { tol = 0.01, absTol = 1e9 } = {}) {
  if (!fin(a) || !fin(b)) return null;
  const d = Math.abs(a - b);
  return d < absTol || d / Math.max(Math.abs(a), Math.abs(b)) <= tol;
}

/** VNDirect rec ({ tpl, quarters: [{ fiscal, created, v }] }) -> Map(key -> { year, quarter, fiscal, created, inc: {...}, bal: {...} }). */
export function fromVnd(rec) {
  const out = new Map();
  for (const q of rec?.quarters ?? []) {
    const p = yq(q.fiscal); if (!p || !q.v) continue;
    const inc = {}, bal = {};
    for (const [k, f] of Object.entries(INCOME)) { const x = f(q.v); if (fin(x)) inc[k] = x; }
    for (const [k, f] of Object.entries(BALANCE)) { const x = f(q.v); if (fin(x)) bal[k] = x; }
    out.set(key(p.year, p.quarter), { ...p, fiscal: quarterEnd(p.year, p.quarter), created: q.created ?? null, inc, bal });
  }
  return out;
}
/** VCI fa -> cùng dạng. */
export function fromVci(fa) {
  const out = new Map();
  const put = (rows, part, names) => {
    for (const r of rows ?? []) {
      if (!Number.isInteger(r?.year) || !(r.quarter >= 1 && r.quarter <= 4)) continue;
      const k = key(r.year, r.quarter), o = out.get(k) ?? { year: r.year, quarter: r.quarter, fiscal: quarterEnd(r.year, r.quarter), created: null, inc: {}, bal: {} };
      for (const n of names) if (fin(r[n])) o[part][n] = r[n];
      out.set(k, o);
    }
  };
  put(fa?.income?.quarters, "inc", Object.keys(INCOME));
  put(fa?.balance?.quarters, "bal", Object.keys(BALANCE));
  return out;
}

/** Đối chiếu từng quý trùng (doanh thu, LNST mẹ). */
export function reconcile(vnd, vci, { fields = ["revenue", "netProfit"] } = {}) {
  const rows = [];
  for (const k of [...new Set([...vnd.keys(), ...vci.keys()])].sort((a, b) => a - b)) {
    const a = vnd.get(k), b = vci.get(k);
    for (const f of fields) {
      const x = a?.inc?.[f], y = b?.inc?.[f];
      if (!fin(x) && !fin(y)) continue;
      const status = !fin(y) ? "VND_ONLY" : !fin(x) ? "VCI_ONLY" : agree(x, y) ? "AGREE" : "DIFF";
      rows.push({ fiscal: (a ?? b).fiscal, field: f, vnd: x ?? null, vci: y ?? null, diff: fin(x) && fin(y) && y !== 0 ? Math.round((x / y - 1) * 1e4) / 1e4 : null, status });
    }
  }
  const both = rows.filter((r) => r.status === "AGREE" || r.status === "DIFF");
  return { rows, overlap: both.length, agreeRate: both.length ? Math.round((both.filter((r) => r.status === "AGREE").length / both.length) * 1e4) / 1e4 : null };
}

/**
 * Hợp nhất -> `fa` dạng VCI + availableAt mỗi quý. `cafefDates`: Map(fiscal -> { date, tier }) (S8). Ưu tiên VNDirect theo từng chỉ tiêu.
 * @returns {{ fa: object, meta: { version, sources: Record<string,"VND"|"VCI">, basis: Record<string, number>, recon: object, patched: number } }}
 */
export function mergeFundamentals({ vndRec = null, vciFa = null, cafefDates = null, minQuarters = 5 } = {}) {
  const vnd = fromVnd(vndRec), vci = fromVci(vciFa);
  const recon = reconcile(vnd, vci);
  const keys = [...new Set([...vnd.keys(), ...vci.keys()])].sort((a, b) => a - b);
  const count = (m, part, f) => [...m.values()].filter((o) => fin(o[part][f])).length;
  const sources = {}; let patched = 0;
  const pick = {}; // chỉ tiêu -> [nguồn chính, nguồn phụ được vá]
  for (const [part, names] of [["inc", Object.keys(INCOME)], ["bal", Object.keys(BALANCE)]]) {
    for (const f of names) {
      const nv = count(vnd, part, f), nc = count(vci, part, f);
      const main = nv >= minQuarters ? "VND" : nc >= minQuarters ? "VCI" : nv >= nc ? "VND" : "VCI";
      sources[f] = main;
      // Vá quý thiếu bằng nguồn kia chỉ khi các quý trùng KHỚP hết (≥ 2 quý trùng).
      const A = main === "VND" ? vnd : vci, B = main === "VND" ? vci : vnd;
      const overlap = keys.filter((k) => fin(A.get(k)?.[part]?.[f]) && fin(B.get(k)?.[part]?.[f]));
      const canPatch = overlap.length >= 2 && overlap.every((k) => agree(A.get(k)[part][f], B.get(k)[part][f]));
      pick[f] = { part, A, B: canPatch ? B : null };
    }
  }
  const income = [], balance = [], basis = { CAFEF: 0, VND_CREATED: 0, EST45: 0 };
  for (const k of keys) {
    const y = Math.floor(k / 4), q = (k % 4) + 1, fiscal = quarterEnd(y, q);
    const av = availability(fiscal, { cafef: cafefDates?.get?.(fiscal) ?? null, created: vnd.get(k)?.created ?? null });
    const iRow = { year: y, quarter: q, availableAt: av.availableAt, availBasis: av.basis, disclosed: av.disclosed }, bRow = { year: y, quarter: q, availableAt: av.availableAt, availBasis: av.basis };
    let anyI = false, anyB = false;
    for (const [f, { part, A, B }] of Object.entries(pick)) {
      let x = A.get(k)?.[part]?.[f];
      if (!fin(x) && B) { x = B.get(k)?.[part]?.[f]; if (fin(x)) patched++; }
      if (!fin(x)) continue;
      if (part === "inc") { iRow[f] = x; anyI = true; } else { bRow[f] = x; anyB = true; }
    }
    if (anyI) { income.push(iRow); basis[av.basis]++; }
    if (anyB) balance.push(bRow);
  }
  const meta = { version: FW_VERSION, sources, basis, recon: { overlap: recon.overlap, agreeRate: recon.agreeRate, diffs: recon.rows.filter((r) => r.status === "DIFF").slice(-8) }, patched };
  return { fa: { income: { quarters: income }, balance: { quarters: balance }, fw: meta }, meta };
}

/**
 * Lớp nối: hợp nhất cả bản đồ fa của VCI với kho KQKD (VNDirect) và ngày CafeF.
 * @param {{ vndRecOf: (t: string) => object|null, cafefDatesOf?: (t: string) => Map|null, log?: object }} deps
 */
export function createFundamentalsWarehouse({ vndRecOf, cafefDatesOf = () => null, log = console }) {
  let last = null;
  function mergeMap(tickers, vciMap) {
    const out = new Map(), stats = { tickers: 0, vnd: 0, vciOnly: 0, basis: { CAFEF: 0, VND_CREATED: 0, EST45: 0 }, agree: [], diffTickers: [] };
    for (const t of tickers) {
      let rec = null, dates = null;
      try { rec = vndRecOf(t); } catch { /* nguồn chính lỗi -> chỉ VCI */ }
      try { dates = cafefDatesOf(t); } catch { /* không có ngày CafeF */ }
      const vci = vciMap?.get?.(t) ?? null;
      if (!rec && !vci) continue;
      const m = mergeFundamentals({ vndRec: rec, vciFa: vci, cafefDates: dates });
      out.set(t, m.fa);
      stats.tickers++; if (rec) stats.vnd++; else stats.vciOnly++;
      for (const [b, n] of Object.entries(m.meta.basis)) stats.basis[b] += n;
      if (m.meta.recon.agreeRate != null) stats.agree.push(m.meta.recon.agreeRate);
      if (m.meta.recon.diffs.length) stats.diffTickers.push(t);
    }
    const a = stats.agree;
    last = { version: FW_VERSION, builtAt: new Date().toISOString(), tickers: stats.tickers, withVnd: stats.vnd, vciOnly: stats.vciOnly, basis: stats.basis,
      agreeMedian: a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null, diffTickers: stats.diffTickers.length, diffSample: stats.diffTickers.slice(0, 20) };
    log.info?.(`[fw] hợp nhất ${stats.tickers} mã (VNDirect ${stats.vnd}, chỉ VCI ${stats.vciOnly})`);
    return out;
  }
  function ticker(t, vciFa = null) {
    const m = mergeFundamentals({ vndRec: vndRecOf(t), vciFa, cafefDates: cafefDatesOf(t) });
    const r = reconcile(fromVnd(vndRecOf(t)), fromVci(vciFa));
    return { version: FW_VERSION, ticker: t, meta: m.meta, quarters: m.fa.income.quarters.slice(-12), recon: r.rows.slice(-24) };
  }
  return { mergeMap, ticker, status: () => last ?? { version: FW_VERSION, builtAt: null } };
}
