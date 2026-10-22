// Trading Matrix M2 — heatmap ngành dạng TOẠ ĐỘ (spec §6.7): X = sức mạnh tương đối so VN-Index (kỳ 1/5/20 phiên),
// Y = % mã của ngành trên MA20, kích thước = GTGD TB 20 phiên, viền đứt + ⚠ = cờ biến động / độ rộng giảm mạnh.
// Bấm một ngành -> lọc bảng Siêu Quét bằng CÙNG state ngành của thanh công cụ (không tạo state thứ hai); nút "Xoá lọc" luôn hiện.
// Điện thoại: danh sách xếp hạng có thanh giá trị (không co biểu đồ thành chữ li ti). Có bảng tương đương cho trình đọc màn hình.
import { useMemo, useState } from "react";
import type { Horizon, MatrixSectors, SectorStat } from "../../../../hooks/useTradingMatrix";
import { vn } from "./MatrixCards";

// Màu theo góc phần tư (giống RRG), luôn kèm chữ trong chú thích + nhãn trực tiếp.
export const QUADRANT = {
  lead: { label: "Dẫn dắt", note: "RS > 0, độ rộng ≥ 50%", fill: "#10b981", text: "text-emerald-300" },
  fading: { label: "Suy yếu", note: "RS > 0, độ rộng < 50%", fill: "#f59e0b", text: "text-amber-300" },
  improving: { label: "Cải thiện", note: "RS < 0, độ rộng ≥ 50%", fill: "#38bdf8", text: "text-sky-300" },
  lagging: { label: "Tụt hậu", note: "RS < 0, độ rộng < 50%", fill: "#f43f5e", text: "text-rose-300" },
} as const;
export type Quadrant = keyof typeof QUADRANT;
export const quadrantOf = (rs: number | null, breadth: number | null): Quadrant | null =>
  rs == null || breadth == null ? null : rs >= 0 ? (breadth >= 50 ? "lead" : "fading") : breadth >= 50 ? "improving" : "lagging";

const fmtBn = (v: number) => `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ`;

interface Props { data: MatrixSectors; active: Set<string>; onIndustry: (name: string | null) => void }

export default function SectorHeatmap({ data, active, onIndustry }: Props) {
  const [h, setH] = useState<Horizon>(5);
  const rows = useMemo(() => data.sectors.filter((s) => s.rs[h] != null && s.breadth != null), [data, h]);
  const W = 640, H = 300, PAD = { l: 44, r: 16, t: 14, b: 32 };
  const xs = rows.map((s) => s.rs[h] as number);
  const xMax = Math.max(1, ...xs.map(Math.abs)) * 1.15;
  const vMax = Math.max(1, ...rows.map((s) => s.value20));
  const X = (v: number) => PAD.l + ((v + xMax) / (2 * xMax)) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const R = (v: number) => 5 + Math.sqrt(v / vMax) * 18;
  const labelled = new Set([...rows].sort((a, b) => b.value20 - a.value20).slice(0, 8).map((s) => s.industry));
  const ranked = [...rows].sort((a, b) => (b.rs[h] as number) - (a.rs[h] as number));
  const click = (s: SectorStat) => onIndustry(active.size === 1 && active.has(s.industry) ? null : s.industry);

  return (
    <div className="space-y-2" data-testid="mx-heatmap">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Kỳ so sánh" className="inline-flex rounded border border-white/10 overflow-hidden bg-black/40">
          {data.horizons.map((k) => (
            <button key={k} role="tab" aria-selected={h === k} onClick={() => setH(k)} data-mx-h={k}
              className={`px-2 py-0.5 text-[10px] font-semibold ${h === k ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400"}`}>{k} phiên</button>
          ))}
        </div>
        <span className="text-[9px] text-slate-500">VN-Index {k(data.indexReturn[h])} · phiên {data.asOf.slice(8, 10)}/{data.asOf.slice(5, 7)} · {rows.length} ngành</span>
        {active.size > 0 && (
          <button type="button" onClick={() => onIndustry(null)} data-testid="mx-clear-industry"
            className="ml-auto text-[10px] px-2 py-0.5 rounded border border-amber-400/40 text-amber-200 bg-amber-500/10">✕ Xoá lọc ngành ({[...active].join(", ")})</button>
        )}
      </div>

      {/* Desktop: biểu đồ toạ độ */}
      <svg viewBox={`0 0 ${W} ${H}`} className="hidden sm:block w-full h-auto" role="img" aria-label={`Heatmap ngành: sức mạnh tương đối ${h} phiên và độ rộng ngành`}>
        <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="rgba(2,6,15,0.35)" />
        <line x1={X(0)} x2={X(0)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(148,163,184,0.35)" />
        <line x1={PAD.l} x2={W - PAD.r} y1={Y(50)} y2={Y(50)} stroke="rgba(148,163,184,0.35)" />
        {[0, 25, 50, 75, 100].map((v) => <text key={v} x={PAD.l - 6} y={Y(v) + 3} textAnchor="end" fontSize={9} fill="#64748b">{v}%</text>)}
        {[-xMax, -xMax / 2, 0, xMax / 2, xMax].map((v, i) => <text key={i} x={X(v)} y={H - PAD.b + 12} textAnchor="middle" fontSize={9} fill="#64748b">{v > 0 ? "+" : ""}{vn(v, 1)}</text>)}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 4} textAnchor="middle" fontSize={9} fill="#94a3b8">Sức mạnh tương đối so VN-Index, {h} phiên (điểm %)</text>
        <text transform={`translate(10 ${(PAD.t + H - PAD.b) / 2}) rotate(-90)`} textAnchor="middle" fontSize={9} fill="#94a3b8">% mã trên MA20</text>
        {[...rows].sort((a, b) => b.value20 - a.value20).map((s) => {
          const q = quadrantOf(s.rs[h], s.breadth)!, cx = X(s.rs[h] as number), cy = Y(s.breadth as number), r = R(s.value20);
          const on = active.has(s.industry), flag = s.flags.length > 0;
          return (
            <g key={s.industry} role="button" tabIndex={0} aria-pressed={on} aria-label={`${s.industry}: RS ${vn(s.rs[h], 2)}, độ rộng ${vn(s.breadth)}%`}
              onClick={() => click(s)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); click(s); } }} className="cursor-pointer focus:outline-none">
              <circle cx={cx} cy={cy} r={r} fill={QUADRANT[q].fill} fillOpacity={on ? 0.75 : 0.35} stroke={on ? "#f8fafc" : flag ? "#fbbf24" : "#0f1420"} strokeWidth={on ? 2 : flag ? 1.5 : 2} strokeDasharray={flag && !on ? "3 2" : undefined} />
              <title>{`${s.group} › ${s.industry}\nRS ${h} phiên: ${vn(s.rs[h], 2)} điểm % · trung vị lợi suất ${vn(s.medianReturn[h], 2)}%\nĐộ rộng: ${vn(s.breadth)}% (${s.eligible}/${s.count} mã)\nGTGD TB20: ${fmtBn(s.value20)} · NN 5 phiên: ${fmtBn(s.foreign5)}\nSmart Score TB: ${s.avgSmart ?? "—"}${s.flags.length ? `\n⚠ ${s.flags.map((f) => f.text).join("; ")}` : ""}`}</title>
              {(labelled.has(s.industry) || on) && (
                // Không đủ chỗ phía trên (sát mép trên khung) -> đặt nhãn dưới bóng; mép trái/phải -> neo nhãn vào trong khung.
                <text x={Math.min(W - PAD.r - 2, Math.max(PAD.l + 2, cx))} y={cy - r - 3 < PAD.t + 9 ? cy + r + 11 : cy - r - 3}
                  textAnchor={cx < PAD.l + 50 ? "start" : cx > W - PAD.r - 50 ? "end" : "middle"} fontSize={9.5} fill="#e2e8f0">{flag ? "⚠ " : ""}{s.industry}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Điện thoại: danh sách xếp hạng theo RS */}
      <ul className="sm:hidden space-y-1" data-testid="mx-heatmap-list">
        {ranked.map((s) => {
          const q = quadrantOf(s.rs[h], s.breadth)!;
          return (
            <li key={s.industry}>
              <button type="button" onClick={() => click(s)} aria-pressed={active.has(s.industry)}
                className={`w-full text-left rounded px-2 py-1 border ${active.has(s.industry) ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/5"}`}>
                <span className="flex justify-between text-[11px]"><span className="text-slate-200">{s.flags.length ? "⚠ " : ""}{s.industry}</span><span className={QUADRANT[q].text}>{QUADRANT[q].label}</span></span>
                <span className="flex justify-between text-[10px] text-slate-400"><span>RS {vn(s.rs[h], 2)} · độ rộng {vn(s.breadth)}%</span><span>{fmtBn(s.value20)}</span></span>
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[9px]" aria-label="Chú thích">
        {(Object.keys(QUADRANT) as Quadrant[]).map((q) => (
          <li key={q} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: QUADRANT[q].fill }} /><span className={QUADRANT[q].text}>{QUADRANT[q].label}</span><span className="text-slate-500">{QUADRANT[q].note}</span></li>
        ))}
        <li className="text-slate-500">◌ viền đứt ⚠ = cờ biến động / độ rộng giảm mạnh · kích thước = GTGD TB20</li>
      </ul>
      <p className="text-[9px] text-slate-500">{data.definition} {data.smartMatched ? "" : "Smart Score: lần quét chưa cùng phiên — không ghép."}</p>

      <table className="sr-only">
        <caption>Thống kê ngành {h} phiên</caption>
        <thead><tr><th>Ngành</th><th>RS</th><th>Độ rộng</th><th>Số mã</th><th>GTGD TB20</th><th>Góc phần tư</th></tr></thead>
        <tbody>{ranked.map((s) => <tr key={s.industry}><td>{s.industry}</td><td>{s.rs[h]}</td><td>{s.breadth}</td><td>{s.eligible}/{s.count}</td><td>{s.value20}</td><td>{QUADRANT[quadrantOf(s.rs[h], s.breadth)!].label}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

const k = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${vn(v, 2)}%`);
