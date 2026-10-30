// Các phần của engine CHƯA có trên giao diện gốc: nguồn & chất lượng dữ liệu, chế độ vĩ mô (HMM) + độ nhạy theo chế độ,
// báo cáo tháng. Chỉ hiển thị đúng payload API — không tự tính thêm số liệu.
import { useState } from 'react';
import { MarkdownLite } from '../../../components/shared/MarkdownLite';
import type { MacroClient } from '../macro-client';
import { useAsync } from './useMacro';
import type { RegimeImpactPayload, RegimePayload, ReportPayload, SeriesPayload, SourcePayload } from './types';

const fmt = (x: number, d = 2) => x.toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (x: number) => `${Math.round(x * 100)}%`;
const SOURCE_VI: Record<string, string> = { 'gateway-hose': 'HOSE (lịch sử giá Gateway)', csv: 'CSV nạp tay' };
const sourceLabel = (s: string) => SOURCE_VI[s] ?? s.replace(/^csv:/, 'CSV · ');

/** Nguồn dữ liệu, độ phủ, trạng thái từng chuỗi và lỗi chất lượng — để người dùng biết phân tích đang dựa trên gì. */
export function DataSourcePanel({ source, sourceError, series }: { source: SourcePayload | null; sourceError: string | null; series: SeriesPayload | null }) {
  if (sourceError) return <p className="state" role="alert">{sourceError}</p>;
  if (!source) return <p className="state" role="status">Đang tải nguồn dữ liệu…</p>;
  const issuesOf = (id: string) => series?.series.find((x) => x.id === id)?.issues ?? [];
  const status = (s: SourcePayload['series'][number]) => {
    if (s.n === 0) return { text: s.role === 'factor' ? 'Chưa có số liệu thật' : 'Chưa có', tone: 'muted' };
    if (s.stale) return { text: `Ngừng cập nhật từ ${s.last} — đã loại`, tone: 'warn' };
    if (s.n < source.minMonths) return { text: `Mới ${s.n} tháng (< ${source.minMonths}) — chưa dùng`, tone: 'warn' };
    return { text: 'Đang dùng', tone: 'ok' };
  };
  return (
    <div className="ds">
      <p>
        Chế độ dữ liệu: <b className="ds-mode" data-mode={source.mode}>{source.mode === 'real' ? 'SỐ LIỆU THẬT' : 'MÔ PHỎNG'}</b>
        {source.mode === 'real'
          ? <> · biến vĩ mô đang dùng: {source.usableFactors.join(', ') || '—'} · chỉ số: {source.usableTargets.join(', ') || '—'}</>
          : <> · cần ít nhất 1 biến vĩ mô và 1 chỉ số thật đủ {source.minMonths} tháng để chuyển sang số liệu thật.</>}
      </p>
      <details>
        <summary>Chi tiết {source.series.length} chuỗi (nguồn, kỳ, chất lượng)</summary>
        <div className="ds-wrap">
        <table className="ds-table">
          <thead><tr><th>Chuỗi</th><th>Nguồn</th><th>Kỳ</th><th>Số tháng</th><th>Trạng thái</th></tr></thead>
          <tbody>
            {source.series.map((s) => {
              const st = status(s);
              const issues = source.mode === 'real' ? issuesOf(s.id) : [];
              return (
                <tr key={s.id}>
                  <th scope="row">{s.nameVi}<small> {s.id}</small></th>
                  <td>{s.sources.length ? s.sources.map(sourceLabel).join(', ') : '—'}</td>
                  <td>{s.first ? `${s.first} → ${s.last}` : '—'}</td>
                  <td>{s.n || '—'}</td>
                  <td data-tone={st.tone}>
                    {st.text}
                    {issues.map((i) => <div key={i.message} className="muted" data-severity={i.severity}>{i.severity === 'error' ? '⚠ ' : ''}{i.message}</div>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </details>
      <p className="muted">
        Tự động (tháng đã đóng, 2 lần/ngày): chỉ số HOSE từ Gateway; CPI Việt Nam (IMF, số liệu Cục Thống kê); FED, giá dầu Brent (FRED); DXY, USD/VND thị trường (Yahoo).
        Biến nội địa còn lại (lãi suất liên ngân hàng, M2, tín dụng, FDI, xuất khẩu, IIP, PMI) chưa có nguồn mở cập nhật — quản trị viên nạp CSV qua
        <code> POST /api/macro/admin/import</code>. Không bao giờ trộn số liệu thật với số liệu mô phỏng.
      </p>
    </div>
  );
}

/** Chế độ vĩ mô (HMM trên IR/CPI/M2) + độ nhạy của một cặp biến–chỉ số theo từng chế độ. */
export function RegimePanel({ client, asOf, factors, targets, names, enabled }: {
  client: MacroClient; asOf?: string; factors: string[]; targets: string[]; names: Record<string, string>; enabled: boolean;
}) {
  const regime = useAsync((s) => client.regime<RegimePayload>(asOf, s), [client, asOf], enabled);
  const [factor, setFactor] = useState('');
  const [target, setTarget] = useState('');
  const f = factor || factors[0] || '';
  const t = target || targets[0] || '';
  const ri = useAsync((s) => client.regimeImpact<RegimeImpactPayload>({ asOf, factor: f, target: t }, s), [client, asOf, f, t], enabled && !!regime.data && !!f && !!t);

  if (regime.error) {
    return (
      <div>
        <p className="state" role="alert">{regime.error}</p>
        <p className="muted">Nhận diện chế độ cần ít nhất một trong lãi suất liên ngân hàng (IR), CPI hoặc M2 với số liệu thật — các chuỗi này phải nạp CSV.</p>
      </div>
    );
  }
  if (!regime.data) return <p className="state" role="status">Đang nhận diện chế độ vĩ mô…</p>;
  const r = regime.data;
  const recent = r.history.slice(-36);
  return (
    <div className="rg">
      <p>
        Hiện tại: <b>{r.current.label}</b> (xác suất {pct(Math.max(...r.current.probs))}, kỳ {r.lastPeriod}) · {r.K} chế độ chọn theo BIC trên {r.features.join(', ')}.
      </p>
      <div className="rg-strip" role="img" aria-label={`Chế độ 36 tháng gần nhất, kết thúc ${r.lastPeriod}`}>
        {recent.map((h) => {
          const st = h.probs.indexOf(Math.max(...h.probs));
          return <i key={h.period} data-state={st} title={`${h.period}: ${r.summary[st]?.label ?? st} (${pct(Math.max(...h.probs))})`} />;
        })}
      </div>
      <ul className="rg-legend">
        {r.summary.map((s) => (
          <li key={s.state} data-state={s.state}>
            <i /> {s.label}: kéo dài kỳ vọng {fmt(s.expectedDurationMonths, 1)} tháng · tỷ trọng dài hạn {pct(s.stationaryShare)} ·{' '}
            {Object.entries(s.meansByFeature).map(([k, v]) => `${k} ${fmt(v)}`).join('; ')}
          </li>
        ))}
      </ul>
      {factors.length > 0 && targets.length > 0 && (
        <div className="rg-impact">
          <div className="fb-row">
            <label>Biến <select value={f} onChange={(e) => setFactor(e.target.value)}>{factors.map((id) => <option key={id} value={id}>{names[id] ?? id}</option>)}</select></label>
            <label>Chỉ số <select value={t} onChange={(e) => setTarget(e.target.value)}>{targets.map((id) => <option key={id} value={id}>{names[id] ?? id}</option>)}</select></label>
          </div>
          {ri.error && <p className="state" role="alert">{ri.error}</p>}
          {ri.data && (
            <>
              <table className="ds-table">
                <thead><tr><th>Chế độ</th><th>Số tháng</th><th>Hệ số</th><th>t</th><th>p</th></tr></thead>
                <tbody>
                  {ri.data.perRegime.map((p) => (
                    <tr key={p.state}>
                      <th scope="row">{p.label}</th><td>{p.n}</td>
                      <td>{p.sufficient ? fmt(p.beta) : '—'}</td><td>{p.sufficient ? fmt(p.t, 1) : '—'}</td><td>{p.sufficient ? fmt(p.p, 3) : 'thiếu mẫu'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                {ri.data.differs ? 'Độ nhạy KHÁC nhau có ý nghĩa giữa các chế độ' : 'Chưa đủ bằng chứng độ nhạy khác nhau giữa các chế độ'} (kiểm định Wald HAC, p = {fmt(ri.data.equalityP, 3)}, độ trễ {ri.data.lag} tháng). {ri.data.note}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Báo cáo vĩ mô tháng (Markdown do API dựng) — mở khi cần, tải lười. */
export function ReportPanel({ client, asOf, enabled }: { client: MacroClient; asOf?: string; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const report = useAsync((s) => client.report<ReportPayload>(asOf, s), [client, asOf], enabled && open);
  return (
    <details onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>Xem báo cáo vĩ mô tháng</summary>
      {report.error && <p className="state" role="alert">{report.error}</p>}
      {open && !report.data && !report.error && <p className="state" role="status">Đang lập báo cáo…</p>}
      {report.data && <MarkdownLite className="mc-report" text={report.data.markdown} />}
    </details>
  );
}
