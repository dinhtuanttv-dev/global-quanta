// Elite 10 E4 — Hồ sơ 360°: mọi tín hiệu của một mã từ 7 tab (sổ E1), bậc bằng chứng hiện hành (E2), phân vị trong vũ trụ và
// Điểm Elite (E3). Tín hiệu bậc C hiển thị làm bối cảnh, có nhãn rõ, không cộng vào điểm.
import { useMemo } from "react";
import { useEliteEvidence, useElitePanel, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import type { Tier } from "../../../lib/elite10/decisionTypes";
import { TierChip } from "./DecisionBoard";

const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));

/** Phân vị (0–100) của giá trị trong danh sách (hạng trung bình cho giá trị trùng). */
export function percentile(values: number[], v: number): number | null {
  if (!values.length) return null;
  let below = 0, equal = 0;
  for (const x of values) { if (x < v) below++; else if (x === v) equal++; }
  return ((below + equal / 2) / values.length) * 100;
}

export default function SignalProfileCard({ ticker }: { ticker: string }) {
  const { decision, panel, isLoading } = useEliteTicker(ticker);
  const { data: full } = useElitePanel();
  const { data: ev } = useEliteEvidence();
  const tierOf = useMemo(() => new Map((ev?.signals ?? []).map((s) => [s.id, s.tier as Tier])), [ev]);
  const groups = useMemo(() => {
    if (!panel) return [];
    const m = new Map<string, typeof panel.signals>();
    for (const s of panel.signals) { if (!m.has(s.tab)) m.set(s.tab, []); m.get(s.tab)!.push(s); }
    return [...m];
  }, [panel]);
  const distribution = useMemo(() => {
    const out = new Map<string, number[]>();
    for (const r of full?.rows ?? []) for (const [k, v] of Object.entries(r.values)) if (v != null) { if (!out.has(k)) out.set(k, []); out.get(k)!.push(v); }
    return out;
  }, [full]);

  if (isLoading) return <p className="py-3 text-xs italic text-slate-500">Đang tải hồ sơ tín hiệu {ticker}…</p>;
  if (!panel) {
    return (
      <div className="tw-scope rounded-lg border border-white/10 bg-slate-950/60 p-3 text-[11px] text-slate-400" data-testid="elite-profile-missing">
        {ticker} không nằm trong vũ trụ Siêu quét của bảng tín hiệu (chỉ số hoặc mã ngoài danh sách), nên chưa có Điểm Elite. Phần phân tích kỹ thuật bên dưới vẫn dùng dữ liệu thật.
      </div>
    );
  }

  return (
    <section className="tw-scope rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-3 text-slate-200" data-testid="elite-profile">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-cyan-300">Hồ sơ tín hiệu {ticker} — phiên {panel.date.split("-").reverse().join("/")}</p>
          <p className="text-[10.5px] text-slate-400">21 tín hiệu từ 7 tab, chuẩn hoá theo sổ đăng ký E1. Phân vị = vị trí trong ~{full?.rows.length ?? "—"} mã cùng phiên.</p>
        </div>
        {decision && (
          <div className="flex flex-wrap gap-1.5 text-[10.5px]" data-testid="elite-profile-score">
            <span className="rounded border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5">Hạng <b>{decision.rank}</b>/{decision.universe.panel}</span>
            <span className="rounded border border-white/15 px-2 py-0.5">Z <b>{num(decision.Z)}</b></span>
            <span className="rounded border border-white/15 px-2 py-0.5">α 5 phiên <b>{num(decision.alpha5Pct)}%</b></span>
            <span className="rounded border border-white/15 px-2 py-0.5">P vượt <b>{num(decision.pOutperform * 100, 1)}%</b></span>
            {decision.inPortfolio
              ? <span className="rounded border border-emerald-400/50 bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-300">Trong Elite 10</span>
              : !decision.eligible && <span className="rounded border border-amber-400/40 px-2 py-0.5 text-amber-300">Không đủ điều kiện: {decision.reason}</span>}
          </div>
        )}
      </div>
      {panel.missingSources.length > 0 && <p className="text-[10px] text-amber-300/80">Thiếu nguồn ở phiên này: {panel.missingSources.join(", ")} — cột tương ứng để trống.</p>}
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {groups.map(([tab, specs]) => (
          <div key={tab} className="rounded-md border border-white/10 bg-white/[0.02] p-2">
            <p className="mb-1 text-[9.5px] font-bold uppercase text-slate-500">{tab}</p>
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
              <tbody>
                {specs.map((s) => {
                  const v = panel.values[s.id];
                  const pct = v == null ? null : percentile(distribution.get(s.id) ?? [], v);
                  const tier = tierOf.get(s.id) ?? s.tier;
                  const contrib = decision?.contributions.find((c) => c.id === s.id);
                  return (
                    <tr key={s.id} className="border-t border-white/5" data-testid={`elite-sig-${s.id}`}>
                      <td className="py-1 pr-1 text-slate-300">{s.labelVi}</td>
                      <td className="whitespace-nowrap px-1 text-right font-mono">{num(v)}</td>
                      <td className="w-24 px-1">
                        {pct != null && (
                          <span title={`Phân vị ${num(pct, 0)}`} className="relative inline-block h-1.5 w-20 rounded bg-white/10 align-middle">
                            <span className="absolute top-0 h-1.5 rounded" style={{ width: `${pct}%`, background: pct >= 50 ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)" }} />
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap pl-1 text-right"><TierChip tier={tier} />{contrib && contrib.contribution !== 0 && <span className="ml-1 text-[9.5px] text-slate-400">{contrib.contribution > 0 ? "+" : ""}{num(contrib.contribution)}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500">Chỉ tín hiệu bậc A/B có số đóng góp vào Điểm Elite. Giá trị trống = nguồn không có dữ liệu cho mã này (không điền số giả).</p>
    </section>
  );
}
