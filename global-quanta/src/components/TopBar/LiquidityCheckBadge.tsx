// TOPBAR — thanh khoản lũy kế 10:30 (spec §6.5, §7.3): so với các phiên trước cùng khung giờ (≥ 10 phiên, độ lệch chuẩn mẫu).
// Đo bằng GIÁ TRỊ khi Gateway đã ghi đủ 10 phiên, trước đó bằng KHỐI LƯỢNG (ghi rõ). Thiếu lịch sử / std = 0 -> không có z.
// Ngưỡng mô tả LIQ-r1: |z| ≥ 1 đáng chú ý, |z| ≥ 2 bất thường — chỉ nói thanh khoản khác thường, KHÔNG nói hướng giá.
import Popover, { PopTrigger, usePopover } from './Popover';
import StatusTag, { describeMeta } from './StatusTag';
import type { Block, LiquidityData } from '../../hooks/useTopbar';

export const LIQ_RULE = { version: 'LIQ-r1', notable: 1, extreme: 2 };
const fmt = (v: number | null, measure: LiquidityData['measure']) =>
  v == null ? '—' : measure === 'value' ? `${Math.round(v / 1e9).toLocaleString('vi-VN')} tỷ` : `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr CP`;

export function liqSignal(z: number | null) {
  if (z == null) return null;
  const a = Math.abs(z);
  return a >= LIQ_RULE.extreme ? { cls: 'extreme', text: z > 0 ? 'CAO BẤT THƯỜNG' : 'THẤP BẤT THƯỜNG' } : a >= LIQ_RULE.notable ? { cls: 'elevated', text: z > 0 ? 'CAO HƠN THƯỜNG' : 'THẤP HƠN THƯỜNG' } : { cls: 'normal', text: 'BÌNH THƯỜNG' };
}

export function LiquidityDetail({ block }: { block: Block<LiquidityData> }) {
  const d = block.data;
  if (!d) return <p className="tb-note">{describeMeta(block.meta)}</p>;
  const sig = liqSignal(d.z);
  const hist = d.history.filter((h) => h.v != null) as { date: string; v: number }[];
  const max = Math.max(1, d.current ?? 0, ...hist.map((h) => h.v));
  return (
    <div data-testid="tb-liq-detail">
      <div className="liq-panel-chart" role="img" aria-label={`Lũy kế tới ${d.cutoff}: ${hist.length} phiên trước và hôm nay`}>
        {hist.slice(-12).map((h) => (
          <div className="liq-bar-col" key={h.date} title={`${h.date}: ${fmt(h.v, d.measure)}`}>
            <div className="liq-bar-track"><div className="liq-bar-fill liq-bar-history" style={{ height: `${(h.v / max) * 100}%` }} /></div>
            <span className="liq-bar-label">{h.date.slice(8)}</span>
          </div>
        ))}
        <div className="liq-bar-col liq-bar-today">
          <div className="liq-bar-track">{d.current != null && <div className={`liq-bar-fill ${(d.deviationPct ?? 0) >= 0 ? 'liq-bar-up' : 'liq-bar-down'}`} style={{ height: `${(d.current / max) * 100}%` }} />}</div>
          <span className="liq-bar-label liq-bar-label-today">Nay</span>
        </div>
      </div>
      <div className="liq-panel-stats">
        <div className="liq-stat-row"><span>Hôm nay tới {d.cutoff}</span><span className="num">{fmt(d.current, d.measure)}</span></div>
        <div className="liq-stat-row"><span>Trung bình {d.n} phiên</span><span className="num">{fmt(d.mean, d.measure)}</span></div>
        <div className="liq-stat-row"><span>Độ lệch chuẩn (mẫu)</span><span className="num">{fmt(d.std, d.measure)}</span></div>
        <div className="liq-stat-row"><span>Chênh lệch</span><span className="num">{d.deviationPct == null ? '—' : `${d.deviationPct >= 0 ? '+' : ''}${d.deviationPct.toFixed(0)}%`}</span></div>
        <div className="liq-stat-row liq-stat-highlight"><span>Z-score</span><span className="num">{d.z == null ? '—' : `${d.z >= 0 ? '+' : ''}${d.z.toFixed(2).replace('.', ',')}σ`}</span></div>
      </div>
      {sig && <div className={`liq-panel-signal liq-signal-${sig.cls}`}>{sig.text}</div>}
      <p className="liq-panel-note">
        Thước đo: <b>{d.measure === 'value' ? 'giá trị khớp lệnh' : 'khối lượng khớp lệnh'}</b> VN-Index lũy kế 09:00–{d.cutoff}, so cùng khung giờ các phiên trước.
        {' '}Ngưỡng {LIQ_RULE.version}: |z| ≥ {LIQ_RULE.notable} đáng chú ý, ≥ {LIQ_RULE.extreme} bất thường — chỉ mô tả mức thanh khoản, không phải hướng giá.
        {d.reason ? ` ${d.reason}` : ''} {block.meta.reason && block.meta.reason !== d.reason ? block.meta.reason : ''}
      </p>
    </div>
  );
}

export default function LiquidityCheckBadge({ block }: { block: Block<LiquidityData> }) {
  const pop = usePopover();
  const d = block.data;
  const sig = liqSignal(d?.z ?? null);
  return (
    <div className="liq-check" data-testid="tb-liq">
      <PopTrigger pop={pop} label={`Thanh khoản lũy kế 10:30 — ${describeMeta(block.meta)}`} className="liq-trigger">
        <span className="liq-label">TK 10:30</span>
        <span className="liq-val num">{fmt(d?.current ?? null, d?.measure ?? 'volume')}</span>
        {d?.deviationPct != null
          ? <span className={`liq-badge ${d.deviationPct > 0 ? 'hot' : 'cold'} ${sig && sig.cls !== 'normal' ? 'alert' : ''}`}><span aria-hidden>{d.deviationPct >= 0 ? '▲' : '▼'}</span> {d.deviationPct >= 0 ? '+' : ''}{d.deviationPct.toFixed(0)}%</span>
          : <StatusTag meta={block.meta} compact />}
      </PopTrigger>
      <Popover pop={pop} title="Thanh khoản lũy kế 10:30"><LiquidityDetail block={block} /></Popover>
    </div>
  );
}
