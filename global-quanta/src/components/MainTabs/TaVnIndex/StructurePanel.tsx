"use client";
// Bảng Cấu trúc MTF v2 (bám đúng tài liệu gốc "cấu trúc thị trường"), bố cục theo chuẩn Pattern Scanner v2:
//   thẻ chỉ số → mô phỏng trên giá thật (ghim theo nến) + sơ đồ chu kỳ theo tài liệu → lợi thế kỹ thuật · vòng đời giai đoạn ·
//   mẫu hình & vị trí → kế hoạch theo tài liệu (R:R tại giá hiện tại, 2 kịch bản, hộp rủi ro) · kiểm định đặt trước MTF v2
//   → dự báo / sổ thực tế / giải thích. Kết luận hiển thị bằng LỜI MÔ TẢ khi kiểm định chưa đạt (MTF-v2-prereg.md).
// Di động: thẻ chỉ số + kết luận trước, các phần còn lại xếp một cột.
import { useMemo, useState } from "react";
import RibbonStrip from "./mtf3/RibbonStrip";
import StructureFrames from "./mtf3/StructureFrames";
import ElliottConfluence from "./mtf3/ElliottConfluence";
import { useStructure3 } from "../../../hooks/useStructure3";
import { ShieldAlert, ShieldCheck, Layers3, History, ChevronLeft, ChevronRight, Check, X, Minus } from "lucide-react";
import type { EvidenceLabel, StructureDoc, StructureLedgerStats, StructureMomentumStats, StructureStage, StructureStat, StructureStatPair, StructureTfKey, StructureTransition } from "../../../hooks/useStructure";
import { STAGE_SHORT, STAGE_TONE, VERDICT_TONE, useStructureSummary, verdictText } from "../../../hooks/useStructure";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";
import { openChartWithStructure } from "./StructureCells";
import { STRUCTURE_MODES, fmtPrice, type StructureMode } from "../../../lib/ta-command-center/chart/structureScene";
import { Card, Tile } from "./ScreenerDeepPanel";
import StructureSketch from "./StructureSketch";
import StructureSchematic from "./StructureSchematic";

const TONE_CLS = { bull: "text-emerald-400", bear: "text-rose-400", warn: "text-amber-300", neutral: "text-cyan-300" } as const;
const TONE_BG = { bull: "rgba(0,245,160,0.08)", bear: "rgba(255,0,85,0.08)", warn: "rgba(255,176,32,0.08)", neutral: "rgba(34,211,238,0.06)" } as const;
const STAGE_BAR: Record<StructureStage, string> = {
  A: "#16a34a", UP: "#00F5A0", B: "#22c55e", C: "#F59E0B", D: "#FF0055", DOWN: "#BE123C", Bp: "#FB923C", RANGE: "#475569",
};
const TF_NAME: Record<StructureTfKey, string> = { W: "Tuần", D: "Ngày", H1: "1 giờ" };
const vi = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pctS = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${vi(Math.abs(v))}%`);
const ciS = (s?: StructureStat) => (s?.ci ? `[${pctS(s.ci[0])}; ${pctS(s.ci[1])}]` : "");
const VERDICT_VI: Record<string, string> = { PASS: "ĐẠT", FAIL: "KHÔNG ĐẠT", FAIL_FDR: "KHÔNG ĐẠT (FDR)", INSUFFICIENT: "THIẾU MẪU" };
const TEST_NAME: Record<string, string> = {
  V1: "L khung 1 giờ (10 phiên, sau phí)", V2: "L + cổng R:R ≥ 1", V3: "L khung ngày (20 phiên)", V4: "Vào B tái tích lũy (20 phiên)", V5: "S khung ngày (kỳ vọng âm)",
};

export function EvidenceChip({ label, title }: { label: EvidenceLabel | string | undefined; title?: string }) {
  const ok = label === "ĐÃ KIỂM ĐỊNH";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold ${ok ? "text-emerald-300 bg-emerald-500/10" : "text-amber-300 bg-amber-500/10"}`}
      title={title ?? (ok ? "Đạt kiểm định ngoài mẫu đặt trước (MTF-v2-prereg)" : "Chưa đạt / đang kiểm định — chỉ hiển thị, không dùng xếp hạng")}>
      {ok ? <ShieldCheck className="w-2.5 h-2.5" /> : <ShieldAlert className="w-2.5 h-2.5" />}{label ?? "—"}
    </span>
  );
}

/** Dải thời gian giai đoạn của từng khung (độ rộng theo số nến), giai đoạn hiện tại có nhãn + tuổi. */
export function MtfTimeline({ doc }: { doc: StructureDoc }) {
  return (
    <div className="space-y-1.5" data-testid="structure-timeline">
      {doc.timeline.map((row) => {
        const segs = (doc.tfs[row.tf]?.segments ?? row.segments).slice(-14);
        const tf = doc.tfs[row.tf];
        const weights = segs.map((s) => Math.max(1, s.bars ?? 1));
        const total = weights.reduce((a, b) => a + b, 0);
        return (
          <div key={row.tf} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[9px] font-bold text-slate-400">{TF_NAME[row.tf]}</span>
            <div className="flex-1 flex h-4 rounded overflow-hidden bg-slate-900/70" role="img" aria-label={`Giai đoạn khung ${TF_NAME[row.tf]}`}>
              {segs.map((s, i) => (
                <div key={`${s.from}-${i}`} title={`${s.label}: ${s.from} → ${s.to}`} style={{ width: `${(weights[i] / total) * 100}%`, background: STAGE_BAR[s.stage], opacity: i === segs.length - 1 ? 0.95 : 0.35 }} />
              ))}
            </div>
            <span className={`w-28 shrink-0 text-[9px] font-bold truncate ${TONE_CLS[STAGE_TONE[tf?.stage ?? "RANGE"]]}`}>
              {tf ? `${STAGE_SHORT[tf.stage]} · ${tf.stageAge} nến` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Hộp rủi ro: số cổ phiếu = min(rủi ro% × vốn / (giá vào − cắt lỗ), trần% × vốn / giá vào) × hệ số tỷ trọng R7, làm tròn lô 100. */
export function positionSize(nav: number, entry: number, stop: number, { riskPct = 0.05, capPct = 0.25, sizeMult = 1 } = {}) {
  if (!(nav > 0) || !(entry > stop) || !(stop > 0)) return null;
  const byRisk = (nav * riskPct) / (entry - stop);
  const byCap = (nav * capPct) / entry;
  const shares = Math.floor((Math.min(byRisk, byCap) * sizeMult) / 100) * 100;
  return { shares, value: shares * entry, pctNav: (shares * entry) / nav, riskValue: shares * (entry - stop), capped: byCap < byRisk };
}

function RiskBox({ doc, entry, stop, validated }: { doc: StructureDoc; entry: number | null; stop: number | null; validated: boolean }) {
  const [nav, setNav] = useState(100_000_000);
  const sz = entry != null && stop != null ? positionSize(nav, entry, stop, { sizeMult: doc.align.sizeMult }) : null;
  const buyable = doc.align.verdict === "MUA" || doc.align.verdict === "CHỜ MUA";
  return (
    <div className="rounded-md bg-slate-900/60 border border-slate-800/70 p-2 space-y-1" data-testid="structure-risk">
      <div className="text-[8.5px] uppercase tracking-wide text-slate-500">Hộp rủi ro · rủi ro 5% vốn / lệnh · trần 25% vốn / mã</div>
      <label className="flex items-center gap-2 text-[10px] text-slate-400">
        Vốn (đ)
        <input type="number" min={0} step={10_000_000} value={nav} onChange={(e) => setNav(Number(e.target.value) || 0)}
          className="flex-1 min-w-0 bg-slate-950/70 border border-slate-700/60 rounded px-2 py-0.5 text-slate-200 font-mono text-[11px]" />
      </label>
      {entry != null && stop != null && sz ? (
        <div className="text-[10px] text-slate-300 leading-relaxed">
          <b className="text-slate-100 font-mono">{sz.shares.toLocaleString("vi-VN")} cp</b> ≈ {Math.round(sz.value).toLocaleString("vi-VN")}đ ({vi(sz.pctNav * 100, 1)}% vốn)
          {sz.capped && <span className="text-amber-300"> · chạm trần 25%</span>}
          {doc.align.sizeMult < 1 && <span className="text-amber-300"> · ×{String(doc.align.sizeMult).replace(".", ",")} theo R7</span>}
          {" "}· lỗ tối đa ≈ {Math.round(sz.riskValue).toLocaleString("vi-VN")}đ
          {!buyable && <span className="block text-rose-300">Kết luận hiện tại là “{verdictText(doc.align.verdict, validated)}” — kích thước chỉ để tham khảo.</span>}
        </div>
      ) : <div className="text-[10px] text-slate-500">Chưa có điểm vào / cắt lỗ hợp lệ.</div>}
    </div>
  );
}

export interface ReplayControl { index: number | null; min: number; max: number; date: string | null; available: boolean; onChange: (i: number | null) => void }

/** Thanh phát lại: chọn phiên trong quá khứ, cấu trúc tính lại chỉ với dữ liệu tới phiên đó (không nhìn trước). */
function ReplayBar({ r }: { r: ReplayControl }) {
  if (!r.available) return null;
  const on = r.index != null;
  const step = (k: number) => r.onChange(Math.min(r.max, Math.max(r.min, (r.index ?? r.max) + k)));
  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-lg px-2 py-1 ${on ? "bg-amber-500/10 border border-amber-400/30" : ""}`} data-testid="structure-replay">
      <button type="button" onClick={() => r.onChange(on ? null : Math.max(r.min, r.max - 60))} aria-pressed={on}
        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${on ? "text-amber-200 border-amber-400/50" : "text-slate-400 border-slate-700/60"}`}
        title="Xem cấu trúc như tại một phiên trong quá khứ rồi đối chiếu với diễn biến thực tế phía sau">
        <History className="w-3 h-3" /> {on ? "Thoát phát lại" : "Phát lại"}
      </button>
      {on && (
        <>
          <button type="button" onClick={() => step(-1)} aria-label="Lùi 1 phiên" className="text-amber-200"><ChevronLeft className="w-3.5 h-3.5" /></button>
          <input type="range" min={r.min} max={r.max} value={r.index ?? r.max} onChange={(e) => r.onChange(Number(e.target.value))}
            aria-label="Chọn phiên phát lại" className="w-32 sm:w-56 accent-amber-400" />
          <button type="button" onClick={() => step(1)} aria-label="Tiến 1 phiên" className="text-amber-200"><ChevronRight className="w-3.5 h-3.5" /></button>
          <span className="text-[10px] font-mono text-amber-200">{r.date}</span>
          <span className="text-[9px] text-slate-500">· chỉ dùng dữ liệu tới phiên này</span>
        </>
      )}
    </div>
  );
}

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(0)}%`);

/** Sổ dự báo thực tế (T6): độ phủ nón 5/10/20 phiên so với mục tiêu 80%, α của ACI, lợi suất 10 phiên theo kết luận. */
function LedgerCard({ ledger, validated }: { ledger: StructureLedgerStats | null; validated: boolean }) {
  if (!ledger) return <p className="text-[10px] text-slate-500">Sổ dự báo bắt đầu ghi từ phiên đầu tiên sau khi triển khai (job 15:47); điểm đầu tiên sau 5 phiên.</p>;
  return (
    <div className="space-y-1.5" data-testid="structure-ledger">
      <table className="w-full text-[10px] font-mono">
        <thead><tr className="text-slate-500"><th className="text-left font-normal">Kỳ hạn</th><th className="text-right font-normal">Độ phủ thực</th><th className="text-right font-normal">Số dự báo</th><th className="text-right font-normal">α ACI</th></tr></thead>
        <tbody>
          {Object.entries(ledger.coverage).map(([h, c]) => (
            <tr key={h} className="text-slate-300">
              <td>{h} phiên</td>
              <td className={`text-right ${c.coverage == null ? "" : Math.abs(c.coverage - ledger.target) <= 0.05 ? "text-emerald-300" : "text-amber-300"}`}>{pct(c.coverage)}</td>
              <td className="text-right">{c.forecasts}</td><td className="text-right">{c.alpha != null ? c.alpha.toFixed(3).replace(".", ",") : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[9px] text-slate-500">Mục tiêu độ phủ {pct(ledger.target)}. ACI (Gibbs &amp; Candès) tự nới / thu hẹp nón theo độ phủ thực tế.</p>
      {Object.keys(ledger.verdicts).length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-[9px]">
          {Object.entries(ledger.verdicts).map(([v, s]) => (
            <span key={v} className="px-1.5 py-0.5 rounded bg-slate-900/70 text-slate-300">{verdictText(v as StructureDoc["align"]["verdict"], validated)}: {s.meanRet10 != null ? `${(s.meanRet10 * 100).toFixed(2).replace(".", ",")}%` : "—"} <span className="text-slate-500">/ 10 phiên · n={s.n}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cảnh báo chuyển giai đoạn khung Ngày của phiên gần nhất (toàn universe). Bấm mã -> mở biểu đồ với cấu trúc. */
function Transitions({ list, asOf, onOpenChart, validated }: { list: StructureTransition[]; asOf: string; onOpenChart?: (t: string) => void; validated: boolean }) {
  const key = list.filter((x) => x.to === "UP" || x.to === "A" || x.to === "B" || x.to === "D" || x.to === "DOWN");
  if (!key.length) return <p className="text-[10px] text-slate-500">Phiên {asOf}: không có mã chuyển sang Tăng / MỘT / Tái tích lũy / Đảo chiều / Giảm.</p>;
  return (
    <div className="flex flex-wrap gap-1" data-testid="structure-transitions">
      {key.slice(0, 40).map((x) => (
        <button key={x.t} type="button" onClick={() => onOpenChart && openChartWithStructure(x.t, onOpenChart)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${x.to === "UP" || x.to === "A" || x.to === "B" ? "text-emerald-300 border-emerald-500/30" : "text-rose-300 border-rose-500/30"}`}
          title={`${x.t}: ${x.from ? STAGE_SHORT[x.from] : "—"} → ${STAGE_SHORT[x.to]} · ${verdictText(x.v, validated)}`}>
          {x.t} <span className="font-normal opacity-80">{x.from ? STAGE_SHORT[x.from] : "—"} → {STAGE_SHORT[x.to]}</span>
        </button>
      ))}
    </div>
  );
}

/** Sổ thời gian thực M1 — "đà tăng tiếp diễn": tiến độ tới mốc 120 phiên chấm, TB chênh lệch BẬT − TẮT và KTC khối. */
function MomentumLedgerCard({ m, inOnGroup }: { m: StructureMomentumStats | null; inOnGroup: boolean }) {
  if (!m) return <p className="text-[9px] text-slate-500">Sổ “đà tăng tiếp diễn” bắt đầu ghi ở job 15:47 phiên đầu tiên sau triển khai.</p>;
  const prog = Math.min(1, m.scoredDays / m.minDays);
  const tone = m.verdict === "PASS" ? "text-emerald-300" : m.verdict === "FAIL" ? "text-rose-300" : "text-amber-300";
  return (
    <div className="rounded-md p-2 space-y-1" style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.18)" }} data-testid="structure-momentum-ledger">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9.5px] font-bold text-amber-200">Sổ thời gian thực · M1 “Đà tăng tiếp diễn”</span>
        <span className={`text-[8.5px] font-bold ${tone}`} data-testid="structure-momentum-label">{m.label}</span>
      </div>
      <p className="text-[9px] text-slate-400 leading-snug">Mỗi phiên, trong các mã giai đoạn ngày Tăng / B: nhóm có cờ Quá đà so với nhóm không có — lợi suất vượt trội 20 phiên kế tiếp (mở cửa phiên sau). Đặt trước, chỉ chấm dữ liệu từ {m.firstDay ?? "phiên đầu tiên"}; chưa dùng vào kết luận.</p>
      <div className="h-1.5 rounded bg-slate-800 overflow-hidden" role="progressbar" aria-valuenow={m.scoredDays} aria-valuemax={m.minDays} aria-label="Tiến độ sổ"><div className="h-full bg-amber-400/70" style={{ width: `${prog * 100}%` }} /></div>
      <div className="text-[9px] text-slate-300 font-mono">
        {m.scoredDays}/{m.minDays} phiên đã chấm · {m.pendingDays} phiên chờ đủ 20 phiên{m.lastGroup ? ` · hôm ${m.lastGroup.d}: ${m.lastGroup.on} mã BẬT / ${m.lastGroup.off} TẮT` : ""}
      </div>
      {m.scoredDays > 0 && (
        <div className="text-[9px] text-slate-300">BẬT − TẮT: <b className="font-mono">{pctS(m.meanS)}</b> {m.ciS ? <span className="text-slate-500">[{pctS(m.ciS[0])}; {pctS(m.ciS[1])}]</span> : null} · sau phí {pctS(m.meanL)} · {m.scoredDays < m.minDays ? "chưa đủ mẫu — không kết luận" : ""}</div>
      )}
      {inOnGroup && <p className="text-[9px] text-amber-300" data-testid="structure-momentum-in">Mã này hiện thuộc nhóm BẬT của sổ (quá đà trong xu hướng tăng).</p>}
    </div>
  );
}

function OkIcon({ ok }: { ok: boolean | null }) {
  if (ok == null) return <Minus className="w-3 h-3 text-slate-600 shrink-0" />;
  return ok ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />;
}

/** Một dòng thống kê lịch sử IS / OOS có KTC. */
function StatRow({ name, s, verdict }: { name: string; s?: StructureStatPair; verdict?: string }) {
  return (
    <tr className="text-slate-300 align-top">
      <td className="pr-1">{name}</td>
      <td className="text-right font-mono whitespace-nowrap">{s?.IS?.n ? pctS(s.IS.mean) : "—"}</td>
      <td className="text-right font-mono whitespace-nowrap">{s?.OOS?.n ? <>{pctS(s.OOS.mean)} <span className="text-slate-500 hidden sm:inline">{ciS(s.OOS)}</span></> : "—"}</td>
      <td className="text-right font-mono text-slate-500 hidden sm:table-cell pl-1">{s?.OOS?.n ?? 0}</td>
      {verdict !== undefined && <td className={`text-right font-bold whitespace-nowrap pl-1.5 ${verdict === "PASS" ? "text-emerald-300" : "text-rose-300"}`}>{VERDICT_VI[verdict] ?? verdict}</td>}
    </tr>
  );
}

interface Props {
  doc: StructureDoc | undefined; isLoading: boolean; error?: Error;
  mode: StructureMode; onModeChange: (m: StructureMode) => void; timeframeKey: StructureTfKey | null;
  replay?: ReplayControl; onOpenChart?: (ticker: string) => void;
  /** Nến của biểu đồ đang xem — để vẽ "mô phỏng trên giá thật" ghim đúng nến. */
  bars?: OhlcvBar[]; timeframe?: Timeframe;
}

export default function StructurePanel({ doc, isLoading, error, mode, onModeChange, timeframeKey, replay, onOpenChart, bars, timeframe }: Props) {
  const summary = useStructureSummary(true);
  const s3 = useStructure3(doc?.symbol ?? null);
  const ledger = summary.data?.ledger && !("error" in summary.data.ledger) ? summary.data.ledger : null;
  const momentum = summary.data?.momentum && !("error" in summary.data.momentum) ? summary.data.momentum : null;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const tfa = doc ? doc.tfs[timeframeKey ?? "D"] ?? doc.tfs.D : undefined;
  const narrative = useMemo(() => doc?.narrative ?? [], [doc]);
  if (error) return <div className="rounded-xl p-3 text-[11px] text-rose-300" style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(255,0,85,0.2)" }}>Không tải được cấu trúc: {error.message}</div>;
  if (!doc || !tfa) return <div className="rounded-xl p-3 text-[11px] text-slate-400" style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="structure-loading">{isLoading ? "Đang phân tích cấu trúc đa khung (SSI)…" : "Chưa có dữ liệu cấu trúc."}</div>;
  const v = doc.align;
  const validated = !!doc.evidence.verdictValidated;
  const tone = VERDICT_TONE[v.verdict];
  const checks = side === "buy" ? doc.checklist.buy : doc.checklist.sell;
  const score = side === "buy" ? doc.checklist.buyScore : doc.checklist.sellScore;
  const ev = doc.evidence.labels;
  const hist = doc.evidence.history ?? null;
  const day = doc.tfs.D;
  const h1 = doc.tfs.H1;
  const rr = tfa.rrNow ?? doc.rrNow ?? null;
  const ext = tfa.ext ?? 0;
  const curStat = hist?.stageTable?.[tfa.stage];
  const sketchOk = !!bars?.length && (timeframe === "D" || timeframe === "W" || timeframe === "1H");
  const L = doc.scenarios.find((s) => s.side === "L");
  const tfName = TF_NAME[tfa.tf];

  return (
    <div className="space-y-2 rounded-xl p-2.5" style={{ background: "linear-gradient(180deg, rgba(34,211,238,0.05), rgba(2,6,15,0.35))", border: "1px solid rgba(34,211,238,0.14)" }} data-testid="structure-panel">
      <header className="flex flex-wrap items-center gap-1.5">
        <Layers3 className="w-3.5 h-3.5 text-cyan-300" />
        <span className="text-[11px] font-bold text-slate-200 mr-1">Cấu trúc MTF v2</span>
        <span className="text-[9px] text-slate-500 mr-1">theo tài liệu gốc · MA 1H/4H × Granville × Dow</span>
        {STRUCTURE_MODES.map((m) => (
          <button key={m.key} type="button" onClick={() => onModeChange(m.key)} title={m.hint} aria-pressed={mode === m.key} data-structure-mode={m.key}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${mode === m.key ? "text-cyan-200 border-cyan-400/50 bg-cyan-500/10" : "text-slate-400 border-slate-700/60 bg-slate-900/50"}`}>
            {m.label}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-[9px] text-slate-500">
          <EvidenceChip label={ev.alignment} title={doc.evidence.summary ?? undefined} />
          SSI · {doc.dataSource.daily.priceBasis === "ADJUSTED_CUMULATIVE" ? "giá điều chỉnh cộng dồn" : doc.dataSource.daily.priceBasis} · {doc.asOf} · engine {doc.version}
        </span>
      </header>
      {s3.data?.ribbon?.context && replay?.index == null && <RibbonStrip ctx={s3.data.ribbon.context} />}
      {s3.data?.structure?.context && replay?.index == null && <StructureFrames ctx={s3.data.structure.context} />}
      {s3.data?.elliott && !("error" in s3.data.elliott) && replay?.index == null && <ElliottConfluence e={s3.data.elliott} />}
      {replay && <ReplayBar r={replay} />}
      {replay?.index != null && (
        <p className="text-[10px] text-amber-200/90 rounded-lg px-2 py-1 bg-amber-500/5" data-testid="structure-replay-note">
          Đang phát lại tại phiên {doc.asOf}: kết luận, bảng kiểm, kịch bản dưới đây là những gì hệ thống thấy LÚC ĐÓ (không có nón dự báo). Các nến sau đường “Phát lại” là diễn biến thực tế để đối chiếu.
        </p>
      )}

      {/* 1. Thẻ chỉ số */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5" data-testid="structure-tiles">
        <Tile label="Giai đoạn ngày" value={day ? STAGE_SHORT[day.stage] : "—"} sub={day ? `${day.stageAge} phiên · tuần: ${doc.context.week ? STAGE_SHORT[doc.context.week] : "—"}` : undefined}
          tone={day ? (STAGE_TONE[day.stage] === "bull" ? "up" : STAGE_TONE[day.stage] === "bear" ? "down" : undefined) : undefined} />
        <Tile label="Khung 1 giờ" value={h1 ? STAGE_SHORT[h1.stage] : "—"} sub={h1 ? `${h1.stageAge} tiết · MA 4 giờ = MA80 tiết` : doc.dataSource.h1.unavailable ?? "chưa có"}
          tone={h1 ? (STAGE_TONE[h1.stage] === "bull" ? "up" : STAGE_TONE[h1.stage] === "bear" ? "down" : undefined) : undefined} />
        <Tile label={validated ? "Kết luận" : "Kết luận (mô tả)"} value={verdictText(v.verdict, validated)} sub={`${v.rule} · ${v.cell}`} />
        <Tile label="R:R tại giá hiện tại" value={rr ? `1:${vi(rr.rr, 1)}` : "—"} sub={rr ? (rr.ok ? "giao dịch ổn (thưởng > rủi ro)" : "giao dịch NG (thưởng ≤ rủi ro)") : "giá dưới MA chân trên"} tone={rr ? (rr.ok ? "up" : "down") : undefined} />
        <Tile label="Lệch MA chân trên" value={tfa.dev != null ? `${vi(tfa.dev, 1)} ATR` : "—"} sub={ext > 0 ? "QUÁ ĐÀ — đang chấm M1 (sổ thực)" : ext < 0 ? "QUÁ ĐÀ GIẢM — không bán đuổi" : `ngưỡng quá đà ±3 ATR · ${tfName}`} />
        <Tile label="Lợi thế kỹ thuật" value={`${doc.checklist.buyScore}/${doc.checklist.buy.length}`} sub={`bán ${doc.checklist.sellScore}/${doc.checklist.sell.length}`} />
      </div>

      {/* 2. Kết luận + dải giai đoạn đa khung */}
      <div className="rounded-lg p-2.5 grid grid-cols-1 lg:grid-cols-3 gap-2" style={{ background: TONE_BG[tone], border: "1px solid rgba(148,163,184,0.1)" }} data-testid="structure-verdict">
        <div className="space-y-1">
          <div className="text-[9px] uppercase tracking-wide text-slate-400">Kết luận đa khung {validated ? "" : "· mô tả cấu trúc"}</div>
          <div className={`text-xl font-black ${TONE_CLS[tone]}`} data-testid="structure-verdict-text">{verdictText(v.verdict, validated)}</div>
          <div className="text-[10px] text-slate-300 leading-snug">{v.text}</div>
          {!validated && doc.evidence.status === "DONE" && (
            <p className="text-[9px] text-amber-300/90 leading-snug" data-testid="structure-verdict-warning">
              Kiểm định đặt trước MTF v2: chưa giả thuyết nào đạt — đây là MÔ TẢ cấu trúc theo tài liệu, không phải tín hiệu mua / bán.
            </p>
          )}
        </div>
        <div className="lg:col-span-2 self-center"><MtfTimeline doc={doc} /></div>
      </div>

      {/* 3. Mô phỏng trên giá thật + sơ đồ chu kỳ theo tài liệu */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        <Card title="Mô phỏng trên giá thật" className="lg:col-span-2" right={`${tfName} · ${tfa.stageLabel}`}>
          {sketchOk ? <StructureSketch bars={bars!} tf={tfa} timeframe={timeframe!} />
            : <p className="text-[10px] text-slate-500 py-8 text-center">Mô phỏng có ở khung Tuần / Ngày / 1 giờ — đổi khung biểu đồ để xem.</p>}
        </Card>
        <Card title="Sơ đồ chu kỳ theo tài liệu" right="MỘT → B → C → D">
          <StructureSchematic current={tfa.stage} stats={hist?.stageTable ?? null} />
          <p className="mt-1 text-[9.5px] text-slate-300 leading-snug" data-testid="structure-stage-text"><b className={TONE_CLS[STAGE_TONE[tfa.stage]]}>{tfa.stageLabel}:</b> {tfa.stageText}</p>
          {curStat?.OOS?.n ? (
            <p className={`mt-1 text-[9px] leading-snug ${(curStat.OOS.mean ?? 0) > 0 ? "text-emerald-300/90" : "text-rose-300/90"}`} data-testid="structure-stage-history">
              Lịch sử khung ngày (ngoài mẫu 2025–2026, VN100): sau giai đoạn này lợi suất vượt trội TB 20 phiên {pctS(curStat.OOS.mean)} {ciS(curStat.OOS)}, n = {curStat.OOS.n.toLocaleString("vi-VN")} — mô tả, không phải dự báo.
            </p>
          ) : null}
        </Card>
      </div>

      {/* 4. Lợi thế kỹ thuật · vòng đời · mẫu hình */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Card title="Lợi thế kỹ thuật" right={<span className="flex items-center gap-1">{score}/{checks.length}
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSide(s)} aria-pressed={side === s}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${side === s ? (s === "buy" ? "text-emerald-300 bg-emerald-500/15" : "text-rose-300 bg-rose-500/15") : "text-slate-500"}`}>
              {s === "buy" ? "Mua" : "Bán"}
            </button>
          ))}</span>}>
          <ul className="space-y-0.5 text-[10px]" data-testid="structure-checklist">
            {checks.map((c) => <li key={c.key} className="flex items-start gap-1.5"><OkIcon ok={c.ok} /><span className={c.ok ? "text-slate-200" : "text-slate-500"}>{c.text}</span></li>)}
          </ul>
        </Card>
        <Card title="Vòng đời giai đoạn" right={tfName}>
          <ol className="space-y-0.5 text-[10px]" data-testid="structure-lifecycle">
            {tfa.segments.slice(-7).map((s, i, arr) => (
              <li key={`${s.from}-${i}`} className="flex gap-2">
                <span className="font-mono text-slate-500 w-[74px] shrink-0 truncate">{s.from.slice(0, 16)}</span>
                <span className={`${i === arr.length - 1 ? "font-bold" : ""} ${TONE_CLS[STAGE_TONE[s.stage]]}`}>{s.label}</span>
                <span className="ml-auto text-slate-500 font-mono">{s.bars ?? ""}</span>
              </li>
            ))}
          </ol>
          {doc.stageOdds && (
            <div className="mt-1 text-[9px] text-slate-400 leading-snug" data-testid="structure-stage-odds">
              <p>
                Xác suất chuyển pha · khung ngày {STAGE_SHORT[doc.stageOdds.stage]} đã {doc.stageOdds.age} phiên{doc.stageOdds.typical && ` (thời lượng điển hình ${doc.stageOdds.typical.median}, 75% ≤ ${doc.stageOdds.typical.p75})`}
                {" · "}<EvidenceChip label={doc.stageOdds.label} title="Kết quả T3/HMM về chuyển trạng thái, không phải xác suất sinh lời hay xác suất thắng giao dịch." />
              </p>
              <p className="mt-0.5">
                P(chuyển sang tăng trong ≤ {doc.stageOdds.horizon ?? 10} phiên): <b className="text-emerald-300">{doc.stageOdds.up != null && Number.isFinite(doc.stageOdds.up) ? `${Math.round(doc.stageOdds.up * 100)}%` : "—"}</b>
                {" · "}P(chuyển sang giảm trong ≤ {doc.stageOdds.horizon ?? 10} phiên): <b className="text-rose-300">{doc.stageOdds.down != null && Number.isFinite(doc.stageOdds.down) ? `${Math.round(doc.stageOdds.down * 100)}%` : "—"}</b>
              </p>
              <p className="mt-0.5 text-slate-500">Đây là xác suất của hai sự kiện chuyển pha riêng, không phải hai phía cộng thành 100%; không dự báo trực tiếp lợi suất và không phải khuyến nghị giao dịch.</p>
            </div>
          )}
          <p className="mt-1 text-[8.5px] text-slate-500">Đoạn đã kết thúc ngắn hơn {tfa.tf === "H1" ? 8 : tfa.tf === "D" ? 5 : 3} nến được gộp để dễ đọc (như tài liệu); giai đoạn hiện tại luôn là trạng thái thực.</p>
        </Card>
        <Card title="Mẫu hình & vị trí" right={`${tfa.patterns.filter((p) => p.status !== "failed").length} mẫu`}>
          <ul className="space-y-1 text-[10px]" data-testid="structure-patterns">
            {tfa.patterns.slice(-4).reverse().map((p) => (
              <li key={`${p.type}${p.confirmedDate}`} className="leading-snug">
                <span className={`font-bold ${p.dir === 1 ? "text-emerald-300" : "text-rose-300"}`}>{p.name}</span>
                <span className="text-slate-400"> · {p.status === "confirmed" ? `phá cổ ${p.breakDate?.slice(0, 16)}` : p.status === "forming" ? "đang hình thành" : "hết hạn"}</span>
                {p.contextLabel && <span className={`ml-1 px-1 rounded text-[8.5px] ${p.context === "countertrend" ? "bg-amber-500/15 text-amber-300" : "bg-slate-700/40 text-slate-300"}`} title={p.contextText}>{p.contextLabel}</span>}
                <span className="block text-slate-500">mục tiêu đo theo chiều cao {fmtPrice(p.target)}{p.followDate ? ` · thành công (giá vượt hẳn MA, MA đổi hướng) ${p.followDate.slice(0, 16)}` : ""}</span>
              </li>
            ))}
            {!tfa.patterns.length && <li className="text-slate-500">Chưa có mẫu W / M / vai–đầu–vai trên sóng trung.</li>}
          </ul>
          {hist?.patternContext && (
            <p className="mt-1 text-[8.5px] text-slate-500 leading-snug">Lịch sử mẫu đáy phá cổ (ngày, ngoài mẫu): tái tích lũy {pctS(hist.patternContext.reaccum.OOS.mean)} (n {hist.patternContext.reaccum.OOS.n}) · đảo chiều {pctS(hist.patternContext.reversal.OOS.mean)} (n {hist.patternContext.reversal.OOS.n}) / 20 phiên sau phí.</p>
          )}
        </Card>
      </div>

      {/* 5. Kế hoạch theo tài liệu + kiểm định đặt trước */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <Card title="Kế hoạch theo tài liệu" right={rr ? (rr.ok ? "giao dịch ổn" : "giao dịch NG") : undefined}>
          {rr ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 text-[10px]" data-testid="structure-plan">
              <dt className="text-slate-500">Nếu mua ở giá hiện tại ({tfName})</dt><dd className="text-right font-mono text-slate-200">{fmtPrice(rr.entry)}</dd>
              <dt className="text-slate-500">Cắt lỗ (đáy sóng nhỏ gần nhất − 0,2 ATR)</dt><dd className="text-right font-mono text-rose-300">{fmtPrice(rr.stop)}</dd>
              <dt className="text-slate-500">Mục tiêu ({rr.targetBasis === "3R" ? "3R — phía trên chưa có đỉnh sóng lớn" : "đỉnh sóng lớn gần nhất"})</dt><dd className="text-right font-mono text-emerald-300">{fmtPrice(rr.target)}</dd>
              <dt className="text-slate-500">Phần thưởng / rủi ro</dt><dd className={`text-right font-mono font-bold ${rr.ok ? "text-emerald-300" : "text-amber-300"}`}>1:{vi(rr.rr, 2)}</dd>
            </dl>
          ) : <p className="text-[10px] text-slate-500">Giá đang dưới MA chân trên hoặc chưa có đáy sóng nhỏ — tài liệu không tính R:R mua ở đây.</p>}
          <div className="mt-1.5 space-y-1">
            {doc.scenarios.map((s) => (
              <div key={s.side} className="text-[10px] leading-snug" data-testid={`structure-scenario-${s.side}`}>
                <span className={`font-bold ${s.side === "L" ? "text-emerald-300" : "text-rose-300"}`}>{s.title}</span>
                {s.rr != null && <span className="text-slate-500 font-mono"> · R:R {vi(s.rr, 2)}</span>}
                <p className="text-slate-300">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-1.5"><RiskBox doc={doc} entry={rr?.entry ?? L?.entry ?? null} stop={rr?.stop ?? L?.stop ?? null} validated={validated} /></div>
        </Card>
        <Card title="Kiểm định đặt trước (MTF v2)" right={doc.evidence.ranAt ? `chạy ${doc.evidence.ranAt} · ${doc.evidence.period?.symbolsDaily ?? "—"} mã` : undefined}>
          {hist ? (
            <div className="space-y-1.5" data-testid="structure-validation">
              <table className="w-full text-[9.5px]">
                <thead><tr className="text-slate-500"><th className="text-left font-normal">Giả thuyết</th><th className="text-right font-normal">Trong mẫu</th><th className="text-right font-normal">Ngoài mẫu [KTC]</th><th className="text-right font-normal hidden sm:table-cell">n</th><th className="text-right font-normal">Kết quả</th></tr></thead>
                <tbody>{(["V1", "V2", "V3", "V4", "V5"] as const).map((k) => <StatRow key={k} name={`${k} · ${TEST_NAME[k]}`} s={hist.tests[k]} verdict={doc.evidence.verdicts[k]} />)}</tbody>
              </table>
              {hist.ext && (
                <p className="text-[9px] text-slate-400 leading-snug" data-testid="structure-ext-history">
                  Cờ <b className="text-amber-300">Quá đà</b> (giai đoạn tăng / B): bật {pctS(hist.ext.on.OOS.mean)} {ciS(hist.ext.on.OOS)} · tắt {pctS(hist.ext.off.OOS.mean)} / 20 phiên ngoài mẫu
                  — ở cổ phiếu VN, giá lệch xa MA thường còn tăng tiếp; tài liệu khuyên “không mua đuổi” nhưng dữ liệu chưa ủng hộ việc bán vì quá đà.
                </p>
              )}
              <p className="text-[9px] text-amber-200/80 leading-snug" data-testid="structure-evidence-summary">{doc.evidence.summary}</p>
              <MomentumLedgerCard m={momentum} inOnGroup={!!day && (day.ext ?? 0) > 0 && (day.stage === "UP" || day.stage === "B")} />
              {doc.evidence.previous && <p className="text-[8.5px] text-slate-500">Lần trước: engine {doc.evidence.previous.engine} ({doc.evidence.previous.ranAt}) — H1–H5 {Object.values(doc.evidence.previous.verdicts).every((x) => x !== "PASS") ? "đều không đạt" : "có thành phần đạt"}.</p>}
            </div>
          ) : <p className="text-[10px] text-slate-500">{doc.evidence.summary ?? "Chưa có kết quả kiểm định."}</p>}
        </Card>
      </div>

      {/* 6. Dự báo · sổ thực tế · giải thích */}
      <details className="rounded-lg p-2.5 space-y-2" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <summary className="flex items-center justify-between cursor-pointer list-none">
          <span className="text-[10px] font-bold text-slate-200">Dự báo · sổ dự báo thực tế · cảnh báo chuyển giai đoạn{summary.data ? ` · phiên ${summary.data.asOf}` : ""}</span>
          <EvidenceChip label={doc.cone?.label ?? (doc.evidence.status === "DONE" ? "THỰC NGHIỆM" : "ĐANG KIỂM ĐỊNH")} />
        </summary>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 pt-2">
          <div className="space-y-1">
            {doc.cone ? (
              <table className="w-full text-[10px] font-mono" data-testid="structure-cone">
                <thead><tr className="text-slate-500"><th className="text-left font-normal">Kỳ hạn</th><th className="text-right font-normal">P10</th><th className="text-right font-normal">P50</th><th className="text-right font-normal">P90</th></tr></thead>
                <tbody>{Object.entries(doc.cone.horizons).map(([h, c]) => <tr key={h} className="text-slate-300"><td>{h} phiên</td><td className="text-right text-rose-300">{fmtPrice(c.p10)}</td><td className="text-right">{fmtPrice(c.p50)}</td><td className="text-right text-emerald-300">{fmtPrice(c.p90)}</td></tr>)}</tbody>
              </table>
            ) : <p className="text-[10px] text-slate-500">{doc.evidence.coneNote ?? "Nón dự báo chỉ hiển thị khi đạt kiểm định độ phủ ngoài mẫu."}</p>}
            {doc.probability && (
              <p className="text-[10px] text-slate-300">Xác suất thắng (20 phiên, dừng 2 ATR / mục tiêu 3 ATR): <b className="font-mono">{doc.probability.value != null ? `${Math.round(doc.probability.value * 100)}%` : "—"}</b>
                {doc.probability.baseRate != null && <span className="text-slate-500"> · tỷ lệ nền {Math.round(doc.probability.baseRate * 100)}%</span>} <EvidenceChip label={doc.probability.label} /></p>
            )}
          </div>
          <LedgerCard ledger={ledger} validated={validated} />
          {summary.data ? <Transitions list={summary.data.transitions ?? []} asOf={summary.data.asOf} onOpenChart={onOpenChart} validated={validated} /> : <p className="text-[10px] text-slate-500">Chưa có bản tóm tắt cấu trúc toàn universe.</p>}
        </div>
      </details>
      <details className="rounded-lg p-2.5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <summary className="text-[10px] font-bold text-slate-200 cursor-pointer list-none">Giải thích cấu trúc · {tfa.stageLabel}</summary>
        <ul className="mt-1 space-y-0.5 text-[10px] text-slate-400 leading-snug list-disc pl-4" data-testid="structure-narrative">
          {narrative.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
        {doc.dataSource.h1.unavailable && <p className="text-[9px] text-amber-300/80">Khung 1 giờ: {doc.dataSource.h1.unavailable}</p>}
        {doc.dataSource.daily.warnings.length > 0 && <p className="text-[9px] text-amber-300/80">{doc.dataSource.daily.warnings[0]}</p>}
      </details>
    </div>
  );
}
