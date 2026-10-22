// TOPBAR — độ rộng (spec §6.4, §7.2): tăng / giảm / đứng trên tổng số mã, phạm vi VNINDEX (HOSE). Chưa có số liệu -> "—"
// (không vẽ 100% một phía). Thanh 3 đoạn, mỗi đoạn có chữ đi kèm.
import StatusTag, { describeMeta } from './StatusTag';
import type { Block, BreadthData } from '../../hooks/useTopbar';

export default function MarketBreadth({ block, detailed = false }: { block: Block<BreadthData>; detailed?: boolean }) {
  const d = block.data;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  return (
    <div className={`breadth ${detailed ? 'breadth-detailed' : ''}`} title={describeMeta(block.meta)} data-testid="tb-breadth"
      aria-label={d ? `Độ rộng ${d.universe}: ${d.advances} tăng, ${d.declines} giảm, ${d.unchanged} đứng giá trên ${d.total} mã` : `Độ rộng: ${describeMeta(block.meta)}`}>
      <span className="breadth-label">Độ rộng</span>
      {d ? (
        <>
          <div className="breadth-bar" aria-hidden>
            <span style={{ width: pct(d.advanceShare) }} />
            <span className="breadth-unch" style={{ width: pct(d.unchanged / d.total) }} />
            <span style={{ width: pct(d.declineShare) }} />
          </div>
          <span className="breadth-label num">{d.advances}▲ {d.unchanged}■ {d.declines}▼</span>
          {detailed && <span className="breadth-sub">/{d.total} mã {d.universe} · trần {d.ceilings ?? '—'} · sàn {d.floors ?? '—'} · A/D {d.adRatio == null ? '—' : d.adRatio.toFixed(2).replace('.', ',')}</span>}
        </>
      ) : <span className="breadth-label num">—</span>}
      <StatusTag meta={block.meta} compact />
    </div>
  );
}
