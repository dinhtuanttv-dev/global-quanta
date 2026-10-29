// 🔎 BỘ LỌC ELITE (30/10/2026) — chế độ lọc của bảng Hồ sơ tín hiệu: cả vũ trụ (~284 mã) × 24 tín hiệu của bảng E1.
//   • Nút điều kiện: bấm lần 1 = YÊU CẦU, lần 2 = LOẠI TRỪ, lần 3 = tắt; mỗi nút ghi bậc bằng chứng (A/B có trọng số trong Điểm Elite,
//     C chỉ là bối cảnh, V = vùng mua v3 đạt kiểm định) + số mã đạt (đếm tức thì bằng bitset, không gọi máy chủ).
//   • Tất cả điều kiện / ≥ k trong n · phân vị trung lập ngành · chỉ mã đủ điều kiện danh mục.
//   • Phễu, bảng kết quả có VÂN TAY 24 tín hiệu, ★ biên Pareto, xếp theo Điểm Elite / số điều kiện đạt / giống một mã.
//   • Lưu theo tài khoản (Gateway), link chia sẻ, báo khi có mã mới đạt. "Elite 10 · bộ lọc của tôi" = CÙNG thuật toán dựng danh mục
//     chính thức trên tập mã đạt bộ lọc, có sổ theo dõi tiến riêng — KHÔNG thay đổi danh mục Elite 10 chính thức.
import { useEffect, useMemo, useState } from "react";
import { useEliteDecision, useEliteEvidence, useElitePanel } from "../../../hooks/elite10/useEliteCenter";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { useMyFilter } from "../../../hooks/elite10/useMyFilter";
import { condBits, condTester, cosine, decodeFilter, encodeFilter, evaluateFilter, paretoFront, percentiles, type Bits, type FCtx } from "../../../lib/elite10/filterEngine";
import { ALL_CHIPS, CHIPS, CHIP_BY_ID, DEFAULT_UI, EXCLUDE_CHIPS, filterToUi, metaOf, PRESETS, uiToFilter, type FilterUi } from "../../../lib/elite10/signalSemantics";
import { browserNotify } from "../../../lib/priceAlerts";
import { TierChip } from "./DecisionBoard";
import type { Tier } from "../../../lib/elite10/decisionTypes";

const num = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));
const pct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d).replace(".", ",")}%`);
const UI_KEY = "elite10:screener-ui", SEEN_KEY = "elite10:screener-seen";
type SortKey = "z" | "hits" | "similar";

/** Màu ô vân tay: số -> phân vị theo chiều tốt (đỏ -> xám -> xanh); bậc / cờ -> dấu; thiếu -> tối. */
function cellColor(sig: string, v: number | null, p: number | null): string {
  if (v == null) return "rgba(30,41,59,.6)";
  const m = metaOf(sig);
  if (m.kind !== "numeric") return v > 0 ? "rgba(52,211,153,.85)" : v < 0 ? "rgba(251,113,133,.8)" : "rgba(100,116,139,.35)";
  if (m.higherBetter == null || p == null) return "rgba(148,163,184,.45)";
  const t = (m.higherBetter ? p : 100 - p) / 100;
  if (t >= 0.5) return `rgba(52,211,153,${(0.2 + (t - 0.5) * 1.5).toFixed(2)})`;
  return `rgba(251,113,133,${(0.2 + (0.5 - t) * 1.5).toFixed(2)})`;
}

function readUi(): FilterUi {
  try {
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("elite-filter");
    if (fromLink) { const f = decodeFilter(fromLink); if (f) return filterToUi(f).ui; }
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return { ...DEFAULT_UI, ...JSON.parse(raw) };
  } catch { /* bỏ qua */ }
  return DEFAULT_UI;
}

export default function EliteScreener({ onOpenTicker, refTicker }: { onOpenTicker: (t: string) => void; refTicker: string | null }) {
  const { data: panel } = useElitePanel();
  const { data: d } = useEliteDecision();
  const { data: ev } = useEliteEvidence();
  const buy = useGatewayBuyTimeline();
  const my = useMyFilter();
  const [ui, setUi] = useState<FilterUi>(readUi);
  const [sort, setSort] = useState<SortKey>("z");
  const [limit, setLimit] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* bỏ qua */ } }, [ui]);
  // Bộ lọc đã lưu theo tài khoản: nạp một lần khi chưa có trạng thái cục bộ / link.
  useEffect(() => {
    if (!my.saved?.filter) return;
    let hasLocal = false;
    try { hasLocal = Boolean(localStorage.getItem(UI_KEY)) || window.location.hash.includes("elite-filter="); } catch { /* bỏ qua */ }
    if (!hasLocal) setUi(filterToUi(my.saved.filter).ui);
  }, [my.saved?.hash]); // eslint-disable-line react-hooks/exhaustive-deps

  const tierOf = useMemo(() => new Map((ev?.signals ?? []).map((s) => [s.id, s.tier as Tier])), [ev]);
  const scores = useMemo(() => new Map((d?.scores ?? []).map((x) => [x.ticker, x])), [d]);
  const inElite = useMemo(() => new Set((d?.portfolio ?? []).map((p) => p.ticker)), [d]);
  const buyZone = useMemo(() => new Set((buy.data?.rows ?? []).filter((r) => r.tier === "VALIDATED" && (r.status === "IN_WINDOW" || (r.status === "UPCOMING" && r.sessionsToEntry <= 10))).map((r) => r.ticker)), [buy.data]);
  const ctx: FCtx | null = useMemo(() => (panel && d ? { rows: panel.rows as FCtx["rows"], scores, buyZone } : null), [panel, d, scores, buyZone]);
  const filter = useMemo(() => uiToFilter(ui), [ui]);
  const result = useMemo(() => (ctx ? evaluateFilter(filter, ctx) : null), [ctx, filter]);
  const specs = useMemo(() => ev?.signals ?? [], [ev]);
  const sigIds = useMemo(() => specs.map((s) => s.id), [specs]);
  const pctBy = useMemo(() => new Map(sigIds.map((id) => [id, ctx ? percentiles(ctx.rows, id, ui.neutral) : new Map<string, number>()])), [sigIds, ctx, ui.neutral]);

  // Đếm tức thì cho từng nút: bitset của điều kiện ∧ tập đủ điều kiện (∧ tập đang đạt khi ở chế độ "tất cả").
  const counts = useMemo(() => {
    const out = new Map<string, { alone: number; withCurrent: number }>();
    if (!ctx || !result) return out;
    const test = condTester(ctx);
    const elig = condBits({ sig: "__elig", op: "==", val: 1 }, { ...ctx, rows: ctx.rows }, (_c, r) => !ui.eligibleOnly || Boolean(ctx.scores.get(r.ticker)?.eligible));
    const passSet = new Set(result.pass);
    const passBits = condBits({ sig: "__pass", op: "==", val: 1 }, ctx, (_c, r) => passSet.has(r.ticker));
    for (const c of ALL_CHIPS) {
      const cond = c.cond.op === "p>=" && ui.neutral ? { ...c.cond, neutral: true } : c.cond;
      const b: Bits = condBits(cond, ctx, test).and(elig);
      const isNot = ui.not.includes(c.id);
      out.set(c.id, { alone: b.count(), withCurrent: isNot ? passBits.count() : ui.mode === "all" && !ui.on.includes(c.id) ? passBits.and(b).count() : b.count() });
    }
    return out;
  }, [ctx, result, ui]);

  const eligibleCount = useMemo(() => (d?.scores ?? []).filter((x) => x.eligible).length, [d]);
  const afterRequire = useMemo(() => (ctx ? evaluateFilter({ ...filter, not: [] }, ctx).pass.length : 0), [ctx, filter]);

  const numericSigs = useMemo(() => sigIds.filter((id) => metaOf(id).kind === "numeric" && metaOf(id).higherBetter), [sigIds]);
  const vecOf = (t: string) => sigIds.map((id) => {
    const r = ctx?.rows.find((x) => x.ticker === t); const v = r?.values[id] ?? null;
    if (v == null) return null;
    return metaOf(id).kind === "numeric" ? pctBy.get(id)?.get(t) ?? null : 50 + Math.sign(v) * 40;
  });
  // Pareto trên các tín hiệu số đang được YÊU CẦU (không có -> Stealth 20 / 5 + Alpha M1).
  const paretoSigs = useMemo(() => {
    const fromUi = ui.on.map((id) => CHIP_BY_ID.get(id)?.sig).filter((s): s is string => Boolean(s) && numericSigs.includes(s!));
    return [...new Set(fromUi.length >= 2 ? fromUi : ["stealth20", "stealth5", "top20_alpha"])];
  }, [ui.on, numericSigs]);
  const pareto = useMemo(() => (result ? paretoFront(result.pass, (t) => paretoSigs.map((s) => pctBy.get(s)?.get(t) ?? null)) : new Set<string>()), [result, paretoSigs, pctBy]);
  const refVec = useMemo(() => (refTicker && ctx ? vecOf(refTicker) : null), [refTicker, ctx, pctBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    if (!result) return [];
    const list = result.pass.map((t) => {
      const s = scores.get(t);
      return { t, s, hits: (result.hits.get(t) ?? []).filter(Boolean).length, sim: refVec ? cosine(refVec, vecOf(t)) : null };
    });
    const z = (x: (typeof list)[number]) => x.s?.Z ?? -99;
    return list.sort((a, b) => sort === "hits" ? b.hits - a.hits || z(b) - z(a) : sort === "similar" ? (b.sim ?? -2) - (a.sim ?? -2) : z(b) - z(a));
  }, [result, scores, sort, refVec]); // eslint-disable-line react-hooks/exhaustive-deps

  // 🔔 báo mã mới đạt bộ lọc (so với lần xem trước của cùng bộ lọc)
  useEffect(() => {
    if (!result || !d) return;
    const key = `${SEEN_KEY}:${JSON.stringify(filter)}`;
    let prev: { date: string; pass: string[] } | null = null;
    try { prev = JSON.parse(localStorage.getItem(key) ?? "null"); } catch { /* bỏ qua */ }
    if (prev && prev.date !== d.date) {
      const fresh = result.pass.filter((t) => !prev!.pass.includes(t));
      if (fresh.length) browserNotify("🔎 Bộ lọc Elite", `${fresh.length} mã mới đạt "${ui.name}": ${fresh.slice(0, 8).join(", ")}`, `elite-screener-${d.date}`);
    }
    try { localStorage.setItem(key, JSON.stringify({ date: d.date, pass: result.pass })); } catch { /* bỏ qua */ }
  }, [result, d, filter, ui.name]);

  const cycle = (id: string) => setUi((u) => {
    const on = u.on.includes(id), no = u.not.includes(id), exclOnly = EXCLUDE_CHIPS.some((c) => c.id === id);
    if (exclOnly) return { ...u, not: no ? u.not.filter((x) => x !== id) : [...u.not, id] };
    if (!on && !no) return { ...u, on: [...u.on, id] };
    if (on) return { ...u, on: u.on.filter((x) => x !== id), not: [...u.not, id] };
    return { ...u, not: u.not.filter((x) => x !== id) };
  });
  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}#elite-filter=${encodeFilter(filter)}`;
    try { await navigator.clipboard.writeText(url); setMsg("Đã chép link bộ lọc."); } catch { setMsg(url); }
  };
  const saveToAccount = async () => {
    try { await my.save(filter); setMsg("Đã lưu vào tài khoản · sổ theo dõi bắt đầu từ phiên dựng kế tiếp."); } catch (e) { setMsg(`Không lưu được: ${(e as Error).message}`); }
  };

  if (!panel || !d || !ev || !ctx || !result) return <p className="py-3 text-xs italic text-slate-500">Đang tải bảng tín hiệu cho bộ lọc…</p>;
  const groups = [...new Set(CHIPS.map((c) => c.group))];
  const tierFor = (sig: string): Tier | "V" | "—" => (sig === "_buyzone" ? "V" : sig.startsWith("_") ? "—" : tierOf.get(sig) ?? "C");
  const chipBtn = (c: (typeof ALL_CHIPS)[number]) => {
    const on = ui.on.includes(c.id), no = ui.not.includes(c.id), n = counts.get(c.id), tier = tierFor(c.sig);
    return (
      <button key={c.id} type="button" onClick={() => cycle(c.id)} data-testid={`chip-${c.id}`} aria-pressed={on || no} data-state={on ? "on" : no ? "not" : "off"}
        title={`${c.title ?? c.label} · ${tier === "V" ? "vùng mua v3 đạt kiểm định" : tier === "—" ? "điều kiện thanh khoản" : `bậc ${tier}`} · ${n?.alone ?? 0} mã đạt riêng điều kiện này · bấm: yêu cầu → loại trừ → tắt`}
        className={`inline-flex min-h-[26px] items-center gap-1 rounded border px-1.5 text-[10px] ${on ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100" : no ? "border-rose-400/60 bg-rose-500/10 text-rose-200 line-through decoration-rose-300/70" : "border-white/10 text-slate-300 hover:border-white/25"}`}>
        <span className={`rounded px-1 text-[8.5px] font-bold ${tier === "A" ? "bg-emerald-500/25 text-emerald-200" : tier === "B" ? "bg-sky-500/25 text-sky-200" : tier === "V" ? "bg-amber-500/25 text-amber-200" : "bg-white/10 text-slate-400"}`}>{tier}</span>
        {c.label}
        <span className="font-mono text-[9px] text-slate-400" data-testid={`chip-count-${c.id}`}>{on || no ? n?.alone ?? 0 : ui.mode === "all" ? `→${n?.withCurrent ?? 0}` : n?.alone ?? 0}</span>
      </button>
    );
  };
  const nConds = ui.on.length;
  const tabOrder = [...new Set(specs.map((s) => s.tab))];
  const sigOrder = tabOrder.flatMap((tab) => specs.filter((s) => s.tab === tab).map((s) => s.id));
  const overlap = my.portfolio ? my.portfolio.portfolio.filter((p) => inElite.has(p.ticker)).length : 0;
  const offH = d.ledgerSummary?.horizons?.["5"] ?? null, myH = my.portfolio?.ledger?.summary?.horizons?.["5"] ?? null;

  return (
    <div className="space-y-2" data-testid="elite-screener">
      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="text-slate-400">Bộ chọn sẵn:</span>
        {PRESETS.map((p) => (
          <button key={p.id} type="button" title={p.title} data-testid={`preset-${p.id}`} onClick={() => setUi(p.ui)}
            className={`min-h-[24px] rounded border px-2 ${ui.name === p.ui.name ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-slate-300 hover:border-white/25"}`}>{p.label}</button>
        ))}
        <span className="ml-auto inline-flex flex-wrap items-center gap-1.5">
          <span className="inline-flex rounded border border-white/10 p-0.5" role="group" aria-label="Cách kết hợp">
            <button type="button" aria-pressed={ui.mode === "all"} onClick={() => setUi({ ...ui, mode: "all" })} className={`rounded px-2 ${ui.mode === "all" ? "bg-cyan-500/20 text-cyan-100" : "text-slate-400"}`} data-testid="mode-all">Tất cả điều kiện</button>
            <button type="button" aria-pressed={ui.mode === "k"} onClick={() => setUi({ ...ui, mode: "k", k: Math.max(1, Math.min(nConds || 1, ui.k)) })} className={`rounded px-2 ${ui.mode === "k" ? "bg-cyan-500/20 text-cyan-100" : "text-slate-400"}`} data-testid="mode-k">≥ k / n</button>
          </span>
          {ui.mode === "k" && (
            <span className="inline-flex items-center gap-1" data-testid="k-control">
              <button type="button" aria-label="Giảm k" onClick={() => setUi({ ...ui, k: Math.max(1, ui.k - 1) })} className="h-6 w-6 rounded border border-white/10">−</button>
              <b className="font-mono">{Math.min(ui.k, Math.max(1, nConds))}/{nConds}</b>
              <button type="button" aria-label="Tăng k" onClick={() => setUi({ ...ui, k: Math.min(Math.max(1, nConds), ui.k + 1) })} className="h-6 w-6 rounded border border-white/10">+</button>
            </span>
          )}
          <label className="inline-flex items-center gap-1 text-slate-300"><input type="checkbox" checked={ui.neutral} onChange={(e) => setUi({ ...ui, neutral: e.target.checked })} className="accent-cyan-400" data-testid="toggle-neutral" /> Phân vị trung lập ngành</label>
          <label className="inline-flex items-center gap-1 text-slate-300"><input type="checkbox" checked={ui.eligibleOnly} onChange={(e) => setUi({ ...ui, eligibleOnly: e.target.checked })} className="accent-cyan-400" data-testid="toggle-eligible" /> Chỉ mã đủ điều kiện danh mục</label>
        </span>
      </div>

      <div className="grid gap-1.5 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g} className="rounded border border-white/5 bg-white/[0.015] p-1.5">
            <p className="mb-1 text-[9px] font-bold uppercase text-slate-500">{g}</p>
            <div className="flex flex-wrap gap-1">{CHIPS.filter((c) => c.group === g).map(chipBtn)}</div>
          </div>
        ))}
        <div className="rounded border border-rose-400/15 bg-rose-500/[0.03] p-1.5">
          <p className="mb-1 text-[9px] font-bold uppercase text-rose-300/80">Loại trừ (bấm chip thường 2 lần cũng thành loại trừ)</p>
          <div className="flex flex-wrap gap-1">{EXCLUDE_CHIPS.map(chipBtn)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px]" data-testid="screener-funnel" aria-label="Phễu lọc">
        <span className="text-slate-400">{panel.rows.length} mã</span><span className="text-slate-600">→</span>
        <span className="text-slate-300">{ui.eligibleOnly ? `${eligibleCount} đủ điều kiện` : "không lọc điều kiện"}</span><span className="text-slate-600">→</span>
        <span className="text-slate-300">{nConds ? `${afterRequire} đạt ${ui.mode === "k" ? `≥ ${Math.min(ui.k, nConds)}/${nConds}` : `cả ${nConds}`} điều kiện` : "chưa chọn điều kiện"}</span>
        {ui.not.length > 0 && <><span className="text-slate-600">→</span><span className="text-rose-300">loại {afterRequire - result.pass.length}</span></>}
        <span className="text-slate-600">=</span><b className="text-[12px] text-cyan-200" data-testid="screener-count">{result.pass.length} mã</b>
        <span className="text-slate-500">· {result.pass.filter((t) => inElite.has(t)).length} đang trong Elite 10 · ★ {pareto.size} trên biên Pareto ({paretoSigs.length} tiêu chí)</span>
        <span className="ml-auto inline-flex gap-1.5">
          <button type="button" onClick={saveToAccount} data-testid="screener-save" className="min-h-[24px] rounded border border-emerald-400/40 px-2 text-emerald-200 hover:bg-emerald-500/10">💾 Lưu vào tài khoản</button>
          <button type="button" onClick={share} data-testid="screener-share" className="min-h-[24px] rounded border border-white/15 px-2 text-slate-300 hover:bg-white/5">🔗 Chia sẻ</button>
        </span>
      </div>
      {msg && <p role="status" className="text-[10px] text-cyan-200" data-testid="screener-msg">{msg}</p>}

      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className="text-slate-400">Xếp theo:</span>
        {([["z", "Điểm Elite"], ["hits", "Số điều kiện đạt"], ["similar", refTicker ? `Giống ${refTicker}` : "Giống mã (chọn mã ở Hồ sơ)"]] as const).map(([k, l]) => (
          <button key={k} type="button" disabled={k === "similar" && !refTicker} aria-pressed={sort === k} onClick={() => setSort(k)} data-testid={`sort-${k}`}
            className={`min-h-[24px] rounded border px-2 ${sort === k ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-slate-400"} disabled:opacity-40`}>{l}</button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 760 }} data-testid="screener-table">
          <thead><tr className="text-left text-[9.5px] text-slate-500">
            <th className="py-1">#</th><th>Mã</th><th>Hạng · Z</th><th title="Số điều kiện YÊU CẦU đạt">Đạt</th>
            <th title={`Vân tay ${sigOrder.length} tín hiệu theo tab (xanh = mạnh theo đúng chiều tốt, đỏ = yếu; bậc / cờ theo dấu; tối = thiếu dữ liệu)`}>Vân tay {sigOrder.length} tín hiệu</th>
            {sort === "similar" && <th>Giống</th>}
          </tr></thead>
          <tbody>
            {rows.slice(0, limit).map((x, i) => (
              <tr key={x.t} className="border-t border-white/5" data-testid={`scr-row-${x.t}`}>
                <td className="py-1 pr-1 font-mono text-slate-500">{i + 1}</td>
                <td className="whitespace-nowrap pr-2">
                  <button type="button" onClick={() => onOpenTicker(x.t)} className="font-mono font-bold text-cyan-300 hover:underline" data-testid={`scr-open-${x.t}`}>{x.t}</button>
                  {pareto.has(x.t) && <span className="ml-1 text-amber-300" title={`Biên Pareto: không mã nào trong kết quả mạnh hơn ở MỌI tiêu chí (${paretoSigs.join(", ")})`} data-testid={`scr-pareto-${x.t}`}>★</span>}
                  {inElite.has(x.t) && <span className="ml-1 rounded border border-emerald-400/50 px-1 text-[8.5px] text-emerald-300">Elite 10</span>}
                </td>
                <td className="whitespace-nowrap pr-2 font-mono">#{x.s?.rank ?? "—"} · {num(x.s?.Z)}</td>
                <td className="pr-2 font-mono">{x.hits}/{nConds}</td>
                <td>
                  <svg width={sigOrder.length * 9} height={14} role="img" aria-label={`Vân tay tín hiệu ${x.t}`}>
                    {sigOrder.map((id, j) => {
                      const v = ctx.rows.find((r) => r.ticker === x.t)?.values[id] ?? null;
                      return <rect key={id} x={j * 9} y={1} width={8} height={12} rx={1.5} fill={cellColor(id, v, pctBy.get(id)?.get(x.t) ?? null)}><title>{`${specs.find((s) => s.id === id)?.labelVi}: ${v == null ? "—" : num(v)}`}</title></rect>;
                    })}
                  </svg>
                </td>
                {sort === "similar" && <td className="font-mono">{x.sim == null ? "—" : num(x.sim, 2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button type="button" onClick={() => setLimit((l) => l + 30)} className="text-[10.5px] text-cyan-300">Xem thêm {Math.min(30, rows.length - limit)} mã ▾</button>}

      <div className="rounded-md border border-emerald-400/20 bg-emerald-500/[0.03] p-2" data-testid="my-elite">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] font-bold text-emerald-300">Elite 10 · bộ lọc của tôi</p>
          <span className="text-[9.5px] text-slate-500">cùng thuật toán danh mục chính thức (Điểm Elite, trần 3 mã / ngành, ERC) trên tập mã đạt bộ lọc ĐÃ LƯU · không thay đổi danh mục chính thức</span>
        </div>
        {my.savedError ? <p className="text-[10px] text-slate-500">Đăng nhập để lưu bộ lọc và theo dõi danh mục riêng ({my.savedError}).</p>
          : !my.saved?.filter ? <p className="text-[10px] text-slate-500" data-testid="my-elite-empty">Chưa lưu bộ lọc nào — bấm 💾 Lưu vào tài khoản. Sổ theo dõi bắt đầu từ phiên dựng kế tiếp (không chấm ngược quá khứ).</p>
          : my.portfolioLoading && !my.portfolio ? <p className="text-[10px] text-slate-500">Đang dựng danh mục từ bộ lọc đã lưu…</p>
          : my.portfolio ? (
            <>
              <p className="text-[10px] text-slate-400">Bộ lọc đã lưu "{my.portfolio.filter.name}" ({new Date(my.portfolio.savedAt ?? "").toLocaleDateString("vi-VN")}) · phiên {my.portfolio.date.split("-").reverse().join("/")} · {my.portfolio.pass.length} mã đạt · {my.portfolio.portfolio.length} mã trong danh mục · trùng danh mục chính thức {overlap}/{my.portfolio.portfolio.length}</p>
              <div className="mt-1 flex flex-wrap gap-1" data-testid="my-elite-picks">
                {my.portfolio.portfolio.map((p) => (
                  <button key={p.ticker} type="button" onClick={() => onOpenTicker(p.ticker)} className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${inElite.has(p.ticker) ? "border-emerald-400/50 text-emerald-200" : "border-white/15 text-slate-200"}`}
                    title={`hạng ${p.rank} · Z ${num(p.Z)} · tỷ trọng ${num(p.weight * 100, 1)}%${inElite.has(p.ticker) ? " · cũng trong danh mục chính thức" : ""}`}>{p.ticker} {num(p.weight * 100, 0)}%</button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400" data-testid="my-elite-ledger">
                Sổ theo dõi: {my.portfolio.ledger?.startedAt ? `từ phiên ${my.portfolio.ledger.startedAt.split("-").reverse().join("/")} · ${my.portfolio.ledger.entries.length} phiên ghi` : "bắt đầu từ phiên dựng kế tiếp"}
                {myH?.n ? <> · vượt vũ trụ 5 phiên TB <b className="text-slate-200">{pct(myH.meanExcess)}</b> ({myH.n} lần chấm) so với danh mục chính thức <b className="text-slate-200">{pct(offH?.meanExcess)}</b> ({offH?.n ?? 0})</> : " · chưa đủ kỳ hạn để chấm (5 / 10 phiên)"}
              </p>
            </>
          ) : <p className="text-[10px] text-amber-300">Không dựng được danh mục từ bộ lọc ({my.portfolioError ?? "—"}).</p>}
        <p className="mt-1 text-[9.5px] text-slate-500">Bộ lọc chỉ được đưa vào danh mục chính thức khi vượt kiểm định đặt trước (walk-forward, bootstrap khối, FDR qua các bộ lọc đã thử, xác suất overfit) trên sổ theo dõi tiến đủ dài. Tín hiệu bậc C là bối cảnh, chưa có lợi thế đã kiểm định.</p>
      </div>
    </div>
  );
}
