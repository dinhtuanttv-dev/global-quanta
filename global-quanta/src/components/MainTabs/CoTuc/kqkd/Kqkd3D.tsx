// K5 (06/11/2026) — mô phỏng 3D/4D lợi nhuận (Canvas 2D, lib/kqkd/canvas3d.ts; kéo để xoay, cuộn để zoom, rê chuột xem số, luôn có bảng số).
//   "surface"    : cột 3D  X = quý (Q1–Q4) · Z = năm (cũ ở trước -> mới ở sau, cột mới cao không che cột cũ) · Y = LNST mẹ (quý riêng hoặc LŨY KẾ) · màu = biên ròng quý (chiều 4)
//   "trajectory" : quỹ đạo 4D  X = tăng trưởng DT TTM · Y = biên ròng TTM · Z = ROE TTM · chiều 4 = thời gian (nút phát / thanh trượt)
//   "market"     : toàn thị trường  X = LNST TTM YoY · Y = biên ròng TTM · Z = SUE LN cốt lõi · cỡ = vốn hoá · màu = mẫu BCTC
import { useEffect, useMemo, useRef, useState, type PointerEvent, type WheelEvent } from "react";
import { DEFAULT_ROT, box, clamp, goldRamp, niceTicks, renderScene, scaler, shade, type Drawable, type Hit, type Rot, type Scene } from "../../../../lib/kqkd/canvas3d";
import { bn, fin, num, pct, pctPlain, TPL_LABEL } from "../../../../lib/kqkd/format";
import type { KqkdDetail, KqkdRow, Tpl } from "../../../../lib/kqkd/types";

const W = 1000, H = 500;
/** Màu mẫu BCTC — thứ tự cố định; đã kiểm ΔE OKLab ≥ 15 cả 3 dạng mù màu, tương phản ≥ 4,8 trên nền tối. */
export const TPL_COLOR: Record<Tpl, string> = { corp: "#E8B84B", bank: "#38BDF8", sec: "#A855F7", ins: "#F1F5F9" };
const reduced = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useOrbit() {
  const [rot, setRot] = useState<Rot>(DEFAULT_ROT);
  const drag = useRef<{ x: number; y: number; rot: Rot; moved: boolean } | null>(null);
  return {
    rot, reset: () => setRot(DEFAULT_ROT),
    down: (e: PointerEvent<HTMLCanvasElement>) => { drag.current = { x: e.clientX, y: e.clientY, rot, moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); },
    move: (e: PointerEvent<HTMLCanvasElement>) => {
      const d = drag.current; if (!d) return false;
      const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      setRot({ ...d.rot, yaw: d.rot.yaw + dx * 0.008, pitch: clamp(d.rot.pitch + dy * 0.006, -1.35, 0.35) });
      return true;
    },
    up: () => { const moved = drag.current?.moved ?? false; drag.current = null; return moved; },
    wheel: (e: WheelEvent<HTMLCanvasElement>) => setRot((r) => ({ ...r, zoom: clamp(r.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.6, 2.4) })),
  };
}

/** Khung vẽ dùng chung: DPR, xoay, rê chuột (điểm gần nhất ≤ 14px), bấm chọn. */
function Stage({ scene, label, onPick, testId }: { scene: Scene; label: string; onPick?: (id: string) => void; testId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hits = useRef<Hit[]>([]);
  const orbit = useOrbit();
  const [tip, setTip] = useState<{ x: number; y: number; w: number; text: string } | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr;
    const ctx = c.getContext?.("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hits.current = renderScene(ctx, scene, orbit.rot, W, H);
  }, [scene, orbit.rot]);
  const local = (e: PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, sx: e.clientX - r.left, sy: e.clientY - r.top, w: r.width }; };
  const nearest = (x: number, y: number) => { let best: Hit | null = null, bd = 14 * 14; for (const h of hits.current) { const d = (h.x - x) ** 2 + (h.y - y) ** 2; if (d < bd) { bd = d; best = h; } } return best; };
  return (
    <div className="relative">
      <canvas ref={ref} role="img" aria-label={label} data-testid={testId} className="block w-full cursor-grab touch-none rounded-lg bg-[#0B0F19] active:cursor-grabbing" style={{ aspectRatio: `${W} / ${H}` }}
        onPointerDown={orbit.down}
        onPointerMove={(e) => { if (orbit.move(e)) { setTip(null); return; } const p = local(e); const h = nearest(p.x, p.y); setTip(h?.tip ? { x: p.sx, y: p.sy, w: p.w, text: h.tip } : null); }}
        onPointerUp={(e) => { const moved = orbit.up(); if (!moved && onPick) { const p = local(e); const h = nearest(p.x, p.y); if (h?.id) onPick(h.id); } }}
        onPointerLeave={() => { orbit.up(); setTip(null); }} onWheel={orbit.wheel} onDoubleClick={orbit.reset} />
      {tip && <div className="pointer-events-none absolute z-10 max-w-[260px] whitespace-pre-line rounded-md border border-white/15 bg-[#111827]/95 px-2 py-1 text-[11px] text-slate-100 shadow-lg" style={tip.x > tip.w - 280 ? { right: tip.w - tip.x + 12, top: tip.y + 12 } : { left: tip.x + 12, top: tip.y + 12 }}>{tip.text}</div>}
      <p className="mt-1 text-[10px] text-slate-500">Kéo để xoay · cuộn để phóng to · bấm đúp để về góc nhìn mặc định</p>
    </div>
  );
}

function Legend({ items }: { items: { color: string; text: string }[] }) {
  return <div className="flex flex-wrap gap-3 text-[10.5px] text-slate-300">{items.map((i) => <span key={i.text} className="flex items-center gap-1"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />{i.text}</span>)}</div>;
}

/** Cột 3D năm × quý; chiều 4 = biên ròng. */
export function ProfitSurface3D({ d }: { d: KqkdDetail }) {
  const [cum, setCum] = useState(false);
  const [years, setYears] = useState(10);
  const [table, setTable] = useState(false);
  const s = d.space.surface;
  const rows = useMemo(() => {
    const n = s.years.length, from = Math.max(0, n - years);
    return s.years.slice(from).map((y, i) => {
      const q = s.z[from + i];
      const vals = cum ? q.map((_, k) => { const a = q.slice(0, k + 1); return a.every(fin) ? a.reduce((x, v) => x + (v as number), 0) : null; }) : q;
      return { year: y, vals, margin: s.color[from + i] };
    });
  }, [s, years, cum]);
  const scene = useMemo<Scene>(() => {
    const all = rows.flatMap((r) => r.vals).filter(fin);
    const hi = Math.max(0, ...all), lo = Math.min(0, ...all);
    const ys = scaler(lo, hi || 1);
    const margins = rows.flatMap((r) => r.margin).filter(fin).filter((m) => m >= 0).sort((a, b) => a - b);
    const mHi = margins.length ? margins[Math.floor(margins.length * 0.95)] || margins[margins.length - 1] : 0.2;
    const items: Drawable[] = [];
    const nz = rows.length, w = Math.min(0.2, 0.85 / Math.max(nz, 4));
    rows.forEach((r, iz) => {
      const z = nz === 1 ? 0 : -1 + (2 * iz) / (nz - 1);
      r.vals.forEach((v, iq) => {
        if (!fin(v)) return;
        const x = -0.75 + iq * 0.5, m = r.margin[iq];
        const top = !fin(m) ? "rgb(100,116,139)" : m < 0 ? "rgb(244,63,94)" : goldRamp(m / (mHi || 1));
        items.push(...box(x, z, w, ys(0), ys(v), top, shade(top, 0.62)));
        items.push({ kind: "dot", p: { x, y: ys(v), z }, r: 0, fill: "transparent", hidden: true,
          tip: `Q${iq + 1}/${r.year}${cum ? ` (lũy kế ${iq === 0 ? "Q1" : iq === 1 ? "6T" : iq === 2 ? "9T" : "cả năm"})` : ""}\nLNST mẹ ${bn(v)}\nBiên ròng quý ${pctPlain(m)}` });
      });
    });
    const tk = niceTicks(lo, hi || 1, 4);
    return { items,
      axes: { x: { label: "Quý", ticks: [0, 1, 2, 3].map((i) => ({ v: -0.75 + i * 0.5, text: cum ? ["Q1", "6T", "9T", "Năm"][i] : `Q${i + 1}` })) },
        y: { label: "LNST mẹ (tỷ)", ticks: tk.map((t) => ({ v: ys(t), text: bn(t, false) })) },
        z: { label: "Năm", ticks: rows.map((r, iz) => ({ v: nz === 1 ? 0 : -1 + (2 * iz) / (nz - 1), text: String(r.year) })).filter((_, i, a) => a.length <= 10 || i % 2 === (a.length - 1) % 2) } } };
  }, [rows, cum]);
  return (
    <div className="space-y-2" data-testid="kq-3d-surface">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <div className="flex gap-1" role="tablist" aria-label="Kiểu số">
          {[[false, "Quý riêng"], [true, "Lũy kế trong năm"]].map(([v, t]) => (
            <button key={String(v)} type="button" role="tab" aria-selected={cum === v} onClick={() => setCum(v as boolean)} data-testid={`kq-3d-cum-${v ? "on" : "off"}`}
              className={`rounded-md border px-2 py-1 font-semibold ${cum === v ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{t as string}</button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-slate-400">Số năm
          <select value={years} onChange={(e) => setYears(Number(e.target.value))} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200">{[5, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button type="button" onClick={() => setTable((t) => !t)} className="ml-auto rounded-md border border-white/10 px-2 py-1 text-slate-300 hover:text-slate-100">{table ? "Ẩn bảng số" : "Bảng số"}</button>
      </div>
      <Stage scene={scene} label={`Cột 3D LNST mẹ ${d.ticker} theo năm và quý, màu theo biên ròng`} testId="kq-3d-canvas-surface" />
      <Legend items={[{ color: goldRamp(0.1), text: "biên ròng thấp" }, { color: goldRamp(1), text: "biên ròng cao" }, { color: "rgb(244,63,94)", text: "biên âm (lỗ)" }]} />
      {table && (
        <table className="w-full text-[11px]"><thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="px-1">Năm</th>{(cum ? ["Q1", "6T", "9T", "Năm"] : ["Q1", "Q2", "Q3", "Q4"]).map((h) => <th key={h} className="px-1 text-right">{h}</th>)}</tr></thead>
          <tbody>{[...rows].reverse().map((r) => <tr key={r.year}><td className="px-1 font-mono text-slate-300">{r.year}</td>{r.vals.map((v, i) => <td key={i} className="px-1 text-right font-mono tabular-nums text-slate-200">{bn(v, false)}</td>)}</tr>)}</tbody></table>
      )}
    </div>
  );
}

/** Quỹ đạo 4D (X tăng trưởng DT · Y biên ròng · Z ROE · thời gian). */
export function Trajectory4D({ d }: { d: KqkdDetail }) {
  const [win, setWin] = useState(20);
  const pts = useMemo(() => d.space.trajectory.slice(-win), [d.space.trajectory, win]);
  const [upto, setUpto] = useState(pts.length);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setUpto(pts.length); }, [pts.length]);
  useEffect(() => {
    if (!playing) return;
    if (reduced()) { setUpto(pts.length); setPlaying(false); return; }
    const id = setInterval(() => setUpto((u) => { if (u >= pts.length) { setPlaying(false); return u; } return u + 1; }), 420);
    return () => clearInterval(id);
  }, [playing, pts.length]);
  const scene = useMemo<Scene>(() => {
    if (!pts.length) return { items: [], axes: { x: { label: "", ticks: [] }, y: { label: "", ticks: [] }, z: { label: "", ticks: [] } } };
    const xr = [Math.max(-0.6, Math.min(...pts.map((p) => p.x))), Math.min(1.5, Math.max(...pts.map((p) => p.x)))];
    const yr = [Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))], zr = [Math.min(...pts.map((p) => p.z)), Math.max(...pts.map((p) => p.z))];
    const pad = (r: number[]) => { const s = (r[1] - r[0]) * 0.08 || 0.02; return [r[0] - s, r[1] + s]; };
    const [x0, x1] = pad(xr), [y0, y1] = pad(yr), [z0, z1] = pad(zr);
    const sx = scaler(x0, x1), sy = scaler(y0, y1), sz = scaler(z0, z1);
    const shown = pts.slice(0, Math.max(1, upto));
    const P = (p: (typeof pts)[number]) => ({ x: sx(p.x), y: sy(p.y), z: sz(p.z) });
    const items: Drawable[] = [];
    for (let i = 1; i < shown.length; i++) { const a = i / shown.length; items.push({ kind: "line", pts: [P(shown[i - 1]), P(shown[i])], color: `rgba(232,184,75,${(0.18 + 0.7 * a).toFixed(2)})`, width: 2 }); }
    // Bóng trên sàn để đọc vị trí X/Z.
    items.push({ kind: "line", pts: shown.map((p) => ({ ...P(p), y: -1 })), color: "rgba(148,163,184,0.22)", width: 1, dash: [3, 3] });
    shown.forEach((p, i) => {
      const last = i === shown.length - 1, a = (i + 1) / shown.length;
      items.push({ kind: "dot", p: P(p), r: last ? 6 : 4, fill: last ? "#F5CE72" : `rgba(232,184,75,${(0.25 + 0.6 * a).toFixed(2)})`, label: last || i === 0 ? p.quarter : undefined,
        tip: `${p.quarter}\nDT TTM YoY ${pct(p.x, 1)}\nBiên ròng TTM ${pctPlain(p.y)}\nROE TTM ${pctPlain(p.z)}\nLNST TTM ${bn(p.npat)}` });
    });
    const fmt = (v: number) => `${Math.round(v * 100)}%`;
    return { items, axes: {
      x: { label: "Tăng trưởng DT 4 quý", ticks: niceTicks(x0, x1, 4).map((t) => ({ v: sx(t), text: fmt(t) })) },
      y: { label: "Biên ròng 4 quý", ticks: niceTicks(y0, y1, 4).map((t) => ({ v: sy(t), text: fmt(t) })) },
      z: { label: "ROE 4 quý", ticks: niceTicks(z0, z1, 3).map((t) => ({ v: sz(t), text: fmt(t) })) } } };
  }, [pts, upto]);
  if (pts.length < 3) return <p className="text-[11px] text-slate-500">Chưa đủ quý (cần ≥ 3 điểm TTM có doanh thu, biên và ROE) để dựng quỹ đạo.</p>;
  const cur = pts[Math.max(0, upto - 1)];
  return (
    <div className="space-y-2" data-testid="kq-3d-trajectory">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <button type="button" onClick={() => { if (upto >= pts.length) setUpto(1); setPlaying((p) => !p); }} data-testid="kq-3d-play"
          className="rounded-md border border-[#E8B84B]/40 px-3 py-1 font-semibold text-[#F5CE72] hover:bg-[#E8B84B]/10">{playing ? "⏸ Dừng" : "▶ Phát theo thời gian"}</button>
        <input type="range" min={1} max={pts.length} value={upto} onChange={(e) => { setPlaying(false); setUpto(Number(e.target.value)); }} aria-label="Quý hiển thị tới" className="w-48 accent-[#E8B84B]" />
        <span className="font-mono text-slate-300">{pts[0].quarter} → <b className="text-[#F5CE72]">{cur.quarter}</b></span>
        <span className="text-slate-500">DT {pct(cur.x, 1)} · biên {pctPlain(cur.y)} · ROE {pctPlain(cur.z)}</span>
        <label className="ml-auto flex items-center gap-1 text-slate-400">Số quý
          <select value={win} onChange={(e) => { setPlaying(false); setWin(Number(e.target.value)); }} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200" data-testid="kq-3d-window">{[12, 20, 40].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
      </div>
      <Stage scene={scene} label={`Quỹ đạo 4D ${d.ticker}: tăng trưởng doanh thu, biên ròng, ROE theo thời gian`} testId="kq-3d-canvas-trajectory" />
      <p className="text-[10px] text-slate-500">Chiều thứ 4 là thời gian: điểm cũ mờ, điểm mới sáng; đường đứt trên sàn là bóng chiếu để đọc tăng trưởng và ROE. Chỉ số 4 quý gần nhất (TTM), mỗi điểm một quý.</p>
    </div>
  );
}

/** Toàn thị trường 3D. */
export function Market3D({ rows, onPick }: { rows: KqkdRow[]; onPick?: (t: string) => void }) {
  const [tpls, setTpls] = useState<Set<Tpl>>(new Set(["corp", "bank", "sec", "ins"]));
  const usable = useMemo(() => rows.filter((r) => r.current && r.ttmGrowth?.status === "NORMAL" && fin(r.ttmGrowth.value) && fin(r.netMarginTtm) && fin(r.sueCore ?? r.sueNpat)), [rows]);
  const scene = useMemo<Scene>(() => {
    const sx = scaler(-1, 3), sy = scaler(-0.1, 0.5), sz = scaler(-4, 4);
    const caps = usable.map((r) => r.mcap ?? 0).filter((x) => x > 0);
    const capMax = Math.max(1, ...caps);
    const items: Drawable[] = usable.filter((r) => tpls.has(r.tpl)).map((r) => {
      const sue = (r.sueCore ?? r.sueNpat) as number;
      const size = r.mcap && r.mcap > 0 ? 3 + 9 * Math.sqrt(r.mcap / capMax) : 3;
      return { kind: "dot", p: { x: sx(r.ttmGrowth.value as number), y: sy(clamp(r.netMarginTtm as number, -0.1, 0.5)), z: sz(clamp(sue, -4, 4)) }, r: size, fill: TPL_COLOR[r.tpl], id: r.t,
        label: r.mcap && r.mcap > capMax * 0.25 ? r.t : undefined,
        tip: `${r.t} · ${TPL_LABEL[r.tpl]} · ${r.quarter}\nLNST 4 quý YoY ${pct(r.ttmGrowth.value, 0)}\nBiên ròng TTM ${pctPlain(r.netMarginTtm)}\nSUE ${r.sueCore != null ? "LN cốt lõi" : "LNST"} ${num(sue)}${r.mcap ? `\nVốn hoá ${bn(r.mcap)}` : ""}\nBấm để mở chi tiết` } as Drawable;
    });
    return { items, axes: {
      x: { label: "LNST 4 quý so cùng kỳ", ticks: [-1, 0, 1, 2, 3].map((t) => ({ v: sx(t), text: `${t * 100}%` })) },
      y: { label: "Biên ròng 4 quý", ticks: [-0.1, 0, 0.2, 0.4].map((t) => ({ v: sy(t), text: `${Math.round(t * 100)}%` })) },
      z: { label: "SUE LN cốt lõi", ticks: [-4, -2, 0, 2, 4].map((t) => ({ v: sz(t), text: String(t) })) } } };
  }, [usable, tpls]);
  return (
    <div className="space-y-2" data-testid="kq-3d-market">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {(Object.keys(TPL_COLOR) as Tpl[]).map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-1 text-slate-300">
            <input type="checkbox" checked={tpls.has(t)} onChange={() => setTpls((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })} className="accent-[#E8B84B]" />
            <i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TPL_COLOR[t] }} />{TPL_LABEL[t]} <span className="font-mono text-slate-500">{usable.filter((r) => r.tpl === t).length}</span>
          </label>
        ))}
        <span className="ml-auto text-slate-500">{usable.length} mã có đủ số liệu (tăng trưởng thường, biên, SUE)</span>
      </div>
      <Stage scene={scene} label="Bản đồ 3D toàn thị trường: tăng trưởng LNST, biên ròng, SUE" onPick={onPick} testId="kq-3d-canvas-market" />
      <p className="text-[10px] text-slate-500">Cỡ điểm theo vốn hoá; nhãn là mã vốn hoá lớn. Giá trị ngoài khung được ghim ở mép (tăng trưởng −100% … +300%, biên −10% … 50%, SUE −4 … 4). Mã nền thấp / đổi dấu không vẽ.</p>
    </div>
  );
}
