// Elite 10 E6 — "Bằng chứng & sổ theo dõi": kết quả engine bằng chứng E2 (IC hạng theo kỳ hạn, t Newey–West, q Benjamini–Hochberg,
// ổn định hai nửa, bậc + lý do) và sổ theo dõi tiến của danh mục Elite 10 (E3). Công khai cả kết quả xấu.
import { useMemo } from "react";
import { useEliteEvidence, useEliteLedger, useEliteRetro } from "../../../hooks/elite10/useEliteCenter";
import { divergingColor } from "../../../lib/worldSectors/types";
import type { EliteRetro, EvidenceSignal, LedgerSummary } from "../../../lib/elite10/decisionTypes";
import { TierChip } from "./DecisionBoard";

const H = ["1", "5", "10", "20"] as const;
const sgn = (v: number | null | undefined, d = 3) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const fmtDate = (d?: string | null) => (d ? d.split("-").reverse().join("/") : "—");

function IcCell({ s, h }: { s: EvidenceSignal; h: string }) {
  const x = s.byH[h];
  if (!x || !x.n) return <td className="px-1 py-1 text-center text-[10px] text-slate-600">chưa đo</td>;
  const main = String(s.mainH) === h;
  return (
    <td className="px-1 py-1 text-center" title={`${x.n} ngày (${fmtDate(x.from)} → ${fmtDate(x.to)}) · t ${num(x.t)} · q ${num(x.q, 3)} · ${x.stable ? "ổn định hai nửa" : "không ổn định hai nửa"}`}>
      <div className={`rounded px-1 py-0.5 font-mono text-[10.5px] text-slate-100 ${main ? "ring-1 ring-amber-300/60" : ""}`} style={{ background: divergingColor(x.mean == null ? null : x.mean * 100) }}>
        {sgn(x.mean, 3)}
        <span className="block text-[9px] text-slate-300/80">t {num(x.t, 1)}{x.q != null ? ` · q ${num(x.q, 2)}` : ""}{x.stable ? " · ✓" : ""}</span>
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
    <div className="overflow-x-auto">
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

function LedgerSummaryView({ s }: { s: LedgerSummary }) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2 text-[11px]">
      {(["5", "10"] as const).map((h) => {
        const x = s.horizons[h];
        return (
          <div key={h} className="rounded-md border border-white/10 bg-white/[0.02] p-2 space-y-0.5">
            <p className="text-[9.5px] font-bold uppercase text-slate-500">Kỳ hạn {h} phiên · {x?.n ?? 0} phiên đã chấm</p>
            <p>Vượt rổ đều (sau phí): <b>{x?.n ? `${sgn((x.meanExcess ?? 0) * 100, 2)}%` : "—"}</b>{x?.excessCi95 ? ` · KTC95 [${sgn(x.excessCi95[0] * 100, 2)}%; ${sgn(x.excessCi95[1] * 100, 2)}%]` : ""}</p>
            <p>Tỷ lệ thắng: {x?.n ? `${num((x.hitRate ?? 0) * 100, 0)}%` : "—"} · VN-Index TB: {x?.meanVnIndex != null ? `${sgn(x.meanVnIndex * 100, 2)}%` : "—"}</p>
            <p>IC của Điểm Elite: {x?.ic?.n ? `${sgn(x.ic.mean, 3)} (t ${num(x.ic.t)}, ${x.ic.n} phiên)` : "—"}</p>
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
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[9.5px] font-bold uppercase text-slate-500">Mẫu không chồng lấn (10 phiên)</p>
          <p>{r.descriptive.nonOverlapping10.n} mẫu · TB {r.descriptive.nonOverlapping10.mean != null ? `${sgn(r.descriptive.nonOverlapping10.mean * 100, 2)}%` : "—"}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[9.5px] font-bold uppercase text-slate-500">Quy năm · vòng quay</p>
          <p>Vượt rổ đều ≈ {r.descriptive.annualisedExcess != null ? `${sgn(r.descriptive.annualisedExcess * 100, 1)}%/năm` : "—"} · vòng quay {r.descriptive.dailyTurnover != null ? `${num(r.descriptive.dailyTurnover * 100, 0)}%/phiên` : "—"}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[9.5px] font-bold uppercase text-slate-500">Số phiên ở bậc A/B/C</p>
          <p className="text-[10px]">{Object.entries(r.descriptive.tierDays).map(([k, v]) => `${RETRO_LABEL[k] ?? k}: ${v.A}/${v.B}/${v.C}`).join(" · ")}</p>
        </div>
      </div>
      <Curve points={r.horizons["10"]?.curve ?? []} />
      <p className="text-[10px] text-slate-500">Mỗi phiên chỉ dùng IC đã có tại thời điểm đó; bậc, trọng số, danh mục và cách chấm dùng đúng hàm của E2/E3. Không điều chỉnh tham số sau khi xem kết quả (E7-prereg).</p>
    </div>
  );
}

export default function EvidenceLedgerTab() {
  const { data: ev, error } = useEliteEvidence();
  const { data: ledger } = useEliteLedger();
  const { data: retro } = useEliteRetro();
  const sorted = useMemo(() => {
    const order = { A: 0, B: 1, C: 2 } as const;
    return [...(ev?.signals ?? [])].sort((a, b) => order[a.tier] - order[b.tier] || (b.byH[String(b.mainH)]?.mean ?? -9) - (a.byH[String(a.mainH)]?.mean ?? -9));
  }, [ev]);
  if (error) return <p className="text-xs text-rose-400">Không tải được bằng chứng: {String(error.message ?? error)}</p>;
  if (!ev) return <p className="py-6 text-center text-xs italic text-slate-500">Đang tải bằng chứng…</p>;
  const recent = [...(ledger?.entries ?? [])].reverse().slice(0, 15);

  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="elite-evidence-tab">
      <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Bằng chứng từng tín hiệu (E2)</h4>
          <span className="text-[10px] text-slate-500">{ev.version} · đo tới phiên {fmtDate(ev.calendarLast)} · {ev.tests} phép thử BH · A {ev.counts.A} · B {ev.counts.B} · C {ev.counts.C}</span>
        </div>
        <p className="text-[10.5px] text-slate-400">
          Ô = IC hạng Spearman trung bình theo ngày giữa tín hiệu và lợi suất từ đóng cửa d+1 tới d+1+h; màu xanh = dự báo đúng chiều, đỏ = ngược chiều.
          Khung vàng = kỳ hạn chính dùng để giáng bậc; ✓ = dương ở cả hai nửa thời gian. Luật thăng/giáng và định nghĩa ghi trong bản đăng ký trước E2 (không sửa sau khi đo).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 760 }} data-testid="elite-ic-table">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-normal py-1">Tín hiệu</th><th className="font-normal">Bậc</th>
                {H.map((h) => <th key={h} className="font-normal">{h} phiên</th>)}
                <th className="text-left font-normal pl-2">Đánh giá</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.id} className="border-t border-white/5" data-testid={`elite-ev-${s.id}`}>
                  <td className="py-1 pr-2"><span className="text-slate-100">{s.labelVi}</span><span className="block text-[9.5px] text-slate-500">{s.tab} · {s.source}</span></td>
                  <td className="text-center whitespace-nowrap"><TierChip tier={s.tier} />{s.change !== "none" && <span className={`ml-1 text-[10px] font-bold ${s.change === "up" ? "text-emerald-300" : "text-rose-300"}`}>{s.change === "up" ? "↑" : "↓"} từ {s.priorTier}</span>}</td>
                  {H.map((h) => <IcCell key={h} s={s} h={h} />)}
                  <td className="pl-2 text-[10px] text-slate-400" style={{ maxWidth: 260 }}>{s.reasonVi}<span className="block text-slate-500">{s.priorEvidenceVi}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Kiểm định hồi cứu walk-forward (E7)</h4>
        <RetroSection r={retro} />
      </section>

      <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2" data-testid="elite-ledger-tab">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Sổ theo dõi tiến Elite 10 (E3)</h4>
          {ledger && <span className="text-[10px] text-slate-500">{ledger.version} · cập nhật {ledger.updatedAt ? new Date(ledger.updatedAt).toLocaleString("vi-VN", { hour12: false }) : "—"}</span>}
        </div>
        {!ledger ? <p className="text-[11px] text-slate-500">Sổ theo dõi chưa có bản ghi.</p> : (
          <>
            <p className={`text-[11px] font-bold ${ledger.summary.label === "EVIDENCE" ? "text-emerald-300" : "text-amber-300"}`}>{ledger.summary.labelVi}</p>
            <LedgerSummaryView s={ledger.summary} />
            <Curve points={ledger.summary.horizons["10"]?.curve ?? []} />
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 620 }}>
                <thead><tr className="text-slate-500"><th className="text-left font-normal">Phiên khoá</th><th className="text-left font-normal">Danh mục</th><th className="font-normal">Vượt rổ đều 5p</th><th className="font-normal">Vượt rổ đều 10p</th><th className="font-normal">VN-Index 10p</th></tr></thead>
                <tbody>
                  {recent.map((e) => (
                    <tr key={e.date} className="border-t border-white/5">
                      <td className="py-1">{fmtDate(e.date)}</td>
                      <td className="text-slate-400">{e.holdings.map((h) => h.ticker).join(" ")}</td>
                      <td className="text-center font-mono">{e.results["5"] ? `${sgn(e.results["5"].excess * 100, 2)}%` : "chờ"}</td>
                      <td className="text-center font-mono">{e.results["10"] ? `${sgn(e.results["10"].excess * 100, 2)}%` : "chờ"}</td>
                      <td className="text-center font-mono">{e.results["10"]?.vnIndex != null ? `${sgn(e.results["10"].vnIndex * 100, 2)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-500">Vào lệnh đóng cửa d+1, ra đóng cửa d+1+h; chi phí 0,40%/vòng cho cả danh mục và rổ đều (lợi suất vượt không đổi khi trừ phí cả hai). Đường cong là xấp xỉ: lợi suất vượt 10 phiên chia đều theo phiên rồi cộng dồn.</p>
          </>
        )}
      </section>
    </div>
  );
}
