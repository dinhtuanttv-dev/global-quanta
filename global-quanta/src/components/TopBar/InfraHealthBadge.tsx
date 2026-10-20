// D5 (2026-10-20) — sức khoẻ hạn mức kho dữ liệu trên thanh trên cùng: băng thông Supabase hôm nay / dự báo tháng so với
// hạn mức miễn phí, trạng thái kho đệm Gateway. Bấm để xem chi tiết. Số đo nằm trong bộ nhớ Gateway (không đọc kho dữ liệu).
import { useEffect, useState } from 'react';
import { fetchMarketJson } from '../../services/marketDataClient';

export interface DbBudget {
  supabaseEgress: {
    day: string;
    today: { mb: number; requests: number; blocked: number };
    budget: { softMb: number; hardMb: number; jobMb: number; monthlyQuotaMb: number; status: 'ok' | 'warn' | 'blocked' };
    monthToDate: { mb: number; projectedMb: number; quotaPct: number };
    byTag: { key: string; mb: number; requests: number }[];
  };
  warehouse: { enabled: boolean; disk?: boolean; ramMb?: number; ramCapMb?: number; ramHits?: number; diskHits?: number; misses?: number } | null;
}

const TONE = { ok: '#34d399', warn: '#fbbf24', blocked: '#f87171' } as const;
const POLL_MS = 10 * 60_000;

export function describeBudget(d: DbBudget): { label: string; tone: keyof typeof TONE; title: string } {
  const e = d.supabaseEgress;
  const pct = Math.round(e.monthToDate.quotaPct);
  const tone = e.budget.status === 'blocked' ? 'blocked' : e.budget.status === 'warn' || pct >= 80 ? 'warn' : 'ok';
  const wh = d.warehouse?.enabled ? (d.warehouse.disk ? 'kho đệm đĩa bền' : 'kho đệm chỉ RAM') : 'không có kho đệm';
  return {
    label: `● Kho ${pct}%`,
    tone,
    title: `Băng thông Supabase: hôm nay ${e.today.mb} MB · tháng ${e.monthToDate.mb} MB, dự báo ${e.monthToDate.projectedMb} MB (${pct}% hạn mức ${e.budget.monthlyQuotaMb} MB) · ${wh}`,
  };
}

export default function InfraHealthBadge() {
  const [data, setData] = useState<DbBudget | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = () => fetchMarketJson<DbBudget>('/api/health/db-budget').then((d) => { if (alive) setData(d); }).catch(() => {});
    void load();
    const id = setInterval(load, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!data?.supabaseEgress) return null;
  const b = describeBudget(data);
  const e = data.supabaseEgress;
  const w = data.warehouse;
  const hitRate = w?.enabled && (w.ramHits ?? 0) + (w.diskHits ?? 0) + (w.misses ?? 0) > 0
    ? Math.round((((w.ramHits ?? 0) + (w.diskHits ?? 0)) / ((w.ramHits ?? 0) + (w.diskHits ?? 0) + (w.misses ?? 0))) * 100)
    : null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} title={b.title} aria-label={b.title} aria-expanded={open}
        style={{ fontSize: 10, color: TONE[b.tone], whiteSpace: 'nowrap', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        {b.label}
      </button>
      {open && (
        <div role="dialog" aria-label="Sức khoẻ hạn mức kho dữ liệu"
          style={{ position: 'absolute', right: 0, top: '140%', zIndex: 60, width: 'min(300px, calc(100vw - 32px))', background: 'var(--bg-elevated, #111827)', border: '1px solid var(--border-subtle, #374151)', borderRadius: 8, padding: 10, fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary, #d1d5db)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary, #f9fafb)', marginBottom: 4 }}>Sức khoẻ hạn mức kho dữ liệu</div>
          <div>Supabase hôm nay: <b>{e.today.mb} MB</b> ({e.today.requests} lượt{e.today.blocked ? `, ${e.today.blocked} lượt bị chặn` : ''})</div>
          <div>Tháng này: <b>{e.monthToDate.mb} MB</b> · dự báo <b>{e.monthToDate.projectedMb} MB</b> / {e.budget.monthlyQuotaMb} MB ({Math.round(e.monthToDate.quotaPct)}%)</div>
          <div>Ngưỡng ngày: cảnh báo {e.budget.softMb} MB · chặn route {e.budget.hardMb} MB · chặn job {e.budget.jobMb} MB</div>
          <div>Kho đệm: {w?.enabled ? `${w.disk ? 'đĩa bền (Railway Volume)' : 'chỉ RAM'} · RAM ${w.ramMb ?? 0}/${w.ramCapMb ?? 0} MB${hitRate !== null ? ` · trúng đệm ${hitRate}%` : ''}` : 'tắt'}</div>
          {e.byTag.length > 0 && (
            <div style={{ marginTop: 4 }}>
              Tốn nhiều nhất: {e.byTag.slice(0, 3).map((t) => `${t.key.replace(/^(job|http):/, '')} ${t.mb} MB`).join(' · ')}
            </div>
          )}
          <div style={{ marginTop: 4, color: 'var(--text-tertiary, #9ca3af)' }}>Gói miễn phí: 5 GB/tháng cho cả tổ chức Supabase (Gateway dùng tối đa 3,5 GB).</div>
        </div>
      )}
    </span>
  );
}
