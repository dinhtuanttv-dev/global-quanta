import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useRadarModel } from '../../hooks/useRadarModel';
import { useWatchlists } from '../../hooks/useWatchlists';
import { useSmartNews } from '../../hooks/useSmartNews';
import { CORE_MIN, type ScoredTicker } from '../../lib/radarModel';
import { layoutRadar, arcPath, polar, radiusForScore, CX, CY, R_MAX, VIEW_W, VIEW_H, type LayoutNode } from '../../lib/radarLayout';
import Card, { AiChip } from './Card';
import { useRadarHistory } from '../../hooks/useRadarHistory';
import { previousSnapshot, radarEvents, scoreTrails, toSnapItems, type RadarEvent, type SnapItem } from '../../lib/radarHistory';
import { browserNotify } from '../../lib/priceAlerts';
import { CONVERGENCE_LABELS } from '../../types';

// ELITE COMMAND RADAR — ★ Danh mục được chọn, chấm hội tụ 6 tiêu chí bằng dữ liệu thật.
//   Góc = nhóm ngành · Bán kính = điểm hội tụ (tâm = 6/6, vùng vàng = Core ≥ 4/6) · Kích thước = Smart Score
//   Ký hiệu = trạng thái (🛡 ổn định / ⚡ bứt phá / ⚠ cảnh báo) · Viền = cảm xúc tin 3 ngày · Vòng nhấp nháy = tin quan trọng trong 24 giờ.
// Lịch sử (Supabase qua Gateway): ảnh chụp mỗi ngày giao dịch -> vệt chuyển động 5 ngày, thanh tua lại, sự kiện radar (vào/ra Core…).
// Màu theo tab Siêu Quét: cyan (khung, mã), hổ phách (Core / điểm), xanh/đỏ (tăng/giảm, tin tốt/xấu), tím (AI).

const UP = '#34d399', DOWN = '#fb7185', AMBER = '#f59e0b', CYAN = '#38bdf8';
const STATE_GLYPH: Record<string, string> = { stable: '🛡', breakout: '⚡', caution: '⚠' };
const SHORT_GROUP: Record<string, string> = {
  'Xây dựng & Vật liệu': 'XD & VL', 'Công nghệ & Viễn thông': 'CN & VT', 'Nguyên vật liệu': 'Nguyên liệu',
  'Bất động sản': 'BĐS', 'Chưa phân nhóm': 'Khác',
};
const groupLabel = (g: string) => SHORT_GROUP[g] ?? g;
const pct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`);

function Evidence({ x }: { x: ScoredTicker }) {
  const lack = Math.max(0, CORE_MIN - x.score);
  return (
    <div className="mt-2 rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[9px] tracking-wider text-slate-500 font-semibold">GIẢI TRÌNH HỘI TỤ — VÌ SAO TIN MÃ NÀY</div>
        <div className="font-mono text-[11px] font-semibold text-amber-400">{x.score}/6</div>
      </div>
      <div className="text-[13px] font-semibold text-slate-100 mb-1.5">
        {x.ticker}
        <span className="ml-1.5 text-[10px] font-normal text-slate-500">{x.item?.companyName ?? ''}</span>
      </div>
      <ul className="space-y-1">
        {x.evidence.map((e) => (
          <li key={e.label} className="flex gap-1.5 text-[10.5px] leading-snug">
            <span className="w-3 shrink-0 text-center font-semibold" style={{ color: e.status === 'pass' ? UP : e.status === 'fail' ? DOWN : '#64748b' }}
              aria-label={e.status === 'pass' ? 'đạt' : e.status === 'fail' ? 'không đạt' : 'chưa có dữ liệu'}>
              {e.status === 'pass' ? '✓' : e.status === 'fail' ? '✗' : '…'}
            </span>
            <span className={e.status === 'pass' ? 'text-slate-200' : 'text-slate-500'}>
              <b className="font-medium">{e.label}</b> — {e.text}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 text-[10px] text-slate-400">
        {x.score >= CORE_MIN ? <>Đang ở <b className="text-amber-400">Core</b>.</> : <>Còn thiếu <b className="text-amber-300">{lack}</b> tiêu chí để vào Core.</>}
      </div>
    </div>
  );
}

const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const NOTIFY_KINDS = new Set(['enter_core', 'leave_core', 'turn_caution']);
const NOTIFIED_KEY = 'gq.radar.notified';

/** Thông báo trình duyệt cho sự kiện quan trọng — mỗi (ngày, mã, loại) một lần. */
function notifyEvents(date: string, events: RadarEvent[]) {
  let seen: string[] = [];
  try { seen = JSON.parse(window.localStorage.getItem(NOTIFIED_KEY) ?? '[]'); } catch { /* bỏ qua */ }
  const fresh = events.filter((e) => NOTIFY_KINDS.has(e.kind) && !seen.includes(`${date}|${e.kind}|${e.ticker}`));
  if (!fresh.length) return;
  for (const e of fresh) browserNotify('ELITE COMMAND RADAR', e.text, `radar-${date}-${e.kind}-${e.ticker}`);
  try { window.localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen, ...fresh.map((e) => `${date}|${e.kind}|${e.ticker}`)].slice(-300))); } catch { /* bỏ qua */ }
}

function SnapEvidence({ v, date }: { v: SnapItem; date: string }) {
  return (
    <div className="mt-2 rounded-lg p-2.5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[9px] tracking-wider text-slate-500 font-semibold">HỘI TỤ NGÀY {fmtDate(date)}</div>
        <div className="font-mono text-[11px] font-semibold text-amber-400">{v.s}/6</div>
      </div>
      <div className="text-[13px] font-semibold text-slate-100 mb-1">{v.t}</div>
      <ul className="space-y-0.5">
        {CONVERGENCE_LABELS.map((label, i) => {
          const c = v.pass?.[i] ?? '-';
          return (
            <li key={label} className="flex gap-1.5 text-[10.5px]">
              <span className="w-3 text-center font-semibold" style={{ color: c === '1' ? UP : c === '0' ? DOWN : '#64748b' }}>{c === '1' ? '✓' : c === '0' ? '✗' : '…'}</span>
              <span className={c === '1' ? 'text-slate-200' : 'text-slate-500'}>{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function EliteCommandRadar() {
  const { selectedTicker, selectTicker } = useAppStore();
  const live = useAppStore((s) => s.livePrices);
  const { lists, setRadarList } = useWatchlists();
  const model = useRadarModel();
  const { scored, core, risk, digest, missingSources, listName, listId, tickers } = model;
  const news = useSmartNews(tickers);
  const [hover, setHover] = useState<string | null>(null);

  const coreSet = useMemo(() => new Set(core.map((n) => n.ticker)), [core]);
  const byTicker = useMemo(() => new Map(scored.map((x) => [x.ticker, x])), [scored]);

  // Lịch sử: chỉ lưu khi đủ 6 nguồn (thiếu nguồn -> điểm thấp giả -> sự kiện "rời Core" giả).
  const snapItems = useMemo(() => toSnapItems(scored, coreSet, live), [scored, coreSet, live]);
  const ready = !model.loading && missingSources.length === 0 && scored.some((x) => x.item);
  const history = useRadarHistory(listName, snapItems, ready);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setViewDate(null); setPlaying(false); }, [listName]);
  const pastDates = useMemo(() => history.snapshots.map((s) => s.date).filter((d) => d !== history.today), [history.snapshots, history.today]);
  const replay = viewDate ? history.snapshots.find((s) => s.date === viewDate) ?? null : null;
  const curDate = replay?.date ?? history.today ?? new Date().toISOString().slice(0, 10);
  const viewItems: SnapItem[] = replay ? replay.items : snapItems;
  const viewMap = useMemo(() => new Map(viewItems.map((i) => [i.t, i])), [viewItems]);
  const layoutKey = viewItems.map((i) => `${i.t}:${i.s}:${i.g}:${i.sm}:${i.core ? 1 : 0}`).join('|');
  const layout = useMemo(() => layoutRadar(viewItems.map((i) => ({
    ticker: i.t, score: i.s, group: i.g ?? 'Chưa phân nhóm', smart: i.sm, core: i.core,
  }))), [layoutKey]);
  const trails = useMemo(() => scoreTrails(history.snapshots, curDate, 5), [history.snapshots, curDate]);
  const prevSnap = useMemo(() => previousSnapshot(history.snapshots, curDate), [history.snapshots, curDate]);
  const events = useMemo(() => (replay || ready ? radarEvents(prevSnap?.items, viewItems) : []), [replay, ready, prevSnap, viewItems]);
  useEffect(() => { if (!replay && events.length) notifyEvents(curDate, events); }, [replay, events, curDate]);

  // ▶ Tua: chạy qua các ngày đã lưu rồi về hiện tại.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setViewDate((d) => {
        const i = d ? pastDates.indexOf(d) : -1;
        const next = d === null ? pastDates[0] ?? null : pastDates[i + 1] ?? null;
        if (next === null) setPlaying(false);
        return next;
      });
    }, 1200);
    return () => clearInterval(id);
  }, [playing, pastDates]);

  // Tin: cảm xúc trung bình 3 ngày (viền) và tin quan trọng 24 giờ (vòng nhấp nháy).
  const newsInfo = useMemo(() => {
    const out = new Map<string, { sentiment: number; hot: boolean }>();
    const now = Date.now();
    for (const it of news.data?.items ?? []) {
      const age = it.publishedAt ? (now - Date.parse(it.publishedAt)) / 3_600_000 : 999;
      if (age > 72) continue;
      for (const t of it.tickers) {
        const cur = out.get(t) ?? { sentiment: 0, hot: false };
        cur.sentiment += it.sentiment;
        if (age <= 24 && it.importance >= 70) cur.hot = true;
        out.set(t, cur);
      }
    }
    return out;
  }, [news.data]);

  const selected = selectedTicker && !replay ? byTicker.get(selectedTicker) ?? null : null;
  const selectedSnap = selectedTicker && replay ? viewMap.get(selectedTicker) ?? null : null;
  const tip = hover ? layout.nodes.find((n) => n.ticker === hover) ?? null : null;
  const groups = new Set(layout.nodes.map((n) => n.group)).size;
  const coreR = (radiusForScore(CORE_MIN) + radiusForScore(CORE_MIN - 1)) / 2;

  const node = (n: LayoutNode) => {
    const v = viewMap.get(n.ticker)!;
    const st = v.st;
    const smart = v.sm;
    const ni = replay ? undefined : newsInfo.get(n.ticker);
    const rim = ni ? (ni.sentiment >= 0.25 ? UP : ni.sentiment <= -0.25 ? DOWN : null) : null;
    const isSel = selectedTicker === n.ticker;
    const label = `${n.ticker}: ${v.s}/6 tiêu chí${n.core ? ', Core' : ''}, Smart ${smart?.toFixed(1) ?? '—'}, nhóm ${n.group}`;
    return (
      <g key={n.ticker} transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`} role="button" tabIndex={0} aria-label={label} aria-pressed={isSel}
        className="cursor-pointer focus:outline-none radar-node"
        onClick={() => selectTicker(n.ticker)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTicker(n.ticker); } }}
        onMouseEnter={() => setHover(n.ticker)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(n.ticker)} onBlur={() => setHover(null)}>
        {ni?.hot && <circle r={n.dot + 4} fill="none" stroke={rim ?? AMBER} strokeWidth={1.5} className="radar-pulse" />}
        {n.core ? (
          <>
            <circle r={n.dot + 6} fill={AMBER} opacity={0.16} />
            <circle r={n.dot} fill="#0d111a" stroke={st === 'caution' ? DOWN : AMBER} strokeWidth={isSel ? 3 : 2} />
            {rim && <circle r={n.dot + 2.5} fill="none" stroke={rim} strokeWidth={1.2} opacity={0.9} />}
            <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#f8fafc" className="font-mono">{n.ticker}</text>
            <text y={-n.dot - 4} textAnchor="middle" fontSize={10}>{STATE_GLYPH[st]}</text>
          </>
        ) : (
          <>
            <circle r={n.dot} fill={st === 'caution' ? DOWN : st === 'breakout' ? AMBER : CYAN} opacity={0.35 + Math.min(0.55, (smart ?? 40) / 160)}
              stroke={isSel ? '#f8fafc' : rim ?? 'none'} strokeWidth={isSel ? 2 : rim ? 1.4 : 0} />
            {st !== 'stable' && <text x={n.dot + 1} y={-n.dot} fontSize={7}>{STATE_GLYPH[st]}</text>}
            {n.showLabel && <text y={n.dot + 9} textAnchor="middle" fontSize={8.5} fill={isSel ? '#f8fafc' : '#94a3b8'} className="font-mono">{n.ticker}</text>}
          </>
        )}
      </g>
    );
  };

  // Vệt chuyển động: điểm hội tụ các ngày trước trên cùng hướng (gần tâm hơn = mạnh lên).
  const trail = (n: LayoutNode) => {
    const arr = trails.get(n.ticker);
    const now = viewMap.get(n.ticker)?.s;
    if (!arr?.length || now === undefined || arr.every((s) => s === now)) return null;
    const pts = arr.map((s) => polar(n.angle, radiusForScore(s)));
    const color = arr[arr.length - 1] < now ? UP : arr[arr.length - 1] > now ? DOWN : '#94a3b8';
    return (
      <g key={`trail-${n.ticker}`} aria-hidden="true" className="radar-trail">
        <polyline points={[...pts, { x: n.x, y: n.y }].map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={0.55} strokeDasharray="3 2" />
        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.8} fill={color} opacity={0.2 + (0.5 * (i + 1)) / pts.length} />)}
      </g>
    );
  };

  const header = (
    <select value={listId} onChange={(e) => setRadarList(e.target.value)} aria-label="Danh mục hiển thị trên Radar"
      className="text-[10px] bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-slate-300 max-w-[150px]">
      {lists.map((l) => <option key={l.id} value={l.id}>★ {l.name} ({l.tickers.length})</option>)}
    </select>
  );

  return (
    <Card id="radar" title={<>ELITE COMMAND RADAR <AiChip /></>} right={header} className="radar-block">
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400 mb-1">
        {tickers.length ? (
          <>
            <span>★ {listName}: <b className="text-slate-200">{tickers.length}</b> mã</span>
            <span>Core <b className="text-amber-400">{viewItems.filter((i) => i.core).length}</b></span>
            {replay && <span className="text-cyan-300">⏮ Đang xem {fmtDate(replay.date)}</span>}
            <span>{groups} nhóm ngành</span>
            {!replay && newsInfo.size > 0 && <span>Tin nóng 24h <b className="text-amber-300">{[...newsInfo.values()].filter((v) => v.hot).length}</b></span>}
          </>
        ) : <span>★ {listName} đang trống — bấm ☆ cạnh mã trong Bảng Siêu Quét hoặc tìm mã (phím /) để thêm.</span>}
      </div>

      <div className="relative">
        <svg viewBox={`-56 0 ${VIEW_W + 112} ${VIEW_H}`} className="w-full block" role="group" aria-label="Elite Command Radar: góc theo nhóm ngành, bán kính theo điểm hội tụ">
          <defs>
            <radialGradient id="radarCore" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={AMBER} stopOpacity={0.16} />
              <stop offset="100%" stopColor={AMBER} stopOpacity={0.03} />
            </radialGradient>
          </defs>
          <circle cx={CX} cy={CY} r={R_MAX} fill="rgba(56,189,248,0.025)" stroke="rgba(56,189,248,0.18)" />
          {[0, 1, 2, 3, 5, 6].map((s) => (
            <circle key={s} cx={CX} cy={CY} r={radiusForScore(s)} fill="none" stroke="rgba(148,163,184,0.10)" strokeDasharray="2 4" />
          ))}
          <circle cx={CX} cy={CY} r={coreR} fill="url(#radarCore)" stroke="rgba(245,158,11,0.45)" strokeDasharray="3 3" />
          <text x={CX} y={CY - coreR + 11} textAnchor="middle" fontSize={8} letterSpacing={3} fill="rgba(245,158,11,0.7)">CORE ≥{CORE_MIN}/6</text>
          {[6, 4, 2, 0].map((s) => (
            <text key={s} x={CX + 3} y={CY - radiusForScore(s) - 2} fontSize={7} fill="rgba(148,163,184,0.45)">{s}/6</text>
          ))}
          {layout.slices.length > 1 && layout.slices.map((sl) => {
            const p = polar(sl.a0, R_MAX);
            const mid = (sl.a0 + sl.a1) / 2;
            const lp = polar(mid, R_MAX + 9);
            // Nhãn bên phải căn trái, bên trái căn phải (không bị cắt ở mép khung).
            const anchor = lp.x > CX + 25 ? 'start' : lp.x < CX - 25 ? 'end' : 'middle';
            const lx = lp.x;
            return (
              <g key={sl.group}>
                <line x1={CX} y1={CY} x2={p.x} y2={p.y} stroke="rgba(148,163,184,0.12)" />
                <path d={arcPath(sl.a0 + 1, sl.a1 - 1, R_MAX + 3)} fill="none" stroke="rgba(56,189,248,0.35)" strokeWidth={2} />
                <text x={lx} y={Math.max(9, Math.min(VIEW_H - 3, lp.y + 3))} textAnchor={anchor} fontSize={8.5} fill="#67e8f9">{groupLabel(sl.group)} · {sl.count}</text>
              </g>
            );
          })}
          <g className="radar-sweep" style={{ transformOrigin: `${CX}px ${CY}px` }}>
            <line x1={CX} y1={CY} x2={CX} y2={CY - R_MAX} stroke="rgba(56,189,248,0.35)" strokeWidth={1.5} />
          </g>
          {layout.nodes.map(trail)}
          {layout.nodes.filter((n) => !n.core).map(node)}
          {layout.nodes.filter((n) => n.core).map(node)}
        </svg>
        {tip && (() => {
          const x = replay ? null : byTicker.get(tip.ticker) ?? null;
          const v = viewMap.get(tip.ticker)!;
          const price = (replay ? null : live[tip.ticker]?.price) ?? v.p ?? null;
          const chg = (replay ? null : live[tip.ticker]?.changePct) ?? v.c ?? null;
          const left = (tip.x / VIEW_W) * 100, top = (tip.y / VIEW_H) * 100;
          return (
            <div role="tooltip" className="absolute z-20 pointer-events-none rounded-lg px-2 py-1.5 text-[10px] shadow-xl w-44"
              style={{ left: `${Math.min(70, Math.max(2, left - 22))}%`, top: `calc(${top}% + ${tip.dot + 6}px)`, background: '#0f1420', border: '1px solid rgba(56,189,248,0.35)' }}>
              <div className="flex justify-between"><b className="text-slate-100 font-mono">{tip.ticker}</b><span className="text-amber-400 font-mono">{v.s}/6</span></div>
              <div className="text-slate-400 truncate">{x?.item?.industry ?? tip.group}{replay ? ` · ${fmtDate(replay.date)}` : ''}</div>
              <div className="flex justify-between font-mono">
                <span className="text-slate-200">{price ? price.toLocaleString('vi-VN') : '—'}</span>
                <span style={{ color: (chg ?? 0) >= 0 ? UP : DOWN }}>{pct(chg)}</span>
              </div>
              <div className="text-slate-400">Smart <span className="text-amber-400">{v.sm?.toFixed(1) ?? '—'}</span>{x ? ` · RS ${x.item?.rsRating?.toFixed(0) ?? '—'}` : ''}</div>
            </div>
          );
        })()}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-slate-500 mt-1">
        <span><span style={{ color: AMBER }}>●</span> Core ≥{CORE_MIN}/6 (vùng vàng)</span>
        <span>Gần tâm = nhiều tiêu chí</span>
        <span>Góc = nhóm ngành</span>
        <span>To = Smart cao</span>
        <span><span style={{ color: CYAN }}>●</span> ổn định · <span style={{ color: AMBER }}>●</span> ⚡ bứt phá · <span style={{ color: DOWN }}>●</span> ⚠ cảnh báo (Down-Trend / F-Score thấp)</span>
        <span>Viền <span style={{ color: UP }}>xanh</span>/<span style={{ color: DOWN }}>đỏ</span> = tin 3 ngày</span>
      </div>

      {history.enabled && (
        <div className="mt-2 rounded-lg px-2 py-1.5" style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.15)' }}>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-[9px] tracking-wider text-slate-500 font-semibold shrink-0">LỊCH SỬ</span>
            {pastDates.length > 0 ? (
              <>
                <button type="button" onClick={() => { if (playing) setPlaying(false); else { setViewDate(null); setPlaying(true); } }}
                  aria-label={playing ? 'Dừng tua' : 'Tua lại các ngày đã lưu'} className="text-cyan-300 hover:text-cyan-200 w-4 shrink-0">{playing ? '⏸' : '▶'}</button>
                <input type="range" min={0} max={pastDates.length} step={1} aria-label="Tua lại lịch sử Radar"
                  value={replay ? pastDates.indexOf(replay.date) : pastDates.length}
                  aria-valuetext={replay ? `Ngày ${fmtDate(replay.date)}` : 'Hiện tại'}
                  onChange={(e) => { setPlaying(false); const i = Number(e.target.value); setViewDate(i >= pastDates.length ? null : pastDates[i]); }}
                  className="flex-1 min-w-0 accent-cyan-400" />
                <span className="font-mono text-slate-300 shrink-0 w-14 text-right">{replay ? fmtDate(replay.date) : 'Hiện tại'}</span>
              </>
            ) : <span className="flex-1 text-slate-500">Lịch sử bắt đầu từ hôm nay — mỗi ngày giao dịch lưu 1 ảnh chụp.</span>}
          </div>
          <div className="text-[9px] text-slate-500 mt-0.5">
            {history.error ? <span className="text-rose-300">Không tải được lịch sử: {history.error}</span>
              : history.saveError ? <span className="text-rose-300">Chưa lưu được ảnh chụp: {history.saveError}</span>
              : history.saving ? 'Đang lưu ảnh chụp hôm nay…'
              : !ready ? 'Chờ đủ 6 nguồn dữ liệu rồi mới lưu ảnh chụp hôm nay.'
              : history.today && history.snapshots.some((s) => s.date === history.today)
                ? `Đã lưu ảnh chụp ${fmtDate(history.today)} · ${history.snapshots.length} ngày · Supabase, xem được trên mọi máy đã đăng nhập.`
                : history.loading ? 'Đang tải lịch sử…' : 'Sẽ lưu ảnh chụp hôm nay sau ít giây.'}
            {trails.size > 0 && ' Vệt đứt = điểm 5 ngày trước (xanh: mạnh lên, đỏ: yếu đi).'}
          </div>
        </div>
      )}

      {history.enabled && (replay || ready) && (
        <div className="mt-2">
          <div className="text-[9px] tracking-wider text-slate-500 font-semibold mb-0.5">
            SỰ KIỆN RADAR {prevSnap ? <span className="font-normal tracking-normal">· {replay ? fmtDate(replay.date) : 'hiện tại'} so với {fmtDate(prevSnap.date)}</span> : null}
          </div>
          {events.length ? (
            <ul className="space-y-0.5">
              {events.slice(0, 8).map((e) => (
                <li key={`${e.kind}-${e.ticker}`}>
                  <button type="button" onClick={() => selectTicker(e.ticker)} className="text-left text-[10.5px] hover:underline"
                    style={{ color: e.tone === 'up' ? UP : e.tone === 'down' ? DOWN : '#cbd5e1' }}>
                    {e.kind === 'enter_core' ? '◎' : e.kind === 'leave_core' ? '○' : e.tone === 'up' ? '▲' : '▼'} {e.text}
                  </button>
                </li>
              ))}
              {events.length > 8 && <li className="text-[9.5px] text-slate-500">+{events.length - 8} sự kiện khác</li>}
            </ul>
          ) : (
            <div className="text-[10px] text-slate-500">{prevSnap ? 'Không có thay đổi đáng kể (vào/ra Core, ±2 tiêu chí, đổi trạng thái).' : 'Chưa có ảnh chụp ngày trước để so sánh.'}</div>
          )}
        </div>
      )}

      {selectedSnap && replay && <SnapEvidence v={selectedSnap} date={replay.date} />}
      {selected && <Evidence x={selected} />}
      {selectedTicker && !selected && !replay && tickers.length > 0 && (
        <div className="mt-2 text-[10.5px] text-slate-400">☆ {selectedTicker} chưa có trong ★ {listName} — bấm <b className="text-cyan-300">Quan tâm</b> ở Action Center để Radar chấm hội tụ.</div>
      )}
      {risk && (
        <div className="mt-2 rounded-lg px-2.5 py-1.5 text-[10.5px]" style={{
          background: risk.level === 'high' ? 'rgba(244,63,94,0.08)' : risk.level === 'medium' ? 'rgba(245,158,11,0.08)' : 'rgba(52,211,153,0.07)',
          border: `1px solid ${risk.level === 'high' ? 'rgba(244,63,94,0.35)' : risk.level === 'medium' ? 'rgba(245,158,11,0.35)' : 'rgba(52,211,153,0.3)'}`,
        }}>
          <b style={{ color: risk.level === 'high' ? DOWN : risk.level === 'medium' ? AMBER : UP }}>
            Rủi ro tập trung: {risk.level === 'low' ? 'Thấp' : risk.level === 'medium' ? 'Trung bình' : 'Cao'}.
          </b>{' '}<span className="text-slate-300">{risk.note}</span>
        </div>
      )}
      {digest && <div className="mt-2 text-[10.5px] text-slate-300 leading-snug">{digest.text}</div>}
      {missingSources.length > 0 && <div className="mt-1 text-[9.5px] text-slate-500">Đang chờ dữ liệu: {missingSources.join(', ')} (chưa tính là "không đạt").</div>}
    </Card>
  );
}
