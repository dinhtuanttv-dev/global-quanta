// Elite 10 E6 — "Bằng chứng & sổ theo dõi": kết quả engine bằng chứng E2 (IC hạng theo kỳ hạn, t Newey–West, q Benjamini–Hochberg,
// ổn định hai nửa, bậc + lý do) và sổ theo dõi tiến của danh mục Elite 10 (E3). Công khai cả kết quả xấu.
import { useMemo, useState } from "react";
import AiBrainCard from "./AiBrainCard";
import EliteToShadowCard from "./EliteToShadowCard";
import { useEliteDecision, useEliteEvidence, useEliteLedger, useEliteRetro, useEliteRetroV3 } from "../../../hooks/elite10/useEliteCenter";
// QĐ-R (20/11/2026): quy tắc, sổ theo dõi tiến và Cổng tiền mặt của Elite HL chuyển từ Bảng quyết định sang đây (cùng cache SWR
// /api/elite/decision — không gọi API thêm); dựng lại thẻ trọng số tín hiệu và ghi chú ⏱ Điểm mua đã gỡ ở G1–G2.
import CashGateCard from "./CashGateCard";
import { HlLedgerPanel, HlRulesPanel } from "./HlRulesLedger";
import { BuyTimingNote, EliteWeightsCard } from "./EvidenceRestored";
// QĐ-R2: "Bằng chứng của từng lớp" (Command Deck Z8) chuyển từ Bảng quyết định sang đây — cùng component, cùng khoá SWR.
import EvidenceWall from "../deck/EvidenceWall";
import { useEvidenceRegistry } from "../../../hooks/elite10/useDeckData";
import type { EliteRetroV3, RealisticSummary } from "../../../lib/elite10/decisionTypes";
import { heatInk } from "../../../lib/elite10/heatInk";
import { divergingColor } from "../../../lib/worldSectors/types";
import type { EliteLedger, EliteRetro, EvidenceSignal, LedgerSummary } from "../../../lib/elite10/decisionTypes";
import { TierChip } from "./DecisionBoard";
import FlowBenchmarkPanel from "./FlowBenchmarkPanel";
// EV-4 (27/11/2026): tái cấu trúc 4 tầng + SQS / xu hướng / IC theo chế độ / đề xuất cần duyệt (chỉ mô tả).
import { useEvidenceEvolution } from "../../../hooks/elite10/useEvidenceEvolution";
import { AiSkillPanel, EvolutionScorecard, RegimeMatrix, SqsCell } from "./EvidenceEvolution";

const H = ["1", "5", "10", "20"] as const;
const sgn = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function IcCell({ s, h }: { s: EvidenceSignal; h: string }) {
  const x = s.byH[h];
  if (!x || !x.n) return <td className="px-1 py-1 text-center text-[10px] text-slate-600">chưa đo</td>;
  const main = String(s.mainH) === h;
  const bg = divergingColor(x.mean == null ? null : x.mean * 100);
  return (
    <td className="px-1 py-1 text-center" title={`${x.n} ngày (${fmtDate(x.from)} → ${fmtDate(x.to)}) · t ${num(x.t)} · q ${num(x.q, 3)} · ${x.stable ? "ổn định hai nửa" : "không ổn định hai nửa"}`}>
      <div className={`rounded px-1 py-0.5 font-mono text-[10.5px] ${main ? "ring-1 ring-amber-300/60" : ""}`} style={{ background: bg, color: heatInk(bg) }}>
        {sgn(x.mean, 3)}
        <span className="block text-[10px]">t {num(x.t, 1)}{x.q != null ? ` · q ${num(x.q, 2)}` : ""}{x.stable ? " · ✓" : ""}</span>
      </div>
    </td>
  );
}

/** Đường lợi suất vượt tích luỹ (xấp xỉ) — vẽ theo đúng thang, đường 0 làm mốc. */
function Curve({ points }: { points: [string, number][] }) {
  if (points.length < 2) return <p className="text-[11px] text-slate-500">Chưa đủ phiên đã chấm để vẽ đường lợi suất vượt.</p>;
  const W = 600, Ht = 140, pad = 28;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const y = (v: number) => Ht - pad / 2 - ((v - lo) / span) * (Ht - pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${Ht}`} className="w-full" style={{ minWidth: 320 }} role="img" aria-label="Lợi suất vượt tích luỹ của Elite 10 so với rổ đều">
        <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="rgba(148,163,184,0.5)" strokeDasharray="3 3" />
        <text x={4} y={y(0) + 3} fontSize="9" fill="rgba(148,163,184,0.9)">0%</text>
        <path d={d} fill="none" stroke={last[1] >= 0 ? "#34d399" : "#f87171"} strokeWidth="2" />
        <circle cx={x(points.length - 1)} cy={y(last[1])} r="3" fill={last[1] >= 0 ? "#34d399" : "#f87171"} />
        <text x={x(points.length - 1) - 4} y={y(last[1]) - 6} fontSize="10" textAnchor="end" fill="#e2e8f0">{sgn(last[1] * 100, 2)}%</text>
        <text x={pad} y={Ht - 2} fontSize="9" fill="rgba(148,163,184,0.9)">{fmtDate(points[0][0])}</text>
        <text x={W - pad} y={Ht - 2} fontSize="9" textAnchor="end" fill="rgba(148,163,184,0.9)">{fmtDate(last[0])}</text>
      </svg>
    </div>
  );
}

function LedgerSummaryView({ s, showIc = true }: { s: LedgerSummary; showIc?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-[11px]">
      {(["5", "10"] as const).map((h) => {
        const x = s.horizons[h];
        return (
          <div key={h} className="rounded-md border border-white/10 bg-white/[0.02] p-2 space-y-0.5">
            <p className="text-[10px] font-bold uppercase text-slate-500">Kỳ hạn {h} phiên · {x?.n ?? 0} phiên đã chấm</p>
            <p>Vượt rổ đều (sau phí): <b>{x?.n ? `${sgn((x.meanExcess ?? 0) * 100, 2)}%` : "—"}</b>{x?.excessCi95 ? ` · KTC95 [${sgn(x.excessCi95[0] * 100, 2)}%; ${sgn(x.excessCi95[1] * 100, 2)}%]` : ""}</p>
            <p>Tỷ lệ thắng: {x?.n ? `${num((x.hitRate ?? 0) * 100, 0)}%` : "—"} · VN-Index TB: {x?.meanVnIndex != null ? `${sgn(x.meanVnIndex * 100, 2)}%` : "—"}</p>
            {x?.cashIncl && <p data-testid={`ledger-cash-${h}`}>Tính cả tiền mặt ({x.cashIncl.n} phiên, cổ phiếu TB {num(x.cashIncl.meanInvested * 100, 0)}%): danh mục <b>{sgn(x.cashIncl.meanPortfolio * 100, 2)}%</b>{x.cashIncl.meanVnIndex != null ? ` · VN-Index ${sgn(x.cashIncl.meanVnIndex * 100, 2)}%` : ""} — trước phí</p>}
            {showIc && <p>IC của Điểm Elite: {x?.ic?.n ? `${sgn(x.ic.mean, 3)} (t ${num(x.ic.t)}, ${x.ic.n} phiên)` : "—"}</p>}
          </div>
        );
      })}
    </div>
  );
}

const RETRO_LABEL: Record<string, string> = { stealth5: "Stealth 5", stealth20: "Stealth 20", net_intent: "Ý đồ IFE", mom5_atr: "Động lượng 5 phiên", log_rvol: "RVOL (log)" };

function RetroSection({ r }: { r: EliteRetro | null | undefined }) {
  if (!r) return <p className="text-[11px] text-slate-500">Kiểm định hồi cứu E7 chưa chạy.</p>;
  const ok = r.label === "EVIDENCE";
  return (
    <div className="space-y-2 text-[11px]" data-testid="elite-retro">
      <p className={`font-bold ${ok ? "text-emerald-300" : "text-amber-300"}`}>{r.verdictVi}</p>
      <p className="text-slate-400">{r.version} · {r.period.sessions} phiên walk-forward ({fmtDate(r.period.from)} → {fmtDate(r.period.to)}) · chỉ 5 tín hiệu dòng tiền có lịch sử point-in-time.</p>
      <LedgerSummaryView s={{ horizons: r.horizons, criteria: r.criteria, label: r.label, labelVi: r.verdictVi }} />
      <RealisticView s={r.descriptive.realistic} testId="elite-retro-realistic" />
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Mẫu không chồng lấn (10 phiên)</p>
          <p>{r.descriptive.nonOverlapping10.n} mẫu · TB {r.descriptive.nonOverlapping10.mean != null ? `${sgn(r.descriptive.nonOverlapping10.mean * 100, 2)}%` : "—"}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Quy năm · vòng quay</p>
          <p>Vượt rổ đều ≈ {r.descriptive.annualisedExcess != null ? `${sgn(r.descriptive.annualisedExcess * 100, 1)}%/năm` : "—"} · vòng quay {r.descriptive.dailyTurnover != null ? `${num(r.descriptive.dailyTurnover * 100, 0)}%/phiên` : "—"}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">Số phiên ở bậc A/B/C</p>
          <p className="text-[10px]">{Object.entries(r.descriptive.tierDays).map(([k, v]) => `${RETRO_LABEL[k] ?? k}: ${v.A}/${v.B}/${v.C}`).join(" · ")}</p>
        </div>
      </div>
      <Curve points={r.horizons["10"]?.curve ?? []} />
      <p className="text-[10px] text-slate-500">Mỗi phiên chỉ dùng IC đã có tại thời điểm đó; bậc, trọng số, danh mục và cách chấm dùng đúng hàm của E2/E3. Không điều chỉnh tham số sau khi xem kết quả (E7-prereg).</p>
    </div>
  );
}

const WEIGHTING_VI: Record<string, string> = { erc: "ERC", "inverse-vol": "nghịch biến động" };

/** R3: lợi suất vượt khi thực thi thật (phí, thuế, chênh lệch giá, tác động √, lô 100, trần/sàn) so với cách chấm chính thức. */
function RealisticView({ s, testId }: { s: RealisticSummary | undefined; testId: string }) {
  if (!s) return null;
  const rows = Object.entries(s.horizons).flatMap(([h, byAum]) => Object.entries(byAum).map(([aum, v]) => ({ h, aum: Number(aum), v })));
  if (!rows.some((r) => r.v.n > 0)) return <p className="text-[10px] text-slate-500" data-testid={testId}>Chấm thực tế kiểu Việt Nam: chưa có bản ghi đủ kỳ hạn.</p>;
  return (
    <div className="space-y-1" data-testid={testId}>
      <p className="text-[10px] font-bold uppercase text-slate-500">Chấm thực tế kiểu Việt Nam (mô tả, không đổi tiêu chí)</p>
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
        <table className="w-full min-w-[460px] text-[10.5px]">
          <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="py-0.5 pr-2">Kỳ hạn · vốn</th><th className="pr-2 text-right">Vượt (chính thức)</th><th className="pr-2 text-right">Vượt (thực tế)</th><th className="pr-2 text-right">Tác động TB</th><th className="text-right">Khớp mua</th></tr></thead>
          <tbody className="font-mono">
            {rows.map(({ h, aum, v }) => (
              <tr key={`${h}-${aum}`}>
                <td className="py-0.5 pr-2 font-sans">{h} phiên · {num(aum / 1e9, 0)} tỷ <span className="text-slate-500">(n {v.n})</span></td>
                <td className="pr-2 text-right">{v.meanOfficialExcess != null ? `${sgn(v.meanOfficialExcess * 100, 2)}%` : "—"}</td>
                <td className="pr-2 text-right">{v.meanExcess != null ? `${sgn(v.meanExcess * 100, 2)}%` : "—"}</td>
                <td className="pr-2 text-right">{v.meanImpactBps != null ? `${num(v.meanImpactBps, 1)} bp` : "—"}</td>
                <td className="text-right">{v.fillRate != null ? `${num(v.fillRate * 100, 0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">Phí mua 0,15%, bán 0,15% + thuế 0,1%, nửa bước giá mỗi chiều, chi phí tác động σ20·√(lệnh/GTGD TB20) mỗi chiều, lô 100, đóng cửa trần khi mua = không khớp, đóng cửa sàn khi bán = dời tối đa 5 phiên. Mốc: rổ đều vũ trụ trừ 0,40%.</p>
    </div>
  );
}

/** E7-v3: bốn tiêu chí, Deflated Sharpe, PBO và lưới 12 cấu hình (lợi nhuận vượt theo ngày sau phí). */
function RetroV3Section({ r }: { r: EliteRetroV3 | null | undefined }) {
  if (!r) return <p className="text-[11px] text-slate-500">Kiểm định E7-v3 chưa chạy.</p>;
  const c = r.criteria;
  const mark = (ok: boolean) => <b className={ok ? "text-emerald-300" : "text-rose-300"}>{ok ? "đạt" : "không đạt"}</b>;
  const h10 = r.horizons["10"];
  return (
    <div className="space-y-2 text-[11px]" data-testid="elite-retro-v3">
      <p className={`font-bold ${r.pass ? "text-emerald-300" : "text-amber-300"}`}>{r.verdictVi}</p>
      <p className="text-slate-400">{r.version} · {r.period.sessions} phiên walk-forward, {r.period.dailyN} ngày lợi nhuận ({fmtDate(r.period.from)} → {fmtDate(r.period.to)}) · khoảng đệm 5 phiên · phí mua 0,15%, bán 0,25%.</p>
      <ul className="grid grid-cols-1 gap-1 md:grid-cols-2" data-testid="elite-retro-v3-criteria">
        <li>1. IC của Z ở 5 phiên: {num(r.horizons["5"]?.ic.mean ?? null, 3)} (t {num(r.horizons["5"]?.ic.t ?? null, 2)}) · {mark(c.icPass)}</li>
        <li>2. Lợi suất vượt 10 phiên sau phí: {h10?.meanExcess != null ? `${sgn(h10.meanExcess * 100, 2)}%` : "—"}{h10?.excessCi95 ? ` (KTC 95% ${sgn(h10.excessCi95[0] * 100, 2)}% … ${sgn(h10.excessCi95[1] * 100, 2)}%)` : ""} · {mark(c.excessPass)}</li>
        <li title="Bailey & López de Prado (2014): xác suất Sharpe thật > Sharpe tối đa kỳ vọng do may mắn khi đã thử N cấu hình">3. Deflated Sharpe (N = {r.deflatedSharpe.N}): {num(r.deflatedSharpe.dsr, 3)} (cần ≥ 0,95; N = 24: {num(r.deflatedSharpe.sensitivityN24, 3)}) · {mark(c.dsrPass)}</li>
        <li title="Bailey và cộng sự (2017), CSCV: xác suất cấu hình tốt nhất trong mẫu lại dưới trung vị ngoài mẫu">4. Xác suất quá khớp PBO: {num(r.pbo.pbo, 3)} ({r.pbo.splits} cách chia, cần &lt; 0,5) · {mark(c.pboPass)}</li>
      </ul>
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-[10.5px]" data-testid="elite-retro-v3-grid">
          <thead><tr className="text-left text-[10px] uppercase text-slate-500"><th className="py-0.5 pr-2">Cấu hình</th><th className="pr-2 text-right">Sharpe năm</th><th className="text-right">Vượt rổ đều / năm</th></tr></thead>
          <tbody className="font-mono">
            {r.grid.map((g) => (
              <tr key={g.id} className={g.primary ? "text-q-accent-strong" : "text-slate-300"}>
                <td className="py-0.5 pr-2 font-sans">{g.size} mã · {g.bufferRank ? `đệm ${g.bufferRank}` : "không đệm"} · {WEIGHTING_VI[g.weighting] ?? g.weighting}{g.primary ? " (chính)" : ""}</td>
                <td className="pr-2 text-right">{num(g.sharpeAnnual, 2)}</td>
                <td className="text-right">{sgn(g.annualExcess * 100, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500">Các cấu hình phụ chỉ để đo quá khớp; chọn lại cấu hình theo bảng này là lọc dữ liệu và phải qua đăng ký trước mới. Phiên hồi cứu không cộng vào sổ tiến. Lưu ý thực thi (R3): lợi nhuận theo ngày giả định bán ở phiên kế tiếp — với T+2 ở Việt Nam việc này không thực hiện được, nên các cấu hình không vùng đệm thực tế còn kém hơn.</p>
    </div>
  );
}

/** Sổ Elite HL nhận diện theo phiên bản sổ ("E4-HL …") hoặc cờ kind của Gateway mới. */
const isHlLedger = (l: EliteLedger | null | undefined) => Boolean(l && (l.summary?.kind === "ELITE_HL" || l.version?.startsWith("E4-HL")));
const HL_BASIS_VI = "Sổ chấm rổ mã đang giữ quy về 100% cổ phiếu (không tính phần tiền mặt), kỳ hạn cố định 5 và 10 phiên, so với bình quân đều các mã giao dịch được. Đây chưa phải lãi / lỗ của danh mục thật (có tiền mặt, giữ tới khi chạm ngưỡng ra).";

/** Một sổ theo dõi tiến: tổng kết, chấm thực tế, đường lợi suất vượt và 15 phiên khoá gần nhất. */
function LedgerSection({ ledger, error, title, hl, testId }: { ledger: EliteLedger | undefined; error?: unknown; title: string; hl: boolean; testId: string }) {
  const recent = [...(ledger?.entries ?? [])].reverse().slice(0, 15);
  return (
    <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-2" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-100">{title}</h4>
        {ledger && <span className="text-[10px] text-slate-400">{ledger.version} · cập nhật {ledger.updatedAt ? new Date(ledger.updatedAt).toLocaleString("vi-VN", { hour12: false }) : "—"}</span>}
      </div>
      {!ledger ? (error
        ? <p className="text-[11px] text-rose-400" data-testid={`${testId}-error`}>Không tải được sổ theo dõi: {String((error as Error).message ?? error)}</p>
        : <p className="text-[11px] text-slate-400">Sổ theo dõi chưa có bản ghi.</p>) : (
        <>
          <p className={`text-[11px] font-bold ${ledger.summary.label === "EVIDENCE" ? "text-emerald-300" : "text-amber-300"}`}>{hl && ledger.summary.kind !== "ELITE_HL" ? `THĂM DÒ — sổ mô tả của Elite HL (${ledger.entries.length} phiên). Chưa có tiêu chí đăng ký trước cho danh mục này.` : ledger.summary.labelVi}</p>
          {hl && <p className="rounded border border-amber-400/30 bg-amber-500/[0.06] p-1.5 text-[10.5px] leading-relaxed text-amber-200" data-testid={`${testId}-basis`}>{ledger.summary.basisVi ?? HL_BASIS_VI}</p>}
          <LedgerSummaryView s={ledger.summary} showIc={!hl} />
          <RealisticView s={ledger.summary.realistic} testId={`${testId === "elite-ledger-tab" ? "elite-ledger" : testId}-realistic`} />
          <Curve points={ledger.summary.horizons["10"]?.curve ?? []} />
          <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 620 }}>
              <thead><tr className="text-slate-400"><th className="text-left font-normal">Phiên khoá</th><th className="text-left font-normal">Danh mục</th><th className="font-normal">Vượt rổ đều 5p</th><th className="font-normal">Vượt rổ đều 10p</th><th className="font-normal">VN-Index 10p</th></tr></thead>
              <tbody>
                {recent.map((e) => {
                  // Danh mục 100% tiền mặt không có gì để chấm -> ghi rõ, không để "chờ" mãi.
                  const cashOnly = Boolean(e.empty) || e.holdings.length === 0;
                  const cell = (h: "5" | "10") => (e.results[h] ? `${sgn(e.results[h].excess * 100, 2)}%` : cashOnly ? "—" : "chờ");
                  return (
                    <tr key={e.date} className="border-t border-white/5">
                      <td className="py-1">{fmtDate(e.date)}{e.frozen && <span className="ml-1 text-[10px] text-rose-300" title="Phiên bị chốt dữ liệu: danh mục giữ nguyên">chốt dữ liệu</span>}</td>
                      <td className="text-slate-400">{cashOnly ? <span data-testid={`${testId}-cash-${e.date}`}>100% tiền mặt — không chấm</span> : <>{e.holdings.map((h) => h.ticker).join(" ")}{e.cash != null && e.cash > 0.0005 && <span className="ml-1 text-[10px] text-slate-400">· tiền mặt {num(e.cash * 100, 0)}%</span>}</>}</td>
                      <td className="text-center font-mono">{cell("5")}</td>
                      <td className="text-center font-mono">{cell("10")}</td>
                      <td className="text-center font-mono">{e.results["10"]?.vnIndex != null ? `${sgn(e.results["10"].vnIndex * 100, 2)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400">Vào lệnh đóng cửa d+1, ra đóng cửa d+1+h; chi phí 0,40%/vòng cho cả danh mục và rổ đều (lợi suất vượt không đổi khi trừ phí cả hai). Đường cong là xấp xỉ: lợi suất vượt 10 phiên chia đều theo phiên rồi cộng dồn.</p>
        </>
      )}
    </section>
  );
}

/** EV-4 (27/11/2026): khung một tầng của tab 4 (tiêu đề + mô tả ngắn). */
function Tier({ n, title, sub, testId, children }: { n: number; title: string; sub: string; testId: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" data-testid={testId} aria-label={title}>
      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-white/10 pb-1">
        <span className="font-mono text-[10.5px] text-q-accent-strong">TẦNG {n}</span>
        <h3 className="text-[12.5px] font-semibold text-slate-100">{title}</h3>
        <span className="text-[10.5px] text-slate-500">{sub}</span>
      </header>
      {children}
    </section>
  );
}

export default function EvidenceLedgerTab() {
  const { data: ev, error } = useEliteEvidence();
  const { data: ledger, error: ledgerError } = useEliteLedger();
  const hl = isHlLedger(ledger);
  // Khi sổ chính thức là Elite HL, sổ của danh mục dòng tiền (E3) vẫn chạy song song — hiện riêng để không mất lịch sử.
  const { data: flowLedger, error: flowError } = useEliteLedger("flow", hl);
  const { data: retro } = useEliteRetro();
  const { data: retroV3 } = useEliteRetroV3();
  const { data: decision } = useEliteDecision();
  const { data: registry } = useEvidenceRegistry();
  // EV-4: SQS, nhãn xu hướng, IC theo chế độ, đề xuất cần duyệt (chỉ mô tả). Lỗi / chưa có -> các phần cũ vẫn hiện đủ.
  const { data: evo, error: evoError } = useEvidenceEvolution();
  const evoById = useMemo(() => new Map((evo?.signals ?? []).map((s) => [s.id, s])), [evo]);
  const [tabFilter, setTabFilter] = useState<string | null>(null);
  const sorted = useMemo(() => {
    const order = { A: 0, B: 1, C: 2 } as const;
    return [...(ev?.signals ?? [])].sort((a, b) => order[a.tier] - order[b.tier] || (b.byH[String(b.mainH)]?.mean ?? -9) - (a.byH[String(a.mainH)]?.mean ?? -9));
  }, [ev]);
  const tabs = useMemo(() => [...new Set(sorted.map((s) => s.tab))], [sorted]);
  const shown = tabFilter ? sorted.filter((s) => s.tab === tabFilter) : sorted;
  if (error) return <p className="text-xs text-rose-400">Không tải được bằng chứng: {String(error.message ?? error)}</p>;
  if (!ev) return <p className="py-6 text-center text-xs italic text-slate-500">Đang tải bằng chứng…</p>;

  return (
    <div className="tw-scope space-y-6 text-slate-200" data-testid="elite-evidence-tab">
      <Tier n={1} title="Bảng điểm & đề xuất" sub="sổ tiến · sức khoẻ tín hiệu · AI · chế độ thị trường — đề xuất không tự áp dụng" testId="tab4-scorecard">
        <EvolutionScorecard ev={evo} error={evoError} />
        {hl && (
          <p className="rounded-lg border border-amber-400/40 bg-amber-500/[0.07] p-2.5 text-[11px] leading-relaxed text-amber-100" data-testid="elite-evidence-scope">
            <b>Phạm vi bằng chứng.</b> Danh mục chính thức hiện là <b>Elite HL</b> (quy tắc do chủ dự án đặt, nhãn THĂM DÒ). Bằng chứng từng tín hiệu (E2) và hai kiểm định hồi cứu E7 / E7-v3 bên dưới thuộc về <b>Điểm Elite và danh mục Elite dòng tiền (cũ)</b> — chúng KHÔNG phải kiểm định của Elite HL. Elite HL hiện chỉ có mô phỏng khám phá K0 (ngang thị trường, xem Bảng quyết định) và sổ theo dõi tiến mô tả ở tầng 3.
          </p>
        )}
      </Tier>

      <Tier n={2} title="Bằng chứng & tín hiệu" sub="tường bằng chứng từng lớp · IC 25 tín hiệu (E2) · SQS · IC theo chế độ thị trường" testId="tab4-signals">
        {/* Khối HL (giữ data-testid cũ): tường bằng chứng từng lớp đứng đầu; quy tắc, cổng và sổ ở tầng 3. */}
        {decision?.hl && <div className="space-y-3" data-testid="elite-evidence-hl"><EvidenceWall ledger={decision.ledgerSummary} registry={registry} k0Note={decision.hl.k0?.noteVi ?? null} /></div>}
        <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-100">Bằng chứng từng tín hiệu (E2)</h4>
            <span className="text-[10px] text-slate-500">{ev.version} · đo tới phiên {fmtDate(ev.calendarLast)} · {ev.tests} phép thử BH · A {ev.counts.A} · B {ev.counts.B} · C {ev.counts.C}</span>
          </div>
          <p className="text-[10.5px] text-slate-400">
            Ô = IC hạng Spearman trung bình theo ngày giữa tín hiệu và lợi suất từ đóng cửa d+1 tới d+1+h; màu xanh = dự báo đúng chiều, đỏ = ngược chiều.
            Khung vàng = kỳ hạn chính dùng để giáng bậc; ✓ = dương ở cả hai nửa thời gian. Luật thăng/giáng và định nghĩa ghi trong bản đăng ký trước E2 (không sửa sau khi đo).
            Cột SQS (0–100) và nhãn xu hướng chỉ mô tả, không đổi bậc.
          </p>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Lọc theo tab nguồn" data-testid="tab4-tab-filter">
            {[null, ...tabs].map((t) => (
              <button key={t ?? "all"} type="button" aria-pressed={tabFilter === t} onClick={() => setTabFilter(t)}
                className={`min-h-[24px] rounded border px-2 text-[10.5px] ${tabFilter === t ? "border-q-accent/60 bg-q-accent/15 text-q-accent-strong" : "border-white/10 text-slate-400 hover:border-white/25"}`}>
                {t ?? `Tất cả (${sorted.length})`}{t ? ` (${sorted.filter((s) => s.tab === t).length})` : ""}
              </button>
            ))}
          </div>
          <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 840 }} data-testid="elite-ic-table">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left font-normal py-1">Tín hiệu</th><th className="font-normal">Bậc</th>
                  <th className="font-normal" title="Chỉ số sức khoẻ tín hiệu 0–100 + nhãn xu hướng (EV-4, mô tả)">SQS · xu hướng</th>
                  {H.map((h) => <th key={h} className="font-normal">{h} phiên</th>)}
                  <th className="text-left font-normal pl-2">Đánh giá</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="border-t border-white/5" data-testid={`elite-ev-${s.id}`}>
                    <td className="py-1 pr-2"><span className="text-slate-100">{s.labelVi}</span><span className="block text-[10px] text-slate-500">{s.tab} · {s.source}</span></td>
                    <td className="text-center whitespace-nowrap"><TierChip tier={s.tier} />{s.change !== "none" && <span className={`ml-1 text-[10px] font-bold ${s.change === "up" ? "text-emerald-300" : "text-rose-300"}`}>{s.change === "up" ? "↑" : "↓"} từ {s.priorTier}</span>}</td>
                    <SqsCell s={evoById.get(s.id)} />
                    {H.map((h) => <IcCell key={h} s={s} h={h} />)}
                    <td className="pl-2 text-[10px] text-slate-400" style={{ maxWidth: 260 }}>{s.reasonVi}<span className="block text-slate-500">{s.priorEvidenceVi}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {evo && <RegimeMatrix ev={evo} />}
      </Tier>

      <Tier n={3} title="Sổ theo dõi tiến" sub="quy tắc & cổng · so sánh Elite HL với Elite dòng tiền · sổ chi tiết thu gọn" testId="tab4-ledgers">
        {decision?.hl && (
          <div className="space-y-3" data-testid="tab4-hl-rules">
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              <HlRulesPanel d={decision} />
              <CashGateCard />
            </div>
            <HlLedgerPanel d={decision} />
            <BuyTimingNote />
          </div>
        )}
        {/* EV-4: trước đây sổ Elite HL hiện 3 lần (tường bằng chứng, bảng so sánh, sổ chi tiết) và sổ dòng tiền 2 lần. Bảng so sánh ở trên
            là bản tóm tắt duy nhất; sổ chi tiết (đường cong, 15 phiên khoá, chấm thực tế) gom vào đây, thu gọn mặc định — vẫn đủ dữ liệu. */}
        <details className="group rounded-lg border border-white/10 bg-white/[0.015] p-2.5" data-testid="tab4-ledger-details">
          <summary className="cursor-pointer text-[11px] font-semibold text-slate-100">
            Sổ chi tiết <span className="font-normal text-slate-500">— {hl ? "Elite HL · đối chứng dòng tiền · Elite × Săn cổ tức · trọng số tín hiệu" : "Elite 10 (E3) · Elite × Săn cổ tức · trọng số tín hiệu"}</span>
          </summary>
          <div className="mt-3 space-y-3">
            <LedgerSection ledger={ledger} error={ledgerError} hl={hl} testId="elite-ledger-tab" title={hl ? "Sổ theo dõi tiến — Elite HL (danh mục chính thức)" : "Sổ theo dõi tiến Elite 10 (E3)"} />
            {hl && <FlowBenchmarkPanel />}
            {hl && <LedgerSection ledger={flowLedger} error={flowError} hl={false} testId="elite-ledger-flow" title="Sổ theo dõi tiến — Elite dòng tiền (đối chứng, E3)" />}
            {/* Elite × TO Giai đoạn II: sổ ảo (THĂM DÒ) — không đổi danh mục chính thức. */}
            <EliteToShadowCard />
            <EliteWeightsCard />
          </div>
        </details>
      </Tier>

      <Tier n={4} title="Thẩm định & hiệu chuẩn" sub="walk-forward E7 · quá khớp E7-v3 · chi phí thực thi R3 · sổ phán quyết AI" testId="tab4-audit">
        <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-100">Kiểm định hồi cứu walk-forward (E7){hl ? " — danh mục Elite dòng tiền (cũ)" : ""}</h4>
          <RetroSection r={retro} />
        </section>
        <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-100">Hiệu chỉnh quá khớp (E7-v3){hl ? " — danh mục Elite dòng tiền (cũ)" : ""}</h4>
          <RetroV3Section r={retroV3} />
        </section>
        {/* ARL-v1 (26/11/2026): sổ phán quyết Phòng họp AI — nguồn đo độ tin cậy của bộ não. */}
        <div className="space-y-3 rounded-lg border border-white/10 bg-[#0E131F] p-3">
          <AiBrainCard testId="ai-brain-evidence" />
          {evo && <AiSkillPanel ev={evo} />}
        </div>
      </Tier>
      <p className="text-[10px] text-slate-400" data-testid="elite-evidence-disclaimer">Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
