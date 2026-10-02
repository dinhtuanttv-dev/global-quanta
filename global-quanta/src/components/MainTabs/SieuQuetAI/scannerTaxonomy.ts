import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";

// Thứ tự hiển thị nhóm ngành (khớp backend/src/market/scanner/taxonomy.js).
export const GROUP_ORDER = [
  "Tài chính", "Bất động sản", "Xây dựng & Vật liệu", "Năng lượng", "Tiện ích", "Công nghiệp",
  "Nguyên vật liệu", "Tiêu dùng", "Công nghệ & Viễn thông", "Y tế", "Khác", "Chưa phân nhóm",
];

/** Ngành của mã: Gateway có phân ngành 2 cấp; nguồn dự phòng (Project A) chỉ có nhãn ngành thô. */
export const industryOf = (i: SieuQuetStockItem) => i.industry ?? i.sector ?? "Khác";
export const groupOf = (i: SieuQuetStockItem) => i.sectorGroup ?? (i.industry ? "Khác" : "Chưa phân nhóm");

export interface IndustryStat { name: string; count: number; avgScore: number | null }
export interface GroupStat extends IndustryStat { industries: IndustryStat[] }

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Thống kê theo nhóm ngành -> ngành (số mã, Smart Score trung bình), theo thứ tự nhóm cố định. */
export function groupStats(items: SieuQuetStockItem[]): GroupStat[] {
  const groups = new Map<string, Map<string, SieuQuetStockItem[]>>();
  for (const it of items) {
    const g = groupOf(it), ind = industryOf(it);
    if (!groups.has(g)) groups.set(g, new Map());
    const m = groups.get(g)!;
    if (!m.has(ind)) m.set(ind, []);
    m.get(ind)!.push(it);
  }
  const rank = (g: string) => (GROUP_ORDER.indexOf(g) === -1 ? 99 : GROUP_ORDER.indexOf(g));
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0], "vi")).map(([name, inds]) => {
    const all = [...inds.values()].flat();
    return {
      name, count: all.length, avgScore: avg(all.map((i) => i.smartScore)),
      industries: [...inds].map(([n, list]) => ({ name: n, count: list.length, avgScore: avg(list.map((i) => i.smartScore)) }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi")),
    };
  });
}

/** Tóm tắt điểm của một rổ / danh mục. */
export function basketSummary(items: SieuQuetStockItem[]) {
  const n = items.length;
  const top = [...items].sort((a, b) => (b.smartScore ?? 0) - (a.smartScore ?? 0)).slice(0, 3).map((i) => i.ticker);
  const groups = groupStats(items).sort((a, b) => b.count - a.count).slice(0, 3).map((g) => ({ name: g.name, share: n ? g.count / n : 0 }));
  return {
    n,
    avgSmart: avg(items.map((i) => i.smartScore)),
    avgFa: avg(items.map((i) => i.faScore)),
    avgTa: avg(items.map((i) => i.taScore)),
    avgRs: avg(items.map((i) => i.rsRating)),
    upTrend: items.filter((i) => i.trendTag === "Up-Trend").length,
    breakout: items.filter((i) => i.breakoutBoostBadge).length,
    foreign: items.filter((i) => i.foreignNetBuyFlag).length,
    outside: items.filter((i) => i.inUniverse === false).length,
    top, groups,
  };
}
