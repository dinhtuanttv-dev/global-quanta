import { useMemo, useState } from "react";
import { useWorldStrategy } from "../../../../hooks/useWorldStrategy";
import { useWorldSectorScores } from "../../../../hooks/useWorldSectorScores";
import { fmtZ } from "../../../../lib/worldSectors/types";
import WorldSectorDrawer from "../worldSectors/WorldSectorDrawer";
import EvidenceTag from "../EvidenceTag";
import { sectorPoints, type SectorPoint } from "./world2d";

const W = 720, H = 400, L = 44, R = 16, T = 18, B = 40;
// Màu theo tư thế (cố định, đã dùng ở bảng chiến lược); nhãn và ký hiệu đi kèm nên không phụ thuộc riêng vào màu.
const STANCE = {
  overweight: { color: "#3987e5", label: "Ưu tiên" },
  underweight: { color: "#e66767", label: "Giảm tỷ trọng" },
  neutral: { color: "#94a3b8", label: "Trung lập" },
  na: { color: "#64748b", label: "Chưa có" },
} as const;
const stanceOf = (s: string) => STANCE[s as keyof typeof STANCE] ?? STANCE.na;
const QUADRANTS = [
  { x: 1, y: 0, text: "Ngắn hạn thuận · 3 tháng thuận", anchor: "end" as const },
  { x: 0, y: 0, text: "Ngắn hạn ngược · 3 tháng thuận", anchor: "start" as const },
  { x: 1, y: 1, text: "Ngắn hạn thuận · 3 tháng ngược", anchor: "end" as const },
  { x: 0, y: 1, text: "Ngắn hạn ngược · 3 tháng ngược", anchor: "start" as const },
];

/** Bản đồ ngành 2D: ngắn hạn (đã kiểm định, lợi thế nhỏ) × bối cảnh 3 tháng (thăm dò, không dự báo). Bấm điểm mở phân tích ngành. */
export default function SectorMap2D() {
  const { data: strategy, error } = useWorldStrategy();
  const { data: scores } = useWorldSectorScores();
  const [hover, setHover] = useState<SectorPoint | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const pts = useMemo(() => (strategy ? sectorPoints(strategy.short.rows, strategy.medium) : []), [strategy]);
  const row = open ? scores?.rows.find((r) => r.icb === open) : undefined;

  const xMax = Math.max(1, ...pts.map((p) => Math.abs(p.x))) * 1.12;
  const yMax = Math.max(1, ...pts.map((p) => Math.abs(p.y))) * 1.12;
  const sx = (v: number) => L + ((v + xMax) / (2 * xMax)) * (W - L - R);
  const sy = (v: number) => T + ((yMax - v) / (2 * yMax)) * (H - T - B);
  // Chỉ ghi tên các ngành nổi bật (xa gốc nhất) để không rối; các ngành còn lại xem qua rê chuột / bảng chiến lược.
  const labeled = useMemo(() => new Set([...pts].sort((a, b) => Math.hypot(b.x, b.y) - Math.hypot(a.x, a.y)).slice(0, 10).map((p) => p.icb)), [pts]);

  return (
    <section className="rounded-xl p-3.5" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="sector-map">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold" style={{ color: "#f1f5f9" }}>Bản đồ ngành Việt Nam</h4>
          <p className="text-[10px]" style={muted}>Trục ngang: tín hiệu ngắn hạn đã kiểm định (lợi thế nhỏ). Trục dọc: bối cảnh 3 tháng, chỉ để tham khảo. Bấm một điểm để xem phân tích ngành.</p>
        </div>
        <EvidenceTag kind="heuristic" title="Vị trí trên bản đồ là mô tả. Chỉ trục ngang có kiểm định đặt trước (WS-v1); trục dọc không đạt kiểm định." />
      </div>
      {error && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--negative)" }}>Không tải được dữ liệu ngành: {error.message}</p>}
      {!strategy && !error && <div className="mt-2 h-60 animate-pulse rounded-lg" style={{ background: "rgba(148,163,184,0.05)" }} aria-busy="true" />}
      {strategy && <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={`Bản đồ ${pts.length} ngành: ngắn hạn theo trục ngang, ba tháng theo trục dọc`}>
          <rect x={L} y={T} width={W - L - R} height={H - T - B} rx={8} fill="rgba(148,163,184,0.025)" stroke="rgba(148,163,184,0.12)" />
          <line x1={sx(0)} x2={sx(0)} y1={T} y2={H - B} stroke="rgba(148,163,184,0.28)" strokeDasharray="3 4" />
          <line x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} stroke="rgba(148,163,184,0.28)" strokeDasharray="3 4" />
          {QUADRANTS.map((q) => <text key={q.text} x={q.x ? W - R - 8 : L + 8} y={q.y ? H - B - 8 : T + 14} textAnchor={q.anchor} fontSize={9} fill="rgba(148,163,184,0.5)">{q.text}</text>)}
          <text x={(L + W - R) / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#94a3b8">Ngắn hạn: z so với các ngành</text>
          <text x={12} y={(T + H - B) / 2} textAnchor="middle" fontSize={10} fill="#94a3b8" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>Điểm 3 tháng</text>
          {pts.map((p) => {
            const c = stanceOf(p.stance);
            const active = hover?.icb === p.icb;
            return <g key={p.icb} role="button" tabIndex={0} aria-label={`${p.nameVi}: ${c.label}, ngắn hạn ${fmtZ(p.x, 2)}, ba tháng ${fmtZ(p.y, 2)}${p.concentrated ? `, tập trung ${p.note}` : ""}`}
              onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p)} onBlur={() => setHover(null)}
              onClick={() => setOpen(p.icb)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(p.icb); } }}
              style={{ cursor: "pointer", outline: "none" }} data-testid={`sector-pt-${p.icb}`}>
              <circle cx={sx(p.x)} cy={sy(p.y)} r={13} fill="transparent" />
              {/* Rổ tập trung vào 1–2 mã: vòng rỗng — tín hiệu thực chất là của cổ phiếu đó, không phải cả ngành */}
              <circle cx={sx(p.x)} cy={sy(p.y)} r={active ? 7.5 : 5.5} fill={p.concentrated ? "#0b1220" : c.color} stroke={p.concentrated ? c.color : active ? "#f1f5f9" : "#0b1220"} strokeWidth={p.concentrated ? 2.2 : 1.5} />
              {labeled.has(p.icb) && <text x={sx(p.x) + (p.x > xMax * 0.55 ? -9 : 9)} y={sy(p.y) + 3.5} textAnchor={p.x > xMax * 0.55 ? "end" : "start"} fontSize={9.5} fill="#cbd5e1">{p.nameVi}</text>}
            </g>;
          })}
        </svg>
        {hover && <div className="pointer-events-none absolute z-10 rounded-lg px-2.5 py-1.5 text-[10px]" role="status" data-testid="sector-tip"
          style={{ left: `${Math.min(68, (sx(hover.x) / W) * 100)}%`, top: `${Math.max(2, (sy(hover.y) / H) * 100 - 20)}%`, background: "#0f172a", border: "1px solid rgba(148,163,184,0.3)", color: "#e2e8f0" }}>
          <b>{hover.nameVi}</b> · {stanceOf(hover.stance).label}<br />
          α {fmtZ(hover.alphaBps, 1)} đcb/phiên · 3 tháng {fmtZ(hover.y, 2)}
          {hover.concentrated && <><br /><span style={{ color: "#fbbf24" }}>Tập trung: {hover.note}</span></>}
        </div>}
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[9.5px]" style={{ color: "var(--text-secondary)" }} aria-label="Chú giải">
          {(["overweight", "neutral", "underweight"] as const).map((k) => <span key={k}><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: STANCE[k].color }} />{STANCE[k].label}</span>)}
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ border: "1.5px solid #94a3b8" }} />Vòng rỗng: rổ tập trung vào 1–2 mã</span>
          <span className="ml-auto" style={muted}>Tham khảo, không phải khuyến nghị đầu tư.</span>
        </div>
      </div>}
      {open && row && <WorldSectorDrawer icb={open} row={row} onClose={() => setOpen(null)} />}
    </section>
  );
}

const muted = { color: "var(--text-tertiary)" };
