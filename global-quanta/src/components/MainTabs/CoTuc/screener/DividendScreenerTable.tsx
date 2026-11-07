import { Star } from 'lucide-react';
import type { DividendStock } from '../../../../lib/quant-cotuc';
import { getDaysUntil, getTradePhase } from '../../../../lib/quant-cotuc';
import { dm, pct as pctTo, pctS, type ToRadarRow } from '../../../../lib/cotuc/to';
import { fmtPctValue, fmtPriceK, fmtRatioPct, fmtVnd } from '../../../../lib/cotuc/format';
import type { ScreenerColumn } from '../../../../lib/cotuc/screenerPrefs';

/**
 * Bảng chính tab Cổ tức — chuẩn Siêu Quét AI (nền #0B0F17, cyan/amber/emerald/rose, số font-mono tabular-nums).
 * Nhóm cột: Mã · CỔ TỨC & LỊCH · ĐỊNH GIÁ · CHU KỲ & XÁC SUẤT · KQKD · QUYẾT ĐỊNH. Header dính khi cuộn.
 * Không hiện "N/A"/"0/100": thiếu dữ liệu dùng badge trạng thái ghi rõ lý do (chưa có lịch, chưa đủ mẫu, chưa có số liệu…).
 */
export type SortField = 'ticker' | 'dividendYield' | 'score' | 'pe' | 'roe' | 'price';

export interface ScreenerTableProps {
  rows: DividendStock[];
  sortField: string;
  sortAsc: boolean;
  onSort: (field: SortField) => void;
  onSelect: (s: DividendStock) => void;
  isPinned: (ticker: string) => boolean;
  onTogglePin: (ticker: string) => void;
  selectedTicker?: string | null;
  realRsMap: Record<string, number | null | undefined>;
  /** TO-v1: đợt cổ tức tiền đang diễn ra của mã (Radar Săn cổ tức, Gateway). Thay tín hiệu W1–W5 / bộ máy quyết định của Project A. */
  toByTicker?: ReadonlyMap<string, ToRadarRow>;
  livePrices: Record<string, number>;
  liveChangePct: Record<string, number | null | undefined>;
  flash: Record<string, { dir: 'up' | 'down'; at: number }>;
  now: number;
  /** BL4: cột đang ẩn (chọn cột theo tài khoản). Mã · Ngành và nút ghim luôn hiện. */
  hidden?: ReadonlySet<ScreenerColumn>;
}

function Badge({ children, tone, title }: { children: React.ReactNode; tone: 'cyan' | 'amber' | 'emerald' | 'rose' | 'violet' | 'muted' | 'neon'; title?: string }) {
  const cls = {
    cyan: 'text-cyan-300 border-cyan-400/30 bg-cyan-400/10',
    amber: 'text-amber-300 border-amber-400/35 bg-amber-400/10',
    emerald: 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10',
    rose: 'text-rose-300 border-rose-400/35 bg-rose-400/10',
    violet: 'text-violet-300 border-violet-400/30 bg-violet-400/10',
    muted: 'text-slate-500 border-white/10 bg-white/[0.02]',
    neon: 'text-emerald-200 border-emerald-400/60 bg-emerald-400/20 shadow-[0_0_10px_rgba(52,211,153,0.35)]',
  }[tone];
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-[1px] text-[10px] font-semibold ${cls}`}>{children}</span>;
}

function DateCell({ date, kind }: { date: string; kind: 'ex' | 'pay' | 'agm' }) {
  if (!date) return <Badge tone="muted" title="Chưa có thông báo từ VNDirect">chưa có lịch</Badge>;
  const d = getDaysUntil(date);
  const soon = d !== null && d >= 0 && d <= 7;
  const color = soon ? (kind === 'ex' ? 'text-rose-300' : kind === 'pay' ? 'text-emerald-300' : 'text-violet-300') : d !== null && d < 0 ? 'text-slate-500' : 'text-slate-200';
  return (
    <div className="leading-tight">
      <span className={`font-mono tabular-nums text-[10.5px] ${color} ${soon ? 'font-semibold' : ''}`}>{date.slice(0, 5)}<span className="text-slate-600">{date.slice(5)}</span></span>
      {d !== null && d >= 0 && <span className="block font-mono tabular-nums text-[10px] text-slate-500">còn {d} ngày</span>}
      {d !== null && d < -60 && kind === 'ex' && <span className="block text-[10px] text-slate-600">đợt cũ</span>}
    </div>
  );
}

const TH = 'sticky z-10 bg-[#0b0f17] px-1.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-white/10 leading-tight align-bottom';
const TD = 'px-1.5 py-1.5 border-b border-white/[0.05] align-middle';

function SortHead({ field, label, sortField, sortAsc, onSort, right, title }: { field: SortField; label: string; sortField: string; sortAsc: boolean; onSort: (f: SortField) => void; right?: boolean; title?: string }) {
  const active = sortField === field;
  return (
    <th className={`${TH} top-[25px] ${right ? 'text-right' : 'text-left'}`} title={title} aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)} className={`inline-flex items-center gap-1 uppercase ${active ? 'text-cyan-300' : 'hover:text-slate-300'}`}>
        {label}<span aria-hidden className="text-[10px]">{active ? (sortAsc ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

export function DividendScreenerTable(p: ScreenerTableProps) {
  const show = (c: ScreenerColumn) => !p.hidden?.has(c);
  const GROUPS: [string, ScreenerColumn[], string][] = [
    ['Cổ tức & lịch', ['price', 'yield', 'ex', 'payAgm'], 'text-cyan-400/80'], ['Định giá', ['pe', 'roe', 'fm'], 'text-amber-300/80'],
    ['Săn cổ tức (TO)', ['window', 'expected'], 'text-emerald-300/80'], ['KQKD', ['growth'], 'text-violet-300/80'], ['Cảnh báo TO', ['decision'], 'text-slate-400'],
  ];
  const groups: [string, number, string][] = [['', 2, ''], ...GROUPS.map(([g, cs, cls]) => [g, cs.filter(show).length, cls] as [string, number, string]).filter((g) => g[1] > 0)];
  const nCols = groups.reduce((n, g) => n + g[1], 0);
  return (
    <div className="tw-scope max-h-[70vh] overflow-auto rounded-xl border border-white/[0.06] bg-[#0b0f17]">
      {/* F2 (06/11/2026): gộp "Thanh toán" + "ĐHCĐ" thành một cột hai dòng, đệm ô 6px -> bảng vừa khung chính ở màn 1366–1440. */}
      <table className="w-full min-w-[840px] border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr>
            {groups.map(([g, span, cls], i) => (
              <th key={i} colSpan={span} className={`${TH} top-0 h-[25px] text-left ${cls} ${g ? 'border-l border-white/[0.06]' : ''}`}>{g}</th>
            ))}
          </tr>
          <tr>
            <th className={`${TH} top-[25px] w-7`} aria-label="Ghim" />
            <SortHead field="ticker" label="Mã · Ngành" {...p} />
            {show('price') && <SortHead field="price" label="Giá" right {...p} title="Giá khớp trực tiếp SSI (nghìn đồng)" />}
            {show('yield') && <SortHead field="dividendYield" label="Yield 12T" right {...p} title="Cổ tức tiền 12 tháng gần nhất / giá hiện tại (VNDirect + SSI)" />}
            {show('ex') && <th className={`${TH} top-[25px] text-left`}>GDKHQ</th>}
            {show('payAgm') && <th className={`${TH} top-[25px] text-left`} title="Dòng trên: ngày thanh toán cổ tức · dòng dưới: ngày ĐHCĐ">Thanh toán · ĐHCĐ</th>}
            {show('pe') && <SortHead field="pe" label="P/E" right {...p} />}
            {show('roe') && <SortHead field="roe" label="ROE" right {...p} />}
            {show('fm') && <SortHead field="score" label="Hạng NT" right {...p} title="Mô hình nhân tố FM-v1: phân vị 0–100 trong danh mục (6 nhóm: lợi suất, độ bền, tăng trưởng, chất lượng, định giá, rủi ro thấp; chuẩn hoá theo ngành) · Q1–Q5 = ngũ phân vị" />}
            {show('window') && <th className={`${TH} top-[25px] text-left`} title="Đợt cổ tức tiền đang chờ GDKHQ: đủ điều kiện quy tắc TO-r1 chưa, phiên bán (cuối còn quyền), kịp T+2 không">Săn cổ tức</th>}
            {show('expected') && <th className={`${TH} top-[25px] text-right`} title="Lợi nhuận vượt VN-Index mỗi lệnh (sau phí) của nhóm lợi suất này trong quá khứ — MÔ TẢ">Kỳ vọng nhóm</th>}
            {show('growth') && <th className={`${TH} top-[25px] text-right`} title="Tăng trưởng LNST công ty mẹ quý gần nhất so với cùng kỳ (KQKD Gateway)">LNST YoY</th>}
            {show('decision') && <th className={`${TH} top-[25px] text-left`}>Cảnh báo</th>}
          </tr>
        </thead>
        <tbody>
          {p.rows.length === 0 && (
            <tr><td colSpan={nCols} className="py-10 text-center text-[11px] text-slate-500">Không có mã nào phù hợp bộ lọc — nới lỏng ngưỡng hoặc bấm “Xóa lọc”.</td></tr>
          )}
          {p.rows.map((s) => {
            const to = p.toByTicker?.get(s.ticker) ?? null;
            const live = p.livePrices[s.ticker];
            const price = live ?? (s.price > 0 ? s.price : null);
            const chg = p.liveChangePct[s.ticker];
            const fl = p.flash[s.ticker];
            const flashing = fl && p.now - fl.at < 1200;
            const phase = getTradePhase(s);
            const growth = s.npatYoY ?? null;
            const selected = s.ticker === p.selectedTicker;
            return (
              <tr key={s.ticker} onClick={() => p.onSelect(s)} data-testid="screener-row"
                className={`cursor-pointer transition-colors hover:bg-cyan-400/[0.05] ${selected ? 'bg-amber-400/[0.06]' : ''}`}>
                <td className={`${TD} w-7`}>
                  <button type="button" aria-label={p.isPinned(s.ticker) ? `Bỏ ghim ${s.ticker}` : `Ghim ${s.ticker}`}
                    onClick={(e) => { e.stopPropagation(); p.onTogglePin(s.ticker); }}
                    className={p.isPinned(s.ticker) ? 'text-amber-300' : 'text-slate-600 hover:text-slate-300'}>
                    <Star className="h-3.5 w-3.5" fill={p.isPinned(s.ticker) ? 'currentColor' : 'none'} />
                  </button>
                </td>
                <td className={TD}>
                  <span className="font-mono text-[12px] font-semibold text-cyan-200">{s.ticker}</span>
                  <span className="block max-w-[8.5rem] truncate text-[10px] text-slate-500" title={s.sector}>{s.sector}</span>
                </td>
                {show("price") && (<td className={`${TD} text-right`}>
                  <span className={`font-mono tabular-nums text-[11.5px] rounded px-0.5 transition-colors ${flashing ? (fl.dir === 'up' ? 'bg-emerald-400/25' : 'bg-rose-400/25') : ''} ${chg == null ? 'text-slate-200' : chg >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtPriceK(price)}</span>
                  {typeof chg === 'number' && <span className={`block font-mono tabular-nums text-[10px] ${chg >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>{chg >= 0 ? '+' : '−'}{Math.abs(chg).toFixed(2)}%</span>}
                </td>)}
                {show("yield") && (<td className={`${TD} text-right border-l border-white/[0.04]`}>
                  {s.dividendYield > 0
                    ? <span className="font-mono tabular-nums text-[11.5px] font-semibold text-emerald-300">{fmtPctValue(s.dividendYield)}{s.yieldAnomaly && <span className="ml-1 cursor-help rounded border border-amber-400/50 bg-amber-400/10 px-1 font-sans text-[10px] font-bold text-amber-300" data-testid={`yield-anomaly-${s.ticker}`} title={`Tỷ suất 12 tháng có thể không đại diện: ${s.yieldAnomaly.reasons.join("; ")}. Số được giữ nguyên, chỉ cảnh báo.`}>⚠</span>}{s.dq?.trap && <span className="ml-1 cursor-help rounded border border-rose-400/50 bg-rose-400/10 px-1 font-sans text-[10px] font-bold text-rose-300" data-testid={`yield-trap-${s.ticker}`} title={`Có dấu hiệu bẫy lợi suất: ${s.dq.trap.join("; ")}`}>bẫy?</span>}</span>
                    : <Badge tone="muted" title="Không có cổ tức tiền mặt trong 12 tháng gần nhất">0%</Badge>}
                  <span className="block font-mono tabular-nums text-[10px] text-slate-500">
                    {s.dividendAmount > 0 ? `${fmtVnd(s.dividendAmount)} đ/cp` : '—'}
                    {s.dq?.yield.fy != null && <span className="ml-1 text-slate-400" title={`Lợi suất theo cổ tức năm tài chính ${s.dq.yield.fyYear} (không gồm khoản trả dồn)${s.dq.yield.catchUp ? " — 12 tháng gần nhất có trả dồn nhiều năm" : ""}`}>· NTC {fmtPctValue(Math.round(s.dq.yield.fy * 1000) / 10)}{s.dq.yield.catchUp ? "*" : ""}</span>}
                    {s.specialDividend && <span className="ml-1 text-amber-300" title="Có đợt chi lớn bất thường trong 12 tháng (≥ 2× mức thường lệ) — tỷ suất có thể không lặp lại">ĐB</span>}
                  </span>
                </td>)}
                {show("ex") && (<td className={TD}><DateCell date={s.exDividendDate} kind="ex" /></td>)}
                {show("payAgm") && (<td className={TD}>
                  <div className="flex flex-col gap-1">
                    <span className="flex items-baseline gap-1"><span className="text-[10px] text-slate-500">TT</span><DateCell date={s.paymentDate} kind="pay" /></span>
                    <span className="flex items-baseline gap-1"><span className="text-[10px] text-slate-500">ĐH</span><DateCell date={s.agmDate} kind="agm" /></span>
                  </div>
                </td>)}
                {show("pe") && (<td className={`${TD} text-right border-l border-white/[0.04]`}>
                  {s.fundamentalsReal && s.pe > 0 ? <span className="font-mono tabular-nums text-slate-200">{s.pe.toFixed(1)}x</span> : <Badge tone="muted" title={s.fundamentalsReal ? 'EPS âm hoặc ≈ 0 — P/E không có nghĩa' : 'Chưa có số liệu thật'}>—</Badge>}
                </td>)}
                {show("roe") && (<td className={`${TD} text-right`}>
                  {s.fundamentalsReal ? <span className={`font-mono tabular-nums ${s.roe >= 15 ? 'text-emerald-300' : s.roe < 0 ? 'text-rose-300' : 'text-slate-200'}`}>{fmtPctValue(s.roe)}</span> : <Badge tone="muted" title="Chưa có số liệu thật">—</Badge>}
                </td>)}
                {show("fm") && (<td className={`${TD} text-right`}>
                  {s.fm
                    ? <span className="leading-tight" title={`FM-v1: hạng ${s.fm.rank}/${s.fm.of} · Q${s.fm.quintile} · ${s.fm.label === "THĂM DÒ" ? "đã qua kiểm định đặt trước (THĂM DÒ)" : "MÔ TẢ — chưa qua kiểm định dự báo"}`}><span className={`font-mono tabular-nums font-semibold ${s.fm.quintile >= 5 ? 'text-emerald-300' : s.fm.quintile >= 4 ? 'text-amber-300' : 'text-slate-300'}`}>{Math.round(s.fm.pct * 100)}</span><span className="block font-mono text-[10px] text-slate-500">Q{s.fm.quintile}</span></span>
                    : <Badge tone="muted" title="Chưa đủ 4/6 nhóm nhân tố có dữ liệu">—</Badge>}
                </td>)}
                {show("window") && (<td className={`${TD} border-l border-white/[0.04]`}>
                  {to ? (
                    <div className="leading-tight" data-testid={`to-cell-${s.ticker}`}>
                      <Badge tone={to.qualifies ? (to.t2Ok ? 'emerald' : 'amber') : 'muted'} title={to.qualifies ? 'Đủ điều kiện quy tắc TO-r1 (THĂM DÒ — chưa phải khuyến nghị)' : 'Chưa đủ điều kiện TO-r1 (lợi suất ≥ 5%, GTGD ≥ 1 tỷ, không trần lúc vào)'}>{to.qualifies ? 'ĐỦ ĐK · THĂM DÒ' : 'chưa đủ ĐK'}</Badge>
                      <span className="block font-mono tabular-nums text-[10px] text-slate-500">bán {dm(to.lastCumDate)} · còn {to.sessionsLeft ?? '—'} phiên</span>
                    </div>
                  ) : <Badge tone="muted" title={phase.label}>{phase.icon} {phase.label}</Badge>}
                </td>)}
                {show("expected") && (<td className={`${TD} text-right`}>
                  {to?.expected?.mean != null
                    ? <div className="leading-tight"><span className={`font-mono tabular-nums font-semibold ${to.expected.mean >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{pctS(to.expected.mean, 1)}</span>
                        <span className="block font-mono tabular-nums text-[10px] text-slate-500">nhóm {to.bucket} · {to.expected.n} lệnh · thắng {pctTo(to.expected.hit, 0)}</span></div>
                    : <Badge tone="muted" title="Không có đợt cổ tức tiền nào đang chờ GDKHQ">—</Badge>}
                </td>)}
                {show("growth") && (<td className={`${TD} text-right border-l border-white/[0.04]`}>
                  {growth != null
                    ? <span className={`font-mono tabular-nums font-semibold ${growth >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtRatioPct(growth, { digits: 0, signed: true })}</span>
                    : <Badge tone="muted" title="Chưa có BCTC quý so sánh cùng kỳ">—</Badge>}
                </td>)}
                {show("decision") && (<td className={`${TD} border-l border-white/[0.04]`}>
                  {to ? <div className="flex flex-wrap gap-1">
                      {!to.t2Ok && <Badge tone="rose" title="Vào ở phiên sớm nhất thì cổ phiếu chưa về kịp để bán ở phiên cuối còn quyền">không kịp T+2</Badge>}
                      {to.ranTooFar && <Badge tone="amber" title="Giá đã chạy hơn 75% số đợt cùng nhóm ở cùng số phiên">đã chạy xa</Badge>}
                      {to.weakSector && <Badge tone="amber" title="Ngành có kết quả lịch sử âm với quy tắc này">ngành yếu</Badge>}
                      {to.limitUpEntry && <Badge tone="rose" title="Phiên đầu sau công bố tăng trần">trần lúc vào</Badge>}
                      {to.t2Ok && !to.ranTooFar && !to.weakSector && !to.limitUpEntry && <Badge tone="muted">không có</Badge>}
                    </div>
                    : <Badge tone="muted">—</Badge>}
                </td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DividendScreenerTable;
