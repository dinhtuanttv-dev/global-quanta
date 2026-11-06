// S2/S4/S6 (06/11/2026) — bổ sung cho mục 📊 Mùa vụ KQKD, KHÔNG đổi công thức / ngưỡng / hiển thị cũ:
//   S2 bản đồ toàn thị trường: rút gọn earnings-cycle-stats của Project A cho mọi mã × Q1–Q4 (Gateway dựng mỗi tuần), cùng quy tắc trạng thái
//      ĐẠT / THEO DÕI / CHƯA ĐỦ MẪU / KHÔNG CÓ LỢI THẾ như EarningsSeasonalityTab.
//   S4 bằng chứng gộp: phản ứng giá quanh công bố của cả ngành ICB cấp 2 và toàn thị trường theo loại quý (ES-v1, chỉ kỳ có tin BCTC chính thức).
//   S6 sổ theo dõi tiến: ghi một lần trước kỳ các cửa sổ THEO DÕI / ĐẠT, chấm bằng công thức Project A sau khi đủ phiên.
import { useMemo, useState } from "react";
import { useKqkdCalendar, useSeasonLedger, useSeasonMap } from "../../../../hooks/useKqkd";
import { dmy, fin, num, pct, pctPlain } from "../../../../lib/kqkd/format";
import type { Ci, PooledQ, SeasonLedgerEntry, SeasonMap, SeasonMapQuarter, SeasonPooled, SeasonWinStatus } from "../../../../lib/kqkd/types";

const QC = ["#22d3ee", "#34d399", "#fbbf24", "#a78bfa"];
export const STATUS_UI: Record<SeasonWinStatus, { t: string; cls: string }> = {
  SELECTED: { t: "ĐẠT", cls: "text-amber-300 border-amber-500/50 bg-amber-500/10" },
  WATCH: { t: "THEO DÕI", cls: "text-violet-200 border-violet-500/40 bg-violet-500/10" },
  THIN: { t: "CHƯA ĐỦ MẪU", cls: "text-slate-400 border-white/10" },
  NONE: { t: "KHÔNG CÓ LỢI THẾ", cls: "text-slate-500 border-white/10" },
};
const RANK: Record<SeasonWinStatus, number> = { SELECTED: 3, WATCH: 2, THIN: 1, NONE: 0 };
const PAGE = 40;
export type MapFilter = "ALL" | "SELECTED" | "WATCH" | "SOON" | "NEAR8";

/** S2: lọc + xếp bản đồ. soon = mã có ngày công bố dự kiến (LC4) trong 14 ngày tới; near8 = loại quý sắp công bố của mã (nextQ) còn đúng 1 kỳ là đủ mẫu tối thiểu. */
export function filterSeasonMap(m: SeasonMap, { filter, quarter, soon, nextQ = new Map(), query }: { filter: MapFilter; quarter: number | null; soon: Map<string, string>; nextQ?: Map<string, number>; query: string }) {
  const qs = quarter ? [quarter] : [1, 2, 3, 4];
  const need = m.rules.minEvents;
  const out = Object.entries(m.rows).map(([t, r]) => {
    const cells = qs.map((q) => r.q[String(q)]).filter((c): c is SeasonMapQuarter => !!c);
    const top = cells.reduce<SeasonWinStatus>((s, c) => (RANK[c.status] > RANK[s] ? c.status : s), "NONE");
    const bestNet = Math.max(-9, ...cells.map((c) => c.best.net ?? -9));
    return { t, r, top, bestNet, near8: (() => { const nq = nextQ.get(t); return !!nq && (!quarter || quarter === nq) && r.q[String(nq)]?.n === need - 1; })(), nq: nextQ.get(t) ?? null, soon: soon.get(t) ?? null };
  }).filter((x) => {
    if (query && !x.t.includes(query)) return false;
    if (filter === "SELECTED") return x.top === "SELECTED";
    if (filter === "WATCH") return x.top === "WATCH" || x.top === "SELECTED";
    if (filter === "SOON") return !!x.soon;
    if (filter === "NEAR8") return x.near8;
    return true;
  });
  out.sort((a, b) => (filter === "SOON" ? (a.soon ?? "").localeCompare(b.soon ?? "") : 0) || RANK[b.top] - RANK[a.top] || b.bestNet - a.bestNet || a.t.localeCompare(b.t));
  return out;
}

export function seasonMapCounts(m: SeasonMap) {
  return [1, 2, 3, 4].map((q) => {
    const c: Record<SeasonWinStatus, number> = { SELECTED: 0, WATCH: 0, THIN: 0, NONE: 0 };
    for (const r of Object.values(m.rows)) { const x = r.q[String(q)]; if (x) c[x.status] += 1; }
    return c;
  });
}

function Cell({ c, need }: { c: SeasonMapQuarter | null | undefined; need: number }) {
  if (!c) return <span className="text-slate-600">—</span>;
  const s = STATUS_UI[c.status];
  const win = c.windows.find((w) => w.id === (c.selected ?? c.best.id));
  return (
    <span className="inline-flex flex-col items-end gap-0.5" title={c.windows.map((w) => `${w.label}: ${w.n} kỳ · ròng ${pct(w.net, 1)} · cận dưới ${pct(w.lcb, 1)} · q ${num(w.q, 2)} · ${STATUS_UI[w.status].t}`).join("\n")}>
      <span className={`rounded border px-1 text-[10px] font-bold ${s.cls}`}>{s.t}</span>
      <span className="font-mono text-[10px] text-slate-400">{c.n}/{need} kỳ · <span className={fin(win?.net) ? ((win!.net as number) >= 0 ? "text-emerald-300" : "text-rose-300") : ""}>{pct(win?.net, 1)}</span></span>
    </span>
  );
}

/** S2: bản đồ mùa vụ toàn thị trường. */
export function SeasonMapBoard({ onOpen }: { onOpen: (t: string) => void }) {
  const { data: m, error, isLoading } = useSeasonMap(true);
  const { data: cal } = useKqkdCalendar(true);
  const [filter, setFilter] = useState<MapFilter>("WATCH");
  const [quarter, setQuarter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const soon = useMemo(() => {
    const out = new Map<string, string>();
    if (!cal) return out;
    const lim = new Date(Date.parse(`${cal.asOf}T00:00:00Z`) + 14 * 864e5).toISOString().slice(0, 10);
    for (const s of [cal.current, cal.next]) for (const r of s.rows) if (r.status === "UPCOMING" && r.expected && r.expected >= cal.asOf && r.expected <= lim && !out.has(r.t)) out.set(r.t, r.expected);
    return out;
  }, [cal]);
  // Loại quý sắp công bố của từng mã: mùa đầu tiên (hiện tại, rồi kế tiếp) mà mã chưa công bố.
  const nextQ = useMemo(() => {
    const out = new Map<string, number>();
    if (!cal) return out;
    for (const s of [cal.current, cal.next]) for (const r of s.rows) if ((r.status === "UPCOMING" || r.status === "OVERDUE") && !out.has(r.t)) out.set(r.t, Number(s.quarter.label[1]));
    return out;
  }, [cal]);
  const rows = useMemo(() => (m ? filterSeasonMap(m, { filter, quarter, soon, nextQ, query: query.trim().toUpperCase() }) : []), [m, filter, quarter, soon, nextQ, query]);
  const counts = useMemo(() => (m ? seasonMapCounts(m) : null), [m]);
  if (error && !m) return <p className="tw-scope text-[11px] text-amber-300" data-testid="season-map-error">Bản đồ mùa vụ chưa sẵn sàng ({error}). Gateway dựng bản đồ 20 phút sau khởi động, sau đó mỗi tuần.</p>;
  if (!m) return <p role="status" className="text-[11px] text-slate-500">{isLoading ? "Đang tải bản đồ mùa vụ…" : "Chưa có bản đồ."}</p>;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE)), p = Math.min(page, pages - 1);
  const F: [MapFilter, string][] = [["WATCH", "ĐẠT + THEO DÕI"], ["SELECTED", "ĐẠT"], ["SOON", "Sắp công bố 14 ngày"], ["NEAR8", `Đủ ${m.rules.minEvents} kỳ sau lần công bố tới`], ["ALL", "Tất cả"]];
  const total = Object.keys(m.rows).length;
  return (
    <section className="tw-scope space-y-3" data-testid="season-map">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" data-testid="season-map-counts">
        {counts!.map((c, i) => (
          <div key={i} className="rounded-md border border-white/[0.07] bg-white/[0.02] px-2 py-1.5">
            <p className="text-[10px] font-bold uppercase" style={{ color: QC[i] }}>Q{i + 1} · {total} mã</p>
            <p className="text-[11px] tabular-nums text-slate-300"><span className="text-amber-300">{c.SELECTED} đạt</span> · <span className="text-violet-200">{c.WATCH} theo dõi</span> · {c.THIN} chưa đủ mẫu · <span className="text-slate-500">{c.NONE} không lợi thế</span></p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {F.map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setFilter(k); setPage(0); }} aria-pressed={filter === k} data-testid={`season-map-f-${k}`}
            className={`rounded-full border px-2.5 py-1 text-[11px] ${filter === k ? "border-[#E8B84B]/60 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{l}</button>
        ))}
        <span className="mx-1 h-4 w-px bg-white/10" />
        {[null, 1, 2, 3, 4].map((q) => (
          <button key={q ?? 0} type="button" onClick={() => { setQuarter(q); setPage(0); }} aria-pressed={quarter === q}
            className={`rounded-md border px-2 py-0.5 text-[11px] ${quarter === q ? "border-white/30 bg-white/10 text-slate-100" : "border-white/10 text-slate-500"}`}>{q ? `Q${q}` : "Cả năm"}</button>
        ))}
        <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} placeholder="Lọc mã…" aria-label="Lọc mã" className="ml-auto w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-200" data-testid="season-map-q" />
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[680px] text-[11px]" data-testid="season-map-table">
          <thead><tr className="border-b border-white/10 text-right text-[10px] uppercase text-slate-500">
            <th className="px-2 py-1.5 text-left">Mã</th>
            {[1, 2, 3, 4].map((q) => <th key={q} className={`px-2 py-1.5 ${quarter && quarter !== q ? "opacity-40" : ""}`} style={{ color: QC[q - 1] }}>Q{q}</th>)}
            <th className="px-2 py-1.5">Công bố dự kiến</th>
          </tr></thead>
          <tbody>
            {rows.slice(p * PAGE, (p + 1) * PAGE).map((x) => (
              <tr key={x.t} className="border-b border-white/[0.04] text-right hover:bg-white/[0.03]" data-testid="season-map-row">
                <td className="px-2 py-1 text-left"><button type="button" onClick={() => onOpen(x.t)} className="font-mono font-bold text-cf-primary hover:text-[#F5CE72]" data-testid="season-map-open">{x.t}</button>{x.r.stale && <span className="ml-1 text-[10px] text-slate-500" title="Lần dựng gần nhất không đọc được mã này — giữ bản trước">bản cũ</span>}</td>
                {[1, 2, 3, 4].map((q) => <td key={q} className={`px-2 py-1 ${quarter && quarter !== q ? "opacity-40" : ""} ${x.nq === q ? "bg-white/[0.035]" : ""}`} title={x.nq === q ? "Quý sắp công bố" : undefined}><Cell c={x.r.q[String(q)]} need={m.rules.minEvents} /></td>)}
                <td className="px-2 py-1 font-mono text-slate-300">{x.soon ? dmy(x.soon) : "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-2 py-4 text-center text-slate-500">Không có mã nào khớp bộ lọc.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-slate-500">
        <span>{rows.length} mã · trang {p + 1}/{pages}</span>
        <button type="button" disabled={p === 0} onClick={() => setPage(p - 1)} className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-30">‹</button>
        <button type="button" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="rounded border border-white/10 px-2 py-0.5 disabled:opacity-30">›</button>
        <span className="ml-auto" data-testid="season-map-fresh">dựng {dmy(m.builtAt)} · nguồn Project A {m.sourceAsOf ? dmy(m.sourceAsOf) : "—"}{m.failed ? ` · ${m.failed} mã lỗi lần dựng này` : ""}</span>
      </div>
      <p className="text-[10px] text-slate-500"><span className="mr-1 rounded border border-sky-400/40 px-1 text-sky-300">MÔ TẢ</span>Ô hiện trạng thái tốt nhất trong 4 cửa sổ của quý và lợi nhuận ròng sau phí ({pctPlain(m.rules.cost, 2)}) của cửa sổ đạt, nếu không có thì cửa sổ ròng cao nhất. Quy tắc giống hệt mục theo mã: ĐẠT cần ≥ {m.rules.minEvents} kỳ, q-value FDR ≤ 0,1 và cận dưới &gt; 0; THEO DÕI = chưa đủ kỳ nhưng q ≤ {num(m.rules.watchQ, 1)} hoặc cận dưới &gt; 0. Nền sáng hơn = loại quý mã sắp công bố. Bấm mã để mở phân tích đầy đủ.</p>
    </section>
  );
}

const ciText = (c: Ci | undefined) => (!c || !fin(c.mean) ? "—" : `${pct(c.mean, 1)}${fin(c.lo) && fin(c.hi) ? ` [${pct(c.lo, 1)}; ${pct(c.hi, 1)}]` : ""}`);
const ciCls = (c: Ci | undefined) => (!c || !fin(c.lo) || !fin(c.hi) ? "text-slate-300" : c.lo > 0 ? "text-emerald-300" : c.hi < 0 ? "text-rose-300" : "text-slate-300");

function PoolTable({ title, byQ, focus, testid }: { title: string; byQ: Record<string, PooledQ>; focus: number | null; testid: string }) {
  return (
    <table className="w-full text-[11px]" data-testid={testid}>
      <thead><tr className="text-right text-[10px] uppercase text-slate-500">
        <th className="px-1 py-1 text-left">{title}</th><th className="px-1 py-1">Kỳ</th><th className="px-1 py-1">Trước tin (−10…−1)</th><th className="px-1 py-1">Quanh tin (0…+2)</th><th className="px-1 py-1">Sau tin (+3…+60)</th><th className="px-1 py-1" title="Quanh tin: 1/3 SUE cao nhất − 1/3 thấp nhất">SUE cao − thấp</th>
      </tr></thead>
      <tbody>
        {[1, 2, 3, 4].map((q) => {
          const x = byQ[String(q)];
          return (
            <tr key={q} className={`text-right font-mono tabular-nums ${focus === q ? "bg-white/[0.04]" : ""}`}>
              <td className="px-1 py-0.5 text-left font-sans font-bold" style={{ color: QC[q - 1] }}>Q{q}{focus === q && <span className="ml-1 text-[10px] font-normal text-slate-400">kỳ tới</span>}</td>
              <td className="px-1 py-0.5 text-slate-400">{x?.n ?? 0}<span className="font-sans text-[10px] text-slate-500"> · {x?.tickers ?? 0} mã</span></td>
              <td className={`px-1 py-0.5 ${ciCls(x?.pre)}`}>{ciText(x?.pre)}</td>
              <td className={`px-1 py-0.5 ${ciCls(x?.ann)}`}>{ciText(x?.ann)}</td>
              <td className={`px-1 py-0.5 ${ciCls(x?.post)}`}>{ciText(x?.post)}</td>
              <td className="px-1 py-0.5 text-slate-300">{x?.sueSplit ? pct(x.sueSplit.diff, 1) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** S4: bằng chứng gộp theo ngành × loại quý, đặt cạnh thống kê riêng của mã (vốn chỉ có 6–7 kỳ). */
export function PooledEvidence({ pooled, ticker, nextQuarter }: { pooled: SeasonPooled | null | undefined; ticker: string; nextQuarter: string | null }) {
  if (!pooled) return null;
  const focus = nextQuarter ? Number(nextQuarter[1]) || null : null;
  return (
    <details className="tw-scope rounded-lg border border-white/10 bg-white/[0.02]" data-testid="season-pooled" open>
      <summary className="cursor-pointer px-3 py-2 text-[11px] text-slate-300">
        <b className="text-slate-100">🧩 Bằng chứng gộp theo ngành</b> · {pooled.sector ? <>ngành <b className="text-slate-100">{pooled.sector.name}</b> và </> : null}toàn thị trường, theo loại quý
        <span className="ml-1 rounded border border-sky-400/40 px-1 text-[10px] text-sky-300">MÔ TẢ</span>
        <span className="text-slate-500"> — tham chiếu cho {ticker}, không thay thống kê riêng của mã</span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        {pooled.sector ? <PoolTable title={pooled.sector.name} byQ={pooled.sector.byQ} focus={focus} testid="season-pooled-sector" /> : <p className="text-[10.5px] text-slate-500">Chưa có phân ngành ICB cho {ticker}.</p>}
        <PoolTable title="Toàn thị trường" byQ={pooled.market.byQ} focus={focus} testid="season-pooled-market" />
        <p className="text-[10px] text-slate-500">Lợi nhuận vượt VN-Index tích luỹ (CAR, mô hình thị trường ES-v1) quanh ngày công bố thật; chỉ tính kỳ có tin BCTC chính thức (từ 2024), mỗi ô là trung bình [khoảng tin cậy 95% bootstrap]. Xanh/đỏ = khoảng không chứa 0. Cửa sổ ở đây là cửa sổ nghiên cứu sự kiện, khác 4 cửa sổ giao dịch E1–E4 ở trên; dùng để xem mã có đang đi cùng hay ngược ngành, không phải tín hiệu. Dựng {dmy(pooled.builtAt)}.</p>
      </div>
    </details>
  );
}

const resultCell = (e: SeasonLedgerEntry) => {
  const r = e.result;
  if (!r) return <span className="text-slate-500">chờ công bố</span>;
  if (r.pending) return <span className="text-slate-400">công bố {dmy(r.published)} · còn {r.need} phiên</span>;
  return <span className={(r.net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}>{pct(r.net, 2)}<span className="ml-1 font-sans text-[10px] text-slate-500">{dmy(r.entry).slice(0, 5)}→{dmy(r.exit).slice(0, 5)}</span></span>;
};

/** S6: sổ theo dõi tiến. */
export function SeasonLedgerView({ onOpen }: { onOpen: (t: string) => void }) {
  const { data: L, error, isLoading } = useSeasonLedger(true);
  if (error && !L) return <p className="text-[11px] text-amber-300" data-testid="season-ledger-error">Sổ theo dõi chưa sẵn sàng ({error}).</p>;
  if (!L) return <p role="status" className="text-[11px] text-slate-500">{isLoading ? "Đang tải sổ theo dõi…" : "Chưa có sổ."}</p>;
  const sum = Object.entries(L.summary);
  return (
    <section className="tw-scope space-y-3" data-testid="season-ledger">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Đã ghi</p><p className="font-mono text-[14px] font-bold text-slate-100" data-testid="season-ledger-total">{L.total}</p><p className="text-[10px] text-slate-500">từ {L.startedAt ? dmy(L.startedAt) : "— (chưa có kỳ nào trong cửa sổ ghi)"}</p></div>
        <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">Đã chấm</p><p className="font-mono text-[14px] font-bold text-slate-100">{L.scored}</p><p className="text-[10px] text-slate-500">cần đủ phiên sau công bố</p></div>
        {sum.length ? sum.slice(0, 2).map(([w, s]) => (
          <div key={w} className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">{w.toUpperCase()} · {s.n} lần</p><p className={`font-mono text-[14px] font-bold ${s.meanNet >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{pct(s.meanNet, 2)}</p><p className="text-[10px] text-slate-500">thắng {pctPlain(s.hitRate, 0)} · quá khứ {pct(s.meanBacktestNet, 2)}</p></div>
        )) : <div className="col-span-2 rounded-md border border-white/[0.07] px-2 py-1.5 text-[10.5px] text-slate-500">Chưa có lần nào được chấm. Kết quả thật chỉ có ý nghĩa sau nhiều mùa; so trung bình thật với trung bình quá khứ để thấy thống kê có giữ được ngoài mẫu hay không.</div>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-white/10">
        <table className="w-full min-w-[720px] text-[11px]" data-testid="season-ledger-table">
          <thead><tr className="border-b border-white/10 text-right text-[10px] uppercase text-slate-500">
            <th className="px-2 py-1.5 text-left">Mã</th><th className="px-2 py-1.5 text-left">Kỳ</th><th className="px-2 py-1.5 text-left">Cửa sổ</th><th className="px-2 py-1.5">Lúc ghi</th><th className="px-2 py-1.5">Quá khứ (ròng · q)</th><th className="px-2 py-1.5">Dự kiến</th><th className="px-2 py-1.5">Kết quả thật (ròng)</th>
          </tr></thead>
          <tbody>
            {L.entries.map((e) => (
              <tr key={`${e.t}|${e.fiscal}|${e.window}`} className="border-b border-white/[0.04] text-right font-mono tabular-nums" data-testid="season-ledger-row">
                <td className="px-2 py-1 text-left"><button type="button" onClick={() => onOpen(e.t)} className="font-bold text-cf-primary hover:text-[#F5CE72]">{e.t}</button></td>
                <td className="px-2 py-1 text-left text-slate-300">{e.quarter}</td>
                <td className="px-2 py-1 text-left font-sans text-slate-300">{e.label}</td>
                <td className="px-2 py-1"><span className={`rounded border px-1 font-sans text-[10px] font-bold ${STATUS_UI[e.status].cls}`}>{STATUS_UI[e.status].t}</span><span className="ml-1 text-[10px] text-slate-500">{dmy(e.recordedAt).slice(0, 5)}</span></td>
                <td className="px-2 py-1 text-slate-300">{pct(e.backtest.net, 1)} · {num(e.backtest.q, 2)}<span className="font-sans text-[10px] text-slate-500"> · {e.backtest.n} kỳ</span></td>
                <td className="px-2 py-1 text-slate-300">{dmy(e.expected)}</td>
                <td className="px-2 py-1">{resultCell(e)}</td>
              </tr>
            ))}
            {!L.entries.length && <tr><td colSpan={7} className="px-2 py-4 text-center text-slate-500">Chưa ghi dòng nào: sổ chỉ ghi khi một mã có cửa sổ THEO DÕI / ĐẠT và ngày công bố dự kiến còn {"1–25"} ngày.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-500"><span className="mr-1 rounded border border-sky-400/40 px-1 text-sky-300">MÔ TẢ</span>{L.rule} Sổ ghi trước khi biết kết quả và không sửa lại, nên đây là kiểm tra ngoài mẫu thật của thống kê mùa vụ.</p>
    </section>
  );
}
