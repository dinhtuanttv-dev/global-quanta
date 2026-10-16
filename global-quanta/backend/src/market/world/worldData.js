// Kết nối thế giới — dựng dữ liệu THẬT cho engine world của gói macro-center 1.2 (hàm thuần, có test).
//
// Ngày (WorldData):
//   tradingDays = phiên HOSE thật (theo VN-Index của Gateway).
//   markets (% lợi suất ngày): VN = VN-Index; CN/JP/KR = chỉ số đóng cửa CÙNG NGÀY (đóng trước/khoảng giờ đóng cửa VN);
//     US = S&P 500 và TH = ETF THD (Yahoo không có lịch sử SET) lấy phiên Mỹ NGÀY TRƯỚC (đã biết trước khi VN mở cửa).
//     Thị trường nghỉ trong phiên VN -> 0 (không có thay đổi giá), ghi trong `coverage`.
//   sectors (% lợi suất ngày): ngành có chỉ số ICB tương ứng (SECTOR_ICB) dùng CHỈ SỐ NGÀNH ICB của Gateway (toàn bộ mã ngành,
//     tái cân bằng tháng — Lọc ngành) từ ngày chỉ số bắt đầu; đoạn trước đó và ngành không có ICB khớp (thuỷ sản, dệt may) dùng
//     rổ CÂN BẰNG TỶ TRỌNG chọn tay (giá điều chỉnh theo sự kiện quyền) — có thiên lệch sống sót, ghi rõ trong coverage.
// Tháng (VintageStore): yếu tố thế giới (FRED/Yahoo) + chỉ số ngành tháng (giá cuối tháng của chỉ số ngày) — tháng đã đóng,
//   asOf = ngày 1 tháng sau.

// Rổ ngành: cổ phiếu tiêu biểu, thanh khoản, thuộc universe Siêu Quét. Mã không có giá bị bỏ qua (ghi coverage).
export const SECTOR_BASKETS = {
  S_BANK: ["VCB", "BID", "CTG", "TCB", "MBB", "ACB", "VPB", "HDB", "STB", "VIB", "TPB", "SHB", "LPB", "MSB", "EIB", "OCB", "SSB", "NAB"],
  S_SEC: ["SSI", "VCI", "HCM", "VND", "MBS", "SHS", "VIX", "FTS", "BSI", "CTS", "ORS", "AGR"],
  S_RE: ["VHM", "VIC", "NVL", "KDH", "DXG", "NLG", "PDR", "DIG", "KBC", "NTL", "HDG", "CEO", "TCH", "DXS", "VRE"],
  S_STEEL: ["HPG", "HSG", "NKG", "TVN", "VGS"],
  S_OIL: ["GAS", "PVD", "PVS", "BSR", "PLX", "OIL", "PVC", "PVB"],
  S_SEAFOOD: ["VHC", "ANV", "IDI"],
  S_TEXTILE: ["TCM", "MSH", "TNG", "VGT", "GIL"],
  S_PORT: ["GMD", "HAH", "VSC", "PHP", "SGP", "VOS", "DVP", "SCS"],
  S_TECH: ["FPT", "CMG", "ELC", "VGI", "CTR"],
  S_POWER: ["POW", "REE", "NT2", "QTP", "GEG", "PC1"],
};
/**
 * Rổ thế giới -> chỉ số ngành ICB của Gateway (/api/market/sectors/:code/history), chỉ khi khớp sát (giống
 * Project A lib/locnganh/world-context.ts). S_SEAFOOD / S_TEXTILE không có ngành ICB tương ứng (thuộc 3570 / 3760 lẫn mã khác).
 */
export const SECTOR_ICB = {
  S_BANK: "8300", S_SEC: "8700", S_RE: "8600", S_STEEL: "1750", S_OIL: "0500", S_PORT: "2770", S_TECH: "9500", S_POWER: "7530",
};
export const MIN_ICB_MEMBERS = 3; // chỉ số ICB chỉ được dùng từ phiên có >= 3 mã thành phần
export const MIN_BASKET_MEMBERS = 2; // tối thiểu để dựng chỉ số ngày (mỗi rổ có 3+ mã ứng viên)

/** Thị trường nước ngoài (Yahoo, nến ngày). lag1: dùng phiên ngày TRƯỚC của sàn đó (sàn Mỹ đóng cửa sau giờ VN). */
export const FOREIGN_MARKETS = {
  US: { symbol: "^GSPC", labelVi: "S&P 500", lag1: true },
  CN: { symbol: "000001.SS", labelVi: "Shanghai Composite", lag1: false },
  JP: { symbol: "^N225", labelVi: "Nikkei 225", lag1: false },
  KR: { symbol: "^KS11", labelVi: "KOSPI", lag1: false },
  TH: { symbol: "THD", labelVi: "ETF THD (MSCI Thái Lan, USD, giao dịch giờ Mỹ — Yahoo không có lịch sử SET)", lag1: true },
};

/** Yếu tố thế giới tháng (Yahoo, nến tháng) bổ sung cho FED/DXY/OIL đã có ở Trung tâm vĩ mô. */
export const WORLD_MONTHLY_YAHOO = {
  CNY: { symbol: "CNY=X", source: "Yahoo:CNY=X" },
  STEEL: { symbol: "HRC=F", source: "Yahoo:HRC=F (thép cán nóng Mỹ, hợp đồng tương lai)" },
  SEMI: { symbol: "^SOX", source: "Yahoo:^SOX (chỉ số bán dẫn Philadelphia)" },
  VIX: { symbol: "^VIX", source: "Yahoo:^VIX" },
  MSCI_EM: { symbol: "EEM", source: "Yahoo:EEM (ETF MSCI Emerging Markets)" },
};
/**
 * Yếu tố tháng từ FRED (W4, 2026-10-16). proxy = không phải đúng chỉ tiêu tên yếu tố — ghi rõ trên UI.
 * asOfDay: ngày của tháng SAU được coi là đã công bố (EPU thương mại ra đầu tháng sau; Philly Fed ra thứ Năm tuần 3 CÙNG tháng).
 */
export const WORLD_MONTHLY_FRED = {
  TARIFF: { id: "EPUTRADE", source: "FRED:EPUTRADE (Baker–Bloom–Davis, bất định chính sách thương mại Mỹ)", proxy: false, asOfDay: 10 },
  PMI_US: { id: "GACDFSA066MSFRBPHI", source: "FRED:GACDFSA066MSFRBPHI (Philly Fed khảo sát sản xuất) — PROXY cho PMI sản xuất Mỹ", proxy: true, asOfDay: 1 },
};
/** Yếu tố của gói CHƯA có nguồn mở — không có dữ liệu, không bịa. */
export const WORLD_FACTORS_WITHOUT_SOURCE = {
  CONTAINER: "Cước container (Drewry WCI/SCFI — trả phí; FRED không có)",
  PMI_CN: "PMI sản xuất Trung Quốc (Caixin/NBS — không có API mở; OECD CLI Trung Quốc trên FRED ngừng ở 2024-01, quá cũ để dùng)",
  EM_FLOWS: "Dòng vốn thị trường mới nổi (IIF/EPFR — trả phí)",
};

/** CSV FRED tháng -> tháng ĐÃ ĐÓNG { period, value, asOf } với ngày công bố asOfDay của tháng sau. */
export function fredMonthly(points, todayIso, asOfDay = 1) {
  const nowPeriod = todayIso.slice(0, 7);
  const by = new Map();
  for (const p of points) { const period = p.date.slice(0, 7); if (period < nowPeriod) by.set(period, p.value); }
  return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, value]) => {
    const [y, m] = period.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
    return { period, value, asOf: `${ny}-${String(nm).padStart(2, "0")}-${String(asOfDay).padStart(2, "0")}` };
  });
}

// ── Sự kiện THẬT (nhập tay, đã kiểm duyệt). Giờ công bố UTC. FOMC: 14:00 giờ miền Đông Mỹ (18:00Z mùa hè / 19:00Z mùa đông).
const FOMC = [
  ["2023-02-01", 19], ["2023-03-22", 18], ["2023-05-03", 18], ["2023-06-14", 18], ["2023-07-26", 18], ["2023-09-20", 18], ["2023-11-01", 18], ["2023-12-13", 19],
  ["2024-01-31", 19], ["2024-03-20", 18], ["2024-05-01", 18], ["2024-06-12", 18], ["2024-07-31", 18], ["2024-09-18", 18], ["2024-11-07", 19], ["2024-12-18", 19],
  ["2025-01-29", 19], ["2025-03-19", 18], ["2025-05-07", 18], ["2025-06-18", 18], ["2025-07-30", 18], ["2025-09-17", 18], ["2025-10-29", 18], ["2025-12-10", 19],
  ["2026-01-28", 19], ["2026-03-18", 18], ["2026-04-29", 18], ["2026-06-17", 18], ["2026-07-29", 18], ["2026-09-16", 18], ["2026-10-28", 18], ["2026-12-09", 19],
];
const REVIEWED = { method: "manual", confidence: 1, reviewed: true };

export const REAL_WORLD_EVENTS = [
  ...FOMC.map(([d, h]) => ({
    id: `fomc-${d}`, kind: "scheduled", type: "monetary_policy", titleVi: `FOMC công bố quyết định lãi suất (${d.split("-").reverse().join("/")})`,
    tsUtc: `${d}T${String(h).padStart(2, "0")}:00:00Z`, region: "US", sectorsHint: ["S_BANK", "S_SEC", "S_RE"], polarityHint: 0,
    source: { name: "Federal Reserve — lịch họp FOMC", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" }, extraction: REVIEWED,
  })),
  {
    id: "us-tariff-2025-04-02", kind: "surprise", type: "trade_policy", titleVi: "Mỹ công bố thuế đối ứng (Việt Nam 46%)", tsUtc: "2025-04-02T20:00:00Z", region: "US",
    sectorsHint: ["S_TEXTILE", "S_SEAFOOD", "S_PORT", "S_STEEL"], polarityHint: -1, source: { name: "Nhà Trắng — tuyên bố thuế đối ứng 02/04/2025" }, extraction: REVIEWED,
  },
  {
    id: "us-tariff-pause-2025-04-09", kind: "surprise", type: "trade_policy", titleVi: "Mỹ hoãn 90 ngày thuế đối ứng", tsUtc: "2025-04-09T17:20:00Z", region: "US",
    sectorsHint: ["S_TEXTILE", "S_SEAFOOD", "S_PORT", "S_STEEL"], polarityHint: 1, source: { name: "Nhà Trắng — tạm hoãn thuế đối ứng 09/04/2025" }, extraction: REVIEWED,
  },
  // W5 (2026-10-16): sự kiện có chiều rõ. Ngành mục tiêu = phần tử đầu của sectorsHint (định trước, không chọn theo p).
  {
    id: "pboc-stimulus-2024-09-24", kind: "surprise", type: "monetary_policy", titleVi: "PBoC công bố gói nới lỏng (hạ RRR, lãi suất, hỗ trợ chứng khoán & BĐS)", tsUtc: "2024-09-24T01:00:00Z", region: "CN",
    sectorsHint: ["S_STEEL", "S_OIL", "S_SEC"], polarityHint: 1, source: { name: "PBoC/NFRA/CSRC — họp báo 09:00 giờ Bắc Kinh 24/09/2024" }, extraction: REVIEWED,
  },
  {
    id: "us-cn-geneva-2025-05-12", kind: "surprise", type: "trade_policy", titleVi: "Mỹ – Trung đạt thoả thuận Geneva, giảm thuế 90 ngày", tsUtc: "2025-05-12T08:00:00Z", region: "US",
    sectorsHint: ["S_TEXTILE", "S_SEAFOOD", "S_PORT"], polarityHint: 1, source: { name: "Tuyên bố chung Mỹ – Trung tại Geneva 12/05/2025" }, extraction: REVIEWED,
  },
  {
    id: "ftse-vn-upgrade-2025-10-07", kind: "scheduled", type: "index_reclassification", titleVi: "FTSE Russell nâng hạng Việt Nam lên thị trường mới nổi thứ cấp", tsUtc: "2025-10-07T21:00:00Z", region: "GLOBAL",
    sectorsHint: ["S_SEC", "S_BANK", "S_RE"], polarityHint: 1, source: { name: "FTSE Russell — kỳ xét phân loại thị trường 10/2025" }, extraction: REVIEWED,
  },
];

// ── Hàm thuần ──

const pct = (a, b) => (a > 0 && b > 0 ? (b / a - 1) * 100 : 0);
const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

/** Giá đóng cửa theo ngày -> Map(date, close) (bỏ nến tạm / giá không dương). */
export const closeMap = (bars) => new Map((bars ?? []).filter((b) => !b.partial && b.close > 0).map((b) => [String(b.date).slice(0, 10), b.close]));

/** Giá đóng cửa gần nhất có ngày <= d (danh sách ngày đã sắp xếp). */
function lastOnOrBefore(dates, map, d, strictlyBefore = false) {
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const ok = strictlyBefore ? dates[mid] < d : dates[mid] <= d;
    if (ok) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : map.get(dates[ans]);
}

/**
 * Lợi suất ngày (%) của một thị trường nước ngoài trên lịch phiên VN: thay đổi giữa giá "đã biết" tại phiên t và phiên t−1.
 * lag1 = true: giá đã biết tại phiên VN ngày d là giá đóng cửa của sàn đó ở ngày < d.
 */
export function alignForeignReturns(tradingDays, bars, { lag1 = false } = {}) {
  const map = closeMap(bars);
  const dates = [...map.keys()].sort();
  const known = tradingDays.map((d) => lastOnOrBefore(dates, map, d, lag1));
  let flat = 0;
  const ret = tradingDays.map((_, t) => {
    if (t === 0 || known[t] == null || known[t - 1] == null) return 0;
    const r = pct(known[t - 1], known[t]);
    if (r === 0) flat++;
    return round(r);
  });
  return { ret, flatDays: flat, first: dates[0] ?? null, last: dates.at(-1) ?? null };
}

/** Chỉ số cân bằng tỷ trọng (lợi suất ngày %) của rổ cổ phiếu trên lịch phiên VN: trung bình lợi suất các mã có giá ở cả 2 phiên. */
export function equalWeightReturns(tradingDays, seriesBySymbol) {
  const maps = Object.entries(seriesBySymbol).map(([s, bars]) => [s, closeMap(bars)]);
  const members = [];
  const ret = tradingDays.map((d, t) => {
    if (t === 0) { members.push(0); return 0; }
    const prev = tradingDays[t - 1];
    let sum = 0, n = 0;
    for (const [, m] of maps) {
      const a = m.get(prev), b = m.get(d);
      if (a > 0 && b > 0) { sum += pct(a, b); n++; }
    }
    members.push(n);
    return n ? round(sum / n) : 0;
  });
  return { ret, members };
}

/**
 * Ghép lợi suất ngày: chỉ số ICB (index = [[date, close, n]]) từ phiên đầu tiên có ICB ở cả 2 phiên liền kề với n >= minMembers;
 * trước đó dùng rổ (basketRet, từ basketStart). Sau khi ICB bắt đầu, phiên thiếu ICB (hiếm) dùng rổ và được đếm (gapDays).
 * Trả { ret, start, icbFrom, icbDays, basketDays, gapDays } — start = phiên đầu chuỗi có nghĩa (null nếu không có nguồn nào).
 */
export function spliceSectorReturns(tradingDays, basketRet, basketStart, icbIndex, minMembers = MIN_ICB_MEMBERS) {
  const icb = new Map((icbIndex ?? []).filter((r) => r[1] > 0 && (r[2] ?? minMembers) >= minMembers).map((r) => [r[0], r[1]]));
  let icbStart = null;
  for (let t = 1; t < tradingDays.length; t++) if (icb.has(tradingDays[t - 1]) && icb.has(tradingDays[t])) { icbStart = t; break; }
  const bs = basketStart ?? Infinity;
  let icbDays = 0, basketDays = 0, gapDays = 0;
  const ret = tradingDays.map((d, t) => {
    if (icbStart != null && t >= icbStart) {
      const a = icb.get(tradingDays[t - 1]), b = icb.get(d);
      if (a > 0 && b > 0) { icbDays++; return round(pct(a, b)); }
      gapDays++;
      return t >= bs ? basketRet?.[t] ?? 0 : 0;
    }
    if (t >= bs) { basketDays++; return basketRet?.[t] ?? 0; }
    return 0;
  });
  const start = Math.min(bs, icbStart != null ? icbStart - 1 : Infinity);
  return { ret, start: Number.isFinite(start) ? start : null, icbFrom: icbStart != null ? tradingDays[icbStart - 1] : null, icbDays, basketDays, gapDays };
}

/** Lợi suất ngày % -> chỉ số tháng (giá trị cuối tháng của chỉ số gốc 100), chỉ tháng ĐÃ ĐÓNG, từ ngày đầu có đủ thành viên. */
export function monthlyIndexFromReturns(tradingDays, ret, todayIso, { startIndex = 0 } = {}) {
  const nowPeriod = todayIso.slice(0, 7);
  const out = new Map();
  let level = 100;
  for (let t = startIndex; t < tradingDays.length; t++) {
    if (t > startIndex) level *= 1 + ret[t] / 100;
    const p = tradingDays[t].slice(0, 7);
    if (p < nowPeriod) out.set(p, level);
  }
  return [...out.entries()].map(([period, value]) => {
    const [y, m] = period.split("-").map(Number);
    const asOf = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    return { period, value: round(value, 4), asOf };
  });
}

/** Phiên đầu tiên rổ có >= MIN_BASKET_MEMBERS mã (chỉ số ngành không dựng trên 1–2 mã ở đầu kỳ). null nếu chưa bao giờ đủ. */
export function firstFullIndex(members, min = MIN_BASKET_MEMBERS) {
  const i = members.findIndex((n, t) => t >= 1 && n >= min);
  return i < 0 ? null : i;
}
