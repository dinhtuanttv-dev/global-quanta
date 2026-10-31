import { useMemo, useState } from "react";
import useSWR from "swr";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { useWorldStrategy } from "../../../../hooks/useWorldStrategy";
import { clampZ, fmtChange, fmtSigned, fmtValue, fmtVnTime, type MonitorDoc, type MonitorGroup, type MonitorItem } from "../../../../lib/world/monitor";
import EvidenceTag from "../EvidenceTag";
import { pickLabels } from "./world2d";

const W = 760, H = 330, L = 44, R = 16, T = 16, B = 38, ZMAX = 4;
const GROUP: Record<MonitorGroup, { label: string; color: string; shape: "circle" | "square" | "diamond" }> = {
  index: { label: "Chỉ số", color: "#3987e5", shape: "circle" },
  macro: { label: "Vĩ mô", color: "#d9a441", shape: "square" },
  commodity: { label: "Hàng hoá", color: "#2fa68a", shape: "diamond" },
};
const muted = { color: "var(--text-tertiary, #64748b)" };
const card = { background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" };
const sx = (z: number) => L + ((clampZ(z, ZMAX) + ZMAX) / (2 * ZMAX)) * (W - L - R);
const sy = (r: number) => T + ((100 - r) / 100) * (H - T - B);

function Mark({ x, y, group, r, unusual }: { x: number; y: number; group: MonitorGroup; r: number; unusual: boolean }) {
  const g = GROUP[group];
  const stroke = unusual ? "#f1f5f9" : "#0b1220";
  if (g.shape === "square") return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={1.5} fill={g.color} stroke={stroke} strokeWidth={1.5} />;
  if (g.shape === "diamond") return <path d={`M${x},${y - r - 1} L${x + r + 1},${y} L${x},${y + r + 1} L${x - r - 1},${y} Z`} fill={g.color} stroke={stroke} strokeWidth={1.5} />;
  return <circle cx={x} cy={y} r={r} fill={g.color} stroke={stroke} strokeWidth={1.5} />;
}

function Spark({ pts }: { pts: [string, number][] }) {
  if (pts.length < 2) return <span style={muted}>—</span>;
  const vals = pts.map((p) => p[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${(i / (vals.length - 1)) * 70},${18 - ((v - lo) / span) * 16}`).join(" ");
  return <svg viewBox="0 0 70 20" width={70} height={20} aria-hidden className="inline-block"><path d={d} fill="none" stroke={vals[vals.length - 1] >= vals[0] ? "#3987e5" : "#e66767"} strokeWidth={1.3} /></svg>;
}

function ZBar({ z }: { z: number | null | undefined }) {
  if (z == null) return <span style={muted}>—</span>;
  const w = (Math.min(Math.abs(z), ZMAX) / ZMAX) * 50;
  return <span className="inline-flex items-center gap-1.5" title={`${fmtSigned(z, 2)} độ lệch chuẩn so với 60 phiên trước`}>
    <span aria-hidden style={{ position: "relative", display: "inline-block", width: 56, height: 6, borderRadius: 3, background: "rgba(148,163,184,0.12)" }}>
      <span style={{ position: "absolute", top: 0, height: 6, borderRadius: 3, background: z >= 0 ? "#3987e5" : "#e66767", left: z >= 0 ? "50%" : `${50 - w}%`, width: `${w}%` }} />
      <span style={{ position: "absolute", left: "50%", top: -2, width: 1, height: 10, background: "rgba(148,163,184,0.5)" }} />
    </span>
    <span style={{ color: Math.abs(z) >= 2 ? "var(--gold-bright, #fbbf24)" : "var(--text-secondary, #94a3b8)", minWidth: 32, textAlign: "right" }}>{fmtSigned(z, 1)}</span>
  </span>;
}

function RangeBar({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return <span style={muted}>—</span>;
  return <span className="inline-flex items-center gap-1.5" title={`Vị trí trong biên giá 252 phiên: ${pct.toFixed(0)}%`}>
    <span aria-hidden style={{ position: "relative", display: "inline-block", width: 52, height: 4, borderRadius: 2, background: "rgba(148,163,184,0.15)" }}>
      <span style={{ position: "absolute", top: -2, left: `calc(${pct}% - 2px)`, width: 4, height: 8, borderRadius: 1, background: "#cbd5e1" }} />
    </span>
    <span style={{ color: "var(--text-secondary, #94a3b8)", minWidth: 26, textAlign: "right" }}>{pct.toFixed(0)}%</span>
  </span>;
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "warn" }) {
  return <div className="rounded-lg px-3 py-2" style={{ background: "rgba(148,163,184,0.04)" }}>
    <p className="text-[9.5px]" style={muted}>{label}</p>
    <p className="text-sm font-bold" style={{ color: tone === "warn" ? "var(--gold-bright, #fbbf24)" : "#f1f5f9" }}>{value}</p>
    {note && <p className="text-[9px]" style={muted}>{note}</p>}
  </div>;
}

/** Giám sát thị trường & rủi ro: một kho giá thống nhất, bản đồ 2D biến động × vị trí biên năm. Chỉ mô tả, không dự báo. */
export default function MarketMonitor({ spillover }: { spillover?: number | null }) {
  const { data, error } = useSWR<MonitorDoc>("world-monitor", () => fetchMarketJson<MonitorDoc>("/api/world/monitor"), { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 30_000 });
  const { data: strategy } = useWorldStrategy();
  const [hover, setHover] = useState<MonitorItem | null>(null);
  const plotted = useMemo(() => (data?.items ?? []).filter((i) => i.available && i.z != null && i.rangePct != null), [data]);
  const labeled = pickLabels([...plotted].sort((a, b) => Math.abs(b.z!) - Math.abs(a.z!)).map((i) => ({ id: i.id, text: i.nameVi, x: sx(i.z!), y: sy(i.rangePct!), toLeft: i.z! > 1.2 })), 10);
  const table = (data?.items ?? []).filter((i) => i.group !== "commodity");
  const missing = (data?.items ?? []).filter((i) => !i.available);
  const s = data?.summary;

  return (
    <section className="rounded-xl p-3.5" style={card} data-testid="market-monitor">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold" style={{ color: "#f1f5f9" }}>Giám sát thị trường &amp; rủi ro</h4>
          <p className="text-[10px]" style={muted}>{data?.method.noteVi ?? "Một kho giá cho chỉ số, vĩ mô và hàng hoá."}{data ? ` Tính lúc ${fmtVnTime(data.generatedAt)}.` : ""}</p>
        </div>
        <EvidenceTag kind="data" />
      </div>
      {error && !data && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--negative, #f87171)" }}>Không tải được giá: {error.message}</p>}
      {!data && !error && <div className="mt-2 h-60 animate-pulse rounded-lg" style={{ background: "rgba(148,163,184,0.05)" }} aria-busy="true" />}
      {data && s && <>
        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-5" data-testid="monitor-stats">
          <Stat label="Biến động toàn cầu" value={strategy ? (strategy.regime.stressed ? "Căng thẳng" : "Bình thường") : "—"} tone={strategy?.regime.stressed ? "warn" : undefined} note={strategy ? `VIX ${fmtValue(strategy.regime.vix)}, phiên ${strategy.regime.date?.split("-").reverse().slice(0, 2).join("/")}` : undefined} />
          <Stat label="VIX trong biên 1 năm" value={s.vixRangePct == null ? "—" : `${s.vixRangePct.toFixed(0)}%`} note="0% đáy, 100% đỉnh" />
          <Stat label="Biến động bất thường" value={`${s.abnormal.length}/${s.available}`} tone={s.abnormal.length ? "warn" : undefined} note={`|z| ≥ ${data.method.abnormalZ}`} />
          <Stat label="Chỉ số tăng phiên gần nhất" value={`${s.indexUp}/${s.indexTotal}`} />
          <Stat label="Lan truyền giữa các thị trường" value={spillover == null ? "—" : `${spillover.toFixed(0)}%`} note="Diebold–Yilmaz, gần đây" />
        </div>
        <div className="relative mt-3">
          <div className="overflow-x-auto"><svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" style={{ minWidth: 560, maxWidth: 1040, margin: "0 auto" }} role="group" aria-label={`Bản đồ ${plotted.length} thị trường: biến động phiên theo trục ngang, vị trí biên năm theo trục dọc`} data-testid="monitor-map">
            <rect x={L} y={T} width={W - L - R} height={H - T - B} rx={8} fill="rgba(148,163,184,0.025)" stroke="rgba(148,163,184,0.12)" />
            <rect x={L} y={T} width={sx(-2) - L} height={H - T - B} fill="rgba(230,103,103,0.05)" />
            <rect x={sx(2)} y={T} width={W - R - sx(2)} height={H - T - B} fill="rgba(57,135,229,0.05)" />
            <line x1={sx(0)} x2={sx(0)} y1={T} y2={H - B} stroke="rgba(148,163,184,0.28)" strokeDasharray="3 4" />
            <line x1={L} x2={W - R} y1={sy(50)} y2={sy(50)} stroke="rgba(148,163,184,0.2)" strokeDasharray="3 4" />
            {[-4, -2, 0, 2, 4].map((v) => <text key={v} x={sx(v)} y={H - B + 13} textAnchor="middle" fontSize={9} fill="#64748b">{v > 0 ? `+${v}` : v === 0 ? "0" : `−${-v}`}</text>)}
            {[0, 50, 100].map((v) => <text key={v} x={L - 6} y={sy(v) + 3} textAnchor="end" fontSize={9} fill="#64748b">{v}%</text>)}
            <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#94a3b8">Biến động phiên gần nhất (z, độ lệch chuẩn). Ngoài ±4 đặt ở rìa</text>
            <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize={10} fill="#94a3b8" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Vị trí trong biên 1 năm</text>
            {plotted.map((i) => {
              const x = sx(i.z!), y = sy(i.rangePct!);
              const toLeft = i.z! > 1.2;
              return <g key={i.id} tabIndex={0} aria-label={`${i.nameVi}: ${fmtChange(i)}, z ${fmtSigned(i.z, 2)}, vị trí biên ${i.rangePct!.toFixed(0)}%`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} style={{ outline: "none" }} data-testid={`monitor-pt-${i.id}`}>
                <circle cx={x} cy={y} r={12} fill="transparent" />
                <Mark x={x} y={y} group={i.group} r={hover?.id === i.id ? 6.5 : 4.5} unusual={!!i.unusual} />
                {labeled.has(i.id) && <text x={x + (toLeft ? -9 : 9)} y={y + 3.5} textAnchor={toLeft ? "end" : "start"} fontSize={9.5} fill="#cbd5e1">{i.nameVi}</text>}
              </g>;
            })}
          </svg></div>
          {hover && <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-lg px-2.5 py-1.5 text-[10px]" role="status" data-testid="monitor-tip" style={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.25)", color: "#e2e8f0" }}>
            <b>{hover.nameVi}</b> · {GROUP[hover.group].label}<br />
            {fmtValue(hover.value)} {hover.unit} · {fmtChange(hover)} · z {fmtSigned(hover.z, 2)}<br />
            <span style={muted}>Phiên {hover.date?.split("-").reverse().join("/")} · {hover.sourceVi}</span>
          </div>}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px]" style={{ color: "var(--text-secondary, #94a3b8)" }} aria-label="Chú giải">
            {(Object.keys(GROUP) as MonitorGroup[]).map((k) => <span key={k} className="inline-flex items-center gap-1"><svg width={12} height={12} aria-hidden><Mark x={6} y={6} group={k} r={3.5} unusual={false} /></svg>{GROUP[k].label}</span>)}
            <span style={muted}>Viền sáng: |z| ≥ {data.method.abnormalZ}. Vùng tô: ngoài ±{data.method.abnormalZ}.</span>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[10.5px]" style={{ minWidth: 640 }} data-testid="monitor-table">
            <thead><tr style={muted}>{["Thị trường", "Giá", "Thay đổi", "z", "Biên 1 năm", "60 phiên", "Phiên"].map((h, i) => <th key={h} className={`px-2 py-1 font-normal ${i === 0 ? "text-left" : i < 3 ? "text-right" : "text-center"}`}>{h}</th>)}</tr></thead>
            <tbody>{table.map((i) => <tr key={i.id} style={{ borderTop: "1px solid rgba(148,163,184,0.07)" }} data-testid={`monitor-row-${i.id}`}>
              <td className="px-2 py-1" style={{ color: "#e2e8f0" }} title={i.sourceVi}>{i.nameVi}</td>
              <td className="px-2 py-1 text-right font-semibold" style={{ color: "#f1f5f9" }}>{i.available ? fmtValue(i.value) : "—"}</td>
              <td className="px-2 py-1 text-right" style={{ color: i.change == null ? undefined : i.change >= 0 ? "#7cb4f5" : "#f09595" }}>{i.available ? fmtChange(i) : "—"}</td>
              <td className="px-2 py-1 text-center"><ZBar z={i.z} /></td>
              <td className="px-2 py-1 text-center"><RangeBar pct={i.rangePct} /></td>
              <td className="px-2 py-1 text-center"><Spark pts={i.spark ?? []} /></td>
              <td className="px-2 py-1 text-center" style={{ color: i.stale ? "var(--gold-bright, #fbbf24)" : "var(--text-tertiary, #64748b)" }} title={i.stale ? `Dữ liệu cũ ${i.ageDays} ngày` : undefined}>{i.date ? i.date.split("-").reverse().slice(0, 2).join("/") : "—"}{i.stale ? " (cũ)" : ""}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {missing.length > 0 && <p className="mt-2 text-[10px]" role="note" style={{ color: "var(--gold, #f59e0b)" }}>Chưa lấy được: {missing.map((m) => m.nameVi).join(", ")}. Không ước lượng thay thế.</p>}
      </>}
    </section>
  );
}
