// TOPBAR — VN-Index (spec §6.2): điểm, thay đổi, sparkline 30 phiên, KL và GIÁ TRỊ THẬT (SSI) từ CÙNG một snapshot,
// kèm nhãn trạng thái + thời điểm. Không có giá mô phỏng; chưa có giá -> "—" + lý do.
import Sparkline from './Sparkline';
import StatusTag, { describeMeta } from './StatusTag';
import type { Block, IndexData } from '../../hooks/useTopbar';

const fmtPts = (v: number) => v.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtSigned = (v: number, d = 2) => `${v >= 0 ? '+' : ''}${v.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
export const fmtVolume = (v: number | null) => (v == null ? '—' : v >= 1e9 ? `${(v / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} tỷ CP` : `${Math.round(v / 1e6).toLocaleString('vi-VN')} tr CP`);
export const fmtValueVnd = (v: number | null) => (v == null ? '—' : `${Math.round(v / 1e9).toLocaleString('vi-VN')} tỷ`);

export default function VnIndexHero({ block }: { block: Block<IndexData> }) {
  const d = block.data;
  const up = (d?.changePct ?? 0) >= 0;
  return (
    <div className="vn-hero" data-testid="tb-vnindex" title={describeMeta(block.meta)}>
      <div className="vn-hero-main">
        <span className="vn-hero-name">VN-INDEX <StatusTag meta={block.meta} compact /></span>
        <div className="vn-hero-valrow">
          <span className="vn-hero-val num">{d ? fmtPts(d.value) : '—'}</span>
          {d && d.change != null && d.changePct != null ? (
            <span className={`vn-hero-chg num ${up ? 'up' : 'down'}`}>
              <span aria-hidden>{up ? '▲' : '▼'}</span> {fmtSigned(d.change, 2)} ({fmtSigned(d.changePct, 2)}%)
            </span>
          ) : (
            <span className="vn-hero-chg num">{block.meta.status === 'loading' ? 'đang tải…' : block.meta.reason ?? 'chưa có giá'}</span>
          )}
        </div>
      </div>
      {d && d.series.length >= 2 && <Sparkline data={d.series.map((p) => p.value)} width={76} height={28} color={up ? 'positive' : 'negative'} />}
      <div className="vn-hero-meta">
        <span title="Khối lượng khớp lệnh (SSI)">KL <b>{fmtVolume(d?.volumeShares ?? null)}</b></span>
        <span title="Giá trị khớp lệnh HOSE (SSI, số liệu thật — không ước tính)">GT <b>{fmtValueVnd(d?.valueVnd ?? null)}</b></span>
      </div>
    </div>
  );
}
