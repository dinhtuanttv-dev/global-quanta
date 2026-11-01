// Bản đồ ngành của Trạng thái thị trường (LD2): cùng nguồn với thang kỳ hạn ở tab Phân tích ngành.
// X = Z của sức mạnh tương đối đúng kỳ đang chọn, Y = % mã vượt VN-Index trong đúng kỳ đó, kích thước = GTGD TB 20 phiên.
// Tên vùng riêng, không dùng tên vùng của RRG vì hai bản đồ trả lời hai câu hỏi khác nhau. 1 phiên chỉ hiện thanh nhịp, không xếp vùng.
// Bấm ngành -> lọc bảng Siêu Quét theo đúng danh sách mã; có nút mở ngành ở tab Phân tích ngành.
import { useMemo, useState } from "react";
import type { SectorLadderDoc, SectorLadderRow, SectorLadderRung } from "../../../../lib/locnganh/types";
import { placeLabels, type Box, type LabelItem } from "../../LocNganh/timing/rrg4dGeometry";
import { vn } from "./MatrixCards";

export const QUADRANT = {
  lead: { label: "Mạnh, lan tỏa", note: "vượt VN-Index, từ 50% số mã trở lên cùng vượt", fill: "#10b981", text: "text-emerald-300" },
  fading: { label: "Mạnh, ít mã", note: "vượt VN-Index, nhưng dưới 50% số mã vượt", fill: "#f59e0b", text: "text-amber-300" },
  improving: { label: "Yếu, còn lan tỏa", note: "kém VN-Index, nhưng từ 50% số mã vượt", fill: "#38bdf8", text: "text-sky-300" },
  lagging: { label: "Yếu, hẹp", note: "kém VN-Index, dưới 50% số mã vượt", fill: "#f43f5e", text: "text-rose-300" },
} as const;
export type Quadrant = keyof typeof QUADRANT;
export const quadrantOf = (z: number | null, beat: number | null): Quadrant | null =>
  z == null || beat == null ? null : z >= 0 ? (beat >= 50 ? "lead" : "fading") : beat >= 50 ? "improving" : "lagging";

const COLS: { h: number; label: string }[] = [{ h: 1, label: "1 phiên" }, { h: 5, label: "5 phiên" }, { h: 20, label: "20 phiên" }, { h: 40, label: "8 tuần" }, { h: 65, label: "13 tuần" }, { h: 130, label: "26 tuần" }];
const fmtBn = (v: number) => `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`;
const sgn = (v: number | null | undefined, d = 2) => (v == null ? "—" : `${v > 0 ? "+" : ""}${vn(v, d)}`);
const rungOf = (s: SectorLadderRow, h: number): SectorLadderRung | undefined => s.rungs.find((r) => r.h === h);
const tooltip = (s: SectorLadderRow, r: SectorLadderRung, label: string) => [
  `${s.name} · ${s.structure.label}`,
  `${label}: RS ${sgn(r.rs)} điểm % · Z ${sgn(r.z)}`,
  r.beat != null ? `${vn(r.beat, 0)}% mã vượt VN-Index (${r.n} mã, KTC 95% ${vn(r.lo ?? 0, 0)}–${vn(r.hi ?? 0, 0)}%)` : `${r.n} mã, chưa đủ để tính độ tham gia`,
  `GTGD TB20: ${fmtBn(s.value20 ?? 0)} · Khối ngoại 5 phiên: ${s.foreign5 == null ? "—" : fmtBn(s.foreign5)} · Smart Score TB: ${s.avgSmart ?? "—"}`,
  ...(s.flags ?? []).map((f) => `⚠ ${f.text}`),
].join("\n");

interface Props { doc: SectorLadderDoc; active: string | null; onSector: (s: SectorLadderRow | null) => void; onOpenSector?: (code: string) => void }

export default function SectorHeatmap({ doc, active, onSector, onOpenSector }: Props) {
  const [h, setH] = useState(20);
  const [level, setLevel] = useState<2 | 3>(2);
  const [hover, setHover] = useState<string | null>(null);
  const label = COLS.find((c) => c.h === h)?.label ?? "";
  const rows = useMemo(() => doc.sectors.filter((s) => s.level === level && rungOf(s, h)?.z != null), [doc, level, h]);
  const ranked = useMemo(() => [...rows].sort((a, b) => (rungOf(b, h)?.z ?? 0) - (rungOf(a, h)?.z ?? 0)), [rows, h]);
  const activeRow = doc.sectors.find((s) => s.code === active) ?? null;
  const W = 640, H = 340, PAD = { l: 46, r: 14, t: 12, b: 36 };
  const zMax = Math.max(2, ...rows.map((s) => Math.abs(rungOf(s, h)?.z ?? 0))) * 1.1;
  const vMax = Math.max(1, ...rows.map((s) => s.value20 ?? 0));
  const X = (v: number) => PAD.l + ((v + zMax) / (2 * zMax)) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const R = (v: number) => 4 + Math.sqrt(v / vMax) * 13;
  const pts = rows.filter((s) => rungOf(s, h)?.beat != null).map((s) => { const r = rungOf(s, h)!; return { s, r, cx: X(r.z!), cy: Y(r.beat!), rad: R(s.value20 ?? 0), q: quadrantOf(r.z, r.beat)! }; });
  const labelBoxes = useMemo(() => {
    const items: LabelItem[] = pts.map((p) => ({ id: p.s.code, x: p.cx, y: p.cy, w: (p.s.flags?.length ? p.s.name.length + 2 : p.s.name.length) * 5.7 + 4, h: 14, priority: p.s.code === active ? 2 : 0, r: p.rad + 2 }));
    const corners: Box[] = [{ left: PAD.l, top: PAD.t, right: PAD.l + 110, bottom: PAD.t + 16 }, { left: W - PAD.r - 110, top: PAD.t, right: W - PAD.r, bottom: PAD.t + 16 }, { left: PAD.l, top: H - PAD.b - 16, right: PAD.l + 110, bottom: H - PAD.b }, { left: W - PAD.r - 110, top: H - PAD.b - 16, right: W - PAD.r, bottom: H - PAD.b }];
    return placeLabels(items, corners, { W, H: H - PAD.b + 4 }, { x: X(0), y: Y(50) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, h, active]);
  const click = (s: SectorLadderRow) => onSector(active === s.code ? null : s);
  const pulse = h === 1;
  const maxPulse = Math.max(0.5, ...rows.map((s) => Math.abs(rungOf(s, 1)?.rs ?? 0)));

  return (
    <div className="space-y-2" data-testid="mx-heatmap">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Kỳ so sánh" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
          {COLS.map((c) => <button key={c.h} type="button" aria-pressed={h === c.h} onClick={() => setH(c.h)} data-mx-h={c.h} className={`px-2 py-0.5 text-[11px] font-semibold ${h === c.h ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400"}`}>{c.label}</button>)}
        </div>
        <div role="group" aria-label="Cấp ngành" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
          {([2, 3] as const).map((l) => <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)} data-mx-level={l} className={`px-2 py-0.5 text-[11px] font-semibold ${level === l ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400"}`}>ICB cấp {l}</button>)}
        </div>
        <span className="text-[11px] text-slate-400">Phiên {doc.asOf?.slice(8, 10)}/{doc.asOf?.slice(5, 7)} · {rows.length} ngành · toàn bộ mã theo dõi, không đổi theo phạm vi</span>
      </div>
      {activeRow && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]" data-testid="mx-sector-active">
          <button type="button" onClick={() => onSector(null)} data-testid="mx-clear-industry" className="px-2 py-0.5 rounded border border-amber-400/40 text-amber-200 bg-amber-500/10">✕ Xoá lọc ngành ({activeRow.name})</button>
          {onOpenSector && <button type="button" onClick={() => onOpenSector(activeRow.code)} data-testid="mx-open-sector" className="px-2 py-0.5 rounded border border-cyan-400/40 text-cyan-200 bg-cyan-500/10">Xem ở Phân tích ngành →</button>}
        </div>
      )}

      {pulse ? (
        <ul className="space-y-1" data-testid="mx-pulse">
          {ranked.map((s) => { const r = rungOf(s, 1)!, v = r.rs ?? 0, w = (Math.abs(v) / maxPulse) * 50; return (
            <li key={s.code}><button type="button" onClick={() => click(s)} aria-pressed={active === s.code} title={tooltip(s, r, label)} className={`w-full grid grid-cols-[minmax(110px,190px)_1fr_auto] items-center gap-2 rounded px-2 py-0.5 text-[11px] text-left border ${active === s.code ? "border-cyan-400/50 bg-cyan-500/10" : "border-transparent"}`}>
              <span className="truncate text-slate-200">{s.name}</span>
              <span aria-hidden className="relative h-2 rounded bg-white/5"><i className="absolute inset-y-0 rounded" style={{ left: v >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: v >= 0 ? "#34d399" : "#fb7185" }} /></span>
              <span className="font-mono text-slate-300">{sgn(r.rs)} · {r.beat == null ? "—" : `${vn(r.beat, 0)}% mã`}</span>
            </button></li>
          ); })}
          <li className="pt-1 text-[11px] text-slate-500">1 phiên là nhịp ngắn, thứ hạng gần như không giữ được sau 5 phiên, nên không xếp vùng và không vẽ quỹ đạo.</li>
        </ul>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="hidden sm:block w-full h-auto" style={{ maxWidth: 880, margin: "0 auto" }} role="img" aria-label={`Bản đồ ngành ${label}: sức mạnh tương đối và độ tham gia`}>
            {(Object.keys(QUADRANT) as Quadrant[]).map((q) => { const right = q === "lead" || q === "fading", top = q === "lead" || q === "improving"; return <rect key={q} x={right ? X(0) : PAD.l} y={top ? PAD.t : Y(50)} width={right ? W - PAD.r - X(0) : X(0) - PAD.l} height={top ? Y(50) - PAD.t : H - PAD.b - Y(50)} fill={QUADRANT[q].fill} fillOpacity={0.05} />; })}
            <line x1={X(0)} x2={X(0)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(148,163,184,0.4)" />
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(50)} y2={Y(50)} stroke="rgba(148,163,184,0.4)" />
            {[0, 25, 50, 75, 100].map((v) => <text key={v} x={PAD.l - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill="#64748b">{v}%</text>)}
            {[-2, -1, 0, 1, 2].map((v) => <text key={v} x={X(v)} y={H - PAD.b + 14} textAnchor="middle" fontSize={11} fill="#64748b">{v > 0 ? "+" : ""}{v}</text>)}
            <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" fontSize={11} fill="#94a3b8">Sức mạnh so VN-Index, {label} (Z, đơn vị độ lệch chuẩn)</text>
            <text transform={`translate(11 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={11} fill="#94a3b8">% mã vượt VN-Index</text>
            <text x={PAD.l + 5} y={PAD.t + 12} fontSize={11} fontWeight={700} fill={QUADRANT.improving.fill}>{QUADRANT.improving.label}</text>
            <text x={W - PAD.r - 5} y={PAD.t + 12} textAnchor="end" fontSize={11} fontWeight={700} fill={QUADRANT.lead.fill}>{QUADRANT.lead.label}</text>
            <text x={PAD.l + 5} y={H - PAD.b - 5} fontSize={11} fontWeight={700} fill={QUADRANT.lagging.fill}>{QUADRANT.lagging.label}</text>
            <text x={W - PAD.r - 5} y={H - PAD.b - 5} textAnchor="end" fontSize={11} fontWeight={700} fill={QUADRANT.fading.fill}>{QUADRANT.fading.label}</text>
            {[...pts].sort((a, b) => b.rad - a.rad).map((p) => {
              const on = active === p.s.code, focus = on || hover === p.s.code, flag = (p.s.flags?.length ?? 0) > 0;
              const tail = (p.r.trail ?? []).filter((t) => t.z != null && t.beat != null);
              return (
                <g key={p.s.code} role="button" tabIndex={0} aria-pressed={on} aria-label={`${p.s.name}: Z ${vn(p.r.z, 2)}, ${vn(p.r.beat, 0)}% mã vượt VN-Index`} onClick={() => click(p.s)} onMouseEnter={() => setHover(p.s.code)} onMouseLeave={() => setHover(null)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(p.s); } }} className="cursor-pointer focus:outline-none">
                  {focus && tail.length > 1 && <polyline points={tail.map((t) => `${X(t.z as number)},${Y(t.beat as number)}`).join(" ")} fill="none" stroke={QUADRANT[p.q].fill} strokeOpacity={0.9} strokeWidth={1.4} data-testid="mx-trail" />}
                  <circle cx={p.cx} cy={p.cy} r={p.rad} fill={QUADRANT[p.q].fill} fillOpacity={on ? 0.75 : 0.4} stroke={on ? "#f8fafc" : flag ? "#fbbf24" : "#0f1420"} strokeWidth={on ? 2 : 1.5} strokeDasharray={flag && !on ? "3 2" : undefined} />
                  <title>{tooltip(p.s, p.r, label)}</title>
                </g>
              );
            })}
            {pts.map((p) => { const b = labelBoxes.get(p.s.code); if (!b) return null; const ex = Math.max(b.left, Math.min(b.right, p.cx)), ey = Math.max(b.top, Math.min(b.bottom, p.cy)); const far = Math.hypot(ex - p.cx, ey - p.cy) > p.rad + 6; return (
              <g key={p.s.code} pointerEvents="none">
                {far && <line x1={p.cx} y1={p.cy} x2={ex} y2={ey} stroke={QUADRANT[p.q].fill} strokeOpacity={0.55} strokeWidth={0.8} />}
                <text x={(b.left + b.right) / 2} y={(b.top + b.bottom) / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={active === p.s.code ? 700 : 500} fill="#e2e8f0" stroke="#060b16" strokeWidth={3} paintOrder="stroke" strokeLinejoin="round">{p.s.flags?.length ? "⚠ " : ""}{p.s.name}</text>
              </g>
            ); })}
          </svg>
          <ul className="sm:hidden space-y-1" data-testid="mx-heatmap-list">
            {ranked.map((s) => { const r = rungOf(s, h)!, q = quadrantOf(r.z, r.beat); return (
              <li key={s.code}><button type="button" onClick={() => click(s)} aria-pressed={active === s.code} className={`w-full text-left rounded px-2 py-1 border ${active === s.code ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/5"}`}>
                <span className="flex justify-between text-[12px]"><span className="text-slate-200">{s.flags?.length ? "⚠ " : ""}{s.name}</span>{q && <span className={QUADRANT[q].text}>{QUADRANT[q].label}</span>}</span>
                <span className="flex justify-between text-[11px] text-slate-400"><span>RS {sgn(r.rs, 1)} · Z {sgn(r.z, 1)} · {r.beat == null ? "—" : `${vn(r.beat, 0)}% mã`}</span><span>{fmtBn(s.value20 ?? 0)}</span></span>
              </button></li>
            ); })}
          </ul>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]" aria-label="Chú thích">
            {(Object.keys(QUADRANT) as Quadrant[]).map((q) => <li key={q} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: QUADRANT[q].fill }} /><span className={QUADRANT[q].text}>{QUADRANT[q].label}</span><span className="text-slate-500">{QUADRANT[q].note}</span></li>)}
            <li className="text-slate-500">⚠ viền đứt = cờ biến động hoặc độ tham gia giảm nhanh · kích thước = GTGD TB20 · rê chuột để xem quỹ đạo · chỉ mô tả, không phải dự báo</li>
          </ul>
        </>
      )}

      <table className="sr-only">
        <caption>Thống kê ngành {label}</caption>
        <thead><tr><th>Ngành</th><th>RS</th><th>Z</th><th>% mã vượt</th><th>Số mã</th><th>GTGD TB20</th><th>Vùng</th></tr></thead>
        <tbody>{ranked.map((s) => { const r = rungOf(s, h)!, q = pulse ? null : quadrantOf(r.z, r.beat); return <tr key={s.code}><td>{s.name}</td><td>{r.rs}</td><td>{r.z}</td><td>{r.beat}</td><td>{r.n}</td><td>{s.value20}</td><td>{q ? QUADRANT[q].label : "—"}</td></tr>; })}</tbody>
      </table>
    </div>
  );
}
