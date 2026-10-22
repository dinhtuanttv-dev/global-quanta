"use client";
// Bảng quyết định Cấu trúc MTF (T5): kết luận theo ma trận R1–R7, dải thời gian giai đoạn Tuần / Ngày / 1 giờ, bảng kiểm 8 mục,
// 2 kịch bản, hộp rủi ro (rủi ro 5% vốn / lệnh, trần 25% vốn / mã), nón dự báo + xác suất (chỉ khi đã kiểm định), giải thích tiếng Việt.
// Di động: thẻ kết luận trước, các phần còn lại thu gọn (mở như bảng trượt).
import { useMemo, useState } from "react";
import { ShieldAlert, ShieldCheck, Layers3, History, ChevronLeft, ChevronRight } from "lucide-react";
import type { StructureDoc, StructureStage, StructureTfKey, EvidenceLabel, StructureLedgerStats, StructureTransition } from "../../../hooks/useStructure";
import { STAGE_SHORT, STAGE_TONE, VERDICT_TONE, useStructureSummary } from "../../../hooks/useStructure";
import { openChartWithStructure } from "./StructureCells";
import { STRUCTURE_MODES, fmtPrice, type StructureMode } from "../../../lib/ta-command-center/chart/structureScene";

const TONE_CLS = { bull: "text-emerald-400", bear: "text-rose-400", warn: "text-amber-300", neutral: "text-cyan-300" } as const;
const TONE_BG = { bull: "rgba(0,245,160,0.10)", bear: "rgba(255,0,85,0.10)", warn: "rgba(255,176,32,0.10)", neutral: "rgba(34,211,238,0.08)" } as const;
const STAGE_BAR: Record<StructureStage, string> = {
  A: "#22D3EE", UP: "#00F5A0", B: "#FFB020", C: "#F59E0B", D: "#FF0055", DOWN: "#BE123C", Bp: "#FB923C", RANGE: "#475569",
};
const TF_NAME: Record<StructureTfKey, string> = { W: "Tuần", D: "Ngày", H1: "1 giờ" };

export function EvidenceChip({ label }: { label: EvidenceLabel | string | undefined }) {
  const ok = label === "ĐÃ KIỂM ĐỊNH";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold ${ok ? "text-emerald-300 bg-emerald-500/10" : "text-amber-300 bg-amber-500/10"}`}
      title={ok ? "Đạt kiểm định ngoài mẫu đặt trước (MTF-prereg)" : "Chưa đạt / đang kiểm định — chỉ hiển thị, không dùng xếp hạng"}>
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

function RiskBox({ doc }: { doc: StructureDoc }) {
  const [nav, setNav] = useState(100_000_000);
  const L = doc.scenarios.find((s) => s.side === "L");
  const sz = L ? positionSize(nav, L.entry, L.stop, { sizeMult: doc.align.sizeMult }) : null;
  const buyable = doc.align.verdict === "MUA" || doc.align.verdict === "CHỜ MUA";
  return (
    <div className="rounded-lg bg-slate-900/60 border border-slate-800/70 p-2.5 space-y-1.5" data-testid="structure-risk">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">Hộp rủi ro · rủi ro 5% vốn / lệnh · trần 25% vốn / mã</div>
      <label className="flex items-center gap-2 text-[10px] text-slate-400">
        Vốn (đ)
        <input type="number" min={0} step={10_000_000} value={nav} onChange={(e) => setNav(Number(e.target.value) || 0)}
          className="flex-1 min-w-0 bg-slate-950/70 border border-slate-700/60 rounded px-2 py-1 text-slate-200 font-mono text-[11px]" />
      </label>
      {L && sz ? (
        <div className="text-[10px] text-slate-300 leading-relaxed">
          Vào {fmtPrice(L.entry)} · cắt lỗ {fmtPrice(L.stop)} ({(((L.entry - L.stop) / L.entry) * 100).toFixed(1).replace(".", ",")}%)
          <br />
          <b className="text-slate-100 font-mono">{sz.shares.toLocaleString("vi-VN")} cp</b> ≈ {Math.round(sz.value).toLocaleString("vi-VN")}đ ({(sz.pctNav * 100).toFixed(1).replace(".", ",")}% vốn)
          {sz.capped && <span className="text-amber-300"> · chạm trần 25%</span>}
          {doc.align.sizeMult < 1 && <span className="text-amber-300"> · ×{doc.align.sizeMult.toString().replace(".", ",")} theo R7</span>}
          <br />
          Lỗ tối đa nếu chạm cắt lỗ ≈ {Math.round(sz.riskValue).toLocaleString("vi-VN")}đ
          {!buyable && <span className="block text-rose-300 mt-1">Kết luận hiện tại là “{doc.align.verdict}” — kích thước chỉ để tham khảo, chưa phải điểm mua.</span>}
        </div>
      ) : <div className="text-[10px] text-slate-500">Chưa có kịch bản tăng hợp lệ.</div>}
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
function LedgerCard({ ledger }: { ledger: StructureLedgerStats | null }) {
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
            <span key={v} className="px-1.5 py-0.5 rounded bg-slate-900/70 text-slate-300">{v}: {s.meanRet10 != null ? `${(s.meanRet10 * 100).toFixed(2).replace(".", ",")}%` : "—"} <span className="text-slate-500">/ 10 phiên · n={s.n}</span></span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Cảnh báo chuyển giai đoạn khung Ngày của phiên gần nhất (toàn universe). Bấm mã -> mở biểu đồ với cấu trúc. */
function Transitions({ list, asOf, onOpenChart }: { list: StructureTransition[]; asOf: string; onOpenChart?: (t: string) => void }) {
  const key = list.filter((x) => x.to === "UP" || x.to === "A" || x.to === "D" || x.to === "DOWN");
  if (!key.length) return <p className="text-[10px] text-slate-500">Phiên {asOf}: không có mã chuyển sang Tăng / Tích lũy / Phá vỡ / Giảm.</p>;
  return (
    <div className="flex flex-wrap gap-1" data-testid="structure-transitions">
      {key.slice(0, 40).map((x) => (
        <button key={x.t} type="button" onClick={() => onOpenChart && openChartWithStructure(x.t, onOpenChart)}
          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${x.to === "UP" || x.to === "A" ? "text-emerald-300 border-emerald-500/30" : "text-rose-300 border-rose-500/30"}`}
          title={`${x.t}: ${x.from ? STAGE_SHORT[x.from] : "—"} → ${STAGE_SHORT[x.to]} · ${x.v}`}>
          {x.t} <span className="font-normal opacity-80">{x.from ? STAGE_SHORT[x.from] : "—"} → {STAGE_SHORT[x.to]}</span>
        </button>
      ))}
    </div>
  );
}

interface Props {
  doc: StructureDoc | undefined; isLoading: boolean; error?: Error;
  mode: StructureMode; onModeChange: (m: StructureMode) => void; timeframeKey: StructureTfKey | null;
  replay?: ReplayControl; onOpenChart?: (ticker: string) => void;
}

export default function StructurePanel({ doc, isLoading, error, mode, onModeChange, timeframeKey, replay, onOpenChart }: Props) {
  const summary = useStructureSummary(true);
  const ledger = summary.data?.ledger && !("error" in summary.data.ledger) ? summary.data.ledger : null;
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const tfa = doc ? doc.tfs[timeframeKey ?? "D"] ?? doc.tfs.D : undefined;
  const narrative = useMemo(() => doc?.narrative ?? [], [doc]);
  if (error) return <div className="rounded-xl p-3 text-[11px] text-rose-300" style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(255,0,85,0.2)" }}>Không tải được cấu trúc: {error.message}</div>;
  if (!doc) return <div className="rounded-xl p-3 text-[11px] text-slate-400" style={{ background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="structure-loading">{isLoading ? "Đang phân tích cấu trúc đa khung (SSI)…" : "Chưa có dữ liệu cấu trúc."}</div>;
  const v = doc.align;
  const tone = VERDICT_TONE[v.verdict];
  const checks = side === "buy" ? doc.checklist.buy : doc.checklist.sell;
  const score = side === "buy" ? doc.checklist.buyScore : doc.checklist.sellScore;
  const ev = doc.evidence.labels;
  const sec = "rounded-xl p-3 space-y-2";
  const secStyle = { background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.1)" };

  return (
    <div className="space-y-2" data-testid="structure-panel">
      {/* Chế độ hiển thị trên biểu đồ */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Layers3 className="w-3.5 h-3.5 text-cyan-300" />
        <span className="text-[10px] font-bold text-slate-300 mr-1">Cấu trúc MTF</span>
        {STRUCTURE_MODES.map((m) => (
          <button key={m.key} type="button" onClick={() => onModeChange(m.key)} title={m.hint} aria-pressed={mode === m.key} data-structure-mode={m.key}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition ${mode === m.key ? "text-cyan-200 border-cyan-400/50 bg-cyan-500/10" : "text-slate-400 border-slate-700/60 bg-slate-900/50"}`}>
            {m.label}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-slate-500">SSI · {doc.dataSource.daily.priceBasis === "ADJUSTED_CUMULATIVE" ? "giá điều chỉnh cộng dồn" : doc.dataSource.daily.priceBasis} · {doc.asOf}</span>
      </div>
      {replay && <ReplayBar r={replay} />}
      {replay?.index != null && (
        <p className="text-[10px] text-amber-200/90 rounded-lg px-2 py-1 bg-amber-500/5" data-testid="structure-replay-note">
          Đang phát lại tại phiên {doc.asOf}: kết luận, bảng kiểm, kịch bản dưới đây là những gì hệ thống thấy LÚC ĐÓ (không có nón dự báo). Các nến sau đường “Phát lại” là diễn biến thực tế để đối chiếu.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {/* 1. Kết luận (luôn hiện đầu tiên, kể cả di động) */}
        <div className={`${sec} lg:col-span-1`} style={{ ...secStyle, background: TONE_BG[tone] }} data-testid="structure-verdict">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] uppercase tracking-wide text-slate-400">Kết luận đa khung</span>
            <EvidenceChip label={ev.alignment} />
          </div>
          <div className={`text-2xl font-black ${TONE_CLS[tone]}`}>{v.verdict}</div>
          <div className="text-[10px] text-slate-300 leading-snug">{v.text}</div>
          <div className="text-[9px] text-slate-500 font-mono">{v.rule} · {v.cell}{v.sizeMult < 1 ? ` · tỷ trọng ×${String(v.sizeMult).replace(".", ",")}` : ""}</div>
          {ev.alignment !== "ĐÃ KIỂM ĐỊNH" && doc.evidence.status === "DONE" && (
            <p className="text-[9px] text-amber-300/90 leading-snug" data-testid="structure-verdict-warning">
              Kiểm định ngoài mẫu đặt trước: kết luận này KHÔNG có lợi thế sinh lời — chỉ dùng để mô tả cấu trúc, không phải tín hiệu mua/bán.
            </p>
          )}
          <MtfTimeline doc={doc} />
        </div>

        {/* 2. Bảng kiểm */}
        <details className={`${sec} group`} style={secStyle} open>
          <summary className="flex items-center justify-between cursor-pointer list-none">
            <span className="text-[10px] font-bold text-slate-200">Lợi thế kỹ thuật · {score}/{checks.length}</span>
            <span className="flex items-center gap-1">
              <EvidenceChip label={ev.checklist} />
              {(["buy", "sell"] as const).map((s) => (
                <button key={s} type="button" onClick={(e) => { e.preventDefault(); setSide(s); }} aria-pressed={side === s}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${side === s ? (s === "buy" ? "text-emerald-300 bg-emerald-500/15" : "text-rose-300 bg-rose-500/15") : "text-slate-500"}`}>
                  {s === "buy" ? "Mua" : "Bán"}
                </button>
              ))}
            </span>
          </summary>
          <ul className="space-y-1" data-testid="structure-checklist">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-1.5 text-[10px] leading-snug">
                <span className={c.ok ? "text-emerald-400" : "text-slate-600"}>{c.ok ? "✓" : "✗"}</span>
                <span className={c.ok ? "text-slate-200" : "text-slate-500"}>{c.text}</span>
              </li>
            ))}
          </ul>
        </details>

        {/* 3. Kịch bản + rủi ro */}
        <details className={sec} style={secStyle} open>
          <summary className="text-[10px] font-bold text-slate-200 cursor-pointer list-none">Hai kịch bản có điều kiện</summary>
          {doc.scenarios.map((s) => (
            <div key={s.side} className="text-[10px] leading-snug" data-testid={`structure-scenario-${s.side}`}>
              <span className={`font-bold ${s.side === "L" ? "text-emerald-300" : "text-rose-300"}`}>{s.title}</span>
              {s.rr != null && <span className="text-slate-500 font-mono"> · R:R {s.rr.toFixed(2).replace(".", ",")}</span>}
              <p className="text-slate-300">{s.text}</p>
            </div>
          ))}
          <RiskBox doc={doc} />
        </details>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
        {/* 4. Dự báo / xác suất */}
        <details className={sec} style={secStyle} open>
          <summary className="flex items-center justify-between cursor-pointer list-none">
            <span className="text-[10px] font-bold text-slate-200">Dự báo tương lai</span>
            <EvidenceChip label={doc.cone?.label ?? (doc.evidence.status === "DONE" ? "THỰC NGHIỆM" : "ĐANG KIỂM ĐỊNH")} />
          </summary>
          {doc.cone ? (
            <table className="w-full text-[10px] font-mono" data-testid="structure-cone">
              <thead><tr className="text-slate-500"><th className="text-left font-normal">Kỳ hạn</th><th className="text-right font-normal">P10</th><th className="text-right font-normal">P50</th><th className="text-right font-normal">P90</th></tr></thead>
              <tbody>
                {Object.entries(doc.cone.horizons).map(([h, c]) => (
                  <tr key={h} className="text-slate-300"><td>{h} phiên</td><td className="text-right text-rose-300">{fmtPrice(c.p10)}</td><td className="text-right">{fmtPrice(c.p50)}</td><td className="text-right text-emerald-300">{fmtPrice(c.p90)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-[10px] text-slate-500">{doc.evidence.coneNote ?? "Nón dự báo chỉ hiển thị khi đạt kiểm định độ phủ ngoài mẫu (T2)."}</p>}
          {doc.cone?.note && <p className="text-[9px] text-slate-500">{doc.cone.note}</p>}
          {doc.probability && (
            <div className="text-[10px] text-slate-300">
              Xác suất thắng (20 phiên, dừng 2 ATR / mục tiêu 3 ATR): <b className="font-mono">{doc.probability.value != null ? `${Math.round(doc.probability.value * 100)}%` : "—"}</b>
              {doc.probability.baseRate != null && <span className="text-slate-500"> · tỷ lệ nền {Math.round(doc.probability.baseRate * 100)}%</span>} <EvidenceChip label={doc.probability.label} />
            </div>
          )}
          {doc.stageOdds && (
            <div className="text-[10px] text-slate-300">
              Giai đoạn ngày {STAGE_SHORT[doc.stageOdds.stage]} đã {doc.stageOdds.age} phiên
              {doc.stageOdds.typical && <span className="text-slate-500"> (điển hình {doc.stageOdds.typical.median}, 75% ≤ {doc.stageOdds.typical.p75})</span>}
              {doc.stageOdds.up != null && <> · P(sang tăng ≤10 phiên) <b>{Math.round(doc.stageOdds.up * 100)}%</b> · P(sang giảm) <b>{Math.round((doc.stageOdds.down ?? 0) * 100)}%</b></>} <EvidenceChip label={doc.stageOdds.label} />
            </div>
          )}
        </details>

        {/* 4b. Sổ dự báo thực tế + chuyển giai đoạn */}
        <details className={`${sec} lg:col-span-3`} style={secStyle}>
          <summary className="flex items-center justify-between cursor-pointer list-none">
            <span className="text-[10px] font-bold text-slate-200">Sổ dự báo thực tế · cảnh báo chuyển giai đoạn{summary.data ? ` · phiên ${summary.data.asOf}` : ""}</span>
          </summary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <LedgerCard ledger={ledger} />
            {summary.data ? <Transitions list={summary.data.transitions ?? []} asOf={summary.data.asOf} onOpenChart={onOpenChart} /> : <p className="text-[10px] text-slate-500">Chưa có bản tóm tắt cấu trúc toàn universe.</p>}
          </div>
        </details>

        {/* 5. Giải thích tiếng Việt */}
        <details className={`${sec} lg:col-span-2`} style={secStyle} open>
          <summary className="text-[10px] font-bold text-slate-200 cursor-pointer list-none">Giải thích cấu trúc{tfa ? ` · ${tfa.stageLabel}` : ""}</summary>
          {tfa && <p className="text-[10px] text-slate-300 leading-relaxed">{tfa.stageText}</p>}
          {doc.evidence.summary && <p className="text-[10px] text-amber-200/80 leading-relaxed rounded px-2 py-1 bg-amber-500/5" data-testid="structure-evidence-summary">{doc.evidence.summary}</p>}
          <ul className="space-y-0.5 text-[10px] text-slate-400 leading-snug list-disc pl-4" data-testid="structure-narrative">
            {narrative.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
          <div className="flex flex-wrap gap-1.5 pt-1 text-[9px] text-slate-500">
            <span>Giai đoạn tăng <EvidenceChip label={ev.stageUp} /></span>
            <span>Cảnh báo giảm <EvidenceChip label={ev.stageDown} /></span>
            <span>Mẫu đáy <EvidenceChip label={ev.patterns} /></span>
          </div>
          {doc.dataSource.h1.unavailable && <p className="text-[9px] text-amber-300/80">Khung 1 giờ: {doc.dataSource.h1.unavailable}</p>}
          {doc.dataSource.daily.warnings.length > 0 && <p className="text-[9px] text-amber-300/80">{doc.dataSource.daily.warnings[0]}</p>}
        </details>
      </div>
    </div>
  );
}
