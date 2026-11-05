// Trang sức khoẻ các sổ theo dõi thực tế (giai đoạn D): mỗi sổ một thẻ với dải 40 phiên gần nhất (đã ghi / thiếu / chưa bắt đầu /
// không có tín hiệu), mốc phiên đầu và cuối, ngày chấm đầu tiên, job ghi sổ, sao lưu ngoài Railway; đầu trang tóm tắt và trạng thái
// thư viện Cycle. Mở từ huy hiệu "Kho" trên thanh trên cùng. Màu luôn đi kèm chữ, dải phiên có nhãn cho trình đọc màn hình.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchMarketJson } from '../../services/marketDataClient';

export type LedgerStatus = 'ok' | 'gap' | 'late' | 'job_error' | 'empty' | 'read_error';
export interface LedgerHealthItem {
  id: string; name: string; tab: string; what: string; cadence: 'session' | 'signal'; writeAt?: string; storage?: string;
  status: LedgerStatus; firstDate?: string | null; lastDate?: string | null; sessions: number; expected?: string | null; missing: string[];
  strip: { date: string; state: 'written' | 'missing' | 'before' | 'none' }[];
  horizon?: number | null; firstScore?: { date: string; estimated: boolean } | null; matured?: number | null;
  backup?: { backedUpSessions: number | null; lastRun: { at: string; failed: number } | null } | null;
  job?: { name: string; at: string; lastRunDate: string | null; ok: boolean | null; finishedAt: string | null; error: string | null } | null;
  note?: string | null; error?: string;
}
export interface LedgerHealthDoc {
  generatedAt: string; calendarThrough: string | null;
  summary: { total: number; ok: number; gap: number; late: number; jobError: number; empty: number; readError: number };
  backup: { at: string; keys: number; sent: number; failed: number } | null;
  ledgers: LedgerHealthItem[];
  cycleLibrary?: { mode: string | null; source: string | null; loadMs: number | null; fileMb: number | null; loaded: boolean; restarts: number; lastError: string | null;
    info: { dataAsOf: string; windows: number; tickers: number } | null; worker?: { heapMb?: number; externalMb?: number } | null };
}

export const STATUS: Record<LedgerStatus, { label: string; color: string; bg: string }> = {
  ok: { label: 'Ổn', color: '#34d399', bg: 'rgba(52,211,153,.12)' },
  gap: { label: 'Thiếu phiên', color: '#fbbf24', bg: 'rgba(251,191,36,.12)' },
  late: { label: 'Trễ', color: '#fb923c', bg: 'rgba(251,146,60,.12)' },
  job_error: { label: 'Lỗi job', color: '#f87171', bg: 'rgba(248,113,113,.12)' },
  empty: { label: 'Chưa có dữ liệu', color: '#94a3b8', bg: 'rgba(148,163,184,.12)' },
  read_error: { label: 'Không đọc được', color: '#f87171', bg: 'rgba(248,113,113,.12)' },
};
const CELL: Record<LedgerHealthItem['strip'][number]['state'], { color: string; label: string }> = {
  written: { color: '#34d399', label: 'đã ghi' }, missing: { color: '#f87171', label: 'thiếu' },
  none: { color: 'rgba(148,163,184,.28)', label: 'không có tín hiệu' }, before: { color: 'rgba(148,163,184,.10)', label: 'chưa bắt đầu sổ' },
};
/** Ngày ngắn; khác năm hiện tại thì kèm năm để không nhầm với ngày sắp tới. */
const dmy = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}${d.slice(0, 4) !== String(new Date().getFullYear()) ? `/${d.slice(0, 4)}` : ''}` : '—');
const hm = (iso?: string | null) => { if (!iso) return '—'; const v = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString(); return `${v.slice(11, 16)} ${v.slice(8, 10)}/${v.slice(5, 7)}`; };
const daysTo = (d: string, now: number) => Math.ceil((Date.parse(`${d}T09:00:00Z`) - now) / 864e5);

/** Tóm tắt một dòng cho huy hiệu: số sổ cần chú ý. */
export function describeLedgers(doc: LedgerHealthDoc): { ok: boolean; text: string } {
  const s = doc.summary, bad = s.total - s.ok;
  return { ok: bad === 0, text: bad === 0 ? `Sổ theo dõi: ${s.total}/${s.total} ổn` : `Sổ theo dõi: ${bad}/${s.total} cần chú ý` };
}

function Strip({ l }: { l: LedgerHealthItem }) {
  return (
    <div role="img" aria-label={`${l.name}: ${l.strip.filter((c) => c.state === 'written').length} phiên đã ghi trong ${l.strip.length} phiên gần nhất${l.missing.length ? `, thiếu ${l.missing.map(dmy).join(', ')}` : ''}`}
      data-testid={`ledger-strip-${l.id}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, l.strip.length)}, minmax(0, 1fr))`, gap: 2, margin: '8px 0 3px' }}>
      {l.strip.map((c) => <span key={c.date} title={`${dmy(c.date)}: ${CELL[c.state].label}`} data-state={c.state} style={{ height: 14, borderRadius: 3, background: CELL[c.state].color }} />)}
    </div>
  );
}

function LedgerCard({ l, now }: { l: LedgerHealthItem; now: number }) {
  const st = STATUS[l.status];
  const left = l.firstScore ? daysTo(l.firstScore.date, now) : null;
  return (
    <article data-testid={`ledger-card-${l.id}`} data-status={l.status} style={{ border: `1px solid ${l.status === 'ok' ? 'var(--border-subtle, #263042)' : st.color}`, borderRadius: 12, padding: '12px 14px', background: 'rgba(15,23,42,.55)', minWidth: 0 }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #f1f5f9)' }}>{l.name}</h3>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-tertiary, #94a3b8)' }}>{l.tab} · {l.what}</p>
        </div>
        <span data-testid="ledger-status" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: st.color, background: st.bg, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>● {st.label}</span>
      </header>
      {l.status === 'read_error' ? <p style={{ fontSize: 12, color: st.color, margin: '8px 0 0' }}>{l.error}</p> : <>
        <Strip l={l} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-tertiary, #94a3b8)' }}><span>{dmy(l.strip[0]?.date)}</span><span>40 phiên gần nhất</span><span>{dmy(l.strip[l.strip.length - 1]?.date)}</span></div>
        <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px 12px', margin: '10px 0 0', fontSize: 12 }}>
          <div><dt style={{ color: 'var(--text-tertiary, #94a3b8)', fontSize: 11 }}>Phiên đã ghi</dt><dd style={{ margin: 0, fontWeight: 600 }}>{l.sessions} · {dmy(l.firstDate)} → {dmy(l.lastDate)}</dd></div>
          <div><dt style={{ color: 'var(--text-tertiary, #94a3b8)', fontSize: 11 }}>{l.cadence === 'signal' ? 'Kiểu sổ' : 'Phiên thiếu'}</dt>
            <dd style={{ margin: 0, fontWeight: 600, color: l.missing.length ? STATUS.gap.color : undefined }} data-testid="ledger-missing">{l.cadence === 'signal' ? 'ghi khi có tín hiệu' : l.missing.length ? l.missing.map(dmy).join(', ') : 'không'}</dd></div>
          {l.horizon != null && <div><dt style={{ color: 'var(--text-tertiary, #94a3b8)', fontSize: 11 }}>Chấm đầu tiên</dt>
            <dd style={{ margin: 0, fontWeight: 600 }} data-testid="ledger-first-score">{l.matured ? `${l.matured} phiên đã chấm` : l.firstScore ? `${dmy(l.firstScore.date)}${l.firstScore.estimated ? ' (ước tính)' : ''}${left != null && left > 0 ? ` · còn ${left} ngày` : ''}` : '—'}</dd></div>}
          {l.job && <div><dt style={{ color: 'var(--text-tertiary, #94a3b8)', fontSize: 11 }}>Job {l.job.at}</dt>
            <dd style={{ margin: 0, fontWeight: 600, color: l.job.ok === false ? STATUS.job_error.color : undefined }} title={l.job.error ?? undefined}>{l.job.ok == null ? 'chưa chạy kể từ khi khởi động' : l.job.ok ? `xong ${hm(l.job.finishedAt)}` : `lỗi ${hm(l.job.finishedAt)}`}</dd></div>}
          {l.backup !== undefined && l.backup !== null && <div><dt style={{ color: 'var(--text-tertiary, #94a3b8)', fontSize: 11 }}>Sao lưu Upstash</dt>
            <dd style={{ margin: 0, fontWeight: 600 }} data-testid="ledger-backup">{l.backup.backedUpSessions == null ? 'chưa chạy' : `${l.backup.backedUpSessions}/${l.sessions} phiên`}</dd></div>}
        </dl>
        {l.status === 'late' && <p style={{ fontSize: 11, color: STATUS.late.color, margin: '8px 0 0' }}>Lẽ ra đã có phiên {dmy(l.expected)}; bản ghi mới nhất là {dmy(l.lastDate)}.</p>}
        {l.note && <p style={{ fontSize: 11, color: 'var(--text-tertiary, #94a3b8)', margin: '8px 0 0' }}>{l.note}</p>}
      </>}
    </article>
  );
}

export default function LedgerHealthPanel({ onClose, now = Date.now() }: { onClose: () => void; now?: number }) {
  const [doc, setDoc] = useState<LedgerHealthDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true;
    fetchMarketJson<LedgerHealthDoc>('/api/market/ledger-health').then((d) => { if (alive) setDoc(d); }).catch((e) => { if (alive) setError(String(e?.message ?? e)); });
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { alive = false; window.removeEventListener('keydown', esc); };
  }, [onClose]);
  const list = useMemo(() => (doc?.ledgers ?? []).filter((l) => !onlyIssues || l.status !== 'ok'), [doc, onlyIssues]);
  const lib = doc?.cycleLibrary;
  const tiles = doc ? [
    { k: 'ok', n: doc.summary.ok, ...STATUS.ok }, { k: 'gap', n: doc.summary.gap, ...STATUS.gap }, { k: 'late', n: doc.summary.late, ...STATUS.late },
    { k: 'job_error', n: doc.summary.jobError + doc.summary.readError, ...STATUS.job_error, label: 'Lỗi' }, { k: 'empty', n: doc.summary.empty, ...STATUS.empty },
  ] : [];
  return createPortal(
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(2,6,15,.72)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflowY: 'auto', padding: 'max(16px, 4vh) 16px' }}>
      <div role="dialog" aria-modal="true" aria-label="Sức khoẻ sổ theo dõi" data-testid="ledger-health" onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(1120px, 100%)', background: 'linear-gradient(180deg, #0f172a 0%, #0b1220 100%)', border: '1px solid var(--border-subtle, #263042)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,.55)', padding: '18px 20px', color: 'var(--text-secondary, #cbd5e1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary, #f8fafc)' }}>Sức khoẻ sổ theo dõi</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-tertiary, #94a3b8)' }}>Sổ ghi lại mô hình mỗi phiên để chấm bằng kết quả thật về sau. Một phiên thiếu không thể ghi bù mà vẫn giữ giá trị kiểm chứng.{doc ? ` Lịch phiên tới ${dmy(doc.calendarThrough)} · cập nhật ${hm(doc.generatedAt)}.` : ''}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng" data-testid="ledger-health-close" style={{ marginLeft: 'auto', background: 'rgba(148,163,184,.12)', border: '1px solid var(--border-subtle, #263042)', borderRadius: 8, color: 'var(--text-primary, #f8fafc)', cursor: 'pointer', fontSize: 13, padding: '4px 10px' }}>✕ Đóng</button>
        </div>
        {error && <p role="alert" style={{ color: STATUS.job_error.color, fontSize: 13 }}>Không tải được: {error}</p>}
        {!doc && !error && <p style={{ fontSize: 13 }}>Đang đọc các sổ…</p>}
        {doc && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(118px, 1fr))', gap: 8, margin: '14px 0 10px' }} data-testid="ledger-summary">
            {tiles.map((t) => <div key={t.k} style={{ border: `1px solid ${t.n ? t.color : 'var(--border-subtle, #263042)'}`, background: t.n ? t.bg : 'transparent', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 11, color: t.color, fontWeight: 700 }}>{t.label}</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #f8fafc)', fontVariantNumeric: 'tabular-nums' }}>{t.n}</div></div>)}
            {lib && <div data-testid="ledger-cycle-lib" style={{ border: '1px solid var(--border-subtle, #263042)', borderRadius: 10, padding: '8px 10px', gridColumn: 'span 2', minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary, #94a3b8)', fontWeight: 700 }}>Thư viện Cycle</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>{lib.loaded && lib.info ? <>{lib.mode === 'worker' ? 'Worker riêng' : 'Trong tiến trình chính'} · nạp từ {lib.source === 'disk' ? 'file trên Volume' : 'kho, vừa dựng'}{lib.loadMs != null ? ` trong ${(lib.loadMs / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giây` : ''} · {lib.info.windows.toLocaleString('vi-VN')} cửa sổ, {lib.info.tickers} mã, dữ liệu {dmy(lib.info.dataAsOf)}{lib.fileMb != null ? ` · file ${lib.fileMb.toLocaleString('vi-VN')} MB` : ''}</> : 'Chưa nạp'}{lib.lastError ? <span style={{ color: STATUS.late.color }}> · {lib.lastError}</span> : null}</div>
            </div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '0 0 10px', fontSize: 11 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12 }}><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} data-testid="ledger-only-issues" />Chỉ sổ cần chú ý</label>
            {(Object.keys(CELL) as (keyof typeof CELL)[]).map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: CELL[k].color, display: 'inline-block' }} />{CELL[k].label}</span>)}
            {doc.backup && <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary, #94a3b8)' }}>Sao lưu gần nhất {hm(doc.backup.at)}{doc.backup.failed ? `, lỗi ${doc.backup.failed} khoá` : ''}</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 10 }}>
            {list.map((l) => <LedgerCard key={l.id} l={l} now={now} />)}
            {!list.length && <p style={{ fontSize: 13 }}>Mọi sổ đều ổn.</p>}
          </div>
        </>}
      </div>
    </div>,
    document.body,
  );
}
