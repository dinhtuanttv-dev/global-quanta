// HL-RADAR P4 (20/11/2026, tài liệu 20) — lớp "Xu hướng & tua lại" của bảng Danh mục Elite HL, dữ liệu Gateway /api/elite/hl-history
// (bản gọn dựng từ chính các tài liệu quyết định đã lưu theo phiên — không tính số mới). Tương ứng R7 (vệt chuyển động) và R8 (tua lại)
// của ELITE COMMAND RADAR. Mọi phần tử mang data-hl-layer; MÔ TẢ, không đổi danh mục.
//  - HlLsTrend: đường LS-v1 phân vị theo phiên của một mã (vạch đỏ đứt = ngưỡng ra), trong ô Tầng 1.
//  - HlReplay: thanh trượt + ▶ xem lại danh mục của từng phiên đã lưu (vào / ra kèm lý do, chênh lệch so với hôm nay).
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../services/marketDataClient";

export interface HlHistSession {
  date: string; rebalance: boolean; frozen: boolean; cash: number | null; invested: number | null; exitLsPct: number | null;
  held: { t: string; rank: number | null; cls: string | null; w: number | null; ls: number | null; t1: number | null; ta: number | null; rrg: number | null; status: string | null; since: string | null; ret: number | null; pz: string | null; lane: string | null; close: number | null }[];
  added: string[]; exits: { t: string; code: string | null; reasonVi: string | null; w: number | null }[];
}
export interface HlHistory { version: string; dates: string[]; sessions: HlHistSession[] }

export function useHlHistory(enabled: boolean, days = 10) {
  return useSWR<HlHistory>(enabled && isMarketGatewayEnabled() ? ["elite-hl-history", days] : null,
    () => fetchMarketJson<HlHistory>("/api/elite/hl-history", { days }), { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 });
}

const UP = "#34d399", DOWN = "#fb7185";
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pc = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${(x * 100).toFixed(d).replace(".", ",")}%`);
const sg = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")}%`);

/** Chuỗi LS-v1 phân vị của một mã qua các phiên (null = phiên đó không giữ mã). */
export function lsSeries(h: HlHistory | undefined, t: string): { date: string; ls: number | null }[] {
  return (h?.sessions ?? []).map((s) => ({ date: s.date, ls: s.held.find((x) => x.t === t)?.ls ?? null }));
}

export function HlLsTrend({ h, ticker, exit, mobile = false }: { h: HlHistory | undefined; ticker: string; exit: number; mobile?: boolean }) {
  const pts = lsSeries(h, ticker);
  const known = pts.filter((p) => p.ls != null) as { date: string; ls: number }[];
  if (known.length < 2) return null;
  const W = 72, H = 20, n = pts.length;
  const x = (i: number) => 2 + (i * (W - 4)) / Math.max(1, n - 1);
  const y = (v: number) => H - 2 - (Math.max(0, Math.min(100, v)) / 100) * (H - 4);
  const first = known[0].ls, last = known[known.length - 1].ls;
  const color = last > first + 0.5 ? UP : last < first - 0.5 ? DOWN : "#94a3b8";
  // nét liền chỉ nối các phiên liên tiếp có giữ mã
  const segs: string[] = []; let cur: string[] = [];
  pts.forEach((p, i) => { if (p.ls == null) { if (cur.length > 1) segs.push(cur.join(" ")); cur = []; } else cur.push(`${x(i).toFixed(1)},${y(p.ls).toFixed(1)}`); });
  if (cur.length > 1) segs.push(cur.join(" "));
  const title = `LS-v1 phân vị theo phiên (ngưỡng ra ${exit}): ${pts.map((p) => `${dm(p.date)} ${p.ls == null ? "—" : Math.round(p.ls)}`).join(" · ")}`;
  return (
    <span className={`${mobile ? "inline-flex" : "mt-0.5 flex"} items-center gap-1 text-[10px] text-slate-400`} data-hl-layer="trend" data-testid={`hl-trend-${mobile ? "m-" : ""}${ticker}`} title={title}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        <line x1={2} x2={W - 2} y1={y(exit)} y2={y(exit)} stroke={DOWN} strokeOpacity={0.6} strokeDasharray="2 2" />
        {segs.map((s, i) => <polyline key={i} points={s} fill="none" stroke={color} strokeWidth={1.4} />)}
        {pts.map((p, i) => (p.ls == null ? null : <circle key={p.date} cx={x(i)} cy={y(p.ls)} r={i === n - 1 ? 2.2 : 1.2} fill={color} opacity={i === n - 1 ? 1 : 0.6} />))}
      </svg>
      <span>LS {known.length} phiên <b style={{ color }}>{(() => { const dd = Math.round(last - first); return dd > 0 ? `+${dd}` : dd < 0 ? `−${-dd}` : "0"; })()}</b></span>
    </span>
  );
}

export function HlReplay({ h, today, onOpenTicker }: { h: HlHistory | undefined; today: { date: string; held: string[] }; onOpenTicker: (t: string) => void }) {
  const past = useMemo(() => (h?.sessions ?? []).filter((s) => s.date < today.date), [h, today.date]);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const idx = i ?? past.length - 1;
  const s = past[idx] ?? null;
  useEffect(() => {
    if (!playing) return;
    const reduce = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setInterval(() => setI((v) => { const nx = (v ?? -1) + 1; if (nx >= past.length) { setPlaying(false); return past.length - 1; } return nx; }), reduce ? 2500 : 1400);
    return () => clearInterval(id);
  }, [playing, past.length]);
  if (!past.length) return null;
  const nowSet = new Set(today.held);
  const thenSet = new Set(s?.held.map((x) => x.t) ?? []);
  const gone = [...thenSet].filter((t) => !nowSet.has(t)), fresh = [...nowSet].filter((t) => !thenSet.has(t));
  return (
    <div className="mt-2 rounded-md border border-cyan-400/20 bg-cyan-400/[0.03] p-2 text-[11px]" data-hl-layer="replay" data-testid="hl-replay">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="hl-replay-toggle" className="min-h-[24px] font-bold text-cyan-200 hover:underline">
        {open ? "▾" : "▸"} Tua lại các phiên trước ({past.length} phiên đã lưu, từ {dm(past[0].date)})
      </button>
      {open && s && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { if (playing) setPlaying(false); else { setI(0); setPlaying(true); } }} aria-label={playing ? "Dừng tua" : "Tua lần lượt các phiên"} data-testid="hl-replay-play"
              className="min-h-[24px] min-w-[24px] rounded border border-white/15 text-cyan-200">{playing ? "⏸" : "▶"}</button>
            <input type="range" min={0} max={past.length - 1} step={1} value={idx} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }}
              aria-label="Chọn phiên để xem lại" aria-valuetext={`Phiên ${dm(s.date)}`} data-testid="hl-replay-range" className="w-40 flex-1 accent-cyan-400" />
            <b className="font-mono text-slate-100" data-testid="hl-replay-date">Phiên {dm(s.date)}</b>
            <span className="rounded border border-amber-400/40 px-1 text-[10px] font-bold text-amber-200">LỊCH SỬ · không phải bảng hôm nay</span>
          </div>
          <p className="text-[10.5px] text-slate-400" data-testid="hl-replay-sum">
            {s.held.length} mã · cổ phiếu {pc(s.invested, 0)} · tiền mặt {pc(s.cash, 0)}{s.rebalance ? " · phiên vào lệnh (đầu tuần)" : ""}{s.frozen ? " · dữ liệu thiếu: giữ nguyên" : ""}
            {s.added.length ? <> · <b className="text-emerald-300">vào {s.added.join(", ")}</b></> : null}
            {s.exits.length ? <> · <b className="text-rose-300">ra {s.exits.map((x) => x.t).join(", ")}</b></> : null}
          </p>
          {s.exits.length > 0 && <ul className="text-[10.5px] text-slate-400" data-testid="hl-replay-exits">{s.exits.map((x) => <li key={x.t}><b className="text-rose-300">Ra {x.t}</b> — {x.reasonVi ?? "—"}</li>)}</ul>}
          <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 560 }} data-testid="hl-replay-table">
              <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 pr-2 font-normal">Hạng</th><th className="font-normal">Mã</th><th className="font-normal">Tỷ trọng</th><th className="font-normal">LS-v1</th><th className="font-normal">Tầng 1</th><th className="font-normal">Trạng thái</th><th className="font-normal">Vị trí giá</th><th className="text-right font-normal">Từ lúc vào</th></tr></thead>
              <tbody>
                {s.held.map((x) => (
                  <tr key={x.t} className="border-t border-white/5" data-testid={`hl-replay-row-${x.t}`}>
                    <td className="py-1 pr-2 font-mono text-slate-400">{x.rank ?? "—"}</td>
                    <td><button type="button" onClick={() => onOpenTicker(x.t)} className="font-bold text-[#F5CE72] hover:underline">{x.t}</button>{!nowSet.has(x.t) && <span className="ml-1 text-[10px] text-rose-300">(đã ra)</span>}</td>
                    <td className="font-mono">{pc(x.w)}</td><td className="font-mono">{x.ls == null ? "—" : Math.round(x.ls)}</td><td className="font-mono">{x.t1 ?? "—"}</td>
                    <td>{x.status === "NEW" ? <b className="text-emerald-300">Vào mới</b> : `Giữ${x.since ? ` từ ${dm(x.since)}` : ""}`}</td>
                    <td className="text-slate-400">{x.pz ?? "—"}</td>
                    <td className="text-right font-mono" style={{ color: (x.ret ?? 0) >= 0 ? UP : DOWN }}>{sg(x.ret)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-500" data-testid="hl-replay-diff">So với hôm nay ({dm(today.date)}): {fresh.length ? <>thêm <b className="text-emerald-300">{fresh.join(", ")}</b></> : "không thêm mã"} · {gone.length ? <>bớt <b className="text-rose-300">{gone.join(", ")}</b></> : "không bớt mã"}. Số liệu đúng như bảng của phiên đó (khoá lúc dựng), không tính lại.</p>
        </div>
      )}
    </div>
  );
}
