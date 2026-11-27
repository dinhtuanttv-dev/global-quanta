// HS360-v3 H2 (27/11/2026, docs/ho-so-360-v3/03) — góc "Tín hiệu" của Hồ sơ 360°: 25 tín hiệu E2 của một mã trong MỘT bảng.
// Cột: giá trị hôm nay (định dạng theo đơn vị) · phân vị toàn thị trường / trong ngành ICB cấp 2 (theo chiều tốt) · bậc E2 · SQS + xu hướng
// (EV-4) · IC ở kỳ hạn chính trong CHẾ ĐỘ THỊ TRƯỜNG HÔM NAY · đóng góp vào Điểm Elite (đối chứng). Lọc theo tab nguồn / bất lợi / bậc A–B.
// CHỈ HIỂN THỊ — không đổi bậc, trọng số hay quy tắc. Giữ data-testid elite-sig-<id> và elite-ws-note của bảng cũ.
import { useMemo, useState } from "react";
import type { EvidenceSignal, PanelTicker, SignalSpec, Tier } from "../../../lib/elite10/decisionTypes";
import type { EvolutionSignal, MarketRegime } from "../../../lib/elite10/evolutionTypes";
import { labelOf, metaOf } from "../../../lib/elite10/signalSemantics";
import { TierChip } from "./DecisionBoard";
import { TrendChip, REGIME_VI } from "./EvidenceEvolution";

const nf = (v: number, d: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v: number, d: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)}`;

/** Giá trị theo đơn vị của sổ E1 (03 §3): tỷ lệ -> %, z / đcb 2 chữ số, xác suất -> %, thang 0–100 số nguyên. */
export function formatSignalValue(unit: string, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "tỷ lệ") return `${signed(v * 100, 1)}%`;
  if (unit === "xác suất") return `${nf(v * 100, 0)}%`;
  if (unit === "0–100") return nf(v, 0);
  if (unit === "đcb/phiên") return `${signed(v, 2)} đcb`;
  if (unit === "z" || unit === "log") return signed(v, 2);
  return nf(v, Math.abs(v) >= 100 ? 0 : 2);
}

/** Phân vị (0–100) của v trong danh sách (hạng trung bình cho giá trị trùng). */
function pctOf(values: number[], v: number): number | null {
  if (!values.length) return null;
  let below = 0, equal = 0;
  for (const x of values) { if (x < v) below++; else if (x === v) equal++; }
  return ((below + equal / 2) / values.length) * 100;
}

/** Nguồn của bảng E1 mà tín hiệu phụ thuộc — để ghi rõ lý do ô trống. */
const SOURCE_OF: Record<string, string> = {
  stealth20: "researchFeatures", stealth5: "researchFeatures", net_intent: "researchFeatures", mom5_atr: "researchFeatures", log_rvol: "researchFeatures",
  camslim_cup: "strategies:camslim", kq_nowcast: "kqkd", top20_alpha: "top20", ws_sector_alpha: "worldStrategy", rrg_quadrant: "rrg",
  catalyst_impact: "catalyst", cotuc_decision: "cotuc", ls_v1: "leadership", structure_score: "structure", structure_verdict: "structure", structure_stage: "structure",
  sepa_s2: "strategies:sepa", sepa_state: "strategies:sepa", pattern_state: "strategies:patterns", convergence: "strategies:convergence", base_breakout: "strategies:base-breakout",
};
const TIER_ORDER: Record<Tier, number> = { A: 0, B: 1, C: 2 };

export interface SignalRowModel {
  spec: SignalSpec; v: number | null; tier: Tier; label: string | null; text: string;
  pctAll: number | null; pctSector: number | null; good: number | null; adverse: boolean; sourceMissing: boolean;
  ev: EvidenceSignal | undefined; evo: EvolutionSignal | undefined; contribution: number | null;
}

/** Dòng của bảng (hàm thuần để kiểm thử): giá trị, phân vị toàn thị trường / ngành, bậc hiện hành, chiều bất lợi. */
export function signalRows({ panel, rows, evOf, evoOf, contributions }: {
  panel: PanelTicker; rows: { ticker: string; icb?: { l2?: string } | null; values: Record<string, number | null> }[];
  evOf: Map<string, EvidenceSignal>; evoOf: Map<string, EvolutionSignal>; contributions: { id: string; contribution: number }[];
}): SignalRowModel[] {
  const l2 = panel.icb?.l2 ?? null;
  const all = new Map<string, number[]>(), sector = new Map<string, number[]>();
  for (const r of rows) for (const [k, v] of Object.entries(r.values)) {
    if (v == null) continue;
    (all.get(k) ?? all.set(k, []).get(k)!).push(v);
    if (l2 && r.icb?.l2 === l2) (sector.get(k) ?? sector.set(k, []).get(k)!).push(v);
  }
  return panel.signals.map((spec) => {
    const v = panel.values[spec.id] ?? null;
    const meta = metaOf(spec.id);
    const label = meta.kind === "numeric" ? null : labelOf(spec.id, v);
    const pctAll = v == null || meta.kind !== "numeric" ? null : pctOf(all.get(spec.id) ?? [], v);
    const secVals = sector.get(spec.id) ?? [];
    const pctSector = v == null || meta.kind !== "numeric" || secVals.length < 5 ? null : pctOf(secVals, v);
    const good = pctAll == null || meta.higherBetter == null ? null : meta.higherBetter ? pctAll : 100 - pctAll;
    const ev = evOf.get(spec.id);
    const c = contributions.find((x) => x.id === spec.id);
    return {
      spec, v, tier: (ev?.tier as Tier | undefined) ?? spec.tier, label, text: label ?? formatSignalValue(spec.unit, v),
      pctAll, pctSector, good, adverse: meta.kind === "numeric" ? good != null && good < 40 : v != null && v < 0,
      sourceMissing: v == null && panel.missingSources.includes(SOURCE_OF[spec.id] ?? "—"),
      ev, evo: evoOf.get(spec.id), contribution: c && c.contribution !== 0 ? c.contribution : null,
    };
  }).sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || (b.evo?.sqs ?? -1) - (a.evo?.sqs ?? -1) || a.spec.labelVi.localeCompare(b.spec.labelVi));
}

function Bar({ p, good, title }: { p: number | null; good: number | null; title: string }) {
  if (p == null) return <span className="text-[10px] text-slate-600">—</span>;
  return (
    <span title={title} className="relative inline-block h-1.5 w-14 rounded bg-white/10 align-middle">
      <span className="absolute top-0 h-1.5 rounded" style={{ width: `${good ?? p}%`, background: good == null ? "rgba(148,163,184,0.6)" : good >= 50 ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)" }} />
    </span>
  );
}

export default function SignalTableView({ panel, rows, evOf, evoOf, contributions, regime }: {
  panel: PanelTicker; rows: { ticker: string; icb?: { l2?: string } | null; values: Record<string, number | null> }[];
  evOf: Map<string, EvidenceSignal>; evoOf: Map<string, EvolutionSignal>; contributions: { id: string; contribution: number }[]; regime: MarketRegime | "UNKNOWN" | null;
}) {
  const [tab, setTab] = useState<string | null>(null);
  const [adverseOnly, setAdverseOnly] = useState(false);
  const [weightedOnly, setWeightedOnly] = useState(false);
  const all = useMemo(() => signalRows({ panel, rows, evOf, evoOf, contributions }), [panel, rows, evOf, evoOf, contributions]);
  const tabs = useMemo(() => [...new Set(all.map((r) => r.spec.tab))], [all]);
  const shown = all.filter((r) => (!tab || r.spec.tab === tab) && (!adverseOnly || r.adverse) && (!weightedOnly || r.tier !== "C"));
  const chip = (on: boolean) => `min-h-[24px] rounded border px-2 text-[10.5px] ${on ? "border-q-accent/60 bg-q-accent/15 text-q-accent-strong" : "border-white/10 text-slate-400 hover:border-white/25"}`;
  const reg = regime && regime !== "UNKNOWN" ? regime : null;
  return (
    <div className="space-y-2" data-testid="elite-signal-table">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Lọc tín hiệu">
        {[null, ...tabs].map((t) => (
          <button key={t ?? "all"} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={chip(tab === t)} data-testid={`elite-sig-tab-${t ?? "all"}`}>
            {t ?? "Tất cả"} ({t ? all.filter((r) => r.spec.tab === t).length : all.length})
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" aria-hidden />
        <button type="button" aria-pressed={adverseOnly} onClick={() => setAdverseOnly((v) => !v)} className={chip(adverseOnly)} data-testid="elite-sig-adverse">Chỉ bất lợi ({all.filter((r) => r.adverse).length})</button>
        <button type="button" aria-pressed={weightedOnly} onClick={() => setWeightedOnly((v) => !v)} className={chip(weightedOnly)} data-testid="elite-sig-weighted">Chỉ bậc A/B ({all.filter((r) => r.tier !== "C").length})</button>
      </div>
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[11px]" style={{ borderCollapse: "collapse" }}>
          <thead><tr className="text-[10px] text-slate-500">
            <th className="py-1 pr-2 text-left font-normal">Tín hiệu</th>
            <th className="px-2 text-right font-normal">Hôm nay</th>
            <th className="px-2 text-left font-normal" title="Phân vị trong ~toàn bộ mã cùng phiên / trong ngành ICB cấp 2, xoay theo chiều tốt (xanh = mạnh, đỏ = yếu)">Phân vị toàn TT / ngành</th>
            <th className="px-2 text-center font-normal">Bậc</th>
            <th className="px-2 text-left font-normal" title="Chỉ số sức khoẻ tín hiệu 0–100 + nhãn xu hướng (tab 4, EV-4) — mô tả">SQS · xu hướng</th>
            <th className="px-2 text-right font-normal" title="IC hạng TB ở kỳ hạn chính, chỉ tính các ngày cùng chế độ thị trường với hôm nay">IC {reg ? REGIME_VI[reg].toLowerCase() : "chế độ hiện tại"}</th>
            <th className="pl-2 text-right font-normal" title="Đóng góp vào Điểm Elite — danh mục dòng tiền (đối chứng); chỉ bậc A/B">Đóng góp Z</th>
          </tr></thead>
          <tbody>
            {shown.map((r) => {
              const s = r.spec, h = r.ev?.byH?.[String(r.ev.mainH)];
              const ri = reg && r.evo ? r.evo.regimeIc[reg] : null;
              const flagColor = r.v == null ? "" : r.v > 0 ? "text-emerald-300" : r.v < 0 ? "text-rose-300" : "text-slate-400";
              return (
                <tr key={s.id} className="border-t border-white/5" data-testid={`elite-sig-${s.id}`} data-adverse={r.adverse}>
                  <td className="py-1 pr-2 text-slate-300">
                    {s.labelVi}<span className="block text-[10px] text-slate-500">{s.tab}</span>
                    {s.id === "ws_sector_alpha" && <span className="block text-[10px] text-slate-500" data-testid="elite-ws-note">Dự báo đã kiểm định chỉ cho phiên VN kế tiếp lúc ATO — đã phản ánh khi Elite vào lệnh (đóng cửa d+1). Trọng số trong Điểm Elite do bằng chứng E2 quyết định (tiên nghiệm 0).</span>}
                  </td>
                  <td className={`whitespace-nowrap px-2 text-right ${r.label ? `text-[10.5px] ${flagColor}` : "font-mono"}`} title={r.v == null ? (r.sourceMissing ? "Nguồn thiếu ở phiên này" : "Không có dữ liệu cho mã này") : undefined}>
                    {r.text}{r.v == null && r.sourceMissing && <span className="block text-[9.5px] text-amber-300/80">nguồn thiếu</span>}
                  </td>
                  <td className="whitespace-nowrap px-2">
                    <Bar p={r.pctAll} good={r.good} title={`Toàn thị trường: phân vị ${r.pctAll == null ? "—" : nf(r.pctAll, 0)}`} />
                    <span className="ml-1.5" />
                    <Bar p={r.pctSector} good={r.pctSector == null || metaOf(s.id).higherBetter == null ? null : metaOf(s.id).higherBetter ? r.pctSector : 100 - r.pctSector} title={`Trong ngành: phân vị ${r.pctSector == null ? "— (dưới 5 mã cùng ngành)" : nf(r.pctSector, 0)}`} />
                  </td>
                  <td className="whitespace-nowrap px-2 text-center" title={h ? `Kiểm định ${r.ev!.mainH} phiên: IC TB ${h.mean ?? "—"} · t ${h.t ?? "—"} · n ${h.n}${h.stable ? " · ổn định hai nửa" : ""}` : r.ev?.reasonVi}>
                    <TierChip tier={r.tier} />{h && <span className="ml-1 font-mono text-[10px] text-slate-500">t {h.t == null ? "—" : nf(h.t, 1)}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2" data-testid={`elite-sig-sqs-${s.id}`}>
                    {r.evo ? <><b className="mr-1 font-mono text-slate-100">{r.evo.sqs}</b><TrendChip tag={r.evo.trendTag} /></> : <span className="text-[10px] text-slate-500">{evoOf.size ? "mới — chưa đo" : "—"}</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 text-right font-mono" data-testid={`elite-sig-regime-${s.id}`} title={ri ? `${ri.n} ngày · t ${ri.t ?? "—"}` : undefined}>
                    {ri && ri.n >= 10 && ri.mean != null ? <span className={ri.mean < 0 ? "text-rose-300" : "text-slate-200"}>{signed(ri.mean, 3)}<span className="ml-1 text-[9.5px] text-slate-500">{ri.n}n</span></span> : <span className="text-[10px] text-slate-500">chưa đủ</span>}
                  </td>
                  <td className="whitespace-nowrap pl-2 text-right font-mono text-[10.5px] text-slate-300">{r.contribution == null ? "" : signed(r.contribution, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length === 0 && <p className="text-[11px] text-slate-500">Không tín hiệu nào khớp bộ lọc.</p>}
    </div>
  );
}
