// 📡 RADAR DANH MỤC ELITE 10 (30/10/2026) — nâng cấp bảng "Danh mục Elite 10" thành bảng xếp hạng 2D + canvas:
//   • Hàng = mã, xếp theo HẠNG (vị trí đầu = hạng cao nhất); đổi chế độ xếp / dữ liệu mới -> hàng tự trượt lên / xuống (FLIP, Web Animations).
//   • Rãnh canvas mỗi hàng = trục Điểm Elite Z: chấm hiện tại + VỆT Z 5 phiên trước (như vệt điểm của Elite Command Radar), vạch QUÉT
//     radar chạy ngang cả bảng, chấm "ping" khi vạch quét đi qua.
//   • Lấy từ Elite Command Radar đúng các lớp có bằng chứng / có ích đã dùng ổn định: ◆ Stealth 20 (đặc = đã kiểm định có lợi thế toàn giai
//     đoạn, rỗng = chưa), ⏱ vòng điểm mua (Timeline cổ tức · KQKD: xanh = trong vùng, vàng = ≤ 5 phiên, nét đứt = gần đạt), viền cảm xúc tin
//     3 ngày + vòng nhấp nháy tin quan trọng 24 giờ (mô tả), sự kiện vào / ra / lên / xuống hạng + thông báo, tua lại lịch sử, dừng hoạt
//     ảnh khi không hiện trên màn hình. Thêm: giá khớp trực tiếp (SSI), vượt VN-Index từ lúc dựng, vị trí giá trong dải cắt lỗ → mục tiêu.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EliteDecision, PortfolioPick } from "../../../lib/elite10/decisionTypes";
import { liveExcess, portfolioEvents, rankMoves, sortPicks, stopTargetPosition, zTrails, type SortMode } from "../../../lib/elite10/portfolioRadar";
import { useRankHistory } from "../../../hooks/elite10/useRankHistory";
import { useLiveQuotes } from "../../../hooks/elite10/useLiveQuotes";
import { useOnScreen } from "../../../hooks/useOnScreen";
import { useRadarSignals } from "../../../hooks/useRadarSignals";
import { useSmartNews } from "../../../hooks/useSmartNews";
import { useOhlcvData } from "../../../hooks/useOhlcvData";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { buyWindowEvents, pickRadarBuyRows, SOON_SESSIONS, type RadarBuyInfo, type RadarBuyRing } from "../../../lib/radarTimeline";
import { browserNotify } from "../../../lib/priceAlerts";
import { BuyTimingCell } from "./boardParts";
import type { BuyCell } from "../../../lib/elite10/buyTimingCell";

const UP = "#34d399", DOWN = "#fb7185", AMBER = "#f59e0b", CYAN = "#38bdf8", VIOLET = "#a78bfa";
const RING_COLOR: Record<RadarBuyRing, string> = { in: UP, soon: AMBER, near: "#94a3b8", later: CYAN };
const SORTS: { id: SortMode; label: string; title: string }[] = [
  { id: "rank", label: "Hạng Elite", title: "Hạng Điểm Elite (Z) toàn vũ trụ của phiên quyết định — hạng chính thức" },
  { id: "live", label: "● Trực tiếp", title: "Tự xếp lại theo lợi suất VƯỢT VN-Index từ giá lúc dựng tới giá khớp hiện tại (chỉ để theo dõi)" },
  { id: "prob", label: "P vượt", title: "Xác suất vượt trung vị vũ trụ trong 5 phiên" },
  { id: "weight", label: "Tỷ trọng", title: "Tỷ trọng ERC trong danh mục" },
];
const SORT_KEY = "elite10:radar-sort", NOTIFIED_KEY = "gq.elite.radar.notified";
const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const sgnPct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${num(v * 100, d)}%`);
const price = (v: number | null | undefined) => (v == null ? "—" : (v / 1000).toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const fmtDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const readSort = (): SortMode => { try { const v = localStorage.getItem(SORT_KEY); return SORTS.some((s) => s.id === v) ? (v as SortMode) : "rank"; } catch { return "rank"; } };

interface RowView {
  pick: PortfolioPick; z: number; trail: number[]; topTier: boolean;
  stealth: { dir: number; z: number | null } | null; buy: RadarBuyInfo | null; rim: string | null; hot: boolean;
}

/** Vẽ một rãnh canvas (thuần, gọi trong vòng rAF chung). */
function drawTrack(cv: HTMLCanvasElement, r: RowView, dom: [number, number], t: number, sweep: number | null, edge: boolean, ping: { t0: number } | undefined) {
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 200, h = cv.clientHeight || 40;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = 14, X = (z: number) => pad + ((z - dom[0]) / (dom[1] - dom[0] || 1)) * (w - 2 * pad), cy = h / 2;
  // rãnh + vạch Z nguyên
  ctx.fillStyle = "rgba(56,189,248,0.04)"; ctx.fillRect(0, cy - 9, w, 18);
  ctx.strokeStyle = "rgba(148,163,184,0.12)"; ctx.lineWidth = 1;
  for (let z = Math.ceil(dom[0]); z <= dom[1]; z++) { ctx.beginPath(); ctx.moveTo(X(z), 3); ctx.lineTo(X(z), h - 3); ctx.stroke(); }
  // vạch quét radar + vệt mờ phía sau
  if (sweep != null) {
    const sx = sweep * w, g = ctx.createLinearGradient(sx - 60, 0, sx, 0);
    g.addColorStop(0, "rgba(56,189,248,0)"); g.addColorStop(1, "rgba(56,189,248,0.16)");
    ctx.fillStyle = g; ctx.fillRect(sx - 60, 0, 60, h);
    ctx.strokeStyle = "rgba(56,189,248,0.45)"; ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, h); ctx.stroke();
  }
  const x = X(r.z);
  // vệt Z các phiên trước (xanh = Z tăng lên hiện tại, đỏ = giảm)
  if (r.trail.length) {
    const col = r.trail[r.trail.length - 1] < r.z ? UP : r.trail[r.trail.length - 1] > r.z ? DOWN : "#94a3b8";
    ctx.setLineDash([3, 2]); ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.beginPath();
    r.trail.forEach((z, i) => (i ? ctx.lineTo(X(z), cy) : ctx.moveTo(X(z), cy))); ctx.lineTo(x, cy); ctx.stroke(); ctx.setLineDash([]);
    r.trail.forEach((z, i) => { ctx.globalAlpha = 0.2 + (0.5 * (i + 1)) / r.trail.length; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(z), cy, 2, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }
  const dot = 5 + Math.min(6, r.pick.weight * 40);
  // ping khi vạch quét đi qua
  if (ping) { const k = (t - ping.t0) / 700; if (k < 1) { ctx.strokeStyle = r.topTier ? AMBER : CYAN; ctx.globalAlpha = 1 - k; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, cy, dot + 2 + k * 14, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; } }
  // tin quan trọng 24 giờ: vòng nhấp nháy
  if (r.hot) { const k = (t % 1800) / 1800; ctx.strokeStyle = r.rim ?? AMBER; ctx.globalAlpha = 0.9 * (1 - k); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, cy, dot + 4 + k * 8, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
  // ⏱ vòng điểm mua
  if (r.buy) {
    const ring = r.buy.ring;
    ctx.strokeStyle = RING_COLOR[ring]; ctx.lineWidth = ring === "in" ? 1.8 : ring === "soon" ? 1.5 : 1;
    ctx.setLineDash(ring === "near" ? [2, 2] : ring === "later" ? [1, 3] : []);
    ctx.globalAlpha = ring === "in" ? 0.6 + 0.35 * Math.abs(Math.sin(t / 700)) : ring === "near" || ring === "later" ? 0.6 : 0.95;
    ctx.beginPath(); ctx.arc(x, cy, dot + 5.5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // chấm: 3 hạng đầu = vàng (như Core của Radar), còn lại cyan
  if (r.topTier) { ctx.fillStyle = "rgba(245,158,11,0.18)"; ctx.beginPath(); ctx.arc(x, cy, dot + 4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = r.topTier ? "#0d111a" : `rgba(56,189,248,${(0.35 + Math.min(0.55, Math.max(0, (r.pick.pOutperform - 0.49) * 20))).toFixed(2)})`;
  ctx.beginPath(); ctx.arc(x, cy, dot, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = r.topTier ? AMBER : r.rim ?? "transparent"; ctx.lineWidth = r.topTier ? 2 : 1.4;
  if (r.topTier || r.rim) ctx.stroke();
  if (r.topTier && r.rim) { ctx.strokeStyle = r.rim; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, cy, dot + 2.5, 0, Math.PI * 2); ctx.stroke(); }
  // ◆ Stealth 20
  if (r.stealth) {
    const c = r.stealth.dir > 0 ? UP : DOWN, sx = x - dot - 4, sy = cy - dot + 1;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.PI / 4);
    if (edge) { ctx.fillStyle = c; ctx.fillRect(-2.8, -2.8, 5.6, 5.6); }
    ctx.strokeStyle = c; ctx.lineWidth = 1.2; ctx.strokeRect(-2.8, -2.8, 5.6, 5.6); ctx.restore();
  }
  // nhãn Z
  // nhãn Z: sát mép phải -> đặt bên trái chấm (không bị cắt)
  ctx.font = "600 9px ui-monospace, monospace"; ctx.fillStyle = "#cbd5e1"; ctx.textBaseline = "middle";
  const label = `Z ${r.z.toFixed(2)}`, lw = ctx.measureText(label).width, right = x + dot + 7 + lw <= w - 2;
  ctx.textAlign = right ? "left" : "right";
  ctx.fillText(label, right ? x + dot + 7 : x - dot - (r.stealth ? 12 : 6), cy);
}

export default function PortfolioRadar({ d, buyCells, secName, drivers, onOpenTicker, compact }: {
  d: EliteDecision; buyCells: Map<string, BuyCell>; secName: (k: string | null) => string; drivers: (t: string) => string[];
  onOpenTicker: (t: string) => void; compact: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(wrapRef);
  const [mode, setModeState] = useState<SortMode>(readSort);
  const setMode = (m: SortMode) => { setModeState(m); try { localStorage.setItem(SORT_KEY, m); } catch { /* bỏ qua */ } };
  const { history } = useRankHistory(6);
  const pastDates = useMemo(() => (history?.dates ?? []).filter((x) => x < d.date), [history, d.date]);
  const [viewDate, setViewDate] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const replay = viewDate ? history?.sessions.find((s) => s.date === viewDate) ?? null : null;

  // Danh mục đang xem: hiện tại (đủ cột) hoặc phiên cũ (từ lịch sử gọn — chỉ hạng / Z / tỷ trọng).
  const picks: PortfolioPick[] = useMemo(() => (replay
    ? replay.portfolio.map((p) => ({ ticker: p.ticker, weight: p.weight ?? 0, Z: p.Z ?? 0, rank: p.rank ?? 999, alpha5Pct: null, pOutperform: 0.5, sectorKey: null, close: 0, stop: 0, target: 0, holdSessions: 10, retained: p.retained }))
    : d.portfolio), [replay, d.portfolio]);
  const curDate = replay?.date ?? d.date;
  const tickers = useMemo(() => picks.map((p) => p.ticker), [picks]);

  const sig = useRadarSignals(tickers).data;
  const edge = sig?.evidence.STEALTH_20.verdict === "edge";
  const regimeEdge = sig?.evidence.STEALTH_20.regime?.verdict === "edge";
  const news = useSmartNews(replay ? [] : tickers);
  const buy = useGatewayBuyTimeline();
  const buyMap = useMemo(() => (replay ? new Map<string, RadarBuyInfo>() : pickRadarBuyRows(buy.data?.rows ?? [], tickers)), [buy.data, tickers, replay]);
  const live = useLiveQuotes(tickers, onScreen && !replay);
  const vni = useOhlcvData("VNINDEX", "3mo", 80);
  const idx0 = useMemo(() => (vni.bars ?? []).find((b) => b.date === d.date)?.close ?? null, [vni.bars, d.date]);

  const newsInfo = useMemo(() => {
    const out = new Map<string, { sentiment: number; hot: boolean }>(), now = Date.now();
    for (const it of news.data?.items ?? []) {
      const age = it.publishedAt ? (now - Date.parse(it.publishedAt)) / 3_600_000 : 999;
      if (age > 72) continue;
      for (const t of it.tickers) { const c = out.get(t) ?? { sentiment: 0, hot: false }; c.sentiment += it.sentiment; if (age <= 24 && it.importance >= 70) c.hot = true; out.set(t, c); }
    }
    return out;
  }, [news.data]);
  const liveEx = useMemo(() => new Map(picks.map((p) => [p.ticker, replay ? null : liveExcess(p.close, live.quotes[p.ticker]?.price, idx0, live.index?.value)])), [picks, live, idx0, replay]);
  const moves = useMemo(() => rankMoves(history, curDate, picks), [history, curDate, picks]);
  const trails = useMemo(() => zTrails(history, curDate, tickers, 5), [history, curDate, tickers]);
  const events = useMemo(() => portfolioEvents(history, curDate, picks), [history, curDate, picks]);
  const buyEvents = useMemo(() => (replay ? [] : buyWindowEvents(buyMap)), [buyMap, replay]);
  const ordered = useMemo(() => sortPicks(picks, replay && mode === "live" ? "rank" : mode, liveEx), [picks, mode, liveEx, replay]);
  const byRank = useMemo(() => sortPicks(picks, "rank"), [picks]);
  const top3 = useMemo(() => new Set(byRank.slice(0, 3).map((p) => p.ticker)), [byRank]);
  const rows: RowView[] = useMemo(() => ordered.map((p) => {
    const ni = newsInfo.get(p.ticker), s = sig?.items[p.ticker]?.stealth20;
    return {
      pick: p, z: p.Z, trail: trails.get(p.ticker) ?? [], topTier: top3.has(p.ticker),
      stealth: s?.on ? { dir: s.direction, z: s.z } : null, buy: buyMap.get(p.ticker) ?? null,
      rim: ni ? (ni.sentiment >= 0.25 ? UP : ni.sentiment <= -0.25 ? DOWN : null) : null, hot: Boolean(ni?.hot),
    };
  }), [ordered, newsInfo, sig, trails, top3, buyMap]);
  const dom = useMemo<[number, number]>(() => {
    const zs = rows.flatMap((r) => [r.z, ...r.trail]);
    return zs.length ? [Math.min(...zs) - 0.15, Math.max(...zs) + 0.15] : [0, 3];
  }, [rows]);

  // Thông báo vào / ra danh mục — mỗi (ngày, loại, mã) một lần.
  useEffect(() => {
    if (replay || !events.length) return;
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "[]"); } catch { /* bỏ qua */ }
    const fresh = events.filter((e) => (e.kind === "enter" || e.kind === "leave") && !seen.includes(`${d.date}|${e.kind}|${e.ticker}`));
    for (const e of fresh) browserNotify("📡 Radar Elite 10", e.text, `elite-radar-${d.date}-${e.kind}-${e.ticker}`);
    if (fresh.length) try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...seen, ...fresh.map((e) => `${d.date}|${e.kind}|${e.ticker}`)].slice(-300))); } catch { /* bỏ qua */ }
  }, [events, replay, d.date]);

  // ▶ tua lại các phiên đã lưu rồi về hiện tại (như Radar)
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setViewDate((cur) => {
      const i = cur ? pastDates.indexOf(cur) : -1;
      const next = cur === null ? pastDates[0] ?? null : pastDates[i + 1] ?? null;
      if (next === null) setPlaying(false);
      return next;
    }), 1200);
    return () => window.clearInterval(id);
  }, [playing, pastDates]);

  // FLIP: hàng trượt tới vị trí mới khi thứ hạng đổi (Web Animations API; tắt khi giảm chuyển động).
  const rowEls = useRef(new Map<string, HTMLElement>());
  const tops = useRef(new Map<string, number>());
  const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const orderKey = rows.map((r) => r.pick.ticker).join(",");
  useLayoutEffect(() => {
    for (const [t, el] of rowEls.current) {
      const top = el.offsetTop, prev = tops.current.get(t);
      if (prev != null && prev !== top && !reduced && typeof el.animate === "function") {
        el.animate([{ transform: `translateY(${prev - top}px)`, background: "rgba(56,189,248,0.08)" }, { transform: "translateY(0)", background: "transparent" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
      tops.current.set(t, top);
    }
  }, [orderKey, reduced]);

  // Một vòng rAF cho mọi rãnh: vạch quét chung (4 giây / lượt), ping khi quét qua chấm; ~30 khung/giây; dừng khi khuất / giảm chuyển động.
  const canv = useRef(new Map<string, HTMLCanvasElement>());
  const pings = useRef(new Map<string, { t0: number }>());
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const domRef = useRef(dom); domRef.current = dom;
  const animate = onScreen && !reduced;
  useEffect(() => {
    const paint = (t: number, sweep: number | null, prevSweep: number | null) => {
      for (const r of rowsRef.current) {
        const cv = canv.current.get(r.pick.ticker);
        if (!cv) continue;
        if (sweep != null && prevSweep != null) {
          const w = cv.clientWidth || 200, x = (14 + ((r.z - domRef.current[0]) / (domRef.current[1] - domRef.current[0] || 1)) * (w - 28)) / w;
          if (prevSweep <= x && x < sweep) pings.current.set(r.pick.ticker, { t0: t });
        }
        drawTrack(cv, r, domRef.current, t, sweep, edge, pings.current.get(r.pick.ticker));
      }
    };
    if (!animate) { paint(0, null, null); return; }
    let raf = 0, last = 0, prev: number | null = null;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      const sweep = (t % 4000) / 4000;
      paint(t, sweep, prev != null && prev <= sweep ? prev : null);
      prev = sweep;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate, edge, orderKey, rows]);

  const isLive = live.sessionLive && !replay;
  const trackW = compact ? 170 : 230;

  return (
    <div ref={wrapRef} className="space-y-2" data-testid="elite-radar">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <b className="mr-1 tracking-wider text-cyan-300">📡 RADAR ELITE 10</b>
        <div className="inline-flex rounded border border-white/10 p-0.5" role="group" aria-label="Xếp hạng theo">
          {SORTS.map((s) => (
            <button key={s.id} type="button" title={s.title} aria-pressed={mode === s.id} data-testid={`elite-radar-sort-${s.id}`} onClick={() => setMode(s.id)}
              className={`min-h-[24px] rounded px-2 ${mode === s.id ? "bg-cyan-500/20 font-bold text-cyan-200" : "text-slate-400 hover:text-slate-200"}`}>{s.label}</button>
          ))}
        </div>
        {isLive ? <span className="rounded border border-emerald-400/40 px-1.5 text-emerald-300" data-testid="elite-radar-live">● TRỰC TIẾP · SSI</span>
          : <span className="text-slate-500">{replay ? `⏮ Đang xem phiên ${fmtDate(replay.date)}` : "Ngoài giờ khớp lệnh — giá phiên gần nhất"}</span>}
        <span className="ml-auto text-slate-500">Phiên quyết định {fmtDate(d.date)} · hạng = hạng Điểm Elite toàn vũ trụ ({d.universe.eligible} mã)</span>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: compact ? 720 : 1000 }} role="list" aria-label="Danh mục Elite 10 xếp theo hạng">
          <div className="grid items-center gap-2 border-b border-white/5 pb-1 text-[9.5px] text-slate-500"
            style={{ gridTemplateColumns: `64px 92px ${trackW}px 78px 128px 112px ${compact ? "" : "74px "}96px${compact ? "" : " minmax(110px,1fr)"}` }}>
            <span>Hạng</span><span>Mã</span><span title="Trục Điểm Elite Z: chấm = hôm nay, vệt = 5 phiên trước">Rãnh Z · vệt 5 phiên</span><span>Tỷ trọng</span><span>⏱ Điểm mua</span>
            <span title="Giá khớp · % trong phiên · lợi suất VƯỢT VN-Index từ giá lúc dựng danh mục">Giá · vượt VNI</span>{!compact && <span>P vượt · α5</span>}<span title="Vị trí giá trong dải cắt lỗ (trái) → mục tiêu (phải)">Cắt lỗ → mục tiêu</span>{!compact && <span>Động lực chính</span>}
          </div>
          {rows.map((r, i) => {
            const p = r.pick, mv = moves.get(p.ticker), q = live.quotes[p.ticker], ex = liveEx.get(p.ticker) ?? null;
            const pos = replay ? null : stopTargetPosition(q?.price ?? p.close, p.stop, p.target);
            const liveMove = mode === "live" && !replay ? byRank.findIndex((x) => x.ticker === p.ticker) - i : 0;
            return (
              <div key={p.ticker} ref={(el) => { if (el) rowEls.current.set(p.ticker, el); else rowEls.current.delete(p.ticker); }} role="listitem" data-testid={`elite-radar-row-${p.ticker}`}
                className="grid items-center gap-2 border-b border-white/5 py-1 text-[11px]"
                style={{ gridTemplateColumns: `64px 92px ${trackW}px 78px 128px 112px ${compact ? "" : "74px "}96px${compact ? "" : " minmax(110px,1fr)"}` }}>
                <div className="leading-tight">
                  <b className={`font-mono text-[15px] ${r.topTier ? "text-amber-300" : "text-slate-100"}`} data-testid={`elite-radar-pos-${p.ticker}`}>#{i + 1}</b>
                  <div className="text-[9px] text-slate-500">hạng {p.rank}
                    {mv?.isNew ? <span className="ml-1 font-bold text-emerald-300" data-testid={`elite-radar-new-${p.ticker}`}>MỚI</span>
                      : mv?.delta ? <span className={`ml-1 font-bold ${mv.delta > 0 ? "text-emerald-300" : "text-rose-300"}`} data-testid={`elite-radar-delta-${p.ticker}`} title={`Phiên trước: hạng ${mv.prevRank}`}>{mv.delta > 0 ? `▲${mv.delta}` : `▼${-mv.delta}`}</span>
                      : mv?.prevRank ? <span className="ml-1 text-slate-500">=</span> : null}
                    {liveMove !== 0 && <span className={`ml-1 ${liveMove > 0 ? "text-emerald-300" : "text-rose-300"}`} title="Thay đổi vị trí trực tiếp so với thứ tự hạng Elite">{liveMove > 0 ? "↑" : "↓"}{Math.abs(liveMove)}</span>}
                  </div>
                </div>
                <div className="min-w-0 leading-tight">
                  <button type="button" onClick={() => onOpenTicker(p.ticker)} data-testid={`elite-radar-open-${p.ticker}`} className="font-mono text-[12px] font-bold text-cyan-300 hover:underline">{p.ticker}</button>
                  {p.retained && <span title="Giữ từ danh mục phiên trước (vùng đệm top 20)" className="ml-1 rounded border border-white/15 px-1 text-[8.5px] text-slate-400">giữ</span>}
                  <div className="truncate text-[9px] text-slate-500" title={secName(p.sectorKey)}>{replay ? "" : secName(p.sectorKey)}</div>
                </div>
                <canvas ref={(el) => { if (el) canv.current.set(p.ticker, el); else canv.current.delete(p.ticker); }} aria-hidden="true" style={{ width: trackW, height: 38, display: "block" }}
                  title={`Z ${num(r.z, 2)}${r.trail.length ? ` · ${r.trail.length} phiên trước: ${r.trail.map((z) => num(z, 2)).join(" → ")}` : ""}${r.stealth ? ` · ◆ Stealth 20 ${r.stealth.dir > 0 ? "tích luỹ" : "phân phối"} (z ${num(r.stealth.z, 2)})` : ""}${r.hot ? " · tin quan trọng 24 giờ" : ""}`} />
                <div className="whitespace-nowrap">
                  <span aria-hidden="true" className="mr-1 inline-block h-1.5 rounded bg-cyan-400/70 align-middle" style={{ width: `${Math.min(40, p.weight * 200)}px` }} />
                  <b>{num(p.weight * 100)}%</b>
                </div>
                <div>{replay ? <span className="text-slate-500">—</span> : <BuyTimingCell cell={buyCells.get(p.ticker)} compact />}</div>
                <div className="leading-tight font-mono">
                  <span className="text-slate-100">{replay ? "—" : price(q?.price ?? p.close)}</span>
                  {!replay && q?.changePct != null && <span className="ml-1 text-[9.5px]" style={{ color: q.changePct >= 0 ? UP : DOWN }}>{q.changePct >= 0 ? "+" : ""}{num(q.changePct, 2)}%</span>}
                  <div className="text-[9.5px]" data-testid={`elite-radar-ex-${p.ticker}`} style={{ color: ex == null ? "#64748b" : ex >= 0 ? UP : DOWN }} title="Lợi suất vượt VN-Index từ giá lúc dựng danh mục">vượt {sgnPct(ex)}</div>
                </div>
                {!compact && <div className="font-mono leading-tight">{replay ? "—" : `${num(p.pOutperform * 100, 1)}%`}<div className="text-[9.5px] text-emerald-300">{p.alpha5Pct != null ? `${p.alpha5Pct >= 0 ? "+" : ""}${num(p.alpha5Pct, 2)}%` : ""}</div></div>}
                <div title={replay ? "" : `Cắt lỗ ${price(p.stop)} · giá ${price(q?.price ?? p.close)} · mục tiêu ${price(p.target)}`} data-testid={`elite-radar-gauge-${p.ticker}`}>
                  {pos == null ? <span className="text-slate-500">—</span> : (
                    <div className="relative h-2 rounded" style={{ background: "linear-gradient(90deg, rgba(251,113,133,.45), rgba(148,163,184,.18) 50%, rgba(52,211,153,.45))" }}>
                      <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-slate-100" style={{ left: `${Math.max(0, Math.min(100, pos * 100))}%` }} />
                    </div>
                  )}
                  {!replay && <div className="mt-0.5 flex justify-between font-mono text-[8.5px] text-slate-500"><span className="text-rose-300">{price(p.stop)}</span><span className="text-emerald-300">{price(p.target)}</span></div>}
                </div>
                {!compact && <div className="truncate text-[10px] text-slate-400" title={drivers(p.ticker).join(" · ")}>{replay ? "" : drivers(p.ticker).join(" · ") || "—"}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {history && pastDates.length > 0 && (
        <div className="flex items-center gap-2 rounded border border-cyan-400/15 bg-cyan-400/[0.03] px-2 py-1 text-[10px]" data-testid="elite-radar-history">
          <span className="text-[9px] font-semibold tracking-wider text-slate-500">LỊCH SỬ</span>
          <button type="button" onClick={() => { if (playing) setPlaying(false); else { setViewDate(null); setPlaying(true); } }} aria-label={playing ? "Dừng tua" : "Tua lại các phiên đã lưu"} className="w-4 text-cyan-300">{playing ? "⏸" : "▶"}</button>
          <input type="range" min={0} max={pastDates.length} step={1} aria-label="Tua lại lịch sử danh mục" value={replay ? pastDates.indexOf(replay.date) : pastDates.length}
            aria-valuetext={replay ? `Phiên ${fmtDate(replay.date)}` : "Hiện tại"} onChange={(e) => { setPlaying(false); const i = Number(e.target.value); setViewDate(i >= pastDates.length ? null : pastDates[i]); }}
            className="min-w-0 flex-1 accent-cyan-400" />
          <span className="w-14 text-right font-mono text-slate-300">{replay ? fmtDate(replay.date) : "Hiện tại"}</span>
        </div>
      )}

      {(events.length > 0 || buyEvents.length > 0) && (
        <div data-testid="elite-radar-events">
          <div className="mb-0.5 text-[9px] font-semibold tracking-wider text-slate-500">SỰ KIỆN DANH MỤC · {replay ? fmtDate(replay.date) : "hiện tại"} so với phiên trước</div>
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
            {events.slice(0, 10).map((e) => (
              <li key={`${e.kind}-${e.ticker}`}><button type="button" onClick={() => onOpenTicker(e.ticker)} className="text-left text-[10.5px] hover:underline" style={{ color: e.tone === "up" ? UP : e.tone === "down" ? DOWN : "#cbd5e1" }}>
                {e.kind === "enter" ? "◎" : e.kind === "leave" ? "○" : e.kind === "rank_up" ? "▲" : "▼"} {e.text}</button></li>
            ))}
            {buyEvents.map((e) => <li key={e.notifyKey}><button type="button" onClick={() => onOpenTicker(e.ticker)} className="text-left text-[10.5px] hover:underline" style={{ color: e.kind === "enter_buy_window" ? UP : AMBER }}>{e.kind === "enter_buy_window" ? "◎" : "⏳"} {e.text}</button></li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-slate-500" data-testid="elite-radar-legend">
        <span><span style={{ color: AMBER }}>●</span> 3 hạng đầu</span>
        <span>Chấm to = tỷ trọng lớn · đậm = P vượt cao</span>
        <span>Vệt đứt = Z 5 phiên trước (<span style={{ color: UP }}>xanh</span> mạnh lên / <span style={{ color: DOWN }}>đỏ</span> yếu đi)</span>
        <span><span style={{ color: UP }}>◆</span>/<span style={{ color: DOWN }}>◆</span> Stealth 20 {!sig ? "(đang tải bằng chứng kiểm định…)" : edge ? <>— <b className="text-emerald-300">đã kiểm định có lợi thế</b> toàn giai đoạn{regimeEdge === false ? <span className="text-amber-300"> · chưa có lợi thế ở chế độ thị trường hiện tại</span> : null}</> : "(rỗng = chưa đạt kiểm định)"}</span>
        <span>⏱ vòng <span style={{ color: UP }}>xanh</span> = trong vùng mua · <span style={{ color: AMBER }}>vàng</span> = ≤ {SOON_SESSIONS} phiên · nét đứt = gần đạt kiểm định</span>
        <span>Viền <span style={{ color: UP }}>xanh</span>/<span style={{ color: DOWN }}>đỏ</span> = tin 3 ngày · vòng nhấp nháy = tin quan trọng 24 giờ (mô tả)</span>
        <span>● Trực tiếp = xếp theo vượt VN-Index từ lúc dựng (theo dõi, không đổi hạng chính thức)</span>
      </div>
    </div>
  );
}
