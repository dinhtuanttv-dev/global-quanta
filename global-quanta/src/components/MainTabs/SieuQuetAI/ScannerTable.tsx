import { Fragment, memo, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";
import type { LiveQuote } from "../../../hooks/useMarketQuotesStream";
import { industryOf } from "./scannerTaxonomy";
import { ariaSort, COLUMN_HELP, fmtKPrice, fmtPct, rowKeyDown, TREND_META, type SortKey, type SortState } from "./scannerView";

export const SCANNER_COLUMNS = 11;
export const NARROW_COLUMNS = 3;

// Bảng màu Đồng Thuận theo statusCode, giữ nguyên từ bản trước.
const CONF_COLOR: Record<string, string> = {
  THUAN_XU_HUONG_MANH: "bg-emerald-950 text-emerald-400 border-emerald-700",
  THUAN_XU_HUONG: "bg-emerald-950/60 text-emerald-400 border-emerald-800",
  DONG_THUAN_TICH_LUY: "bg-cyan-950 text-cyan-400 border-cyan-700",
  PHONG_THU_CHUAN: "bg-blue-950 text-blue-400 border-blue-700",
  THUAN_PHONG_THU: "bg-blue-950/60 text-blue-400 border-blue-800",
  DAN_DAT_NGUOC_DONG: "bg-purple-950 text-purple-400 border-purple-700",
  TRUNG_LAP: "bg-slate-800 text-slate-400 border-slate-600",
  NGHICH_XU_HUONG: "bg-rose-950 text-rose-400 border-rose-700",
};

function fmt(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toFixed(d);
}
function sourceLabel(source: string): string {
  if (source === "SSI_STREAM") return "SSI realtime";
  if (source.startsWith("SSI")) return "SSI";
  return "nguồn dự phòng";
}
const isExcluded = (i: SieuQuetStockItem) => i.piotroskiFScore !== null && i.piotroskiFScore <= Math.floor(i.fScoreMax * 3 / 9);

function ScoreBar({ value, max, color }: { value: number | null; max: number; color: string }) {
  return <span className="scan-bar" aria-hidden><i style={{ width: `${value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100))}%`, background: color }} /></span>;
}
function FPips({ item }: { item: SieuQuetStockItem }) {
  if (item.fScoreApplicable === false) return <span className="scan-na" title="F-Score không áp dụng cho ngân hàng / chứng khoán / bảo hiểm (mẫu BCTC không có lợi nhuận gộp, TSNH, nợ ngắn hạn)">N/A</span>;
  if (item.piotroskiFScore === null) return <span className="scan-na" title="Chưa đủ BCTC để đánh giá (cần ≥ 4/6 tiêu chí)">{`—/${item.fScoreMax}`}</span>;
  const excluded = isExcluded(item);
  return <span className="scan-pips" role="img" aria-label={`F-Score ${item.piotroskiFScore} trên ${item.fScoreMax}`} title={`F-Score ${item.piotroskiFScore}/${item.fScoreMax}`}>
    {Array.from({ length: item.fScoreMax }, (_, k) => <i key={k} className={k < item.piotroskiFScore! ? (excluded ? "on bad" : "on") : ""} />)}
    <b>{item.piotroskiFScore}/{item.fScoreMax}</b>
  </span>;
}
function Trend({ tag }: { tag: string | null }) {
  const m = tag ? TREND_META[tag] : null;
  if (!tag) return <>—</>;
  return <span className="whitespace-nowrap" title={m?.title}><span aria-hidden style={{ color: m?.color }}>{m?.glyph} </span>{tag}</span>;
}
function Signals({ item }: { item: SieuQuetStockItem }) {
  return <span className="scan-signals">
    {item.breakoutBoostBadge && <span className="scan-sig amber" title="Breakout">⚡<span className="sig-txt">Breakout</span></span>}
    {item.foreignNetBuyFlag && <span className="scan-sig cyan" title="Top 5 mã khối ngoại mua ròng mạnh nhất hôm nay (bản tin HOSE)">🌍<span className="sig-txt">NN mua ròng</span></span>}
  </span>;
}
const rrTitle = (item: SieuQuetStockItem) => (item.riskRewardBasis ? `Hỗ trợ ${fmtKPrice(item.riskRewardBasis.support)} · kháng cự ${fmtKPrice(item.riskRewardBasis.resistance)} (engine cấu trúc, khung ngày, ${item.riskRewardBasis.asOf})` : "Chưa có vùng hỗ trợ / kháng cự bao quanh giá");
const fmtRr = (item: SieuQuetStockItem) => (item.riskRewardRatio !== null && item.riskRewardRatio !== undefined ? fmt(item.riskRewardRatio, 2) : "—");

interface RowProps {
  item: SieuQuetStockItem; live?: LiveQuote; expanded: boolean; onToggle: (t: string) => void; observe: (el: HTMLTableRowElement | null, t: string) => void;
  starred: boolean; onStar: (t: string) => void; selected: boolean; onSelect: (t: string) => void; narrow: boolean;
}

// memo: khi giá realtime đổi, chỉ dòng của mã đó vẽ lại (bảng tới ~300 dòng).
const StockRow = memo(function StockRow({ item, live, expanded, onToggle, observe, starred, onStar, selected, onSelect, narrow }: RowProps) {
  // Giá/% ưu tiên SSI qua Market Gateway; điểm số vẫn là kết quả quét định kỳ.
  const price = live?.price ?? item.price;
  const changePct = live ? live.changePct : item.changePct;
  const priceTitle = live ? `Giá ${sourceLabel(live.source)}${live.asOf ? ` · ${live.asOf}` : ""}` : `Giá chốt lúc quét (${item.computedAt})`;
  const confClass = (item.confluenceStatusCode && CONF_COLOR[item.confluenceStatusCode]) ?? "bg-slate-800 text-slate-400 border-slate-600";
  const excluded = isExcluded(item);
  const up = (changePct ?? 0) > 0, down = (changePct ?? 0) < 0;
  const chgColor = up ? "text-emerald-400" : down ? "text-rose-400" : "text-amber-300";
  const star = <button type="button" aria-pressed={starred} aria-label={starred ? `Bỏ ${item.ticker} khỏi danh mục` : `Thêm ${item.ticker} vào danh mục`}
    title={starred ? "Bỏ khỏi danh mục đang chọn" : "Thêm vào danh mục đang chọn"} onClick={(e) => { e.stopPropagation(); onStar(item.ticker); }} onDoubleClick={(e) => e.stopPropagation()}
    className={`scan-star ${starred ? "text-amber-400" : "text-slate-500 hover:text-amber-300"}`}>{starred ? "★" : "☆"}</button>;
  const open = <button type="button" aria-expanded={expanded} aria-label={`${expanded ? "Đóng" : "Mở"} phân tích ${item.ticker}`} title={expanded ? "Đóng phân tích khối lượng" : "Mở phân tích khối lượng"} data-testid={`scan-open-${item.ticker}`}
    onClick={(e) => { e.stopPropagation(); onToggle(item.ticker); }} onDoubleClick={(e) => e.stopPropagation()} className="scan-open">{expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}</button>;
  const rowClass = `scan-row ${excluded ? "is-excluded" : ""} ${expanded ? "is-open" : ""} ${selected ? "is-selected" : ""}`;

  if (narrow) return (
    <tr ref={(el) => observe(el, item.ticker)} data-ticker={item.ticker} className={rowClass} aria-selected={selected} tabIndex={0}
      onClick={() => { onSelect(item.ticker); onToggle(item.ticker); }} onKeyDown={(e) => rowKeyDown(e, item.ticker, onToggle, onSelect)}>
      <td className="scan-ticker">{star}<b>{item.ticker}</b><div className="scan-sub">{industryOf(item)}</div></td>
      <td className="num" title={priceTitle}>{fmtKPrice(price)}<div className={`scan-chg ${chgColor}`}>{fmtPct(changePct)}</div></td>
      <td className="num scan-smart">{fmt(item.smartScore, 1)}{open}</td>
    </tr>
  );
  return (
    <tr ref={(el) => observe(el, item.ticker)} data-ticker={item.ticker} className={rowClass} aria-selected={selected} tabIndex={0}
      title="Bấm để chọn mã (Action Center, Radar…) · bấm › hoặc nhấn đúp (Enter) để xem phân tích khối lượng · ↑↓ chuyển dòng"
      onClick={() => onSelect(item.ticker)} onDoubleClick={() => onToggle(item.ticker)} onKeyDown={(e) => rowKeyDown(e, item.ticker, onToggle, onSelect)}>
      <td className="scan-ticker">
        {star}{open}<b>{item.ticker}</b>
        {item.inUniverse === false && <span className="scan-outside" title="Ngoài universe: chấm theo cùng công thức và bối cảnh của lần quét">ngoài DS</span>}
        <span className="scan-sub" title={item.sectorGroup ? `${item.sectorGroup} › ${industryOf(item)}` : undefined}>{industryOf(item)}</span>
      </td>
      <td className="num group-start" title={priceTitle}>{fmtKPrice(price)}{live && live.source.startsWith("SSI") && <span className="scan-live" aria-label="Giá SSI">●</span>}</td>
      <td className={`num ${chgColor}`}>{fmtPct(changePct)}</td>
      <td className="num group-start scan-smart"><ScoreBar value={item.smartScore} max={100} color="#f59e0b" />{fmt(item.smartScore, 1)}</td>
      <td className="num scan-rs"><ScoreBar value={item.rsRating} max={99} color="#64748b" />{fmt(item.rsRating, 1)}</td>
      <td className="group-start"><span className={`scan-conf ${confClass}`} title={item.confluenceStatusLabel ?? undefined}>{item.confluenceStatusLabel ?? "—"}</span></td>
      <td><Signals item={item} /></td>
      <td className="scan-trend"><Trend tag={item.trendTag} /></td>
      <td className="group-start"><FPips item={item} />{excluded && <span className="scan-excl" title="F-Score từ 1/3 thang trở xuống: xếp cuối bảng">Loại</span>}</td>
      <td className="num group-start" title={rrTitle(item)}>{fmtRr(item)}</td>
      <td className="num">{fmt(item.riskAdjustedMomentum, 2)}</td>
    </tr>
  );
});

/** Các cột còn lại, hiện khi mở một mã trên điện thoại. */
function NarrowDetails({ item }: { item: SieuQuetStockItem }) {
  const confClass = (item.confluenceStatusCode && CONF_COLOR[item.confluenceStatusCode]) ?? "bg-slate-800 text-slate-400 border-slate-600";
  return <tr className="scan-narrow-detail"><td colSpan={NARROW_COLUMNS}>
    <dl data-testid={`scan-details-${item.ticker}`}>
      <div><dt>RS</dt><dd>{fmt(item.rsRating, 1)}</dd></div>
      <div><dt>Trend</dt><dd><Trend tag={item.trendTag} /></dd></div>
      <div><dt>F-Score</dt><dd><FPips item={item} /></dd></div>
      <div title={rrTitle(item)}><dt>R/R</dt><dd>{fmtRr(item)}</dd></div>
      <div><dt>Risk-Adj Mom.</dt><dd>{fmt(item.riskAdjustedMomentum, 2)}</dd></div>
      <div className="wide"><dt>Đồng Thuận</dt><dd><span className={`scan-conf ${confClass}`}>{item.confluenceStatusLabel ?? "—"}</span> <Signals item={item} /></dd></div>
    </dl>
  </td></tr>;
}

function SortTh({ label, k, help, sort, onSort, className = "" }: { label: string; k: SortKey; help?: string; sort: SortState | null; onSort: (k: SortKey) => void; className?: string }) {
  const on = sort?.key === k;
  return <th className={className} aria-sort={ariaSort(sort, k)} title={help}>
    <button type="button" className={`th-sort ${on ? "on" : ""}`} onClick={() => onSort(k)} data-testid={`sort-${k}`}>{label}<span aria-hidden>{on ? (sort!.dir === "asc" ? " ↑" : " ↓") : ""}</span></button>
  </th>;
}

export interface ScannerTableProps {
  sections: [string, SieuQuetStockItem[]][]; grouped: boolean; liveQuotes: Record<string, LiveQuote>; expandedTicker: string | null;
  starred: Set<string>; selectedTicker: string | null; onToggle: (t: string) => void; onStar: (t: string) => void; onSelect: (t: string) => void;
  observe: (el: HTMLTableRowElement | null, t: string) => void; sort: SortState | null; onSort: (k: SortKey) => void; narrow: boolean; emptyText: string | null;
  renderDetail: (ticker: string, colSpan: number) => ReactNode;
}

export default function ScannerTable({ sections, grouped, liveQuotes, expandedTicker, starred, selectedTicker, onToggle, onStar, onSelect, observe, sort, onSort, narrow, emptyText, renderDetail }: ScannerTableProps) {
  const span = narrow ? NARROW_COLUMNS : SCANNER_COLUMNS;
  return (
    <table className="scan-table" aria-label="Bảng Siêu Quét AI">
      <thead>
        {narrow ? (
          <tr>
            <SortTh label="Mã" k="ticker" sort={sort} onSort={onSort} className="text-left" />
            <SortTh label="Giá · %" k="changePct" help={COLUMN_HELP.changePct} sort={sort} onSort={onSort} className="num" />
            <SortTh label="Smart" k="smartScore" help={COLUMN_HELP.smartScore} sort={sort} onSort={onSort} className="num" />
          </tr>
        ) : <>
          <tr className="th-group">
            <th>Cổ phiếu</th><th colSpan={2} className="group-start">Giá</th><th colSpan={2} className="group-start">Xếp hạng</th>
            <th colSpan={3} className="group-start">Trạng thái</th><th className="group-start">Chất lượng</th><th colSpan={2} className="group-start">Rủi ro · động lượng</th>
          </tr>
          <tr>
            <SortTh label="Mã" k="ticker" sort={sort} onSort={onSort} className="text-left" />
            <SortTh label="Giá" k="price" help={COLUMN_HELP.price} sort={sort} onSort={onSort} className="num group-start" />
            <SortTh label="%" k="changePct" help={COLUMN_HELP.changePct} sort={sort} onSort={onSort} className="num" />
            <SortTh label="Smart Score" k="smartScore" help={COLUMN_HELP.smartScore} sort={sort} onSort={onSort} className="num group-start" />
            <SortTh label="RS" k="rsRating" help={COLUMN_HELP.rsRating} sort={sort} onSort={onSort} className="num" />
            <th className="group-start" title={COLUMN_HELP.confluence}>Đồng Thuận</th>
            <th title={COLUMN_HELP.signals}>Tín hiệu</th>
            <th className="scan-trend" title={COLUMN_HELP.trend}>Trend</th>
            <SortTh label="F-Score BCTC" k="fScore" help={COLUMN_HELP.fScore} sort={sort} onSort={onSort} className="group-start" />
            <SortTh label="R/R" k="riskRewardRatio" help={COLUMN_HELP.rr} sort={sort} onSort={onSort} className="num group-start" />
            <SortTh label="Risk-Adj Mom." k="riskAdjustedMomentum" help={COLUMN_HELP.ram} sort={sort} onSort={onSort} className="num" />
          </tr>
        </>}
      </thead>
      <tbody>
        {sections.map(([name, list]) => (
          <Fragment key={name || "all"}>
            {grouped && (
              <tr className="scan-section"><td colSpan={span}>
                <span className="text-cyan-200 font-semibold">{name}</span>
                <span className="text-slate-400"> · {list.length} mã · Smart TB {(list.reduce((a, i) => a + (i.smartScore ?? 0), 0) / list.length).toFixed(1)} · ▲ {list.filter((i) => i.trendTag === "Up-Trend").length} Up-Trend</span>
              </td></tr>
            )}
            {list.map((item) => (
              <Fragment key={item.ticker}>
                <StockRow item={item} live={liveQuotes[item.ticker.toUpperCase()]} expanded={expandedTicker === item.ticker} onToggle={onToggle} observe={observe}
                  starred={starred.has(item.ticker)} onStar={onStar} selected={selectedTicker === item.ticker} onSelect={onSelect} narrow={narrow} />
                {expandedTicker === item.ticker && narrow && <NarrowDetails item={item} />}
                {expandedTicker === item.ticker && renderDetail(item.ticker, span)}
              </Fragment>
            ))}
          </Fragment>
        ))}
        {emptyText && <tr><td colSpan={span} className="scan-empty">{emptyText}</td></tr>}
      </tbody>
    </table>
  );
}
