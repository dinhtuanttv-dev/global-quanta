// K1–K6 (06/11/2026) — 📈 KQKD theo quý (tab PHÂN TÍCH CƠ BẢN › Kết quả kinh doanh). Thay bảng Top 20 cũ (Project A, tăng trưởng thô).
//   Toàn bộ ~284 mã · quý mới nhất + LŨY KẾ từ đầu năm so cùng kỳ + 4 quý (TTM) · LN cốt lõi / ngoài cốt lõi · chất lượng (Sloan, CFO/LNST,
//   Piotroski, Altman, Beneish) · SUE · mùa vụ · ước tính cả năm · bản đồ nhiệt 12 quý · bản đồ 3D toàn thị trường · ngăn chi tiết từng mã.
//   Nguồn: Gateway /api/fundamentals/kqkd/* (BCTC đầy đủ VNDirect trên Railway Volume). Nhãn MÔ TẢ.
import { useMemo, useState } from "react";
import { useKqkdSummary } from "../../../../hooks/useKqkd";
import { bn, dmy, fin, growthText, num, pct, pctPlain, summaryCsv, downloadText, TPL_LABEL, TPL_SHORT } from "../../../../lib/kqkd/format";
import type { KqkdRow, Tpl } from "../../../../lib/kqkd/types";
import KqkdTickerDrawer from "./KqkdTickerDrawer";
import { Market3D, TPL_COLOR } from "./Kqkd3D";

type Filter = "all" | "ytdUp" | "coreUp" | "nonCore" | "accrual" | "beneish" | "altman" | "nowcastUp" | "notyet";
const FILTERS: { id: Filter; label: string; test: (r: KqkdRow) => boolean; title: string }[] = [
  { id: "all", label: "Đã công bố", test: (r) => !!r.current, title: "Mã đã công bố quý mới nhất của thị trường" },
  { id: "ytdUp", label: "Lũy kế tăng", test: (r) => !!r.current && r.ytd?.growth?.status === "NORMAL" && (r.ytd.growth.value ?? 0) > 0, title: "LNST lũy kế từ đầu năm cao hơn cùng kỳ" },
  { id: "coreUp", label: "Cốt lõi tăng", test: (r) => !!r.current && r.coreYoY.status === "NORMAL" && (r.coreYoY.value ?? 0) > 0, title: "LN cốt lõi quý cao hơn cùng kỳ" },
  { id: "nonCore", label: "Lãi ngoài cốt lõi", test: (r) => !!r.current && r.flags.includes("NON_CORE"), title: "Hơn 50% LNTT quý đến từ ngoài hoạt động cốt lõi" },
  { id: "accrual", label: "Dồn tích cao", test: (r) => !!r.current && r.flags.includes("HIGH_ACCRUAL"), title: "Dồn tích Sloan > 10% tài sản: lợi nhuận chưa thành tiền" },
  { id: "beneish", label: "Beneish cảnh báo", test: (r) => !!r.current && !!r.mFlag, title: "M-score > −1,78 (sàng lọc, không phải kết luận)" },
  { id: "altman", label: "Altman rủi ro", test: (r) => !!r.current && r.zZone === "DISTRESS", title: "Z″ < 1,1" },
  { id: "nowcastUp", label: "Ước cả năm tăng", test: (r) => !!r.current && fin(r.nowcast?.growth) && (r.nowcast!.growth as number) > 0, title: "Ngoại suy mùa vụ từ lũy kế cho LNST cả năm cao hơn năm trước" },
  { id: "notyet", label: "Chưa có quý mới", test: (r) => !r.current, title: "Chưa công bố quý mới nhất" },
];
type Sort = "ytdNow" | "ytd" | "npatYoY" | "core" | "ttm" | "sue" | "roe" | "margin" | "cfo" | "f" | "npat" | "mcap";
const SORTS: { id: Sort; label: string }[] = [
  { id: "ytdNow", label: "LNST lũy kế (tỷ)" }, { id: "ytd", label: "Lũy kế YoY" }, { id: "npatYoY", label: "LNST quý YoY" }, { id: "core", label: "Cốt lõi YoY" }, { id: "ttm", label: "4 quý YoY" }, { id: "sue", label: "SUE cốt lõi" },
  { id: "roe", label: "ROE" }, { id: "margin", label: "Biên ròng" }, { id: "cfo", label: "CFO/LNST" }, { id: "f", label: "Piotroski F" }, { id: "npat", label: "LNST quý (tỷ)" }, { id: "mcap", label: "Vốn hoá" },
];
const nv = (g: KqkdRow["npatYoY"] | null | undefined) => (g?.status === "NORMAL" ? g.value : null);
const sortKey: Record<Sort, (r: KqkdRow) => number | null> = {
  ytdNow: (r) => r.ytd?.now ?? null, ytd: (r) => nv(r.ytd?.growth), npatYoY: (r) => nv(r.npatYoY), core: (r) => nv(r.coreYoY), ttm: (r) => nv(r.ttmGrowth), sue: (r) => r.sueCore ?? r.sueNpat,
  roe: (r) => r.roe, margin: (r) => r.netMarginTtm, cfo: (r) => r.cfoToNpat, f: (r) => r.f, npat: (r) => r.npat, mcap: (r) => r.mcap,
};

/** Ô bản đồ nhiệt: phân kỳ quanh 0 (xanh lá tăng · hồng giảm · xám gần 0), trạng thái đặc biệt có ký hiệu. */
function heatColor(c: KqkdRow["heat"][number]): { bg: string; mark: string } {
  if (!c) return { bg: "rgba(148,163,184,0.06)", mark: "" };
  const [v, st] = c;
  if (st === "TURNAROUND") return { bg: "rgba(16,185,129,0.55)", mark: "↑" };
  if (st === "TO_LOSS" || st === "LOSS") return { bg: "rgba(244,63,94,0.6)", mark: st === "LOSS" ? "−" : "↓" };
  if (st === "LOW_BASE") return { bg: "rgba(251,191,36,0.35)", mark: "·" };
  if (!fin(v)) return { bg: "rgba(148,163,184,0.06)", mark: "" };
  const a = Math.min(0.85, 0.12 + Math.abs(v) * 0.9);
  return { bg: Math.abs(v) < 0.02 ? "rgba(148,163,184,0.22)" : v > 0 ? `rgba(16,185,129,${a.toFixed(2)})` : `rgba(244,63,94,${a.toFixed(2)})`, mark: "" };
}
function Heat({ r, quarters }: { r: KqkdRow; quarters: string[] }) {
  return (
    <span className="flex gap-[2px]" role="img" aria-label={`LNST so cùng kỳ 12 quý ${r.t}: ${r.heat.map((c, i) => `${quarters[i] ?? ""} ${c ? (c[1] === "NORMAL" ? pct(c[0]) : c[1]) : "—"}`).join(", ")}`}>
      {r.heat.map((c, i) => { const h = heatColor(c); return <i key={i} className="inline-flex h-4 w-[9px] items-center justify-center rounded-[2px] text-[10px] not-italic leading-none text-white/90" style={{ background: h.bg }} title={`${quarters[i] ?? ""}: ${c ? (c[1] === "NORMAL" ? pct(c[0]) : growthText({ value: c[0], status: c[1] }).text) : "—"}`}>{h.mark}</i>; })}
    </span>
  );
}

export default function KqkdCenter({ onSelectTicker, sectorOf }: { onSelectTicker?: (t: string) => void; sectorOf?: (t: string) => string | null }) {
  const { data, error, isLoading } = useKqkdSummary();
  const [filter, setFilter] = useState<Filter>("all");
  const [tpl, setTpl] = useState<Tpl | "all">("all");
  const [sector, setSector] = useState<string>("");
  const [sort, setSort] = useState<Sort>("ytdNow");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [show3d, setShow3d] = useState(false);
  const PAGE = 50;
  const [limit, setLimit] = useState(PAGE);
  const sectors = useMemo(() => [...new Set((data?.rows ?? []).map((r) => sectorOf?.(r.t)).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "vi")), [data, sectorOf]);
  const base = useMemo(() => (data?.rows ?? []).filter((r) => (tpl === "all" || r.tpl === tpl) && (!sector || sectorOf?.(r.t) === sector)), [data, tpl, sector, sectorOf]);
  const rows = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter)!;
    const k = sortKey[sort];
    return base.filter((r) => f.test(r) && (!q || r.t.includes(q.toUpperCase()))).sort((a, b) => (k(b) ?? -1e18) - (k(a) ?? -1e18) || a.t.localeCompare(b.t));
  }, [base, filter, sort, q]);

  if (error) return <div className="cf-panel rounded-xl p-4 text-[11px] text-rose-300">Không tải được KQKD theo quý: {error}</div>;
  if (isLoading || !data) return <div className="cf-panel rounded-xl p-4 text-[11px] italic text-slate-400">Đang tải KQKD theo quý…</div>;
  const c = data.counts, dl = data.deadline;
  const tiles: { label: string; value: string; sub: string; cls?: string }[] = [
    { label: "Đã công bố", value: `${c.reportedLatest}/${c.tickers}`, sub: `mã có BCTC ${data.latestQuarter ?? ""}` },
    { label: "Trung vị LNST lũy kế", value: pct(data.medianYtdGrowth, 1), sub: "so cùng kỳ lũy kế", cls: data.medianYtdGrowth == null ? undefined : data.medianYtdGrowth >= 0 ? "text-emerald-300" : "text-rose-300" },
    { label: "Lũy kế tăng", value: data.shareYtdUp == null ? "—" : `${Math.round(data.shareYtdUp * 100)}%`, sub: "tỷ lệ mã tăng trưởng thường" },
    { label: "LN cốt lõi tăng", value: data.shareCoreUp == null ? "—" : `${Math.round(data.shareCoreUp * 100)}%`, sub: "quý so cùng kỳ" },
    { label: "Lãi ngoài cốt lõi", value: String(c.nonCore), sub: "> 50% LNTT quý", cls: "text-sky-300" },
    { label: "Dồn tích cao / Beneish", value: `${c.highAccrual} / ${c.mFlag}`, sub: "cần soát chất lượng số", cls: "text-amber-300" },
  ];
  const nextDeadline = dl.next?.deadlineConsolidated ?? null;
  return (
    <section className="tw-scope cf-panel space-y-3 rounded-xl p-4" aria-label="KQKD theo quý" data-testid="kq-center">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-bold text-[#F5CE72]">📈 KQKD theo quý — {data.latestQuarter ?? "—"}</h3>
          <p className="text-[11px] text-slate-400">BCTC đầy đủ {c.tickers} mã (doanh nghiệp {c.byTemplate.corp} · ngân hàng {c.byTemplate.bank} · chứng khoán {c.byTemplate.sec} · bảo hiểm {c.byTemplate.ins}), tới 20 năm · lũy kế theo quý · chỉ quý đã công bố tới {dmy(data.asOf)}{data.fetchedAt ? ` · nạp ${dmy(data.fetchedAt)} ${data.fetchedAt.slice(11, 16)} UTC` : ""}</p>
        </div>
        <span className="rounded border border-slate-500/40 px-2 py-0.5 text-[10px] font-bold text-slate-300" title={data.method.label}>{data.version} · {data.label}</span>
      </header>

      <div className="flex flex-wrap gap-2" data-testid="kq-deadline">
        {[dl.current, dl.next].filter(Boolean).map((x) => (
          <div key={x!.quarterLabel} className="flex-1 rounded-lg border border-sky-400/20 bg-sky-400/[0.05] px-3 py-2 text-[11px]" style={{ minWidth: 260 }}>
            <p className="font-bold text-sky-300">Hạn công bố BCTC {x!.quarterLabel} <span className="font-normal text-slate-400">(ước tính theo quy định, không phải ngày công ty tự công bố)</span></p>
            <p className="mt-0.5 text-slate-200">Riêng lẻ <b className="font-mono">{dmy(x!.deadlineStandalone)}</b> ({x!.daysUntilStandalone >= 0 ? `còn ${x!.daysUntilStandalone} ngày` : "đã qua"}) · Hợp nhất <b className="font-mono">{dmy(x!.deadlineConsolidated)}</b> ({x!.daysUntilConsolidated >= 0 ? `còn ${x!.daysUntilConsolidated} ngày` : "đã qua"})</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="kq-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] font-bold uppercase text-slate-500">{t.label}</p>
            <p className={`font-mono text-[18px] font-bold tabular-nums ${t.cls ?? "text-slate-100"}`}>{t.value}</p>
            <p className="text-[10px] text-slate-500">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Lọc">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} title={f.title} data-testid={`kq-filter-${f.id}`} onClick={() => { setFilter(f.id); setLimit(PAGE); }}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${filter === f.id ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>
              {f.label} <span className="font-mono text-slate-500">{base.filter(f.test).length}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <select value={tpl} onChange={(e) => { setTpl(e.target.value as Tpl | "all"); setLimit(PAGE); }} aria-label="Mẫu BCTC" data-testid="kq-tpl" className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200">
          <option value="all">Mọi mẫu BCTC</option>{(Object.keys(TPL_LABEL) as Tpl[]).map((t) => <option key={t} value={t}>{TPL_LABEL[t]} ({c.byTemplate[t]})</option>)}
        </select>
        {sectors.length > 0 && (
          <select value={sector} onChange={(e) => { setSector(e.target.value); setLimit(PAGE); }} aria-label="Ngành" data-testid="kq-sector" className="max-w-[200px] rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200">
            <option value="">Mọi ngành</option>{sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-slate-400">Sắp xếp
          <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setLimit(PAGE); }} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200" data-testid="kq-sort">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Lọc mã…" aria-label="Lọc mã" className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200" data-testid="kq-search" />
        <button type="button" onClick={() => downloadText(`KQKD_${(data.latestQuarter ?? "").replace("/", "-")}_${rows.length}ma.csv`, summaryCsv(rows))} className="ml-auto rounded-md border border-white/10 px-2 py-1 text-slate-300 hover:text-slate-100" data-testid="kq-csv">⬇ CSV ({rows.length} mã)</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-0 text-[11px]" data-testid="kq-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="border-b border-white/10 px-1 py-1.5">Mã · ngành</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right">LNST quý · YoY</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="LN cốt lõi quý so cùng kỳ">Cốt lõi</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="LNST lũy kế từ đầu năm so cùng kỳ lũy kế">Lũy kế · YoY</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="Phần LNTT quý đến từ ngoài hoạt động cốt lõi">Ngoài CL</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="Biên ròng và ROE 4 quý">Biên · ROE</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="Dòng tiền HĐKD ÷ LNST (4 quý) · dồn tích Sloan">CFO/LN · dồn tích</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title="Piotroski F (0–9) · Altman Z″ (mẫu doanh nghiệp)">F · Z″</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title={`Bất ngờ chuẩn hoá LN cốt lõi${data.evidence ? ` (${data.evidence.sueCore.label}: ${data.evidence.prereg} ${data.evidence.sueCore.pass ? "ĐẠT" : "KHÔNG ĐẠT"})` : ""}`}>SUE</th>
              <th className="border-b border-white/10 px-1 py-1.5 text-right" title={`LNST 4 quý gần nhất so 4 quý trước đó · ngoại suy mùa vụ LNST cả năm so năm trước${data.evidence ? ` (${data.evidence.nowcast.label}: ${data.evidence.prereg} ${data.evidence.nowcast.pass ? "ĐẠT" : "KHÔNG ĐẠT"})` : ""}`}>4 quý · ước năm{data.evidence?.nowcast.pass ? <span className="ml-0.5 text-emerald-300">ⓣ</span> : null}</th>
              <th className="border-b border-white/10 px-1 py-1.5" title="LNST so cùng kỳ 12 quý (cũ → mới)">12 quý</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => {
              const g = growthText(r.npatYoY), co = growthText(r.coreYoY), yt = growthText(r.ytd?.growth ?? null), tt = growthText(r.ttmGrowth);
              return (
                <tr key={r.t} className="align-middle hover:bg-white/[0.03]" data-testid="kq-row">
                  <td className="border-b border-white/[0.05] px-1 py-1.5">
                    <button type="button" onClick={() => setOpen(r.t)} className="font-mono text-[12px] font-bold text-[#F5CE72] hover:underline" data-testid={`kq-open-${r.t}`}>{r.t}</button>
                    <span className="ml-1 rounded px-1 text-[10px] font-bold" style={{ color: TPL_COLOR[r.tpl], border: `1px solid ${TPL_COLOR[r.tpl]}55` }} title={TPL_LABEL[r.tpl]}>{TPL_SHORT[r.tpl]}</span>
                    <span className="block truncate text-[10px] text-slate-500" style={{ maxWidth: 130 }}>{sectorOf?.(r.t) ?? ""}{!r.current ? ` · ${r.quarter}` : ""}</span>
                  </td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums"><span className="block text-slate-200">{bn(r.npat)}</span><span className={`block ${g.cls}`} title={g.title}>{g.text}</span></td>
                  <td className={`border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums ${co.cls}`} title={co.title}>{co.text}</td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums"><span className="block text-slate-200">{r.ytd ? `${r.ytd.to === 4 ? "Năm" : `${r.ytd.to * 3}T`} ${bn(r.ytd.now, false)}` : "—"}</span><span className={`block ${yt.cls}`} title={yt.title}>{yt.text}</span></td>
                  <td className={`border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums ${r.flags.includes("NON_CORE") ? "text-sky-300" : "text-slate-400"}`}>{fin(r.nonCoreShare) ? (r.nonCoreShare > 1 ? "> 100%" : r.nonCoreShare < -1 ? "< −100%" : pctPlain(r.nonCoreShare, 0)) : "—"}</td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums"><span className="block text-slate-200">{pctPlain(r.netMarginTtm)}</span><span className="block text-slate-400">{pctPlain(r.roe)}</span></td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums"><span className={`block ${fin(r.cfoToNpat) && r.cfoToNpat < 0 ? "text-amber-300" : "text-slate-200"}`}>{fin(r.cfoToNpat) ? `${num(r.cfoToNpat, 1)}×` : "—"}</span><span className={`block ${r.flags.includes("HIGH_ACCRUAL") ? "text-amber-300" : "text-slate-400"}`}>{pctPlain(r.accrual)}</span></td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums"><span className={`block ${r.f == null ? "text-slate-500" : r.f >= 7 ? "text-emerald-300" : r.f <= 3 ? "text-rose-300" : "text-slate-200"}`}>{r.f ?? "—"}</span><span className={`block ${r.zZone === "DISTRESS" ? "text-rose-300" : r.zZone === "SAFE" ? "text-slate-300" : "text-slate-400"}`}>{num(r.z, 1)}{r.mFlag ? <span className="ml-0.5 text-amber-300" title={`Beneish M = ${num(r.m)} > −1,78`}>⚑</span> : null}</span></td>
                  <td className={`border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums ${!fin(r.sueCore) ? "text-slate-500" : r.sueCore >= 2 ? "text-emerald-300" : r.sueCore <= -2 ? "text-rose-300" : "text-slate-200"}`}>{num(r.sueCore, 1)}</td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5 text-right font-mono tabular-nums"><span className={`block ${tt.cls}`} title={tt.title}>{tt.text}</span><span className={`block ${fin(r.nowcast?.growth) ? (r.nowcast!.growth! >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-500"}`} title={r.nowcast ? `Ước cả năm ${bn(r.nowcast.est)} (P10–P90 ${bn(r.nowcast.lo, false)}–${bn(r.nowcast.hi)})` : "Không ước tính (đủ 4 quý hoặc thiếu lịch sử)"}>{fin(r.nowcast?.growth) ? `ước ${pct(r.nowcast!.growth, 0)}` : "—"}</span></td>
                  <td className="border-b border-white/[0.05] px-1 py-1.5"><Heat r={r} quarters={data.heatQuarters} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="py-4 text-center text-[11px] text-slate-500">Không có mã nào trong nhóm này.</p>}
        {rows.length > limit && (
          <div className="flex items-center justify-center gap-3 py-2 text-[11px] text-slate-400">
            <span>Đang hiện {limit}/{rows.length} mã</span>
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} data-testid="kq-more" className="rounded-md border border-[#E8B84B]/40 px-3 py-1 font-semibold text-[#F5CE72] hover:bg-[#E8B84B]/10">Xem thêm {Math.min(PAGE, rows.length - limit)}</button>
            <button type="button" onClick={() => setLimit(rows.length)} className="rounded-md border border-white/10 px-3 py-1 hover:text-slate-200">Hiện tất cả</button>
          </div>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
        <span>12 quý:</span>
        <i className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(16,185,129,0.7)" }} />tăng so cùng kỳ
        <i className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(244,63,94,0.7)" }} />giảm
        <i className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(148,163,184,0.22)" }} />gần 0
        <i className="inline-block h-3 w-3 rounded-sm" style={{ background: "rgba(251,191,36,0.35)" }} />nền thấp · ↑ lỗ → lãi · ↓ lãi → lỗ · − lỗ
      </p>

      <section className="rounded-lg border border-white/10 bg-white/[0.02]" data-testid="kq-market3d">
        <button type="button" onClick={() => setShow3d((s) => !s)} aria-expanded={show3d} className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] font-bold text-slate-200" data-testid="kq-market3d-toggle">
          <span>🧊 Bản đồ 3D toàn thị trường <span className="font-normal text-slate-400">· tăng trưởng LNST × biên ròng × SUE, cỡ = vốn hoá</span></span><span className="text-slate-400">{show3d ? "Thu gọn ▲" : "Mở ▼"}</span>
        </button>
        {show3d && <div className="px-3 pb-3"><Market3D rows={base} onPick={setOpen} /></div>}
      </section>

      <p className="text-[10px] text-slate-500">
        Bấm mã để mở chi tiết: ma trận Q1–Q4 và lũy kế tới 20 năm, thác nước lợi nhuận, chất lượng & sức khoẻ, mùa vụ & ước tính cả năm, 3D/4D, so với ngành.
        {" "}{data.method.core} Tăng trưởng nền thấp / đổi dấu ghi bằng chữ; giới hạn −100% … +300%. {data.method.pit} {data.method.label}
        {data.evidence && <> Kiểm định đặt trước {data.evidence.prereg} (ngoài mẫu 2020–2026): ước tính tăng trưởng cả năm <b className="text-emerald-300">{data.evidence.nowcast.pass ? "ĐẠT → THĂM DÒ" : "KHÔNG ĐẠT"}</b> (IC {num(data.evidence.nowcast.ic, 3)}), nhưng dải P10–P90 hẹp hơn thực tế; SUE cốt lõi <b className="text-amber-300">{data.evidence.sueCore.pass ? "ĐẠT" : "KHÔNG ĐẠT"}</b> (giữ MÔ TẢ).</>}
        {data.failed.length > 0 && ` Chưa nạp được: ${data.failed.slice(0, 10).join(", ")}${data.failed.length > 10 ? "…" : ""}.`}
      </p>
      {open && <KqkdTickerDrawer ticker={open} rows={data.rows} onClose={() => setOpen(null)} onOpenProfile={onSelectTicker} sectorOf={sectorOf} nextDeadline={nextDeadline} />}
    </section>
  );
}
