// Chiến lược ngành Việt Nam — ngắn hạn & trung hạn (S3). Ghép Nhịp đập thị trường + Nhịp đập hàng hoá + Truyền dẫn & bằng chứng
// + RRG Lọc ngành (Gateway /api/world-sectors/strategy). Ngắn hạn: α = IC·σ·z với IC đã kiểm định; trung hạn: bối cảnh, không dự báo.
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useWorldStrategy } from "../../../../hooks/useWorldStrategy";
import { useWorldSectorScores } from "../../../../hooks/useWorldSectorScores";
import { useAppStore } from "../../../../store/useAppStore";
import { divergingColor, fmtZ, REGION_ORDER, REGION_SHORT } from "../../../../lib/worldSectors/types";
import { MEDIUM_STANCE_VI, QUADRANT_VI, SHORT_STANCE_VI, type MediumRow, type MediumStance, type ShortRow } from "../../../../lib/worldSectors/strategyTypes";
import EvidenceTag from "../EvidenceTag";
import WorldSectorDrawer from "../worldSectors/WorldSectorDrawer";

const muted = { color: "var(--text-tertiary)" };
const num = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (d: string | null | undefined) => (d ? d.split("-").reverse().join("/") : "—");
const STANCE_COLOR = { overweight: divergingColor(2.5), underweight: divergingColor(-2.5), neutral: "rgba(148,163,184,0.25)", na: "rgba(148,163,184,0.15)" } as const;
const VOTE = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "0");

function Card({ title, tag, children }: { title: string; tag?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl p-3 space-y-2" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>{title}</h4>{tag}
      </div>
      {children}
    </section>
  );
}

function AlphaBar({ a, max }: { a: number | null; max: number }) {
  const w = a == null ? 0 : Math.min(1, Math.abs(a) / max) * 50;
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "inline-block", width: 70, height: 6, background: "rgba(148,163,184,0.12)", borderRadius: 3 }}>
      <span style={{ position: "absolute", left: "50%", top: -2, width: 1, height: 10, background: "rgba(148,163,184,0.5)" }} />
      {a != null && <span style={{ position: "absolute", top: 0, height: 6, borderRadius: 3, background: divergingColor(a >= 0 ? 2.5 : -2.5), left: a >= 0 ? "50%" : `${50 - w}%`, width: `${w}%` }} />}
    </span>
  );
}

function ShortTable({ rows, onOpen }: { rows: ShortRow[]; onOpen: (icb: string) => void }) {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const max = Math.max(5, ...rows.map((r) => Math.abs(r.alphaBps ?? 0)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10.5px]" data-testid="strategy-short" style={{ borderCollapse: "collapse", minWidth: 640 }}>
        <thead><tr style={muted}><th className="text-left font-normal">Ngành</th><th className="font-normal">Tư thế</th><th className="font-normal">α (đcb/phiên)</th><th className="font-normal">P vượt VN-Index</th><th className="font-normal">z</th><th className="text-left font-normal">Khu vực</th><th className="text-left font-normal">Mã lớn nhất</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.icb} onClick={() => onOpen(r.icb)} style={{ borderTop: "1px solid rgba(148,163,184,0.08)", cursor: "pointer" }} title={`${r.icBasisVi} σ tương đối ${num(r.sigmaBps)} đcb/phiên.`}>
              <td className="py-1.5" style={{ color: "#f1f5f9" }}>{r.parent ? "· " : ""}{r.nameVi}{r.evidence?.label === "EVIDENCE" && <span className="ml-1 text-[8.5px] font-bold px-1 rounded" style={{ background: "rgba(52,211,153,0.12)", color: "var(--positive)" }}>ĐẠT CẤP NGÀNH</span>}</td>
              <td className="text-center"><span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: STANCE_COLOR[r.stance], color: "#f1f5f9" }}>{SHORT_STANCE_VI[r.stance]}</span></td>
              <td className="text-center whitespace-nowrap"><AlphaBar a={r.alphaBps} max={max} /> <b style={{ color: "#f1f5f9" }}>{fmtZ(r.alphaBps, 1)}</b></td>
              <td className="text-center">{r.pOutperform == null ? "—" : `${num(r.pOutperform * 100, 1)}%`}</td>
              <td className="text-center" style={muted}>{fmtZ(r.zx, 2)}</td>
              <td style={muted}>{REGION_ORDER.filter((x) => r.byRegion[x]).map((x) => `${REGION_SHORT[x]} ${fmtZ(r.byRegion[x]!.z)}`).join(" · ")}{r.commodity != null ? ` · HH ${fmtZ(r.commodity)}` : ""}</td>
              <td>{r.constituents.slice(0, 3).map((c) => <button key={c.ticker} type="button" onClick={(e) => { e.stopPropagation(); selectTicker(c.ticker); }} className="text-[9.5px] font-black mr-1" style={{ color: "var(--gold, #f59e0b)" }}>{c.ticker}</button>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MediumCard({ r, onOpen }: { r: MediumRow; onOpen: (icb: string) => void }) {
  return (
    <button type="button" onClick={() => onOpen(r.icb)} className="w-full text-left rounded-lg p-2.5 space-y-1" style={{ background: "rgba(148,163,184,0.05)" }} data-testid={`strategy-medium-${r.icb}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold truncate" style={{ color: "#f1f5f9" }}>{r.nameVi} <span className="font-normal" style={muted}>ICB {r.icb}</span></span>
        <span className="text-[9px] shrink-0" style={muted} title="Phiếu: điểm 3 tháng ngành thế giới · chu kỳ RRG · áp lực yếu tố truyền dẫn">{r.votes.map(VOTE).join(" ")}</span>
      </div>
      <div className="flex flex-wrap gap-1 text-[9px]">
        <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: "var(--text-secondary)" }}>Thế giới 3T {fmtZ(r.ws.score, 2)}</span>
        {r.rrg && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: "var(--text-secondary)" }}>RRG {QUADRANT_VI[r.rrg.quadrant] ?? r.rrg.quadrant}{r.rrg.state ? ` · ${r.rrg.state}` : ""}</span>}
        {r.factorPressure.score != null && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: "var(--text-secondary)" }}>Truyền dẫn {fmtZ(r.factorPressure.score, 2)}</span>}
        {r.rrg?.accumulation != null && <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: "var(--text-secondary)" }}>Tích luỹ {r.rrg.accumulation}</span>}
      </div>
      {r.factorPressure.links.length > 0 && <p className="text-[9px]" style={muted}>Liên kết: {r.factorPressure.links.map((l) => `${l.factor} β ${num(l.beta, 2)} (bậc ${l.tier}, z ${fmtZ(l.z)})`).join(" · ")}</p>}
      {r.confirm.length > 0 && <p className="text-[9px]" style={muted}>Cổng W3: {r.confirm.map((c) => `${c.id} ${c.factor} ${c.confirmed ? "đã xác nhận" : c.signOk === false ? "ngược chiều" : "chưa xác nhận"}`).join(" · ")}</p>}
      {r.scenarios.length > 0 && (
        <p className="text-[9px]" style={muted}>Kịch bản 3T: {r.scenarios.map((s) => (s.unreliable ? `${s.nameVi} ước tính bất ổn` : `${s.nameVi} ${fmtZ(s.estPct, 1)}%${s.conclusive ? "" : " (chưa kết luận)"}`)).join(" · ")}</p>
      )}
    </button>
  );
}

export default function StrategyPanel() {
  const { data, error } = useWorldStrategy();
  const { data: scores } = useWorldSectorScores();
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="text-xs" style={{ color: "var(--negative)" }}>Không tải được chiến lược: {error.message}</p>;
  if (!data) return <p className="text-xs italic py-4 text-center" style={muted}>Đang tổng hợp chiến lược ngành…</p>;
  const row = open ? scores?.rows.find((r) => r.icb === open) : null;
  const groups: [MediumStance[], string, number][] = [[["supportive"], "Bối cảnh thuận", 2.5], [["mixed", "neutral"], "Hỗn hợp / trung tính", 0], [["adverse"], "Bối cảnh bất lợi", -2.5]];

  return (
    <div className="tw-scope space-y-3" data-testid="strategy-panel">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Chiến lược ngành Việt Nam — ngắn hạn & trung hạn</p>
          <p className="text-[9.5px]" style={muted}>Ghép Nhịp đập thị trường · Nhịp đập hàng hoá · Truyền dẫn & bằng chứng · chu kỳ RRG Lọc ngành · phiên VN {fmtDate(data.vnLast)} · {data.version}</p>
        </div>
      </div>
      {data.regime.stressed && (
        <p className="text-[10px] rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--gold, #fbbf24)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> VIX {num(data.regime.vix, 2)} ({fmtZ(data.regime.vixChg, 1)}% phiên {fmtDate(data.regime.date)}). {data.regime.noteVi}
        </p>
      )}

      <Card title="Ngắn hạn — phiên VN kế tiếp" tag={<EvidenceTag kind={data.evidence.short.label === "EVIDENCE" ? "evidence" : "heuristic"} title={`${data.evidence.short.version}: IC ${data.evidence.short.ic}, t ${data.evidence.short.t} · ${data.evidence.short.sample}`} />}>
        <p className="text-[9.5px]" style={muted}>
          α = IC × σ × z (Grinold–Kahn) — lợi suất tương đối kỳ vọng so với VN-Index, điểm cơ bản/phiên. IC xếp hạng đã kiểm định ≈ {data.evidence.short.ic} nên
          <b style={{ color: "var(--text-secondary)" }}> lợi thế rất nhỏ</b> (P vượt ≈ 50–55%): dùng để nghiêng tỷ trọng giữa các ngành, không phải tín hiệu mua/bán đơn lẻ. Bấm một ngành để xem phân tích chuyên sâu.
        </p>
        <ShortTable rows={data.short.rows} onOpen={setOpen} />
      </Card>

      <Card title="Trung hạn — bối cảnh 1–3 tháng" tag={<EvidenceTag kind="heuristic" title={data.evidence.medium.reasonVi} />}>
        <p className="text-[9.5px]" style={muted}>{data.evidence.medium.reasonVi} Phiếu (+/0/−): điểm 3 tháng ngành thế giới · chu kỳ RRG Lọc ngành · áp lực yếu tố truyền dẫn.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {groups.map(([keys, title, tone]) => {
            const items = data.medium.filter((m) => keys.includes(m.stance));
            return (
              <div key={title} className="space-y-1.5">
                <p className="text-[9.5px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: tone === 0 ? "rgba(148,163,184,0.4)" : divergingColor(tone), marginRight: 6 }} />{title} ({items.length})
                </p>
                {items.length === 0 && <p className="text-[10px] italic" style={muted}>Không có ngành.</p>}
                {items.map((m) => <MediumCard key={m.icb} r={m} onOpen={setOpen} />)}
              </div>
            );
          })}
        </div>
      </Card>
      <p className="text-[9px] leading-relaxed" style={muted}>{data.method.shortVi} {data.method.mediumVi} Tham khảo — không phải khuyến nghị đầu tư.</p>
      {row && <WorldSectorDrawer icb={row.icb} row={row} onClose={() => setOpen(null)} />}
    </div>
  );
}
