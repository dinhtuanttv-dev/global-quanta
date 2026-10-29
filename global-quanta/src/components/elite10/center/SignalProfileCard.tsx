// Elite 10 E4 — Hồ sơ 360°: mọi tín hiệu của một mã từ 7 tab (sổ E1), bậc bằng chứng hiện hành (E2), phân vị trong vũ trụ và
// Điểm Elite (E3). Tín hiệu bậc C hiển thị làm bối cảnh, có nhãn rõ, không cộng vào điểm.
// 30/10/2026: số tín hiệu đếm theo sổ (24); tín hiệu bậc / cờ hiện NHÃN thay vì thanh phân vị; thanh phân vị theo CHIỀU TỐT của
// từng tín hiệu (xám = trung tính); bậc kèm IC / t / n ở kỳ hạn chính; thác đóng góp vào Z; khoảng cách tới danh mục Elite 10.
import { useMemo } from "react";
import { useEliteDecision, useEliteEvidence, useElitePanel, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import type { Tier } from "../../../lib/elite10/decisionTypes";
import { labelOf, metaOf } from "../../../lib/elite10/signalSemantics";
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
  const { data: dec } = useEliteDecision();
  const evOf = useMemo(() => new Map((ev?.signals ?? []).map((s) => [s.id, s])), [ev]);
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
  // Khoảng cách tới danh mục: Z của mã yếu nhất đang trong Elite 10.
  const gap = useMemo(() => {
    const pf = dec?.portfolio ?? [];
    if (!decision || !pf.length || decision.inPortfolio) return null;
    const weakest = pf.reduce((a, b) => (b.Z < a.Z ? b : a));
    return { weakest, dz: weakest.Z - decision.Z };
  }, [dec, decision]);

  if (isLoading) return <p className="py-3 text-xs italic text-slate-500">Đang tải hồ sơ tín hiệu {ticker}…</p>;
  if (!panel) {
    return (
      <div className="tw-scope rounded-lg border border-white/10 bg-slate-950/60 p-3 text-[11px] text-slate-400" data-testid="elite-profile-missing">
        {ticker} không nằm trong vũ trụ Siêu quét của bảng tín hiệu (chỉ số hoặc mã ngoài danh sách), nên chưa có Điểm Elite. Phần phân tích kỹ thuật bên dưới vẫn dùng dữ liệu thật.
      </div>
    );
  }
  const tabs = groups.length;
  const contribs = (decision?.contributions ?? []).filter((c) => c.contribution !== 0).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const maxAbs = Math.max(1e-9, ...contribs.map((c) => Math.abs(c.contribution)));
  const labelFor = (id: string) => panel.signals.find((s) => s.id === id)?.labelVi ?? id;

  return (
    <section className="tw-scope rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-3 text-slate-200" data-testid="elite-profile">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-bold text-cyan-300">Hồ sơ tín hiệu {ticker} — phiên {panel.date.split("-").reverse().join("/")}</p>
          <p className="text-[10.5px] text-slate-400">{panel.signals.length} tín hiệu từ {tabs} tab, chuẩn hoá theo sổ đăng ký E1. Thanh = phân vị trong ~{full?.rows.length ?? "—"} mã cùng phiên, xoay theo chiều tốt của từng tín hiệu (xanh = mạnh, đỏ = yếu, xám = trung tính).</p>
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

      {decision && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-2" data-testid="elite-profile-waterfall">
            <p className="mb-1 text-[9.5px] font-bold uppercase text-slate-500">Đóng góp vào Điểm Elite (Z = {num(decision.Z)})</p>
            {contribs.length === 0 ? <p className="text-[10.5px] text-slate-500">Không tín hiệu bậc A/B nào có giá trị khác 0 ở mã này.</p> : contribs.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5 text-[10.5px]" data-testid={`elite-contrib-${c.id}`}>
                <span className="w-28 shrink-0 truncate text-slate-300" title={labelFor(c.id)}>{labelFor(c.id)}</span>
                <span className="relative h-2 flex-1 rounded bg-white/5">
                  <span className="absolute top-0 h-2 rounded" style={{ left: c.contribution >= 0 ? "50%" : `${50 - (Math.abs(c.contribution) / maxAbs) * 50}%`, width: `${(Math.abs(c.contribution) / maxAbs) * 50}%`, background: c.contribution >= 0 ? "rgba(52,211,153,.75)" : "rgba(251,113,133,.75)" }} />
                  <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-white/25" />
                </span>
                <span className="w-12 shrink-0 text-right font-mono">{c.contribution > 0 ? "+" : ""}{num(c.contribution)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-[10.5px]" data-testid="elite-profile-gap">
            <p className="mb-1 text-[9.5px] font-bold uppercase text-slate-500">Khoảng cách tới Elite 10</p>
            {decision.inPortfolio ? <p className="text-emerald-300">Đang trong danh mục Elite 10.</p>
              : !decision.eligible ? <p className="text-amber-300">Chưa đủ điều kiện danh mục ({decision.reason}) — Điểm Elite cao cũng không được chọn.</p>
              : gap ? (
                <p className="text-slate-300">Mã yếu nhất trong danh mục: <b className="font-mono">{gap.weakest.ticker}</b> Z {num(gap.weakest.Z)} (hạng {gap.weakest.rank}).{" "}
                  {gap.dz > 0 ? <>{ticker} cần thêm <b className="font-mono">ΔZ ≈ {num(gap.dz)}</b> mới vượt — chưa tính vùng đệm top 20 và trần 3 mã / ngành.</> : <>Z của {ticker} đã cao hơn — đang đứng ngoài vì trần 3 mã / ngành hoặc vùng đệm giữ mã cũ.</>}</p>
              ) : <p className="text-slate-500">Chưa có danh mục phiên này.</p>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {groups.map(([tab, specs]) => (
          <div key={tab} className="rounded-md border border-white/10 bg-white/[0.02] p-2">
            <p className="mb-1 text-[9.5px] font-bold uppercase text-slate-500">{tab}</p>
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse" }}>
              <tbody>
                {specs.map((s) => {
                  const v = panel.values[s.id];
                  const meta = metaOf(s.id);
                  const label = meta.kind === "numeric" ? null : labelOf(s.id, v);
                  const pct = v == null || meta.kind !== "numeric" ? null : percentile(distribution.get(s.id) ?? [], v);
                  const good = pct == null || meta.higherBetter == null ? null : meta.higherBetter ? pct : 100 - pct;
                  const e = evOf.get(s.id);
                  const tier = (e?.tier as Tier | undefined) ?? s.tier;
                  const h = e?.byH?.[String(e.mainH)];
                  const contrib = decision?.contributions.find((c) => c.id === s.id);
                  const flagColor = v == null ? "" : v > 0 ? "text-emerald-300" : v < 0 ? "text-rose-300" : "text-slate-400";
                  return (
                    <tr key={s.id} className="border-t border-white/5" data-testid={`elite-sig-${s.id}`}>
                      <td className="py-1 pr-1 text-slate-300">{s.labelVi}</td>
                      <td className={`whitespace-nowrap px-1 text-right ${label ? `text-[10.5px] ${flagColor}` : "font-mono"}`}>{label ?? num(v)}</td>
                      <td className="w-24 px-1">
                        {pct != null && (
                          <span title={`Phân vị ${num(pct, 0)}${meta.higherBetter == null ? " · trung tính (không có chiều tốt)" : meta.higherBetter ? "" : " · thấp là tốt"}`} className="relative inline-block h-1.5 w-20 rounded bg-white/10 align-middle">
                            <span className="absolute top-0 h-1.5 rounded" style={{ width: `${good ?? pct}%`, background: good == null ? "rgba(148,163,184,0.6)" : good >= 50 ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)" }} />
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap pl-1 text-right" title={h ? `Kiểm định ${e!.mainH} phiên: IC TB ${num(h.mean, 4)} · t ${num(h.t)} · n ${h.n}${h.stable ? " · ổn định hai nửa" : ""}` : e?.reasonVi}>
                        <TierChip tier={tier} />
                        {h && <span className="ml-1 font-mono text-[9px] text-slate-500">t {num(h.t, 1)}</span>}
                        {contrib && contrib.contribution !== 0 && <span className="ml-1 text-[9.5px] text-slate-400">{contrib.contribution > 0 ? "+" : ""}{num(contrib.contribution)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500">Chỉ tín hiệu bậc A/B có số đóng góp vào Điểm Elite. Giá trị trống = nguồn không có dữ liệu cho mã này (không điền số giả). Rê chuột lên bậc để xem IC / t / n của kiểm định.</p>
    </section>
  );
}
