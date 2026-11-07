// TO-v1 (07/11/2026) — các khối của tab Thời điểm tối ưu: tham chiếu theo nhóm lợi suất, sổ TO-L1 (2 lần xem + CUSUM),
// mô phỏng danh mục (đường vốn, sụt giảm, VN-Index), W1–W5 viết lại trên Gateway (MÔ TẢ).
import { useMemo, useState } from "react";
import { useToSim, useToWindows } from "../../../../hooks/useCorpEvents";
import { ciText, dm, pct, pctS, type ToOverview, type ToSimResult } from "../../../../lib/cotuc/to";

const box = "tw-scope rounded-xl border border-white/[0.06] bg-[#0b0f17] p-3";

export function ToReference({ data }: { data: ToOverview }) {
  const ref = data.reference; if (!ref) return null;
  const years = Object.entries(ref.byYear);
  return (
    <div className={box} data-testid="to-reference">
      <p className="mb-1.5 text-[11px] font-bold text-slate-200">📐 Tham chiếu lịch sử (03/2022 – nay) · vào phiên đầu sau công bố, bán phiên cuối còn quyền</p>
      <table className="w-full text-[11px]"><thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="py-0.5">Nhóm lợi suất</th><th className="text-right">Lệnh</th><th className="text-right">Vượt VN-Index / lệnh</th><th className="text-right">Khoảng tin cậy 95%</th><th className="text-right">Tỷ lệ thắng</th></tr></thead>
        <tbody>{Object.entries(ref.byBucket).map(([b, s]) => (
          <tr key={b} className="border-t border-white/[0.04]"><td className="py-0.5 font-semibold text-slate-300">{b}</td><td className="text-right font-mono">{s.n}</td>
            <td className={`text-right font-mono font-semibold ${(s.mean ?? 0) > 0 ? "text-emerald-300" : "text-rose-300"}`}>{pctS(s.mean, 2)}</td><td className="text-right font-mono text-slate-400">{ciText(s)}</td><td className="text-right font-mono">{pct(s.hit, 0)}</td></tr>))}</tbody></table>
      <p className="mt-2 text-[10.5px] text-slate-400">Quy tắc TO-r1 (≥ 5%, GTGD ≥ 1 tỷ, không trần) theo năm:{" "}
        {years.map(([y, s]) => <span key={y} className="mr-2 font-mono"><span className="text-slate-500">{y}</span> <span className={(s.mean ?? 0) > 0 ? "text-emerald-300" : "text-rose-300"}>{pctS(s.mean, 2)}</span> <span className="text-slate-600">({s.n})</span></span>)}</p>
      <p className="mt-1 text-[10px] text-amber-300/90">Lợi thế đang suy giảm (2025–2026 gần 0). Đây là số MÔ TẢ quá khứ; kết luận chỉ đến từ sổ theo dõi tiến TO-L1.</p>
      {ref.weakSectors.length > 0 && <p className="mt-1 text-[10px] text-slate-500">Ngành có kết quả âm: {ref.weakSectors.join(", ")}.</p>}
    </div>
  );
}

export function ToLedger({ data }: { data: ToOverview }) {
  const L = data.ledger; const next = L.nextLook ?? 60; const progress = Math.min(1, L.counts.done / next);
  const S = L.cusum.S ?? 0;
  return (
    <div className={box} data-testid="to-ledger">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-bold text-slate-200">🧾 Sổ theo dõi tiến TO-L1 · kiểm định đặt trước TO-r1</p>
        <span className={`rounded border px-1.5 text-[10px] font-semibold ${L.label === "ĐẠT TO-r1" ? "border-emerald-400/50 text-emerald-300" : "border-sky-400/40 text-sky-300"}`} data-testid="to-label">{L.label}</span>
        <span className="ml-auto text-[10px] text-slate-500">ghi từ {dm(L.start)}/{L.start.slice(0, 4)} · đăng ký {dm(L.registered)}/{L.registered.slice(0, 4)}</span>
      </div>
      <div className="grid gap-2 text-[11px] md:grid-cols-3">
        <div><p className="text-[10px] uppercase text-slate-500">Tiến độ tới lần xem {next} lệnh</p>
          <div className="mt-1 h-2 rounded bg-white/[0.06]"><div className="h-2 rounded bg-cyan-400/70" style={{ width: `${progress * 100}%` }} /></div>
          <p className="mt-0.5 font-mono text-slate-300" data-testid="to-progress">{L.counts.done}/{next} đã chấm · {L.counts.open} đang mở{L.counts.void ? ` · ${L.counts.void} huỷ` : ""}</p></div>
        <div><p className="text-[10px] uppercase text-slate-500">Kết quả thật (vượt VN-Index / lệnh)</p>
          <p className="font-mono text-slate-200">{L.stats.n ? <>{pctS(L.stats.mean, 2)} <span className="text-slate-500">{ciText(L.stats)} · thắng {pct(L.stats.hit, 0)}</span></> : "chưa có lệnh chấm xong"}</p>
          <p className="text-[10px] text-slate-500">tham chiếu μ0 {pctS(L.cusum.mu0, 2)} · σ0 {pct(L.cusum.sigma0, 2)}</p></div>
        <div><p className="text-[10px] uppercase text-slate-500">CUSUM suy giảm (báo động khi &lt; −{L.cusum.h})</p>
          <div className="mt-1 h-2 rounded bg-white/[0.06]"><div className={`h-2 rounded ${L.cusum.alarmed ? "bg-rose-400" : "bg-amber-400/70"}`} style={{ width: `${Math.min(100, (Math.abs(S) / L.cusum.h) * 100)}%` }} /></div>
          <p className={`mt-0.5 font-mono ${L.cusum.alarmed ? "text-rose-300" : "text-slate-300"}`} data-testid="to-cusum">S = {S.toLocaleString("vi-VN")}{L.cusum.alarmed ? " · BÁO ĐỘNG: lợi thế có thể đang suy giảm" : ""}</p>
          {Object.keys(L.cusum.quarters).length > 0 && <p className="text-[10px] text-slate-500">{Object.entries(L.cusum.quarters).map(([q, v]) => `${q}: ${v.S}`).join(" · ")}</p>}</div>
      </div>
      {L.looks.length > 0 && <p className="mt-2 text-[10.5px] text-slate-300">{L.looks.map((l) => `Lần xem ${l.n} lệnh: ${pctS(l.mean, 2)}, cận dưới 97,5% ${pctS(l.lower975, 2)} → ${l.pass ? "ĐẠT" : "chưa đạt"}`).join(" · ")}</p>}
      {L.entries.length > 0 && (
        <div className="mt-2 max-h-48 overflow-auto"><table className="w-full text-[10.5px]" data-testid="to-ledger-table"><thead><tr className="text-left text-[10px] uppercase text-slate-500"><th>Mã</th><th>Vào</th><th>Lợi suất</th><th>GDKHQ</th><th className="text-right">Vượt VN-Index</th><th>Trạng thái</th></tr></thead>
          <tbody>{L.entries.map((e) => <tr key={e.id} className="border-t border-white/[0.04]"><td className="font-mono text-cyan-200">{e.t}</td><td className="font-mono">{dm(e.entryDate)}</td><td className="font-mono">{pct(e.y)}</td><td className="font-mono">{dm(e.ex)}</td>
            <td className={`text-right font-mono ${(e.result?.excess ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{e.result ? pctS(e.result.excess, 2) : "—"}</td><td className="text-slate-400">{e.status === "OPEN" ? "đang mở" : e.status === "DONE" ? "đã chấm" : "huỷ"}</td></tr>)}</tbody></table></div>)}
      <p className="mt-2 text-[10px] text-slate-500">Quy tắc, tiêu chí và số tham chiếu cố định trước (TO-prereg.md): xem tại 30 và 60 lệnh, đạt khi cận dưới khoảng tin cậy 97,5% &gt; 0. Chưa đạt thì giữ nhãn THĂM DÒ — không phải khuyến nghị.</p>
    </div>
  );
}

/** Đường vốn (vàng) so với VN-Index (xám) + vùng sụt giảm; rê chuột xem giá trị. */
export function EquityChart({ sim, height = 180, labels = ["Săn cổ tức (TO-r1)", "VN-Index"] }: { sim: Pick<ToSimResult, "curve">; height?: number; labels?: [string, string] }) {
  const [hover, setHover] = useState<number | null>(null);
  const c = sim.curve; const W = 800, H = height, P = 28;
  const geo = useMemo(() => {
    if (c.length < 2) return null;
    const vals = c.flatMap((x) => [x[1], x[2]]); const lo = Math.min(...vals), hi = Math.max(...vals);
    const x = (i: number) => P + (i / (c.length - 1)) * (W - P - 6); const y = (v: number) => 6 + (1 - (v - lo) / Math.max(1e-9, hi - lo)) * (H - 40);
    let pk = 0; const dd = c.map((p) => { pk = Math.max(pk, p[1]); return p[1] / pk - 1; }); const ddMin = Math.min(...dd, -0.01);
    const yd = (v: number) => H - 2 - (v / ddMin) * 26;
    return { x, y, lo, hi, line: (k: 1 | 2) => c.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(""), dd: `M${x(0)},${H - 2}` + dd.map((v, i) => `L${x(i).toFixed(1)},${yd(v).toFixed(1)}`).join("") + `L${x(c.length - 1)},${H - 2}Z`, ddMin };
  }, [c, H]);
  if (!geo) return <p className="text-[11px] text-slate-500">Chưa đủ dữ liệu để vẽ.</p>;
  const h = hover != null ? c[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Đường vốn so với VN-Index" data-testid="to-equity"
        onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width * W - P) / (W - P - 6) * (c.length - 1)); setHover(Math.max(0, Math.min(c.length - 1, i))); }} onMouseLeave={() => setHover(null)}>
        {[geo.lo, 1, geo.hi].map((v) => <g key={v}><line x1={P} x2={W - 6} y1={geo.y(v)} y2={geo.y(v)} stroke="rgba(255,255,255,0.06)" /><text x={2} y={geo.y(v) + 3} fontSize="9" fill="#64748b">{(v * 100 - 100).toFixed(0)}%</text></g>)}
        <path d={geo.dd} fill="rgba(244,63,94,0.18)" />
        <path d={geo.line(2)} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
        <path d={geo.line(1)} fill="none" stroke="#F5CE72" strokeWidth="2" />
        {hover != null && <line x1={geo.x(hover)} x2={geo.x(hover)} y1={4} y2={H - 2} stroke="rgba(255,255,255,0.25)" />}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-slate-400"><span><span className="mr-1 inline-block h-0.5 w-4 bg-[#F5CE72] align-middle" />{labels[0]}</span><span><span className="mr-1 inline-block h-0.5 w-4 bg-slate-400 align-middle" />{labels[1]}</span><span><span className="mr-1 inline-block h-2 w-3 bg-rose-500/30 align-middle" />Sụt giảm danh mục</span>
        {h && <span className="ml-auto font-mono text-slate-200">{dm(h[0])}/{h[0].slice(0, 4)} · {labels[0]} {pctS(h[1] - 1)} · {labels[1]} {pctS(h[2] - 1)}</span>}</div>
    </div>
  );
}

export function ToSimPanel() {
  const sim = useToSim(true); const [mode, setMode] = useState<"history" | "forward">("history");
  const s = mode === "history" ? sim?.history : sim?.forward;
  return (
    <div className={box} data-testid="to-sim">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <p className="text-[11px] font-bold text-slate-200">📈 Mô phỏng danh mục · tối đa 5 vị thế × 20% vốn · có phí</p>
        <div className="ml-auto flex gap-1">{(["history", "forward"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} data-testid={`to-sim-${m}`}
          className={`rounded-md border px-2 py-0.5 text-[10.5px] ${mode === m ? "border-amber-400/60 bg-amber-400/15 text-amber-200" : "border-white/10 text-slate-400"}`}>{m === "history" ? "Lịch sử (mô phỏng)" : "Sổ tiến TO-L1"}</button>)}</div>
      </div>
      {!sim ? <p className="text-[11px] text-slate-500">Đang tải…</p> : !s || !s.curve.length ? <p className="text-[11px] text-slate-500">{mode === "forward" ? "Sổ tiến chưa có lệnh nào (ghi từ 09/11/2026)." : "Chưa có dữ liệu."}</p> : <>
        <div className="mb-2 grid grid-cols-2 gap-2 text-[11px] md:grid-cols-6" data-testid="to-sim-stats">
          {([["Tổng lợi nhuận", pctS(s.total)], ["VN-Index", pctS(s.vnTotal)], ["Sụt giảm lớn nhất", `${pctS(s.maxDD)} (VN-Index ${pctS(s.vnMaxDD)})`], ["Sharpe", s.sharpe?.toLocaleString("vi-VN") ?? "—"], ["Lệnh · thắng", `${s.trades} · ${pct(s.hit, 0)}`], ["Thời gian có vốn", pct(s.exposure, 0)]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="rounded-md border border-white/[0.06] px-2 py-1"><p className="text-[10px] uppercase text-slate-500">{k}</p><p className="font-mono text-slate-200">{v}</p></div>))}
        </div>
        <EquityChart sim={s} />
        <p className="mt-1 text-[10px] text-slate-500">{mode === "history" ? `Từ ${dm(s.from)}/${s.from.slice(0, 4)}: mọi đợt đủ điều kiện TO-r1 trong quá khứ (backtest, MÔ TẢ). Năm thị trường tăng mạnh thường kém VN-Index vì phần lớn thời gian để vốn nhàn rỗi.` : "Chỉ các lệnh ghi trong sổ theo dõi tiến (dữ liệu thật sau ngày đăng ký); lệnh đang mở tính theo giá gần nhất."}</p>
      </>}
    </div>
  );
}

export function ToLegacyWindows({ defaultTicker }: { defaultTicker?: string | null }) {
  const [t, setT] = useState(defaultTicker ?? ""); const tk = /^[A-Z0-9]{3,10}$/.test(t.trim().toUpperCase()) ? t.trim().toUpperCase() : null;
  const pooled = useToWindows(null); const one = useToWindows(tk);
  if (!pooled) return null;
  return (
    <div className={box} data-testid="to-legacy">
      <p className="mb-1 text-[11px] font-bold text-slate-200">🗂 Cửa sổ cũ W1–W5 (neo GDKHQ) — tính lại trên Gateway · <span className="font-normal text-sky-300">MÔ TẢ</span></p>
      <p className="mb-2 text-[10px] text-amber-300/90">W1–W3 phải vào lệnh trước khi GDKHQ được công bố (cột "biết GDKHQ lúc vào") nên phần lớn không giao dịch được thật; W4 lịch sử âm. Giữ để so sánh, không dùng để ra quyết định.</p>
      <table className="w-full text-[11px]"><thead><tr className="text-left text-[10px] uppercase text-slate-500"><th>Cửa sổ</th><th className="text-right">Đợt</th><th className="text-right">Vượt VN-Index</th><th className="text-right">Khoảng tin cậy 95%</th><th className="text-right">Thắng</th><th className="text-right">Biết GDKHQ lúc vào</th>{tk && <th className="text-right">{tk}: đợt · TB · q</th>}</tr></thead>
        <tbody>{Object.entries(pooled.pooled).map(([w, s]) => { const m = one?.windows?.[w];
          return <tr key={w} className="border-t border-white/[0.04]"><td className="py-0.5 text-slate-300">{s.label}</td><td className="text-right font-mono">{s.n}</td><td className={`text-right font-mono ${(s.mean ?? 0) > 0 ? "text-emerald-300" : "text-rose-300"}`}>{pctS(s.mean, 2)}</td><td className="text-right font-mono text-slate-400">{ciText(s)}</td><td className="text-right font-mono">{pct(s.hit, 0)}</td>
            <td className={`text-right font-mono ${(s.knownAtEntry ?? 0) < 0.5 ? "text-rose-300" : "text-slate-300"}`}>{pct(s.knownAtEntry, 0)}</td>
            {tk && <td className="text-right font-mono text-slate-300">{m ? `${m.n} · ${pctS(m.mean, 1)} · ${m.q == null ? "—" : m.q.toLocaleString("vi-VN")}` : "—"}</td>}</tr>; })}</tbody></table>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-slate-400">
        <label className="flex items-center gap-1">Xem theo mã <input value={t} onChange={(e) => setT(e.target.value.toUpperCase())} maxLength={10} placeholder="VD: BMP" data-testid="to-legacy-input" className="cf-panel-input w-20 rounded px-1.5 py-0.5 text-[11px] text-cf-primary" /></label>
        <span>Kiểm định đa giả thuyết trên toàn bộ {pooled.tests} cặp mã × cửa sổ (≥ 8 đợt): {pooled.significant.length ? `q ≤ 0,1: ${pooled.significant.join(", ")}` : "không cặp nào đạt q ≤ 0,1"}.</span>
      </div>
    </div>
  );
}
