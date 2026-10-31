// Hiển thị 2 bảng Tổng quan (31/10/2026): chỉ đổi cách trình bày, không tính lại điểm số hay giá.
import { useCallback, useEffect, useLayoutEffect, useState, type KeyboardEvent, type RefObject } from "react";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import type { MarketQuote } from "../../../services/marketDataClient";
import { readScoped, writeScoped } from "../../../lib/ta-command-center/userScope";

// ── Sắp xếp ──────────────────────────────────────────────────────────────
export type SortKey = "ticker" | "price" | "changePct" | "smartScore" | "rsRating" | "fScore" | "riskRewardRatio" | "riskAdjustedMomentum";
export interface SortState { key: SortKey; dir: "asc" | "desc" }
const SORT_VALUE: Record<Exclude<SortKey, "ticker">, (i: SieuQuetStockItem) => number | null | undefined> = {
  price: (i) => i.price, changePct: (i) => i.changePct, smartScore: (i) => i.smartScore, rsRating: (i) => i.rsRating,
  fScore: (i) => i.piotroskiFScore, riskRewardRatio: (i) => i.riskRewardRatio, riskAdjustedMomentum: (i) => i.riskAdjustedMomentum,
};

/** Không có sắp xếp thì giữ nguyên thứ tự máy quét. Ô thiếu số luôn nằm cuối, theo cả hai chiều. Thứ tự bằng nhau giữ nguyên thứ tự gốc. */
export function sortItems<T extends SieuQuetStockItem>(items: T[], sort: SortState | null): T[] {
  if (!sort) return items;
  const sign = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "ticker") return [...items].sort((a, b) => sign * a.ticker.localeCompare(b.ticker));
  const value = SORT_VALUE[sort.key];
  const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  return [...items].sort((a, b) => {
    const x = value(a), y = value(b);
    if (!ok(x) && !ok(y)) return 0;
    if (!ok(x)) return 1;
    if (!ok(y)) return -1;
    return sign * (x - y);
  });
}

/** Bấm tiêu đề: chiều đầu tiên -> chiều ngược -> về thứ tự mặc định. Cột Mã bắt đầu từ A, cột số bắt đầu từ lớn. */
export function nextSort(cur: SortState | null, key: SortKey): SortState | null {
  const first = key === "ticker" ? "asc" : "desc";
  if (cur?.key !== key) return { key, dir: first };
  return cur.dir === first ? { key, dir: first === "asc" ? "desc" : "asc" } : null;
}
export const ariaSort = (s: SortState | null, key: SortKey): "ascending" | "descending" | "none" => (s?.key === key ? (s.dir === "asc" ? "ascending" : "descending") : "none");

// ── Định dạng ────────────────────────────────────────────────────────────
/** Giá theo nghìn đồng, cùng quy ước với Bảng giá (148700 -> 148.70). */
export const fmtKPrice = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) && v > 0 ? (v / 1000).toFixed(2) : "—");
export const fmtPct = (v: number | null | undefined): string => (typeof v === "number" && Number.isFinite(v) ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—");
/** Khối lượng gọn khi bảng hẹp: số đầy đủ vẫn nằm trong chú thích ô. */
export function fmtCompactVol(v: number | null | undefined): string {
  if (!v) return "";
  if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M`;
  if (v >= 1e4) return `${Math.round(v / 1e3)}K`;
  return Math.round(v).toLocaleString("en-US");
}
/** Tỷ lệ thanh độ sâu trong một dòng; không có khối lượng thì 0. */
export const depthShare = (v: number | null | undefined, max: number): number => (v && max > 0 ? Math.min(100, (v / max) * 100) : 0);
/** Vị trí giá trong biên cao-thấp phiên (0-100); thiếu dữ liệu hoặc biên bằng 0 thì null. */
export function rangePos(price: number | null | undefined, low: number | null | undefined, high: number | null | undefined): number | null {
  if (!price || !low || !high || high <= low) return null;
  return Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
}

export const TREND_META: Record<string, { glyph: string; color: string; title: string }> = {
  "Up-Trend": { glyph: "▲", color: "#34d399", title: "Xu hướng tăng: giá > MA20 > MA50" },
  "Down-Trend": { glyph: "▼", color: "#fb7185", title: "Xu hướng giảm: giá < MA20 < MA50" },
  Accumulation: { glyph: "◆", color: "#67e8f9", title: "Tích luỹ: MA20 > MA50, giá chưa nằm trên MA20" },
  Distribution: { glyph: "◇", color: "#fbbf24", title: "Phân phối: MA20 ≤ MA50, giá chưa nằm dưới MA20" },
};

/** Chú giải tiêu đề cột, viết theo đúng công thức của máy quét (backend/src/market/scanner/formulas.js). */
export const COLUMN_HELP: Record<string, string> = {
  price: "Giá theo nghìn đồng. Chấm xanh: giá SSI realtime.",
  changePct: "Thay đổi so với giá tham chiếu.",
  smartScore: "Xếp hạng tổng hợp 0–100: 40% cơ bản + 35% kỹ thuật + 25% sự kiện, nhân hệ số đồng thuận. Chỉ là xếp hạng mô tả, xem nhãn kiểm định phía trên.",
  rsRating: "Sức mạnh tương đối 1–99: thứ hạng lợi suất 64 phiên so với toàn bộ mã trong danh sách quét.",
  confluence: "Mức đồng thuận giữa xu hướng VN-Index, xu hướng mã, RS và chất lượng.",
  signals: "Breakout và top 5 khối ngoại mua ròng trong ngày.",
  trend: "Theo vị trí giá, MA20 và MA50. Rê chuột vào từng ô để xem định nghĩa.",
  fScore: "F-Score rút gọn từ BCTC. Không áp dụng cho ngân hàng, chứng khoán, bảo hiểm. Mã có điểm từ 1/3 thang trở xuống bị xếp cuối bảng.",
  rr: "R/R = (kháng cự − giá) / (giá − hỗ trợ), vùng gần nhất của engine cấu trúc, khung ngày.",
  ram: "Lợi suất trung bình 64 phiên chia độ lệch chuẩn, nhân căn 252 (dạng Sharpe, năm hoá).",
};

const SESSION_VI: Record<string, string> = { ATO: "Phiên ATO", ATC: "Phiên ATC", LO: "Khớp lệnh liên tục", PT: "Thoả thuận", C: "Thoả thuận" };
/** Trạng thái phiên lấy trực tiếp từ giá trên bảng. Chưa có phiên thì ghi ngày dữ liệu mới nhất, không đoán. */
export function boardSession(quotes: Record<string, Pick<MarketQuote, "session" | "time">>): { live: boolean; label: string } | null {
  const qs = Object.values(quotes);
  if (!qs.length) return null;
  const counts = new Map<string, number>();
  for (const q of qs) if (q.session) counts.set(q.session, (counts.get(q.session) ?? 0) + 1);
  const top = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top) return { live: true, label: SESSION_VI[top] ?? `Phiên ${top}` };
  const times = qs.map((q) => q.time ?? "").sort();
  const last = times[times.length - 1]?.slice(0, 10);
  return { live: false, label: last ? `Ngoài phiên · dữ liệu ${last.split("-").reverse().slice(0, 2).join("/")}` : "Ngoài phiên" };
}

// ── Tuỳ chọn hiển thị theo tài khoản ─────────────────────────────────────
export type Density = "compact" | "comfortable";
export interface ViewPrefs { focus: boolean; density: Density; levels: 1 | 3 }
const PREFS_KEY = "gq.overview.view.v1";
export const DEFAULT_VIEW: ViewPrefs = { focus: false, density: "compact", levels: 3 };
export function parseViewPrefs(raw: string | null): ViewPrefs {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<ViewPrefs> | null;
    return { focus: v?.focus === true, density: v?.density === "comfortable" ? "comfortable" : "compact", levels: v?.levels === 1 ? 1 : 3 };
  } catch { return DEFAULT_VIEW; }
}
export function useViewPrefs() {
  const [prefs, setPrefs] = useState<ViewPrefs>(() => parseViewPrefs(readScoped(PREFS_KEY)));
  const update = useCallback((patch: Partial<ViewPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      try { writeScoped(PREFS_KEY, JSON.stringify(next)); } catch { /* chỉ nhớ trong phiên */ }
      return next;
    });
  }, []);
  return [prefs, update] as const;
}

export const NARROW_QUERY = "(max-width: 640px)";
export function useIsNarrow(): boolean {
  const q = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(NARROW_QUERY).matches;
  const [narrow, setNarrow] = useState(q);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(NARROW_QUERY);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return narrow;
}

export type Fit = "wide" | "mid" | "tight";
/** Mức chữ theo bề rộng bảng. Bảng giá 23 cột cần nhiều chỗ hơn nên ngưỡng cao hơn. */
export function fitOf(width: number, mode: "scanner" | "board"): Fit {
  if (!width) return "wide";
  if (mode === "board") return width >= 1320 ? "wide" : width >= 1040 ? "mid" : "tight";
  return width >= 1060 ? "wide" : width >= 860 ? "mid" : "tight";
}
/** Đo khung bảng. Bảng vừa khung thì dùng chung thanh cuộn của trang; chưa vừa mới bật khung cuộn riêng để giữ được tiêu đề và cột Mã. */
export function useTableFit(ref: RefObject<HTMLElement | null>, mode: "scanner" | "board", dep: unknown) {
  const [state, setState] = useState<{ fit: Fit; overflow: boolean }>({ fit: "wide", overflow: false });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const table = el.querySelector("table");
      const width = el.clientWidth;
      const next = { fit: fitOf(width, mode), overflow: !!table && table.offsetWidth > width + 1 };
      setState((s) => (s.fit === next.fit && s.overflow === next.overflow ? s : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const table = el.querySelector("table");
    if (table) ro.observe(table);
    return () => ro.disconnect();
  }, [ref, mode, dep]);
  return state;
}

/** Phím ↑↓ di chuyển giữa các dòng, Enter mở phân tích, Space chọn mã. */
export function rowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, ticker: string, onToggle: (t: string) => void, onSelect: (t: string) => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter") { e.preventDefault(); onToggle(ticker); return; }
  if (e.key === " ") { e.preventDefault(); onSelect(ticker); return; }
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const rows = [...(e.currentTarget.closest("tbody")?.querySelectorAll<HTMLTableRowElement>("tr[data-ticker]") ?? [])];
  rows[rows.indexOf(e.currentTarget) + (e.key === "ArrowDown" ? 1 : -1)]?.focus();
}
