// D5 (2026-10-20) — sức khoẻ hạn mức kho dữ liệu trên thanh trên cùng: băng thông Supabase hôm nay / dự báo tháng so với
// hạn mức miễn phí, trạng thái kho đệm Gateway. Bấm để xem chi tiết. Số đo nằm trong bộ nhớ Gateway (không đọc kho dữ liệu).
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

/** B4 (25/10/2026): sức khoẻ "⏱ Timeline điểm mua" — kho Cổ tức trên Gateway, nguồn Timeline, đối chiếu Project A, ngắt mạch quét. */
export interface CotucHealth {
  store: { tables: Record<string, { rows: number; updatedAt: string | null }> };
  buyTiming: { failures: number; lastError: string | null; parity: { mismatches: number; projectA: number; gateway: number; at: string } | null; localError: string | null };
  scanner: { enabled: boolean; timing: { lastPassAt: string | null; pausedUntil: string | null; lastError: string | null } | null } | null;
}

const hm = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const v = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString();
  return `${v.slice(11, 16)} ${v.slice(8, 10)}/${v.slice(5, 7)}`;
};

export function describeCotuc(h: CotucHealth, now = Date.now()): { ok: boolean; text: string } {
  const d = h.store.tables.decision;
  const ageH = d?.updatedAt ? (now - Date.parse(d.updatedAt)) / 3_600_000 : Infinity;
  const paused = h.scanner?.timing?.pausedUntil;
  const parity = h.buyTiming.parity;
  // Quyết định cập nhật mỗi giờ trong phiên + 2 mốc ngoài phiên -> quá 3 ngày (qua cuối tuần / lễ ngắn) là bất thường.
  const ok = (d?.rows ?? 0) > 0 && ageH < 72 && !paused && (!parity || parity.mismatches === 0);
  const parts = [
    d?.rows ? `${d.rows} mã, cập nhật ${hm(d.updatedAt)}` : 'kho chưa có dữ liệu',
    parity ? (parity.mismatches === 0 ? 'khớp Project A' : `lệch Project A ${parity.mismatches} dòng`) : null,
    paused ? `quét tạm dừng tới ${hm(paused)}` : null,
  ].filter(Boolean);
  return { ok, text: `Timeline điểm mua: ${parts.join(' · ')}` };
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
  const [cotuc, setCotuc] = useState<CotucHealth | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dlgRef = useRef<HTMLDivElement>(null);
  // Bảng chi tiết nằm trong portal (thanh trên cùng cắt phần tràn): đặt dưới nút, kẹp trong màn hình với lề 16 px.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      const width = Math.min(300, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.right - width, window.innerWidth - 16 - width));
      setPos({ top: r.bottom + 6, left, width });
    };
    place();
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!dlgRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('keydown', close);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); window.removeEventListener('keydown', close); window.removeEventListener('pointerdown', outside); };
  }, [open]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchMarketJson<DbBudget>('/api/health/db-budget').then((d) => { if (alive) setData(d); }).catch(() => {});
    const loadCotuc = () => fetchMarketJson<CotucHealth>('/api/cotuc-store/health').then((d) => { if (alive && d?.store) setCotuc(d); }).catch(() => {});
    void load(); void loadCotuc();
    const id = setInterval(() => { void load(); void loadCotuc(); }, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);
  if (!data?.supabaseEgress) return null;
  const base = describeBudget(data);
  const ct = cotuc ? describeCotuc(cotuc) : null;
  const b = ct && !ct.ok && base.tone === 'ok' ? { ...base, tone: 'warn' as const, title: `${base.title} · ${ct.text}` } : ct ? { ...base, title: `${base.title} · ${ct.text}` } : base;
  const e = data.supabaseEgress;
  const w = data.warehouse;
  const hitRate = w?.enabled && (w.ramHits ?? 0) + (w.diskHits ?? 0) + (w.misses ?? 0) > 0
    ? Math.round((((w.ramHits ?? 0) + (w.diskHits ?? 0)) / ((w.ramHits ?? 0) + (w.diskHits ?? 0) + (w.misses ?? 0))) * 100)
    : null;
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} title={b.title} aria-label={b.title} aria-expanded={open}
        style={{ fontSize: 10, color: TONE[b.tone], whiteSpace: 'nowrap', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        {b.label}
      </button>
      {open && pos && createPortal(
        <div ref={dlgRef} role="dialog" aria-label="Sức khoẻ hạn mức kho dữ liệu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000, width: pos.width, background: 'var(--bg-elevated, #111827)', border: '1px solid var(--border-subtle, #374151)', borderRadius: 8, padding: 10, fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary, #d1d5db)', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
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
          {ct && <div style={{ marginTop: 4, color: ct.ok ? undefined : TONE.warn }} data-testid="infra-cotuc">{ct.text}</div>}
          <div style={{ marginTop: 4, color: 'var(--text-tertiary, #9ca3af)' }}>Gói miễn phí: 5 GB/tháng cho cả tổ chức Supabase (Gateway dùng tối đa 3,5 GB).</div>
        </div>,
        document.body,
      )}
    </span>
  );
}
