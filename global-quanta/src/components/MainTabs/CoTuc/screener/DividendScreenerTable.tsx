import { Star } from 'lucide-react';
import type { DividendStock } from '../../../../lib/quant-cotuc';
import { calcRealDividendQualityScore, detectRiskFlags, getDaysUntil, getTradePhase, isQualityScoreReal } from '../../../../lib/quant-cotuc';
import type { TimingSignal } from '../../../../lib/cotuc/timing-types';
import type { DecisionSnapshot } from '../../../../lib/cotuc/decision';
import { fmtOffset, fmtPctValue, fmtPriceK, fmtRatioPct, fmtVnd } from '../../../../lib/cotuc/format';

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
  timingByTicker: ReadonlyMap<string, TimingSignal>;
  decisionsByTicker: ReadonlyMap<string, DecisionSnapshot>;
  livePrices: Record<string, number>;
  liveChangePct: Record<string, number | null | undefined>;
  flash: Record<string, { dir: 'up' | 'down'; at: number }>;
  now: number;
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
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-[1px] text-[9.5px] font-semibold ${cls}`}>{children}</span>;
}

function DateCell({ date, kind }: { date: string; kind: 'ex' | 'pay' | 'agm' }) {
  if (!date) return <Badge tone="muted" title="Chưa có thông báo từ VNDirect">chưa có lịch</Badge>;
  const d = getDaysUntil(date);
  const soon = d !== null && d >= 0 && d <= 7;
  const color = soon ? (kind === 'ex' ? 'text-rose-300' : kind === 'pay' ? 'text-emerald-300' : 'text-violet-300') : d !== null && d < 0 ? 'text-slate-500' : 'text-slate-200';
  return (
    <div className="leading-tight">
      <span className={`font-mono tabular-nums text-[10.5px] ${color} ${soon ? 'font-semibold' : ''}`}>{date.slice(0, 5)}<span className="text-slate-600">{date.slice(5)}</span></span>
      {d !== null && d >= 0 && <span className="block font-mono tabular-nums text-[9.5px] text-slate-500">còn {d} ngày</span>}
      {d !== null && d < -60 && kind === 'ex' && <span className="block text-[9.5px] text-slate-600">đợt cũ</span>}
    </div>
  );
}

const ACTION: Record<TimingSignal['action'], { text: string; tone: Parameters<typeof Badge>[0]['tone']; title: string }> = {
  NO_DATE: { text: 'chưa có lịch', tone: 'muted', title: 'Chưa có ngày GDKHQ (thông báo hoặc ước tính theo chu kỳ)' },
  POST_EX: { text: 'đã qua GDKHQ', tone: 'muted', title: 'Đợt cổ tức đã qua' },
  NO_SIGNAL: { text: 'chưa đủ mẫu', tone: 'muted', title: 'Chưa có cửa sổ qua cổng thống kê (≥ 8 đợt, q-value, cận dưới > 0)' },
  TOO_EARLY: { text: 'chờ vùng mua', tone: 'amber', title: 'Chưa tới vùng mua tối ưu' },
  IN_WINDOW: { text: 'TRONG VÙNG MUA', tone: 'neon', title: 'Đang trong vùng mua tối ưu' },
  WINDOW_PASSED: { text: 'đã qua vùng mua', tone: 'muted', title: 'Đã qua vùng mua của đợt này' },
};

const LEVEL = {
  FAVORABLE: { text: 'Thuận lợi', tone: 'emerald' as const },
  WATCH: { text: 'Quan sát', tone: 'amber' as const },
  AVOID: { text: 'Chưa nên', tone: 'muted' as const },
};

const TH = 'sticky z-10 bg-[#0b0f17] px-2 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-slate-500 border-b border-white/10 whitespace-nowrap';
const TD = 'px-2 py-1.5 border-b border-white/[0.05] align-middle';

function SortHead({ field, label, sortField, sortAsc, onSort, right, title }: { field: SortField; label: string; sortField: string; sortAsc: boolean; onSort: (f: SortField) => void; right?: boolean; title?: string }) {
  const active = sortField === field;
  return (
    <th className={`${TH} top-[25px] ${right ? 'text-right' : 'text-left'}`} title={title} aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)} className={`inline-flex items-center gap-1 uppercase ${active ? 'text-cyan-300' : 'hover:text-slate-300'}`}>
        {label}<span aria-hidden className="text-[8px]">{active ? (sortAsc ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

export function DividendScreenerTable(p: ScreenerTableProps) {
  const groups: [string, number, string][] = [
    ['', 2, ''], ['Cổ tức & lịch', 5, 'text-cyan-400/80'], ['Định giá', 3, 'text-amber-300/80'],
    ['Chu kỳ & xác suất', 2, 'text-emerald-300/80'], ['KQKD', 1, 'text-violet-300/80'], ['Quyết định', 1, 'text-slate-400'],
  ];
  return (
    <div className="tw-scope max-h-[70vh] overflow-auto rounded-xl border border-white/[0.06] bg-[#0b0f17]">
      <table className="w-full min-w-[1080px] border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr>
            {groups.map(([g, span, cls], i) => (
              <th key={i} colSpan={span} className={`${TH} top-0 h-[25px] text-left ${cls} ${g ? 'border-l border-white/[0.06]' : ''}`}>{g}</th>
            ))}
          </tr>
          <tr>
            <th className={`${TH} top-[25px] w-7`} aria-label="Ghim" />
            <SortHead field="ticker" label="Mã · Ngành" {...p} />
            <SortHead field="price" label="Giá" right {...p} title="Giá khớp trực tiếp SSI (nghìn đồng)" />
            <SortHead field="dividendYield" label="Yield 12T" right {...p} title="Cổ tức tiền 12 tháng gần nhất / giá hiện tại (VNDirect + SSI)" />
            <th className={`${TH} top-[25px] text-left`}>GDKHQ</th>
            <th className={`${TH} top-[25px] text-left`}>Thanh toán</th>
            <th className={`${TH} top-[25px] text-left`}>ĐHCĐ</th>
            <SortHead field="pe" label="P/E" right {...p} />
            <SortHead field="roe" label="ROE" right {...p} />
            <SortHead field="score" label="Điểm" right {...p} title="Dividend Quality Score (4 tầng) — chỉ có ở mã đủ dữ liệu chất lượng cổ tức" />
            <th className={`${TH} top-[25px] text-left`}>Cửa sổ tối ưu</th>
            <th className={`${TH} top-[25px] text-right`} title="Kỳ vọng lợi nhuận ròng (cận dưới 90%) nếu mua trong cửa sổ">Kỳ vọng ròng</th>
            <th className={`${TH} top-[25px] text-right`} title="Tăng trưởng LNST công ty mẹ kỳ vừa công bố so với cùng kỳ">LNST YoY</th>
            <th className={`${TH} top-[25px] text-left`}>Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.length === 0 && (
            <tr><td colSpan={14} className="py-10 text-center text-[11px] text-slate-500">Không có mã nào phù hợp bộ lọc — nới lỏng ngưỡng hoặc bấm “Xóa lọc”.</td></tr>
          )}
          {p.rows.map((s) => {
            const sig = p.timingByTicker.get(s.ticker);
            const dec = p.decisionsByTicker.get(s.ticker);
            const live = p.livePrices[s.ticker];
            const price = live ?? (s.price > 0 ? s.price : null);
            const chg = p.liveChangePct[s.ticker];
            const fl = p.flash[s.ticker];
            const flashing = fl && p.now - fl.at < 1200;
            const scoreReal = isQualityScoreReal(s);
            const score = calcRealDividendQualityScore(s, p.realRsMap[s.ticker], detectRiskFlags(s).length);
            const phase = getTradePhase(s);
            const growth = sig?.earnings?.profitGrowthYoY ?? null;
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
                  <span className="block max-w-[8.5rem] truncate text-[9.5px] text-slate-500" title={s.sector}>{s.sector}</span>
                </td>
                <td className={`${TD} text-right`}>
                  <span className={`font-mono tabular-nums text-[11.5px] rounded px-0.5 transition-colors ${flashing ? (fl.dir === 'up' ? 'bg-emerald-400/25' : 'bg-rose-400/25') : ''} ${chg == null ? 'text-slate-200' : chg >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtPriceK(price)}</span>
                  {typeof chg === 'number' && <span className={`block font-mono tabular-nums text-[9.5px] ${chg >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>{chg >= 0 ? '+' : '−'}{Math.abs(chg).toFixed(2)}%</span>}
                </td>
                <td className={`${TD} text-right border-l border-white/[0.04]`}>
                  {s.dividendYield > 0
                    ? <span className="font-mono tabular-nums text-[11.5px] font-semibold text-emerald-300">{fmtPctValue(s.dividendYield)}</span>
                    : <Badge tone="muted" title="Không có cổ tức tiền mặt trong 12 tháng gần nhất">0%</Badge>}
                  <span className="block font-mono tabular-nums text-[9.5px] text-slate-500">
                    {s.dividendAmount > 0 ? `${fmtVnd(s.dividendAmount)} đ/cp` : '—'}
                    {s.specialDividend && <span className="ml-1 text-amber-300" title="Có đợt chi lớn bất thường trong 12 tháng (≥ 2× mức thường lệ) — tỷ suất có thể không lặp lại">ĐB</span>}
                  </span>
                </td>
                <td className={TD}><DateCell date={s.exDividendDate} kind="ex" /></td>
                <td className={TD}><DateCell date={s.paymentDate} kind="pay" /></td>
                <td className={TD}><DateCell date={s.agmDate} kind="agm" /></td>
                <td className={`${TD} text-right border-l border-white/[0.04]`}>
                  {s.fundamentalsReal && s.pe > 0 ? <span className="font-mono tabular-nums text-slate-200">{s.pe.toFixed(1)}x</span> : <Badge tone="muted" title={s.fundamentalsReal ? 'EPS âm hoặc ≈ 0 — P/E không có nghĩa' : 'Chưa có số liệu thật'}>—</Badge>}
                </td>
                <td className={`${TD} text-right`}>
                  {s.fundamentalsReal ? <span className={`font-mono tabular-nums ${s.roe >= 15 ? 'text-emerald-300' : s.roe < 0 ? 'text-rose-300' : 'text-slate-200'}`}>{fmtPctValue(s.roe)}</span> : <Badge tone="muted" title="Chưa có số liệu thật">—</Badge>}
                </td>
                <td className={`${TD} text-right`}>
                  {scoreReal
                    ? <span className={`font-mono tabular-nums font-semibold ${score >= 80 ? 'text-emerald-300' : score >= 60 ? 'text-amber-300' : 'text-slate-300'}`}>{score}</span>
                    : <Badge tone="muted" title="Điểm chất lượng cổ tức cần đủ 3 tầng dữ liệu — hiện chỉ có ở danh mục gốc">—</Badge>}
                </td>
                <td className={`${TD} border-l border-white/[0.04]`}>
                  {sig ? (
                    <div className="leading-tight">
                      <Badge tone={ACTION[sig.action].tone} title={ACTION[sig.action].title}>{ACTION[sig.action].text}</Badge>
                      {sig.window && <span className="block font-mono tabular-nums text-[9.5px] text-slate-500">{fmtOffset(sig.window.entryFrom)}…{fmtOffset(sig.window.entryTo)}{sig.tdToEx !== null && sig.tdToEx >= 0 ? ` · GDKHQ còn ${sig.tdToEx} phiên` : ''}</span>}
                    </div>
                  ) : <Badge tone="muted" title={phase.label}>{phase.icon} {phase.label}</Badge>}
                </td>
                <td className={`${TD} text-right`}>
                  {sig?.expectedNetReturn != null
                    ? <div className="leading-tight"><span className={`font-mono tabular-nums font-semibold ${sig.expectedNetReturn >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtRatioPct(sig.expectedNetReturn, { signed: true })}</span>
                        {sig.nEvents != null && <span className="block font-mono tabular-nums text-[9.5px] text-slate-500">{sig.nEvents} đợt{sig.confidence ? ` · ${sig.confidence === 'HIGH' ? 'cao' : sig.confidence === 'MEDIUM' ? 'TB' : 'thấp'}` : ''}</span>}</div>
                    : <Badge tone="muted" title="Chưa có cửa sổ qua kiểm định">—</Badge>}
                </td>
                <td className={`${TD} text-right border-l border-white/[0.04]`}>
                  {growth != null
                    ? <span className={`font-mono tabular-nums font-semibold ${growth >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{fmtRatioPct(growth, { digits: 0, signed: true })}
                        {sig?.earnings?.conflict && sig.earnings.conflict !== 'NONE' && <span className="ml-0.5 text-amber-300" title="KQKD dự kiến sát/nằm trong thời gian nắm giữ">⚡</span>}</span>
                    : <Badge tone="muted" title="Chưa có BCTC quý so sánh cùng kỳ">—</Badge>}
                </td>
                <td className={`${TD} border-l border-white/[0.04]`}>
                  {dec ? <Badge tone={LEVEL[dec.decision.level].tone} title={dec.decision.headline}>{LEVEL[dec.decision.level].text} · {Math.round(dec.decision.combinedProbability * 100)}%</Badge>
                    : <Badge tone="muted" title="Bộ máy quyết định chưa quét tới mã này (Gateway quét xoay vòng)">đang quét</Badge>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default DividendScreenerTable;
