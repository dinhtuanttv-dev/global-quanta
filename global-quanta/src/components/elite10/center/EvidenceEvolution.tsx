// EV-4 (27/11/2026) — các khối mới của tab 4 "Bằng chứng & sổ theo dõi": bảng điểm điều hành + đề xuất cần duyệt (tầng 1), nhãn SQS /
// xu hướng cho bảng E2 và ma trận IC theo chế độ thị trường (tầng 2), kỹ năng AI theo sổ ARL-v1 (tầng 4). CHỈ MÔ TẢ — không đổi bậc,
// trọng số hay quy tắc Elite HL; mọi đề xuất cần người duyệt và bản đăng ký trước.
import { useState } from "react";
import type { EvidenceEvolution, EvolutionSignal, MarketRegime, TrendTag } from "../../../lib/elite10/evolutionTypes";

const sgn = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const pct = (v: number | null | undefined) => (v == null ? "—" : `${sgn(v * 100, 2)}%`);

export const REGIME_VI: Record<MarketRegime | "UNKNOWN", string> = { UPTREND: "Xu hướng tăng", SIDEWAY: "Đi ngang", DOWNTREND: "Xu hướng giảm", UNKNOWN: "Chưa rõ" };
export const TAG_VI: Record<TrendTag, { label: string; tone: string; title: string }> = {
  PROVEN_LEADER: { label: "Đã chứng minh", tone: "border-emerald-400/50 text-emerald-300", title: "Bậc A/B, SQS ≥ 70, q (Benjamini–Hochberg) ≤ 0,05." },
  EMERGING: { label: "Ứng viên mới nổi", tone: "border-white/20 text-q-text", title: "10–59 ngày đo, IC dương, t ≥ 2, dương ở cả hai nửa. Chưa qua kiểm soát nhiều phép thử — chỉ theo dõi." },
  DECAYING: { label: "Suy giảm", tone: "border-amber-400/50 text-amber-200", title: "Bậc khởi điểm A/B nhưng đo lại: q > 0,15 hoặc IC 20 ngày gần nhất < ½ IC toàn kỳ." },
  INVERTED: { label: "Ngược chiều", tone: "border-rose-400/50 text-rose-300", title: "IC âm có ý nghĩa (t ≤ −2, ≥ 30 ngày) ở kỳ hạn 1 hoặc 5 phiên." },
  LOW_COVERAGE: { label: "Thiếu dữ liệu", tone: "border-slate-400/50 text-slate-300", title: "Đo được dưới 50% số ngày kỳ vọng — các nhãn khác chưa đáng tin." },
  NEUTRAL: { label: "Trung tính", tone: "border-white/10 text-slate-400", title: "Chưa đủ điều kiện nhãn nào." },
};

export function TrendChip({ tag }: { tag: TrendTag }) {
  const t = TAG_VI[tag];
  return <span title={t.title} className={`inline-block whitespace-nowrap rounded border px-1.5 text-[10px] ${t.tone}`}>{t.label}</span>;
}

/** Ô SQS + nhãn cho một dòng bảng E2. */
export function SqsCell({ s }: { s: EvolutionSignal | undefined }) {
  if (!s) return <td className="px-1 text-center text-[10px] text-slate-600">—</td>;
  const b = s.sqsBreakdown;
  return (
    <td className="px-1 py-1 text-center" data-testid={`tab4-sqs-${s.id}`}
      title={`SQS ${s.sqs}/100 = thống kê ${b.stat} + bền thời gian ${b.stability} + đa kỳ hạn ${b.horizon} + độ phủ ${b.coverage} · đo ${s.measured}/${s.expected} ngày`}>
      <b className="font-mono text-[11px] text-slate-100">{s.sqs}</b>
      <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-q-accent" style={{ width: `${s.sqs}%` }} /></span>
      <span className="mt-1 block"><TrendChip tag={s.trendTag} /></span>
    </td>
  );
}

function Kpi({ label, value, sub, testId }: { label: string; value: React.ReactNode; sub: React.ReactNode; testId: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5" data-testid={testId}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-slate-100">{value}</p>
      <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{sub}</p>
    </div>
  );
}

const PRIO: Record<string, string> = { HIGH: "text-rose-300", MEDIUM: "text-amber-200", INFO: "text-slate-400" };
const PRIO_VI: Record<string, string> = { HIGH: "Cao", MEDIUM: "Vừa", INFO: "Tin" };

/** Tầng 1: bảng điểm điều hành + đề xuất cần duyệt + hàng chờ đủ mẫu. */
export function EvolutionScorecard({ ev, error }: { ev: EvidenceEvolution | undefined; error?: unknown }) {
  const [allProps, setAllProps] = useState(false);
  if (!ev) return <p className="text-[11px] text-slate-500" data-testid="tab4-scorecard-empty">{error ? "Chưa tải được bảng điểm tiến hoá (Gateway chưa có hoặc đang dựng) — các phần bên dưới vẫn đầy đủ." : "Đang tải bảng điểm…"}</p>;
  const { liveAlpha: la, signalHealth: sh, aiSkill: ai, readinessQueue: rq } = ev.scorecard;
  const props = allProps ? ev.proposals : ev.proposals.slice(0, 4);
  const waiting = rq.filter((r) => !r.readyToEvaluate).sort((a, b) => b.progressPct - a.progressPct).slice(0, 6);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi testId="tab4-kpi-alpha" label="Sổ tiến Elite HL" value={la.settled10 ? pct(la.hlExcess10) : `${la.sessionsRecorded} phiên`}
          sub={la.settled10 ? `Vượt rổ đều 10 phiên, ${la.settled10} phiên đã chấm · dòng tiền ${pct(la.flowExcess10)}` : `đã ghi · chưa phiên nào đủ 10 phiên để chấm (${la.championVersion ?? "E4-HL"})`} />
        <Kpi testId="tab4-kpi-signals" label={`Sức khoẻ ${sh.totalSignals} tín hiệu`} value={<>SQS TB {sh.meanSqs}</>}
          sub={`${sh.provenCount} đã chứng minh · ${sh.emergingCount} ứng viên · ${sh.decayingCount} suy giảm · ${sh.invertedCount} ngược chiều · ${sh.lowCoverageCount} thiếu dữ liệu`} />
        <Kpi testId="tab4-kpi-ai" label="Sổ phán quyết AI" value={`${ai.scored5} / ${ai.totalEntries}`}
          sub={`bản đã chấm 5 phiên / đã ghi · ${ai.label ?? "—"} · BSS chưa đo (sổ không lưu xác suất)`} />
        <Kpi testId="tab4-kpi-regime" label="Chế độ thị trường" value={REGIME_VI[ev.currentRegime]}
          sub={`VN-Index phiên ${ev.regimeAsOf ? ev.regimeAsOf.split("-").reverse().join("/") : "—"} (MA20/MA50, như Cổng tiền mặt) · bằng chứng đo tới ${ev.calendarLast ? ev.calendarLast.split("-").reverse().join("/") : "—"}`} />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5" data-testid="tab4-proposals">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold text-slate-100">Đề xuất cần duyệt <span className="text-slate-500">({ev.proposals.length})</span></p>
            <span className="text-[10px] text-slate-500">không tự áp dụng — cần đăng ký trước</span>
          </div>
          {ev.proposals.length === 0 ? <p className="mt-1 text-[11px] text-slate-500">Chưa có đề xuất.</p> : (
            <ul className="mt-1.5 space-y-1.5">
              {props.map((p) => (
                <li key={p.id} className="border-t border-white/5 pt-1.5 text-[11px]" data-testid={`tab4-proposal-${p.id}`}>
                  <p><b className={`mr-1 text-[10px] uppercase ${PRIO[p.priority]}`}>{PRIO_VI[p.priority]}</b><span className="text-slate-100">{p.titleVi}</span></p>
                  <p className="text-[10.5px] text-slate-400">{p.evidenceVi}</p>
                  <p className="text-[10.5px] text-slate-500">→ {p.suggestedActionVi}</p>
                </li>
              ))}
            </ul>
          )}
          {ev.proposals.length > 4 && <button type="button" className="mt-1.5 text-[10.5px] text-q-text hover:underline" onClick={() => setAllProps((v) => !v)} aria-expanded={allProps}>{allProps ? "Thu gọn" : `Xem cả ${ev.proposals.length} đề xuất`}</button>}
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5" data-testid="tab4-readiness">
          <p className="text-[11px] font-semibold text-slate-100">Đang tích luỹ mẫu</p>
          <ul className="mt-1.5 space-y-1.5">
            {waiting.map((r) => (
              <li key={r.id} className="text-[10.5px]">
                <div className="flex justify-between gap-2 text-slate-300"><span className="truncate" title={r.title}>{r.title}</span><span className="font-mono text-slate-400">{r.currentSamples}/{r.targetSamples}</span></div>
                <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-q-accent/70" style={{ width: `${r.progressPct}%` }} /></span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[10px] text-slate-500">Tín hiệu E2 cần {ev.rules.tierDecisionN} ngày đo để luật bậc có hiệu lực; sổ cần ≥ 30 mẫu đã chấm để đọc sơ bộ.</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-500">{ev.rules.noteVi} Ứng viên mới nổi kỳ vọng do may mắn ≈ {sgn(sh.emergingByChance, 1)} trên {sh.emergingEligible} tín hiệu đủ điều kiện xét. {ev.challengersNoteVi}</p>
    </div>
  );
}

const REG: MarketRegime[] = ["UPTREND", "SIDEWAY", "DOWNTREND"];

/** Tầng 2: IC hạng ở kỳ hạn chính theo chế độ thị trường của ngày tín hiệu. */
export function RegimeMatrix({ ev }: { ev: EvidenceEvolution }) {
  const rows = [...ev.signals].filter((s) => REG.some((r) => s.regimeIc[r].n > 0)).sort((a, b) => (b.regimeSpread ?? -1) - (a.regimeSpread ?? -1));
  return (
    <details className="rounded-md border border-white/10 bg-white/[0.02] p-2.5" data-testid="tab4-regime">
      <summary className="cursor-pointer text-[11px] font-semibold text-slate-100">IC theo chế độ thị trường <span className="font-normal text-slate-500">(kỳ hạn chính · {rows.length} tín hiệu có dữ liệu · hiện tại: {REGIME_VI[ev.currentRegime]})</span></summary>
      {rows.length === 0 ? <p className="mt-1.5 text-[11px] text-slate-500">Chưa ghép được chuỗi IC với chế độ thị trường.</p> : (
        <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="mt-1.5 overflow-x-auto">
          <table className="w-full min-w-[520px] whitespace-nowrap text-[11px]" style={{ borderCollapse: "collapse" }}>
            <thead><tr className="text-[10px] text-slate-500"><th className="py-1 text-left font-normal">Tín hiệu</th>{REG.map((r) => <th key={r} className={`px-2 text-right font-normal ${r === ev.currentRegime ? "text-q-text" : ""}`}>{REGIME_VI[r]}</th>)}<th className="px-2 text-right font-normal" title="Chênh lệch IC lớn nhất giữa các chế độ có ≥ 10 ngày">Chênh</th></tr></thead>
            <tbody className="font-mono">
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-white/5" data-testid={`tab4-regime-${s.id}`}>
                  <td className="py-1 pr-2 font-sans text-slate-200">{s.labelVi}</td>
                  {REG.map((r) => { const c = s.regimeIc[r]; return <td key={r} className={`px-2 text-right ${c.mean != null && c.mean < 0 ? "text-rose-300" : "text-slate-200"}`} title={`${c.n} ngày · t ${c.t ?? "—"}`}>{c.n ? sgn(c.mean, 3) : "—"}<span className="ml-1 text-[9.5px] text-slate-500">{c.n}</span></td>; })}
                  <td className="px-2 text-right text-slate-400">{sgn(s.regimeSpread, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-slate-500">Chế độ của ngày tín hiệu tính trên VN-Index tới chính ngày đó (không nhìn trước). Nhóm dưới 10 ngày không tính vào cột Chênh. Mô tả — chưa phải căn cứ đổi trọng số.</p>
    </details>
  );
}

/** Tầng 4: kỹ năng AI theo giỏ cán cân luận điểm (ARL-v1) — thay cho BSS khi sổ chưa lưu xác suất. */
export function AiSkillPanel({ ev }: { ev: EvidenceEvolution }) {
  const a = ev.scorecard.aiSkill;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5 text-[11px]" data-testid="tab4-ai-skill">
      <p className="font-semibold text-slate-100">Giá trị gia tăng của AI so với Elite HL <span className="font-normal text-slate-500">({a.version ?? "ARL-v1"} · {a.label ?? "—"})</span></p>
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[420px] whitespace-nowrap text-[10.5px]">
          <thead><tr className="text-[10px] text-slate-500"><th className="py-0.5 text-left font-normal">Kỳ hạn</th><th className="text-right font-normal">AI nghiêng thuận</th><th className="text-right font-normal">AI thận trọng</th><th className="text-right font-normal">Cân bằng</th><th className="text-right font-normal">Cơ sở (mọi mã lõi)</th></tr></thead>
          <tbody className="font-mono">
            {(["5", "10"] as const).map((h) => { const x = a.incrementalAlpha[h]; const c = (b: { n: number; meanExcess: number | null }) => `${pct(b.meanExcess)} (${b.n})`; return (
              <tr key={h} className="border-t border-white/5"><td className="py-0.5 font-sans">{h} phiên</td><td className="text-right">{c(x.agree)}</td><td className="text-right">{c(x.caution)}</td><td className="text-right">{c(x.flat)}</td><td className="text-right">{pct(x.baseline)}</td></tr>
            ); })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">{a.bssNoteVi}</p>
    </div>
  );
}
