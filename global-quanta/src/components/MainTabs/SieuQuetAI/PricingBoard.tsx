import { Fragment, memo, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MarketQuote } from "../../../services/marketDataClient";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import type { FlashDir } from "../../../hooks/useBoardQuotes";
import { ariaSort, depthShare, fmtCompactVol, fmtPct, rangePos, rowKeyDown, type Fit, type SortKey, type SortState } from "./scannerView";

// Bảng giá trực tuyến kiểu SSI: Trần/Sàn/TC · 3 bước giá mua · khớp lệnh · 3 bước giá bán · tổng KL ·
// cao/thấp. Quy ước màu bảng giá VN: tím = trần, xanh lơ = sàn, vàng = tham chiếu, xanh lá = tăng,
// đỏ = giảm. Giá hiển thị theo nghìn đồng (62.80 = 62.800đ), khối lượng theo cổ phiếu.

export const BOARD_COLUMNS = 23;
export const BOARD_COLUMNS_ONE_LEVEL = 15;
const NARROW_SPAN = 4;
const COLOR = { ceil: "#e879f9", floor: "#22d3ee", ref: "#facc15", up: "#22c55e", down: "#f43f5e", none: "#94a3b8" };

export function priceColor(price: number | null | undefined, q: Pick<MarketQuote, "refPrice" | "ceiling" | "floor"> | undefined) {
  if (!price || !q?.refPrice) return COLOR.none;
  if (q.ceiling && price >= q.ceiling) return COLOR.ceil;
  if (q.floor && price <= q.floor) return COLOR.floor;
  if (price === q.refPrice) return COLOR.ref;
  return price > q.refPrice ? COLOR.up : COLOR.down;
}
export const fmtPrice = (v: number | null | undefined) => (v ? (v / 1000).toFixed(2) : "");
export const fmtVol = (v: number | null | undefined) => (v ? Math.round(v).toLocaleString("en-US") : "");

/** Bước giá có KL nhưng giá 0 -> lệnh ATO/ATC (giá thị trường đầu/cuối phiên). */
function levelPrice(level: { price: number; volume: number } | undefined, session: string | null | undefined) {
  if (!level) return "";
  if (!level.price && level.volume) return session === "ATO" ? "ATO" : "ATC";
  return fmtPrice(level.price);
}

interface RowProps {
  item: SieuQuetStockItem;
  q: MarketQuote | undefined;
  flash: FlashDir | null;
  expanded: boolean;
  starred: boolean;
  onToggle: (ticker: string) => void;
  onStar: (ticker: string) => void;
  observe: (el: HTMLTableRowElement | null, ticker: string) => void;
  selected: boolean;
  onSelect: (ticker: string) => void;
  fit: Fit;
  levels: 1 | 3;
  narrow: boolean;
}

const BoardRow = memo(function BoardRow({ item, q, flash, expanded, starred, onToggle, onStar, observe, selected, onSelect, fit, levels, narrow }: RowProps) {
  const matchColor = priceColor(q?.price, q);
  const bid = q?.bid ?? [], ask = q?.ask ?? [];
  const flashBg = flash === "up" ? "rgba(34,197,94,0.28)" : flash === "down" ? "rgba(244,63,94,0.28)" : undefined;
  const fullVol = fit === "wide";
  const showVol = (v: number | null | undefined) => (fullVol ? fmtVol(v) : fmtCompactVol(v));
  const maxDepth = Math.max(0, ...bid.slice(0, levels).map((l) => l.volume ?? 0), ...ask.slice(0, levels).map((l) => l.volume ?? 0));
  const dir = !q?.price || !q.refPrice || q.price === q.refPrice ? undefined : q.price > q.refPrice ? "up" : "down";
  const side = (lv: { price: number; volume: number } | undefined, kind: "bid" | "ask", extra = "") => {
    const share = depthShare(lv?.volume, maxDepth);
    const tint = kind === "bid" ? "rgba(34,197,94,0.16)" : "rgba(244,63,94,0.16)";
    return <>
      <td className={`num tint-${kind} ${extra}`} style={{ color: priceColor(lv?.price, q) }}>{levelPrice(lv, q?.session)}</td>
      <td className={`num tint-${kind} board-vol`} title={lv?.volume ? `${fmtVol(lv.volume)} cổ phiếu` : undefined}
        style={share ? { backgroundImage: `linear-gradient(${kind === "bid" ? "to left" : "to right"}, ${tint} ${share}%, transparent ${share}%)` } : undefined}>{showVol(lv?.volume)}</td>
    </>;
  };
  const star = <button type="button" aria-pressed={starred} aria-label={starred ? `Bỏ ${item.ticker} khỏi danh mục` : `Thêm ${item.ticker} vào danh mục`}
    onClick={(e) => { e.stopPropagation(); onStar(item.ticker); }} onDoubleClick={(e) => e.stopPropagation()}
    className={`scan-star ${starred ? "text-amber-400" : "text-slate-500 hover:text-amber-300"}`}>{starred ? "★" : "☆"}</button>;
  const open = <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Đóng" : "Mở"} phân tích ${item.ticker}`} data-testid={`board-open-${item.ticker}`}
    title={expanded ? "Đóng phân tích khối lượng" : "Mở phân tích khối lượng"} onClick={(e) => { e.stopPropagation(); onToggle(item.ticker); }} onDoubleClick={(e) => e.stopPropagation()} className="scan-open">
    {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}</button>;
  const rowClass = `scan-row ${expanded ? "is-open" : ""} ${selected ? "is-selected" : ""}`;
  const changeText = q?.changePct !== null && q?.changePct !== undefined && q.price ? fmtPct(q.changePct) : "";

  if (narrow) return (
    <tr ref={(el) => observe(el, item.ticker)} data-ticker={item.ticker} tabIndex={0} aria-selected={selected} className={rowClass}
      onClick={() => { onSelect(item.ticker); onToggle(item.ticker); }} onKeyDown={(e) => rowKeyDown(e, item.ticker, onToggle, onSelect)}>
      <td className="scan-ticker board-ticker" style={{ color: matchColor }}>{star}<b>{item.ticker}</b></td>
      <td className="num board-match" data-dir={dir} style={{ color: matchColor, background: flashBg }}>{fmtPrice(q?.price)}</td>
      <td className="num" style={{ color: matchColor }}>{changeText}</td>
      <td className="num text-slate-200">{fmtCompactVol(q?.totalVolume)}{open}</td>
    </tr>
  );
  const pos = fit === "wide" ? rangePos(q?.price, q?.low, q?.high) : null;
  return (
    <tr ref={(el) => observe(el, item.ticker)} data-ticker={item.ticker} tabIndex={0} aria-expanded={expanded} aria-selected={selected}
      title="Bấm để chọn mã (Action Center, Radar…) · bấm › hoặc nhấn đúp (Enter) để xem phân tích khối lượng · ↑↓ chuyển dòng"
      onClick={() => onSelect(item.ticker)} onDoubleClick={() => onToggle(item.ticker)} onKeyDown={(e) => rowKeyDown(e, item.ticker, onToggle, onSelect)} className={rowClass}>
      <td className="scan-ticker board-ticker" style={{ color: matchColor }}>{star}{open}<b>{item.ticker}</b></td>
      <td className="num tint-ref group-start" style={{ color: COLOR.ceil }}>{fmtPrice(q?.ceiling)}</td>
      <td className="num tint-ref" style={{ color: COLOR.floor }}>{fmtPrice(q?.floor)}</td>
      <td className="num tint-ref" style={{ color: COLOR.ref }}>{fmtPrice(q?.refPrice)}</td>
      {levels === 3 && side(bid[2], "bid", "group-start")}{levels === 3 && side(bid[1], "bid")}{side(bid[0], "bid", levels === 1 ? "group-start" : "")}
      <td className="num board-match group-start" data-dir={dir} style={{ color: matchColor, background: flashBg, transition: "background 0.6s" }}>{fmtPrice(q?.price)}</td>
      <td className="num tint-match" style={{ color: matchColor }}>{q?.change ? `${q.change > 0 ? "+" : ""}${(q.change / 1000).toFixed(2)}` : ""}</td>
      <td className="num tint-match" style={{ color: matchColor }}>{changeText}</td>
      {side(ask[0], "ask", "group-start")}{levels === 3 && side(ask[1], "ask")}{levels === 3 && side(ask[2], "ask")}
      <td className="num text-slate-200 group-start" title={q?.totalVolume ? `${fmtVol(q.totalVolume)} cổ phiếu` : undefined}>{showVol(q?.totalVolume)}</td>
      <td className="num board-hl" style={{ color: priceColor(q?.high, q) }}>{fmtPrice(q?.high)}{pos !== null && <span className="hl-track" title={`Giá nằm ở ${pos.toFixed(0)}% biên cao - thấp của phiên`} aria-hidden><i style={{ left: `${pos}%` }} /></span>}</td>
      <td className="num" style={{ color: priceColor(q?.low, q) }}>{fmtPrice(q?.low)}</td>
      <td className="num text-amber-400 group-start" title="Smart Score (Siêu Quét AI)">{item.smartScore !== null ? item.smartScore.toFixed(1) : "—"}</td>
    </tr>
  );
});

/** Trên điện thoại: 3 bước giá xếp dọc và phần còn lại, mở khi bấm một mã. */
function NarrowLadder({ item, q }: { item: SieuQuetStockItem; q: MarketQuote | undefined }) {
  const bid = q?.bid ?? [], ask = q?.ask ?? [];
  const maxDepth = Math.max(0, ...bid.slice(0, 3).map((l) => l.volume ?? 0), ...ask.slice(0, 3).map((l) => l.volume ?? 0));
  const row = (lv: { price: number; volume: number } | undefined, kind: "bid" | "ask", n: number) => {
    const share = depthShare(lv?.volume, maxDepth);
    return <li key={`${kind}${n}`} style={share ? { backgroundImage: `linear-gradient(to left, ${kind === "bid" ? "rgba(34,197,94,0.16)" : "rgba(244,63,94,0.16)"} ${share}%, transparent ${share}%)` } : undefined}>
      <span className="text-slate-400">{kind === "bid" ? "Mua" : "Bán"} {n}</span>
      <b style={{ color: priceColor(lv?.price, q) }}>{levelPrice(lv, q?.session) || "—"}</b>
      <span>{fmtVol(lv?.volume) || "—"}</span>
    </li>;
  };
  return <tr className="scan-narrow-detail"><td colSpan={NARROW_SPAN} data-testid={`board-ladder-${item.ticker}`}>
    <ul className="board-ladder">{[2, 1, 0].map((i) => row(ask[i], "ask", i + 1))}{[0, 1, 2].map((i) => row(bid[i], "bid", i + 1))}</ul>
    <dl>
      <div><dt style={{ color: COLOR.ceil }}>Trần</dt><dd>{fmtPrice(q?.ceiling) || "—"}</dd></div>
      <div><dt style={{ color: COLOR.floor }}>Sàn</dt><dd>{fmtPrice(q?.floor) || "—"}</dd></div>
      <div><dt style={{ color: COLOR.ref }}>TC</dt><dd>{fmtPrice(q?.refPrice) || "—"}</dd></div>
      <div><dt>Cao</dt><dd style={{ color: priceColor(q?.high, q) }}>{fmtPrice(q?.high) || "—"}</dd></div>
      <div><dt>Thấp</dt><dd style={{ color: priceColor(q?.low, q) }}>{fmtPrice(q?.low) || "—"}</dd></div>
      <div><dt>+/−</dt><dd>{q?.change ? `${q.change > 0 ? "+" : ""}${(q.change / 1000).toFixed(2)}` : "—"}</dd></div>
      <div><dt>Tổng KL</dt><dd>{fmtVol(q?.totalVolume) || "—"}</dd></div>
      <div><dt>Smart</dt><dd className="text-amber-400">{item.smartScore !== null ? item.smartScore.toFixed(1) : "—"}</dd></div>
    </dl>
  </td></tr>;
}

export interface PricingBoardProps {
  sections: [string, SieuQuetStockItem[]][];
  grouped: boolean;
  quotes: Record<string, MarketQuote>;
  flash: Record<string, { dir: FlashDir; at: number }>;
  now: number;
  expandedTicker: string | null;
  starred: Set<string>;
  onToggle: (ticker: string) => void;
  onStar: (ticker: string) => void;
  observe: (el: HTMLTableRowElement | null, ticker: string) => void;
  renderDetail: (ticker: string, colSpan: number) => ReactNode;
  emptyText: string;
  selectedTicker?: string | null;
  onSelect?: (ticker: string) => void;
  fit?: Fit;
  levels?: 1 | 3;
  narrow?: boolean;
  sort?: SortState | null;
  onSort?: (k: SortKey) => void;
}

const noop = () => {};

function SortTh({ label, k, sort, onSort, className, rowSpan, title, style }: { label: string; k: SortKey; sort: SortState | null; onSort: (k: SortKey) => void; className?: string; rowSpan?: number; title?: string; style?: React.CSSProperties }) {
  const on = sort?.key === k;
  return <th className={className} rowSpan={rowSpan} title={title} style={style} aria-sort={ariaSort(sort, k)}>
    <button type="button" className={`th-sort ${on ? "on" : ""}`} onClick={() => onSort(k)} data-testid={`board-sort-${k}`}>{label}<span aria-hidden>{on ? (sort!.dir === "asc" ? " ↑" : " ↓") : ""}</span></button>
  </th>;
}

export default function PricingBoard({ sections, grouped, quotes, flash, now, expandedTicker, starred, onToggle, onStar, observe, renderDetail, emptyText, selectedTicker = null, onSelect = noop, fit = "wide", levels = 3, narrow = false, sort = null, onSort = noop }: PricingBoardProps) {
  const total = sections.reduce((n, [, l]) => n + l.length, 0);
  const span = narrow ? NARROW_SPAN : levels === 3 ? BOARD_COLUMNS : BOARD_COLUMNS_ONE_LEVEL;
  const sideHead = (kind: "b" | "a") => {
    const order = kind === "b" ? (levels === 3 ? [3, 2, 1] : [1]) : (levels === 3 ? [1, 2, 3] : [1]);
    return order.flatMap((n, i) => [
      <th key={`${kind}p${n}`} className={`num ${i === 0 ? "group-start" : ""}`}>{levels === 1 ? "Giá" : `Giá ${n}`}</th>,
      <th key={`${kind}v${n}`} className="num">{levels === 1 ? "KL" : `KL ${n}`}</th>,
    ]);
  };
  return (
    <table className="scan-table board-table" aria-label="Bảng giá trực tuyến">
      {narrow ? (
        <thead><tr>
          <SortTh label="Mã" k="ticker" sort={sort} onSort={onSort} className="text-left" />
          <th className="num">Giá</th><th className="num">%</th><th className="num">Tổng KL</th>
        </tr></thead>
      ) : (
        <thead>
          <tr className="th-group">
            <SortTh label="Mã" k="ticker" sort={sort} onSort={onSort} className="text-left" rowSpan={2} />
            <th className="num group-start" style={{ color: COLOR.ceil }} rowSpan={2}>Trần</th>
            <th className="num" style={{ color: COLOR.floor }} rowSpan={2}>Sàn</th>
            <th className="num" style={{ color: COLOR.ref }} rowSpan={2}>TC</th>
            <th className="text-center group-start head-bid" colSpan={levels * 2}>Bên mua</th>
            <th className="text-center group-start head-match" colSpan={3}>Khớp lệnh</th>
            <th className="text-center group-start head-ask" colSpan={levels * 2}>Bên bán</th>
            <th className="num group-start" rowSpan={2}>Tổng KL</th>
            <th className="num" rowSpan={2}>Cao</th>
            <th className="num" rowSpan={2}>Thấp</th>
            <SortTh label="Smart" k="smartScore" sort={sort} onSort={onSort} className="num group-start" rowSpan={2} title="Smart Score — Siêu Quét AI. Sắp xếp theo mã hoặc Smart vì giá realtime chỉ tải cho các dòng đang hiển thị." />
          </tr>
          <tr>
            {sideHead("b")}
            <th className="num group-start">Giá</th><th className="num">+/-</th><th className="num">%</th>
            {sideHead("a")}
          </tr>
        </thead>
      )}
      <tbody>
        {sections.map(([name, list]) => (
          <Fragment key={name || "all"}>
            {grouped && (
              <tr className="scan-section">
                <td colSpan={span}>
                  <span className="text-cyan-200 font-semibold">{name}</span>
                  <span className="text-slate-400"> · {list.length} mã</span>
                </td>
              </tr>
            )}
            {list.map((item) => {
              const f = flash[item.ticker];
              return (
                <Fragment key={item.ticker}>
                  <BoardRow item={item} q={quotes[item.ticker]} flash={f && now - f.at < 1200 ? f.dir : null}
                    expanded={expandedTicker === item.ticker} starred={starred.has(item.ticker)}
                    onToggle={onToggle} onStar={onStar} observe={observe}
                    selected={selectedTicker === item.ticker} onSelect={onSelect} fit={fit} levels={levels} narrow={narrow} />
                  {expandedTicker === item.ticker && narrow && <NarrowLadder item={item} q={quotes[item.ticker]} />}
                  {expandedTicker === item.ticker && renderDetail(item.ticker, span)}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
        {total === 0 && (
          <tr><td colSpan={span} className="scan-empty">{emptyText}</td></tr>
        )}
      </tbody>
    </table>
  );
}
