// Nhịp đập thị trường › Ngành thế giới → ngành Việt Nam (M4). Dữ liệu: Gateway /api/world-sectors/scores (M1–M3).
// Xếp hạng thuận/ngược gió (ngắn hạn = thông tin mới sau phiên VN; trung hạn = 3 tháng) + bản đồ nhiệt ngành VN × khu vực.
import { useState } from "react";
import { useWorldSectorScores } from "../../../../hooks/useWorldSectorScores";
import { divergingColor, fmtZ, labelVi, REGION_ORDER, REGION_SHORT, type RegionId, type WsRow } from "../../../../lib/worldSectors/types";
import EvidenceTag from "../EvidenceTag";
import WorldSectorDrawer from "./WorldSectorDrawer";

type Horizon = "short" | "medium";
type HeatKey = "new" | "w1" | "m1" | "m3";
const HEAT_LABEL: Record<HeatKey, string> = { new: "Phiên mới", w1: "1 tuần", m1: "1 tháng", m3: "3 tháng" };
const muted = { color: "var(--text-tertiary)" };
const fmtDate = (d: string | null | undefined) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "—");

function ScoreBar({ z }: { z: number | null }) {
  const w = z == null ? 0 : Math.min(1, Math.abs(z) / 2.5) * 50;
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "inline-block", width: 72, height: 6, background: "rgba(148,163,184,0.12)", borderRadius: 3 }}>
      <span style={{ position: "absolute", left: "50%", top: -2, width: 1, height: 10, background: "rgba(148,163,184,0.5)" }} />
      {z != null && <span style={{ position: "absolute", top: 0, height: 6, borderRadius: 3, background: divergingColor(z >= 0 ? 2.5 : -2.5), left: z >= 0 ? "50%" : `${50 - w}%`, width: `${w}%` }} />}
    </span>
  );
}

function RankList({ title, items, rows, horizon, onOpen, tone }: { title: string; items: { icb: string; nameVi: string; score: number }[]; rows: Map<string, WsRow>; horizon: Horizon; onOpen: (icb: string) => void; tone: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-[9.5px] font-bold uppercase mb-1.5" style={{ color: "var(--text-secondary)" }}>
        <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: divergingColor(tone === "pos" ? 2.5 : -2.5), marginRight: 6 }} />{title}
      </p>
      {items.length === 0 && <p className="text-[10px] italic" style={muted}>Không có ngành nào vượt ngưỡng ±0,5.</p>}
      <div className="space-y-1.5">
        {items.map((it) => {
          const r = rows.get(it.icb)!;
          const h = horizon === "short" ? r.short : r.medium;
          const regions = REGION_ORDER.filter((x) => h.sectors.byRegion[x]);
          return (
            <button key={it.icb} type="button" onClick={() => onOpen(it.icb)} data-testid={`ws-rank-${horizon}-${it.icb}`}
              className="w-full text-left rounded-lg px-2.5 py-2" style={{ background: "rgba(148,163,184,0.05)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold truncate" style={{ color: "#f1f5f9" }}>{r.nameVi} <span className="font-normal" style={muted}>ICB {r.icb}</span></span>
                <span className="flex items-center gap-1.5 shrink-0"><ScoreBar z={it.score} /><b className="text-[11px]" style={{ color: "#f1f5f9" }}>{fmtZ(it.score, 2)}</b></span>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-1">
                {regions.map((x) => <span key={x} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: "var(--text-secondary)" }}>{REGION_SHORT[x]} {fmtZ(h.sectors.byRegion[x]!.z)}</span>)}
                {h.commodity != null && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: "var(--text-secondary)" }}>Hàng hoá {fmtZ(h.commodity)}</span>}
                {horizon === "short" && r.short.evidence.label === "EVIDENCE" && <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.12)", color: "var(--positive)" }}>BẰNG CHỨNG CẤP NGÀNH</span>}
                {horizon === "medium" && r.medium.gap3m != null && Math.abs(r.medium.gap3m) >= 1 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: "var(--text-secondary)" }} title="Điểm thế giới 3 tháng trừ z 3 tháng của chính ngành VN">
                    {r.medium.gap3m > 0 ? "VN đi sau thế giới" : "VN đi trước thế giới"} {fmtZ(r.medium.gap3m)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function WorldSectorPanel() {
  const { data, error } = useWorldSectorScores();
  const [horizon, setHorizon] = useState<Horizon>("short");
  const [heatKey, setHeatKey] = useState<HeatKey>("new");
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="text-xs" style={{ color: "var(--negative)" }}>Không tải được ngành thế giới: {error.message}</p>;
  if (!data) return <p className="text-xs italic py-4 text-center" style={muted}>Đang tính ngành thế giới → ngành Việt Nam…</p>;
  const rows = new Map(data.rows.filter((r) => r.available).map((r) => [r.icb, r]));
  const rk = data.rankings[horizon];
  const ev = horizon === "short" ? data.evidence.short : data.evidence.medium;
  const sorted = [...rows.values()].sort((a, b) => ((horizon === "short" ? b.short.score : b.medium.score) ?? -9) - ((horizon === "short" ? a.short.score : a.medium.score) ?? -9));
  const vnLast = sorted[0]?.vnLast ?? null;

  return (
    <div className="tw-scope rounded-xl p-3.5 space-y-3" data-testid="world-sector-panel" style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Ngành thế giới → ngành Việt Nam (ICB)</p>
          <p className="text-[9.5px]" style={muted}>74 ETF ngành Mỹ · STOXX 600 · TOPIX-17 · KODEX · Đài · TQ, ánh xạ theo mã ICB · phiên VN gần nhất {fmtDate(vnLast)}</p>
        </div>
        <EvidenceTag kind={ev.label === "EVIDENCE" ? "evidence" : "heuristic"} title={`${data.evidence.version} · ${data.evidence.sample}: ${ev.labelVi}`} />
      </div>

      <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Khung thời gian">
        {(["short", "medium"] as Horizon[]).map((h) => (
          <button key={h} type="button" aria-pressed={horizon === h} onClick={() => { setHorizon(h); setHeatKey(h === "short" ? "new" : "m3"); }}
            className="text-[10px] font-bold px-2.5 py-1 rounded-md"
            style={{ background: horizon === h ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.06)", color: horizon === h ? "var(--gold, #f59e0b)" : "var(--text-secondary)" }}>
            {h === "short" ? "Ngắn hạn · thông tin mới sau phiên VN" : "Trung hạn · 3 tháng"}
          </button>
        ))}
      </div>
      <p className="text-[9.5px]" style={muted}>
        {ev.labelVi}{ev.ic != null ? ` (IC ${fmtZ(ev.ic, 3)}${ev.t != null ? `, t ${fmtZ(ev.t, 2)}` : ""})` : ""}. Điểm = độ lệch chuẩn; ±0,5 là ngưỡng thuận/ngược gió. Bấm một ngành để xem phân tích chuyên sâu.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <RankList title="Thuận gió" items={rk.tailwind} rows={rows} horizon={horizon} onOpen={setOpen} tone="pos" />
        <RankList title="Ngược gió" items={rk.headwind} rows={rows} horizon={horizon} onOpen={setOpen} tone="neg" />
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
          <p className="text-[9.5px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Bản đồ nhiệt: ngành VN × khu vực (z, độ lệch chuẩn)</p>
          <div className="flex gap-1" role="group" aria-label="Chỉ số bản đồ nhiệt">
            {(Object.keys(HEAT_LABEL) as HeatKey[]).map((k) => (
              <button key={k} type="button" aria-pressed={heatKey === k} onClick={() => setHeatKey(k)} className="text-[9px] px-2 py-0.5 rounded"
                style={{ background: heatKey === k ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.06)", color: heatKey === k ? "var(--gold, #f59e0b)" : "var(--text-tertiary)" }}>{HEAT_LABEL[k]}</button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="ws-heatmap" className="w-full text-[10px]" style={{ borderCollapse: "separate", borderSpacing: 2, minWidth: 520 }}>
            <thead><tr style={muted}><th className="text-left font-normal">Ngành VN</th><th className="font-normal">Điểm</th>{REGION_ORDER.map((r) => <th key={r} className="font-normal">{REGION_SHORT[r]}</th>)}</tr></thead>
            <tbody>
              {sorted.map((r) => {
                const score = horizon === "short" ? r.short.score : r.medium.score;
                return (
                  <tr key={r.icb} onClick={() => setOpen(r.icb)} style={{ cursor: "pointer" }}>
                    <td className="py-0.5 pr-2 truncate" style={{ color: "#f1f5f9", maxWidth: 170 }}>{r.parent ? "· " : ""}{r.nameVi}</td>
                    <td className="text-center rounded" style={{ background: divergingColor(score), color: "#f1f5f9", minWidth: 44 }} title={`${r.nameVi}: ${labelVi[horizon === "short" ? r.short.label : r.medium.label]}`}>{fmtZ(score)}</td>
                    {REGION_ORDER.map((reg: RegionId) => {
                      const h = r.heat[reg];
                      const z = h ? h[heatKey] : null;
                      return <td key={reg} className="text-center rounded" style={{ background: divergingColor(z), color: z == null ? "var(--text-tertiary)" : "#f1f5f9", minWidth: 40 }}
                        title={h ? `${r.nameVi} ← ${REGION_SHORT[reg]} (${h.n} mã, khớp tốt nhất: ${h.best}) · ${HEAT_LABEL[heatKey]}: ${fmtZ(z, 2)}` : `${REGION_SHORT[reg]}: không có ngành tương ứng`}>{h ? fmtZ(z) : "·"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[9px]" style={muted} aria-hidden="true">
          <span>Ngược gió</span>
          <span style={{ width: 120, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${divergingColor(-2.5)}, ${divergingColor(0)}, ${divergingColor(2.5)})` }} />
          <span>Thuận gió</span>
          <span>· "—" = chưa có phiên mới · "·" = khu vực không có ngành tương ứng</span>
        </div>
      </div>
      <p className="text-[9px] leading-relaxed" style={muted}>{data.method.vi} Châu Âu (STOXX 600) dùng chính chuẩn ICB nên khớp 1-1; Mỹ/Nhật/Hàn là chuẩn khác (khớp gần/một phần).</p>
      {open && rows.get(open) && <WorldSectorDrawer icb={open} row={rows.get(open)!} onClose={() => setOpen(null)} />}
    </div>
  );
}
