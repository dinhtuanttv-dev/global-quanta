import { Fragment, memo, type ReactNode } from "react";
import type { MarketQuote } from "../../../services/marketDataClient";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import type { FlashDir } from "../../../hooks/useBoardQuotes";

// Bảng giá trực tuyến kiểu SSI: Trần/Sàn/TC · 3 bước giá mua · khớp lệnh · 3 bước giá bán · tổng KL ·
// cao/thấp. Quy ước màu bảng giá VN: tím = trần, xanh lơ = sàn, vàng = tham chiếu, xanh lá = tăng,
// đỏ = giảm. Giá hiển thị theo nghìn đồng (62.80 = 62.800đ), khối lượng theo cổ phiếu.

export const BOARD_COLUMNS = 23;
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
}

const BoardRow = memo(function BoardRow({ item, q, flash, expanded, starred, onToggle, onStar, observe, selected, onSelect }: RowProps) {
  const matchColor = priceColor(q?.price, q);
  const bid = q?.bid ?? [], ask = q?.ask ?? [];
  // Ô gọn (2px mỗi bên) để 23 cột vừa khung 1366px mà không phải cuộn ngang.
  const cell = "px-0.5 text-right tabular-nums";
  const flashBg = flash === "up" ? "rgba(34,197,94,0.28)" : flash === "down" ? "rgba(244,63,94,0.28)" : undefined;
  const side = (lv: { price: number; volume: number } | undefined) => (
    <>
      <td className={cell} style={{ color: priceColor(lv?.price, q) }}>{levelPrice(lv, q?.session)}</td>
      <td className={`${cell} text-slate-300`}>{fmtVol(lv?.volume)}</td>
    </>
  );
  return (
    <tr ref={(el) => observe(el, item.ticker)} data-ticker={item.ticker} tabIndex={0} aria-expanded={expanded}
      title="Bấm để chọn mã (Action Center, Radar…) · nhấn đúp (hoặc Enter) để xem phân tích khối lượng"
      aria-selected={selected}
      onClick={() => onSelect(item.ticker)}
      onDoubleClick={() => onToggle(item.ticker)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onToggle(item.ticker); } }}
      className={`border-b border-white/5 hover:bg-white/5 cursor-pointer select-none ${expanded ? "bg-cyan-950/30" : ""} ${selected ? "shadow-[inset_3px_0_0_#f59e0b]" : ""}`}>
      <td className="pl-1 pr-2 py-1 font-semibold whitespace-nowrap sticky left-0 z-[1]" style={{ background: "#0d111a", color: matchColor }}>
        <button type="button" aria-pressed={starred} aria-label={starred ? `Bỏ ${item.ticker} khỏi danh mục` : `Thêm ${item.ticker} vào danh mục`}
          onClick={(e) => { e.stopPropagation(); onStar(item.ticker); }} onDoubleClick={(e) => e.stopPropagation()}
          className={`mr-1 font-sans ${starred ? "text-amber-400" : "text-slate-600 hover:text-amber-300"}`}>{starred ? "★" : "☆"}</button>
        {item.ticker}
      </td>
      <td className={cell} style={{ color: COLOR.ceil }}>{fmtPrice(q?.ceiling)}</td>
      <td className={cell} style={{ color: COLOR.floor }}>{fmtPrice(q?.floor)}</td>
      <td className={cell} style={{ color: COLOR.ref }}>{fmtPrice(q?.refPrice)}</td>
      {side(bid[2])}{side(bid[1])}{side(bid[0])}
      <td className={`${cell} font-semibold border-l border-white/10`} style={{ color: matchColor, background: flashBg, transition: "background 0.6s" }}>{fmtPrice(q?.price)}</td>
      <td className={cell} style={{ color: matchColor }}>{q?.change ? `${q.change > 0 ? "+" : ""}${(q.change / 1000).toFixed(2)}` : ""}</td>
      <td className={`${cell} border-r border-white/10`} style={{ color: matchColor }}>{q?.changePct !== null && q?.changePct !== undefined && q.price ? `${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(2)}%` : ""}</td>
      {side(ask[0])}{side(ask[1])}{side(ask[2])}
      <td className={`${cell} text-slate-200 border-l border-white/10`}>{fmtVol(q?.totalVolume)}</td>
      <td className={cell} style={{ color: priceColor(q?.high, q) }}>{fmtPrice(q?.high)}</td>
      <td className={cell} style={{ color: priceColor(q?.low, q) }}>{fmtPrice(q?.low)}</td>
      <td className={`${cell} text-amber-400 border-l border-white/10`} title="Smart Score (Siêu Quét AI)">{item.smartScore !== null ? item.smartScore.toFixed(1) : "—"}</td>
    </tr>
  );
});

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
}

const noop = () => {};

export default function PricingBoard({ sections, grouped, quotes, flash, now, expandedTicker, starred, onToggle, onStar, observe, renderDetail, emptyText, selectedTicker = null, onSelect = noop }: PricingBoardProps) {
  const th = "px-0.5 font-normal text-right";
  const total = sections.reduce((n, [, l]) => n + l.length, 0);
  return (
    <table className="w-full text-[10px] font-mono" aria-label="Bảng giá trực tuyến">
      <thead className="text-slate-400 sticky top-0 z-10" style={{ background: "#0f1420" }}>
        <tr className="text-[9.5px] text-slate-500 border-b border-white/5">
          <th className="text-left pl-1 font-normal sticky left-0" style={{ background: "#0f1420" }} rowSpan={2}>Mã</th>
          <th className="font-normal" style={{ color: COLOR.ceil }} rowSpan={2}>Trần</th>
          <th className="font-normal" style={{ color: COLOR.floor }} rowSpan={2}>Sàn</th>
          <th className="font-normal" style={{ color: COLOR.ref }} rowSpan={2}>TC</th>
          <th className="font-normal text-center border-l border-white/10" colSpan={6}>Bên mua</th>
          <th className="font-normal text-center border-x border-white/10" colSpan={3}>Khớp lệnh</th>
          <th className="font-normal text-center" colSpan={6}>Bên bán</th>
          <th className="font-normal border-l border-white/10" rowSpan={2}>Tổng KL</th>
          <th className="font-normal" rowSpan={2}>Cao</th>
          <th className="font-normal" rowSpan={2}>Thấp</th>
          <th className="font-normal border-l border-white/10" rowSpan={2} title="Smart Score — Siêu Quét AI">Smart</th>
        </tr>
        <tr className="border-b border-white/10 text-[9.5px]">
          {["Giá 3", "KL 3", "Giá 2", "KL 2", "Giá 1", "KL 1"].map((h, i) => <th key={`b${h}`} className={`${th} ${i === 0 ? "border-l border-white/10" : ""}`}>{h}</th>)}
          <th className={`${th} border-l border-white/10`}>Giá</th><th className={th}>+/-</th><th className={`${th} border-r border-white/10`}>%</th>
          {["Giá 1", "KL 1", "Giá 2", "KL 2", "Giá 3", "KL 3"].map((h) => <th key={`a${h}`} className={th}>{h}</th>)}
        </tr>
      </thead>
      <tbody>
        {sections.map(([name, list]) => (
          <Fragment key={name || "all"}>
            {grouped && (
              <tr className="bg-white/[0.03] border-b border-white/10">
                <td colSpan={BOARD_COLUMNS} className="py-1 px-1 font-sans text-[10px]">
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
                    selected={selectedTicker === item.ticker} onSelect={onSelect} />
                  {expandedTicker === item.ticker && renderDetail(item.ticker, BOARD_COLUMNS)}
                </Fragment>
              );
            })}
          </Fragment>
        ))}
        {total === 0 && (
          <tr><td colSpan={BOARD_COLUMNS} className="py-6 text-center text-slate-500 font-sans text-[10px]">{emptyText}</td></tr>
        )}
      </tbody>
    </table>
  );
}
