// Cycle Fingerprint v2 (CF4) — giao diện engine CF2: 30 giai đoạn tương tự của NHIỀU mã (thư viện toàn universe, có ngày),
// dự báo lợi suất VƯỢT VN-Index, nhãn bằng chứng CF3 và sổ theo dõi thực tế. Bấm một giai đoạn -> thẻ chi tiết (không mở biểu đồ).
import { useMemo, useState } from 'react';
import type { CycleMatch, PricePoint } from '../../../types/cycleFingerprint';
import type { CycleV2Ledger, CycleV2Neighbor, CycleV2Response } from '../../../types/cycleFingerprintV2';
import { MainChart, fmtCfDate, matchKey, type MatchChartMode } from './MainChart';

const nf = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : x.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sp = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${nf(x, d)}%`);
const pc = (x: number | null | undefined, d = 0) => (x == null ? '—' : `${nf(x * 100, d)}%`);
const simPct = (x: number | null | undefined) => (x == null ? '—' : x >= 0.999 ? '> 99,9%' : pc(x, 1));
const tone = (x: number | null | undefined) => (x == null ? 'var(--text-tertiary)' : x >= 0 ? 'var(--positive)' : 'var(--negative)');

/** Chuyển giai đoạn v2 sang dạng MainChart đang vẽ (mẫu base 100 đầu kỳ + diễn biến base 100 cuối kỳ). */
function toMatches(ns: CycleV2Neighbor[]): CycleMatch[] {
  const q = (v: number) => ({ value: v, source: 'HARD_DATA' as const });
  return ns.map((n) => ({
    ticker: n.ticker, matchStartDate: n.start ?? '', matchEndDate: n.end ?? '',
    similarityPct: q((n.similarity ?? 0) * 100),
    returns: { d10: q(n.excess.d10 ?? 0), d20: q(n.excess.d20 ?? 0), d30: q(0), d60: q(n.excess.d60 ?? 0) },
    alignedSeries: n.pattern.map((v, i) => ({ sessionOffset: i, normalizedClose: q(v) })),
    forwardSeries: n.forward.map((v, i) => ({ sessionOffset: i, normalizedClose: q(v) })),
  }));
}

function EvidenceV2({ data }: { data: CycleV2Response }) {
  const ev = data.evidence;
  return (
    <div className="cf-evidence" role="note" data-testid="cf2-evidence">
      <p className="cf-evidence__head">
        <span className="cf-evidence__label">{ev.label}</span>
        <b>{ev.verdict === 'PASS' ? 'Đã qua kiểm định đặt trước CF3.' : 'Kiểm định đặt trước CF3 KHÔNG ĐẠT — chỉ để quan sát, không phải khuyến nghị.'}</b>
      </p>
      <p>
        Ngoài mẫu {fmtCfDate(ev.period.oos[0])} → {fmtCfDate(ev.period.oos[1])} ({ev.period.oosDates} ngày, {ev.period.oosTickers} mã, chạy một lần):
        IC hạng {nf(ev.oos.ic.mean, 4)} [{nf(ev.oos.ic.lo, 3)}; {nf(ev.oos.ic.hi, 3)}] · hơn chọn ngẫu nhiên {nf(ev.oos.icMinusPlacebo.mean, 3)} ·
        nhóm 20% cao − thấp sau phí {sp(ev.oos.quintileSpreadNet.mean != null ? ev.oos.quintileSpreadNet.mean * 100 : null, 2)} ·
        Brier skill {nf(ev.oos.brierSkill, 3)} · khoảng 80% phủ {pc(ev.oos.coverage80)}.
      </p>
      <ul className="cf2-checks" data-testid="cf2-checks">
        {ev.checks.map((c) => <li key={c.id} data-pass={c.pass}><span aria-hidden>{c.pass ? '✔' : '✖'}</span> {c.name}</li>)}
      </ul>
      <p className="cf-evidence__foot">
        Quy tắc chốt trước khi chạy (cấu hình SHA-256 {ev.configSha256.slice(0, 8)}…). Trong mẫu {fmtCfDate(ev.period.is[0])} → {fmtCfDate(ev.period.is[1])}: IC {nf(ev.is.ic.mean, 3)}.
      </p>
    </div>
  );
}

function ForecastTiles({ data }: { data: CycleV2Response }) {
  const f = data.forecast, h20 = f.horizons.find((h) => h.h === 20);
  return (
    <>
      <div className="cf2-tiles" data-testid="cf2-forecast">
        <div><span>Vượt VN-Index 20 phiên (đã co về nền)</span><b style={{ color: tone(h20?.excessPct) }}>{sp(h20?.excessPct, 2)}</b></div>
        <div><span>P(vượt VN-Index)</span><b>{pc(h20?.pOutperform)}</b></div>
        <div><span>Số mẫu hiệu dụng</span><b>{nf(f.nEff, 1)}</b><em>trên 30 giai đoạn · co {pc(f.shrink)}</em></div>
        <div><span>Tương đồng TB (tuyệt đối)</span><b>{pc(f.avgSimilarity, 1)}</b><em>giống hơn x% cặp ngẫu nhiên</em></div>
        <div data-testid="cf2-interval"><span>Dải lịch sử 80% (20 phiên)</span><b>{sp(f.interval80.loPct)} … {sp(f.interval80.hiPct)}</b>
          <em>{f.interval80.calibrated ? 'đã hiệu chỉnh ngoài mẫu' : `CHƯA hiệu chỉnh — ngoài mẫu chỉ phủ ${pc(f.interval80.oosCoverage)}`}</em></div>
      </div>
      <table className="cf-topk-table cf2-horizons">
        <thead><tr><th>Kỳ hạn</th><th title="Sau khi co về mức nền theo số mẫu hiệu dụng">Dự báo vượt VN-Index</th><th>TB có trọng số 30 giai đoạn</th><th title="TB vô điều kiện của thư viện tại thời điểm">Mức nền</th><th>P(vượt)</th></tr></thead>
        <tbody>{f.horizons.map((h) => (
          <tr key={h.h}><td>{h.h} phiên</td><td style={{ color: tone(h.excessPct) }}>{sp(h.excessPct, 2)}</td><td style={{ color: tone(h.rawPct) }}>{sp(h.rawPct, 2)}</td><td>{sp(h.baselinePct, 2)}</td><td>{pc(h.pOutperform)}</td></tr>
        ))}</tbody>
      </table>
    </>
  );
}

/** Thẻ chi tiết một giai đoạn: mẫu đặt chồng lên 30 phiên hiện tại (neo cuối kỳ) + diễn biến thật sau đó. */
function NeighborDetail({ n, current, sectorName, onClose }: { n: CycleV2Neighbor; current: number[]; sectorName: (c: string | null) => string; onClose: () => void }) {
  const W = 320, Hh = 120, P = 8;
  const endN = n.pattern[n.pattern.length - 1] || 100, endC = current[current.length - 1] || 100;
  const pat = n.pattern.map((v, i) => [i - (n.pattern.length - 1), (v / endN) * 100] as const);
  const cur = current.map((v, i) => [i - (current.length - 1), (v / endC) * 100] as const);
  const fwd = n.forward.map((v, i) => [i, v] as const);
  const all = [...pat, ...cur, ...fwd].map((p) => p[1]);
  const lo = Math.min(...all), hi = Math.max(...all), x0 = -(n.pattern.length - 1), x1 = Math.max(60, fwd.length - 1);
  const x = (o: number) => P + ((o - x0) / (x1 - x0)) * (W - 2 * P);
  const y = (v: number) => Hh - P - ((v - lo) / Math.max(hi - lo, 1e-9)) * (Hh - 2 * P);
  const path = (pts: readonly (readonly [number, number])[]) => pts.map(([o, v], i) => `${i ? 'L' : 'M'}${x(o).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <div className="cf2-detail" data-testid="cf2-detail">
      <div className="cf2-detail__head">
        <b>{n.ticker}</b> <span>{sectorName(n.sector)}{n.sameSector ? ' · cùng ngành' : ''}</span>
        <span>{fmtCfDate(n.start ?? '')} → {fmtCfDate(n.end ?? '')}</span>
        <button type="button" onClick={onClose} aria-label="Đóng">✕</button>
      </div>
      <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={`Giai đoạn ${n.ticker} đặt chồng lên 30 phiên hiện tại và diễn biến 60 phiên sau`}>
        <line x1={x(0)} x2={x(0)} y1={P} y2={Hh - P} stroke="var(--text-tertiary)" strokeDasharray="2 3" />
        <path d={path(cur)} fill="none" stroke="var(--positive)" strokeWidth={2} />
        <path d={path(pat)} fill="none" stroke="var(--gold)" strokeWidth={1.5} strokeDasharray="2 3" />
        <path d={path(fwd)} fill="none" stroke="var(--gold)" strokeWidth={1.8} strokeDasharray="5 3" />
      </svg>
      <p className="cf-note">Xanh = 30 phiên hiện tại · vàng chấm = giai đoạn {n.ticker} (neo cùng điểm cuối) · vàng gạch = diễn biến THẬT sau đó.</p>
      <dl className="cf2-detail__stats">
        <div><dt>Tương đồng tuyệt đối</dt><dd>{simPct(n.similarity)}</dd></div>
        <div><dt>Trọng số</dt><dd>{nf(n.weight, 3)}</dd></div>
        {(['d10', 'd20', 'd40', 'd60'] as const).map((k) => <div key={k}><dt>Vượt VN-Index {k.slice(1)} phiên</dt><dd style={{ color: tone(n.excess[k]) }}>{sp(n.excess[k], 2)}</dd></div>)}
      </dl>
    </div>
  );
}

function LedgerPanel({ ledger, symbol }: { ledger: CycleV2Ledger | null; symbol: string }) {
  if (!ledger) return null;
  const started = ledger.firstDate;
  return (
    <section className="cf2-ledger" data-testid="cf2-ledger">
      <h4>Sổ theo dõi thực tế (dự báo 20 phiên, mọi mã)</h4>
      {ledger.maturedDates === 0 ? (
        <p className="cf-note" data-testid="cf2-ledger-empty">
          {started ? `Sổ bắt đầu ghi từ ${fmtCfDate(started)} (${ledger.snapshots} bản chụp, ${ledger.pendingRows} dự báo đang chờ).` : 'Sổ bắt đầu ghi từ phiên giao dịch tới (16:05 hằng ngày).'}
          {' '}Mỗi dự báo được chấm sau đủ 21 phiên — chưa có kết quả thực tế để đánh giá.
        </p>
      ) : (
        <div className="cf2-tiles">
          <div><span>Ngày đã chấm</span><b>{ledger.maturedDates}</b><em>{ledger.scoredRows} dự báo</em></div>
          <div><span>IC hạng TB</span><b>{nf(ledger.meanIc, 3)}</b><em>{pc(ledger.positiveIcShare)} số ngày IC &gt; 0</em></div>
          <div><span>Đúng hướng</span><b>{pc(ledger.hitRate)}</b></div>
          <div><span>Brier</span><b>{nf(ledger.brier, 3)}</b><em>0,25 = đoán mù</em></div>
          <div><span>Khoảng 80% phủ</span><b>{pc(ledger.coverage80)}</b></div>
          <div><span>Nhóm 20% cao − thấp, sau phí</span><b style={{ color: tone(ledger.meanSpreadNet) }}>{sp(ledger.meanSpreadNet != null ? ledger.meanSpreadNet * 100 : null, 2)}</b></div>
        </div>
      )}
      {ledger.mine.length > 0 && (
        <table className="cf-topk-table" data-testid="cf2-ledger-mine">
          <thead><tr><th>Ngày ghi ({symbol})</th><th>Dự báo vượt VN-Index 20 phiên</th><th>P(vượt)</th><th>Thực tế</th></tr></thead>
          <tbody>{ledger.mine.slice().reverse().map((m) => (
            <tr key={m.date}><td>{fmtCfDate(m.date)}</td><td style={{ color: tone(m.excessPct) }}>{sp(m.excessPct, 2)}</td><td>{pc(m.pOutperform)}</td>
              <td style={{ color: tone(m.realizedPct) }}>{m.realizedPct == null ? 'đang chờ' : sp(m.realizedPct, 2)}</td></tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

export function CfV2Panel({ data, sectorNames }: { data: CycleV2Response; sectorNames?: Map<string, string> }) {
  const [mode, setMode] = useState<MatchChartMode>('overlay');
  const [hl, setHl] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const matches = useMemo(() => toMatches(data.neighbors), [data.neighbors]);
  const priceSeries: PricePoint[] = useMemo(() => data.current.dates.map((d, i) => ({ date: d, close: { value: data.current.closes[i], source: 'HARD_DATA' } })), [data.current]);
  const sectorName = (c: string | null) => (c ? sectorNames?.get(c) ?? `ICB ${c}` : '—');
  const distinct = new Set(data.neighbors.map((n) => n.ticker)).size;
  const openN = data.neighbors.find((n) => matchKey(matches[data.neighbors.indexOf(n)]) === open) ?? null;

  return (
    <div className="cf-tab cf2" data-testid="cf2-panel">
      <EvidenceV2 data={data} />
      <p className="cf-note">
        {data.symbol}{data.sector ? ` · ${sectorName(data.sector)}` : ''} · dữ liệu tới {fmtCfDate(data.asOf)} · cửa sổ {data.window} phiên ngày ·
        thư viện {data.library.windows.toLocaleString('vi-VN')} cửa sổ của {data.library.tickers} mã (giá điều chỉnh cộng dồn){data.inLibrary === false ? ' · mã này ngoài thư viện, so với thư viện chung' : ''}.
      </p>
      <ForecastTiles data={data} />

      <div className="cf-mode-toggle" role="group" aria-label="Cách vẽ giai đoạn tương tự">
        {([['overlay', 'Chồng lên hiện tại + 60 phiên sau'], ['shape', 'Hình dạng mẫu (kiểu cũ)']] as const).map(([m, label]) => (
          <button key={m} type="button" className={`cf-chip ${mode === m ? 'cf-chip--active' : ''}`} aria-pressed={mode === m} data-testid={`cf2-mode-${m}`} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>
      <MainChart priceSeries={priceSeries} topMatches={matches} atrSeries={[]} useAtrAxis={false} highlightedKey={hl} mode={mode} unitLabel="phiên" />

      <section className="cf-topk-list">
        <h4>{data.neighbors.length} giai đoạn tương tự nhất · {distinct} mã khác nhau</h4>
        <table className="cf-topk-table" data-testid="cf2-neighbors">
          <thead><tr><th>#</th><th>Mã</th><th>Ngành</th><th>Giai đoạn</th><th title="Tỷ lệ cặp cửa sổ ngẫu nhiên kém giống hơn">Tương đồng</th><th>Trọng số</th>
            {[10, 20, 40, 60].map((h) => <th key={h} title={`Lợi suất vượt VN-Index ${h} phiên SAU giai đoạn`}>Vượt {h}p</th>)}</tr></thead>
          <tbody>{data.neighbors.map((n, i) => {
            const k = matchKey(matches[i]);
            return (
              <tr key={k} data-testid="cf2-neighbor-row" className={hl === k || open === k ? 'cf-topk-row--highlighted' : ''}
                onMouseEnter={() => setHl(k)} onMouseLeave={() => setHl(null)} onClick={() => setOpen(open === k ? null : k)}>
                <td>{i + 1}</td>
                <td><b style={{ color: 'var(--gold)' }}>{n.ticker}</b>{n.sameSector ? <span title="Cùng ngành ICB cấp 2"> ●</span> : null}</td>
                <td>{sectorName(n.sector)}</td>
                <td data-testid="cf2-neighbor-period">{fmtCfDate(n.start ?? '')} → {fmtCfDate(n.end ?? '')}</td>
                <td>{simPct(n.similarity)}</td>
                <td>{nf(n.weight, 2)}</td>
                {(['d10', 'd20', 'd40', 'd60'] as const).map((key) => <td key={key} style={{ color: tone(n.excess[key]) }}>{sp(n.excess[key], 1)}</td>)}
              </tr>
            );
          })}</tbody>
        </table>
        <p className="cf-note">Bấm một dòng để mở thẻ chi tiết giai đoạn. Láng giềng cùng mã cách nhau ≥ 60 phiên, tối đa 3 giai đoạn mỗi tháng lịch. ● = cùng ngành ICB cấp 2.</p>
      </section>
      {openN && <NeighborDetail n={openN} current={data.current.pattern} sectorName={sectorName} onClose={() => setOpen(null)} />}

      <LedgerPanel ledger={data.ledger} symbol={data.symbol} />
    </div>
  );
}
