// Top 20 v2 (T4) — Radar Top 20 đa yếu tố (mô hình M1: 18 yếu tố giá / dòng tiền / BCTC VNDirect / ngành).
// Nhãn bằng chứng T3 (KHÔNG ĐẠT -> EXPERIMENTAL), phân rã đóng góp theo nhóm, bấm mã -> thẻ chi tiết 18 yếu tố (không mở biểu đồ),
// trọng số M1 (IC 36 tháng), sổ theo dõi thực tế.
import { Fragment, useMemo, useState } from 'react';
import type { AlphaGroup, AlphaStock, AlphaTop20Response } from '../../../types/alphaTop20';

const GROUP_VI: Record<AlphaGroup, string> = { price: 'Giá', flow: 'Dòng tiền', fund: 'Cơ bản', sector: 'Ngành' };
const FACTOR_VI: Record<string, string> = {
  mom12_1: 'Momentum 12-1', mom6_1: 'Momentum 6-1', resRs63: 'RS phần dư 63 phiên', high52: 'Gần đỉnh 52 tuần', trend: 'Trend Template', lowVol60: 'Biến động 60 phiên',
  foreign20: 'Khối ngoại ròng 20 phiên', foreign60: 'Khối ngoại ròng 60 phiên', valueTrend: 'GTGD 20/250', cmf20: 'CMF-20', rev5: 'Đảo chiều 5 phiên',
  npYoY: 'LNST quý (cùng kỳ)', revYoY: 'Doanh thu quý (cùng kỳ)', npAccel: 'Gia tốc LNST', roe: 'ROE 4 quý', ep: 'E/P (LNST 4 quý / vốn hoá)', npTtmG: 'LNST 4 quý (tăng trưởng)',
  sectorRs63: 'RS 3 tháng của ngành',
};
const nf = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgn = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${nf(x, d)}`);
const fmtDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—');
const tone = (x: number | null | undefined) => (x == null ? 'var(--text-tertiary)' : x >= 0 ? 'var(--positive)' : 'var(--negative)');

/** Giá trị thô theo đơn vị dễ đọc của từng yếu tố. */
export function fmtRaw(key: string, v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (key) {
    case 'mom12_1': case 'mom6_1': case 'resRs63': case 'rev5': case 'sectorRs63': return `${sgn(Math.expm1(v) * 100)}%`;
    case 'high52': return `${nf(v * 100, 0)}% đỉnh`;
    case 'trend': return `${nf(v, 0)}/6`;
    case 'lowVol60': return `σ ${nf(-v * 100, 2)}%/phiên`;
    case 'foreign20': case 'foreign60': return `${sgn(v * 100)}% GTGD`;
    case 'valueTrend': return `${nf(Math.exp(v), 2)}×`;
    case 'cmf20': return sgn(v, 2);
    case 'npYoY': case 'revYoY': case 'npAccel': case 'npTtmG': return Math.abs(v) >= 5 ? `${v > 0 ? '≥ +' : '≤ −'}500%` : `${sgn(v * 100, 0)}%`; // cắt biên ±500% (T1)
    case 'roe': case 'ep': return `${nf(v * 100, 1)}%`;
    default: return nf(v, 3);
  }
}

function GroupBars({ g }: { g: AlphaStock['groups'] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }} aria-label="Đóng góp theo nhóm">
      {(['price', 'flow', 'fund', 'sector'] as AlphaGroup[]).map((k) => {
        const v = g[k] ?? 0, h = Math.min(14, Math.abs(v) * 30 + 1);
        return <span key={k} title={`${GROUP_VI[k]}: ${sgn(v, 3)}`} style={{ width: 7, height: 14, display: 'inline-flex', alignItems: v >= 0 ? 'flex-end' : 'flex-start', background: 'var(--bg-surface-2)', borderRadius: 2 }}>
          <span style={{ width: 7, height: h, background: v >= 0 ? 'var(--positive)' : 'var(--negative)', borderRadius: 2, opacity: 0.85 }} />
        </span>;
      })}
    </span>
  );
}

function Detail({ s, onClose }: { s: AlphaStock; onClose: () => void }) {
  const byGroup = (['price', 'flow', 'fund', 'sector'] as AlphaGroup[]).map((g) => ({ g, rows: s.factors.filter((f) => f.group === g) }));
  const maxAbs = Math.max(0.01, ...s.factors.map((f) => Math.abs(f.contribution ?? 0)));
  return (
    <tr data-testid="alpha-detail"><td colSpan={8} style={{ padding: 0 }}>
      <div style={{ border: '1px solid var(--gold)', borderRadius: 8, padding: '10px 12px', margin: '6px 0', position: 'sticky', left: 0, maxWidth: 'min(100%, calc(100vw - 40px))', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <b style={{ color: 'var(--gold)', fontSize: 14 }}>{s.ticker}</b>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{s.sectorName ?? s.sector ?? '—'} · điểm {sgn(s.score, 3)} = Σ z × trọng số · hạng {s.rank} toàn thị trường · GTGD TB60 {nf(s.avgValue60 / 1e9, 1)} tỷ</span>
          <button type="button" onClick={onClose} aria-label="Đóng" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}>✕</button>
        </div>
        <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', marginTop: 6 }}>
          <thead><tr style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left' }}>Yếu tố</th><th style={{ textAlign: 'right' }}>Giá trị</th><th style={{ textAlign: 'right' }} title="Hạng chuẩn hoá trong ngày, đã trung hoà ngành">z</th><th style={{ textAlign: 'right' }}>Trọng số</th><th style={{ textAlign: 'left', paddingLeft: 8 }}>Đóng góp</th>
          </tr></thead>
          <tbody>{byGroup.map(({ g, rows }) => (
            <Fragment key={g}>
              <tr><td colSpan={5} style={{ paddingTop: 6, fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{GROUP_VI[g]} · {sgn(s.groups[g], 3)}</td></tr>
              {rows.map((f) => (
                <tr key={f.key} style={{ borderTop: '1px solid var(--bg-surface-2)' }} data-testid="alpha-factor-row">
                  <td style={{ padding: '3px 0' }}>{FACTOR_VI[f.key] ?? f.key}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtRaw(f.key, f.raw)}</td>
                  <td style={{ textAlign: 'right', color: tone(f.z) }}>{sgn(f.z, 2)}</td>
                  <td style={{ textAlign: 'right' }}>{nf((f.weight ?? 0) * 100, 1)}%</td>
                  <td style={{ paddingLeft: 8, minWidth: 90 }}>
                    <span style={{ display: 'inline-block', height: 6, width: `${(Math.abs(f.contribution ?? 0) / maxAbs) * 60}px`, background: tone(f.contribution), borderRadius: 3, verticalAlign: 'middle' }} />
                    <span style={{ marginLeft: 4, color: tone(f.contribution) }}>{sgn(f.contribution, 3)}</span>
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}</tbody>
        </table>
        <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>BCTC chỉ dùng quý đã công bố trước hôm nay. Mô hình chưa qua kiểm định đặt trước — dùng để sàng lọc, không phải khuyến nghị.</p>
      </div>
    </td></tr>
  );
}

export default function Top20V2Panel({ data, selectedSector, onClearSector, onSelectTicker }: {
  data: AlphaTop20Response; selectedSector: { code: string; name: string } | null; onClearSector: () => void; onSelectTicker: (t: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [showWeights, setShowWeights] = useState(false);
  const ev = data.evidence, L = data.ledger;
  const list = useMemo(() => {
    if (!selectedSector) return data.top20;
    const inTop = data.top20.filter((s) => s.sector === selectedSector.code);
    return inTop;
  }, [data.top20, selectedSector]);
  const extraInSector = selectedSector ? data.others.filter((o) => o.sector === selectedSector.code && !list.some((s) => s.ticker === o.ticker)).slice(0, 10) : [];

  return (
    <div className="panel-block" data-testid="alpha-panel">
      <div className="sb-row" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <b style={{ color: 'var(--gold)' }}>Radar Top 20 v2 · đa yếu tố</b>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
          {data.liquid} mã đủ thanh khoản · dữ liệu tới {fmtDate(data.dataAsOf)}
          {selectedSector && <> · Lọc theo ngành: <b style={{ color: 'var(--gold)' }}>{selectedSector.name}</b>{' '}
            <button type="button" onClick={onClearSector} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 11 }}>✕ bỏ lọc</button></>}
        </span>
      </div>

      <div className="cf-evidence" role="note" data-testid="alpha-evidence">
        <p className="cf-evidence__head"><span className="cf-evidence__label">{ev.label}</span>
          <b>{ev.verdict === 'PASS' ? 'Đã qua kiểm định đặt trước T3.' : `Kiểm định đặt trước T3 KHÔNG ĐẠT (${ev.checks.filter((c) => c.pass).length}/6) — dùng để sàng lọc, không phải khuyến nghị.`}</b></p>
        <p>
          Ngoài mẫu {fmtDate(ev.period.oos[0])} → {fmtDate(ev.period.oos[1])} ({ev.period.oosDates} ngày, {ev.period.tickers} mã, chạy một lần): IC xếp hạng 20 phiên {sgn(ev.oos.ic.mean, 3)} [{nf(ev.oos.ic.lo, 3)}; {nf(ev.oos.ic.hi, 3)}] ·
          Top 20 − universe sau phí {sgn((ev.oos.spreadNet5.mean ?? 0) * 100, 2)}%/5 phiên · hơn chọn ngẫu nhiên {sgn((ev.oos.vsPlacebo.mean ?? 0) * 100, 2)}% · Deflated Sharpe {sgn(ev.oos.dsr.deflated, 3)}.
        </p>
        <ul className="cf2-checks" data-testid="alpha-checks">{ev.checks.map((c) => <li key={c.id} data-pass={c.pass}><span aria-hidden>{c.pass ? '✔' : '✖'}</span> {c.name}</li>)}</ul>
        {ev.notes.map((n) => <p key={n} className="cf-evidence__foot">{n}</p>)}
      </div>

      <p data-testid="alpha-source" style={{ fontSize: 10.5, color: 'var(--text-tertiary)', margin: '6px 0 8px' }}>
        Mô hình {data.model} · trọng số từ IC {data.icHistoryDays} ngày (36 tháng, co 50% về đều) · giá điều chỉnh cộng dồn (Gateway) · BCTC, khối ngoại, vốn hoá: VNDirect ({data.vnd.tickers} mã, cập nhật {fmtDate(data.vnd.fetchedAt)}) · tối đa 4 mã / ngành.{' '}
        <button type="button" onClick={() => setShowWeights((v) => !v)} data-testid="alpha-weights-toggle" style={{ background: 'none', border: 'none', color: 'var(--gold)', cursor: 'pointer', fontSize: 10.5, padding: 0 }}>{showWeights ? 'Ẩn trọng số' : 'Xem trọng số 18 yếu tố'}</button>
      </p>
      {showWeights && (
        <div data-testid="alpha-weights" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '2px 14px', fontSize: 11, margin: '0 0 10px' }}>
          {data.weights.map((w) => (
            <div key={w.key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{FACTOR_VI[w.key] ?? w.key}</span>
              <span style={{ display: 'inline-block', width: `${(w.weight ?? 0) * 400}px`, maxWidth: 60, height: 6, background: 'var(--gold)', borderRadius: 3 }} />
              <span style={{ width: 40, textAlign: 'right' }}>{nf((w.weight ?? 0) * 100, 1)}%</span>
              <span style={{ width: 52, textAlign: 'right', color: tone(w.ic36m) }} title="IC trung bình 36 tháng">IC {sgn(w.ic36m, 3)}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', minWidth: 620 }}>
          <thead><tr style={{ color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase' }}>
            <th style={{ textAlign: 'left', padding: '4px 0' }}>#</th><th style={{ textAlign: 'left' }}>Mã</th><th style={{ textAlign: 'left' }}>Ngành</th>
            <th style={{ textAlign: 'right' }}>Điểm</th><th style={{ textAlign: 'center' }} title="Giá · Dòng tiền · Cơ bản · Ngành">Nhóm</th>
            <th style={{ textAlign: 'left', paddingLeft: 8 }}>Động lực chính</th><th style={{ textAlign: 'right' }}>Hạng TT</th><th />
          </tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 12, color: 'var(--text-tertiary)' }}>Ngành này không có mã nào trong Top 20 v2.</td></tr>}
            {list.map((s, i) => {
              const drivers = [...s.factors].sort((a, b) => Math.abs(b.contribution ?? 0) - Math.abs(a.contribution ?? 0)).slice(0, 2);
              return (
                <Fragment key={s.ticker}>
                  <tr data-testid="alpha-row" aria-expanded={open === s.ticker} onClick={() => { onSelectTicker(s.ticker); setOpen(open === s.ticker ? null : s.ticker); }}
                    style={{ cursor: 'pointer', borderTop: '1px solid var(--bg-surface-2)', background: open === s.ticker ? 'var(--bg-surface-2)' : undefined }}>
                    <td style={{ padding: '6px 0', color: 'var(--text-tertiary)' }}>{i + 1}</td>
                    <td style={{ fontWeight: 700, color: 'var(--gold)' }}>{s.ticker}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{s.sectorName ?? s.sector ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{sgn(s.score, 2)}</td>
                    <td style={{ textAlign: 'center' }}><GroupBars g={s.groups} /></td>
                    <td style={{ paddingLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>{drivers.map((d) => `${FACTOR_VI[d.key] ?? d.key} ${fmtRaw(d.key, d.raw)}`).join(' · ')}</td>
                    <td style={{ textAlign: 'right', fontSize: 11 }}>{s.rank}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-tertiary)' }}>{open === s.ticker ? '▴' : '▾'}</td>
                  </tr>
                  {open === s.ticker && <Detail s={s} onClose={() => setOpen(null)} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {extraInSector.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '6px 0 0' }} data-testid="alpha-sector-extra">
          Mã khác của ngành theo điểm (ngoài Top 20 do trần 4 mã / ngành hoặc điểm thấp hơn): {extraInSector.map((o) => `${o.ticker} (#${o.rank})`).join(', ')}
        </p>
      )}

      <section data-testid="alpha-ledger" style={{ marginTop: 12 }}>
        <h4 style={{ margin: '0 0 4px' }}>Sổ theo dõi thực tế (Top 20 v2, 20 phiên)</h4>
        {L.maturedDates === 0 ? (
          <p className="cf-note" data-testid="alpha-ledger-empty">Sổ bắt đầu ghi từ {fmtDate(L.firstDate)} ({L.snapshots} bản chụp). Mỗi bản chụp được chấm sau đủ 21 phiên — chưa có kết quả thực tế.</p>
        ) : (
          <div className="cf2-tiles">
            <div><span>Ngày đã chấm</span><b>{L.maturedDates}</b></div>
            <div><span>IC xếp hạng TB</span><b>{sgn(L.meanScoreIc, 3)}</b><em>{nf((L.positiveIcShare ?? 0) * 100, 0)}% số ngày IC &gt; 0</em></div>
            <div><span>Top 20 − universe (20 phiên)</span><b style={{ color: tone(L.meanSpreadPct) }}>{sgn(L.meanSpreadPct, 2)}%</b><em>{nf((L.beatUniverseShare ?? 0) * 100, 0)}% số lần thắng</em></div>
          </div>
        )}
      </section>
    </div>
  );
}
