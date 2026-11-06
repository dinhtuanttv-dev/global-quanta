// F5 (06/11/2026) — 🏆 Chất lượng KQKD: xếp hạng quý mới nhất bằng SUE / SUR (bất ngờ chuẩn hoá), tăng trưởng có kiểm soát
// (nền thấp, đổi dấu không xếp hạng), biên lợi nhuận, chuỗi tăng trưởng; 8 quý LNST dạng cột. Nhãn MÔ TẢ (trọng số đặt tay).
// Thay thế việc đọc bảng "KQKD theo quý" cũ (vẫn giữ nguyên ngay sau) — bảng cũ bị méo bởi nền thấp (VD +41.509%).
import { useMemo, useState } from "react";
import { useEarningsQuality, type EarningsQualityRow, type GrowthStatus } from "../../../hooks/useEarningsQuality";

type Filter = "ranked" | "surprise" | "streak" | "turnaround" | "toloss" | "lowbase" | "notyet";
const FILTERS: { id: Filter; label: string; test: (r: EarningsQualityRow) => boolean; title: string }[] = [
  { id: "ranked", label: "Đã xếp hạng", test: (r) => r.rank != null, title: "Mã đã công bố quý mới nhất và đủ dữ liệu để chấm điểm" },
  { id: "surprise", label: "Bất ngờ tích cực", test: (r) => r.current && r.sue != null && r.sue >= 2 && r.npatStatus !== "LOW_BASE", title: "SUE ≥ 2: LNST vượt cùng kỳ hơn 2 lần độ lệch chuẩn lịch sử" },
  { id: "streak", label: "Tăng bền vững", test: (r) => r.current && r.streak >= 4, title: "LNST tăng so với cùng kỳ ≥ 4 quý liên tiếp" },
  { id: "turnaround", label: "Lỗ → lãi", test: (r) => r.current && r.npatStatus === "TURNAROUND", title: "Từ lỗ cùng kỳ sang lãi" },
  { id: "toloss", label: "Lãi → lỗ", test: (r) => r.current && r.npatStatus === "TO_LOSS", title: "Từ lãi cùng kỳ sang lỗ" },
  { id: "lowbase", label: "Nền thấp", test: (r) => r.current && r.npatStatus === "LOW_BASE", title: "Kỳ gốc quá nhỏ: tăng trưởng % không có ý nghĩa, không xếp hạng" },
  { id: "notyet", label: "Chưa có quý mới", test: (r) => !r.current, title: "Chưa công bố quý mới nhất của thị trường" },
];
type Sort = "score" | "sue" | "npatYoY" | "revYoY" | "streak";
const SORTS: { id: Sort; label: string }[] = [{ id: "score", label: "Điểm" }, { id: "sue", label: "SUE" }, { id: "npatYoY", label: "LNST YoY" }, { id: "revYoY", label: "DT YoY" }, { id: "streak", label: "Chuỗi tăng" }];
const STATUS_VI: Partial<Record<GrowthStatus, { t: string; cls: string }>> = {
  LOW_BASE: { t: "nền thấp", cls: "text-amber-300 border-amber-400/40" }, TURNAROUND: { t: "lỗ → lãi", cls: "text-emerald-300 border-emerald-400/40" },
  TO_LOSS: { t: "lãi → lỗ", cls: "text-rose-300 border-rose-400/40" }, LOSS: { t: "lỗ", cls: "text-rose-300 border-rose-400/40" }, NA: { t: "thiếu", cls: "text-slate-400 border-white/15" },
};
const pct = (x: number | null | undefined, d = 0) => (x == null || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
const num = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? "—" : x.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const bn = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? "—" : `${(x / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(x) >= 1e11 ? 0 : 1 })} tỷ`);
const tone = (x: number | null | undefined) => (x == null ? "text-slate-400" : x > 0 ? "text-emerald-300" : x < 0 ? "text-rose-300" : "text-slate-300");

/** 8 quý LNST dạng cột chung đường 0 (đỏ = lỗ); quý cuối nhấn. */
function Spark({ s }: { s: EarningsQualityRow["spark"] }) {
  const vals = s.map((x) => x.npat ?? 0);
  const max = Math.max(1, ...vals.map(Math.abs));
  const W = 96, H = 26, bw = W / Math.max(1, s.length) - 2, mid = H / 2;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`LNST 8 quý: ${s.map((x) => `${x.q} ${bn(x.npat)}`).join(", ")}`}>
      <line x1={0} x2={W} y1={mid} y2={mid} stroke="rgba(148,163,184,0.25)" strokeWidth={1} />
      {s.map((x, i) => {
        const v = x.npat ?? 0, h = (Math.abs(v) / max) * (mid - 1);
        return <rect key={x.q} x={i * (bw + 2) + 1} y={v >= 0 ? mid - h : mid} width={bw} height={Math.max(1, h)} rx={1}
          fill={v >= 0 ? (i === s.length - 1 ? "#10B981" : "rgba(16,185,129,0.55)") : (i === s.length - 1 ? "#F43F5E" : "rgba(244,63,94,0.55)")}><title>{`${x.q}: ${bn(x.npat)}`}</title></rect>;
      })}
    </svg>
  );
}

export default function EarningsQualityPanel({ onSelectTicker, sectorOf }: { onSelectTicker?: (t: string) => void; sectorOf?: (t: string) => string | null }) {
  const { data, error, isLoading } = useEarningsQuality();
  const [filter, setFilter] = useState<Filter>("ranked");
  const [sort, setSort] = useState<Sort>("score");
  const [q, setQ] = useState("");
  // Phân trang: 262 mã cùng lúc = trang ~12.800px; mặc định 50, "Xem thêm" 50 mỗi lần; đổi bộ lọc/sắp xếp/tìm -> về 50.
  const PAGE = 50;
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => {
    if (!data) return [];
    const f = FILTERS.find((x) => x.id === filter)!;
    const key = (r: EarningsQualityRow) => (sort === "score" ? r.score : sort === "sue" ? r.sue : sort === "npatYoY" ? (r.npatStatus === "NORMAL" ? r.npatYoY : null) : sort === "revYoY" ? (r.revStatus === "NORMAL" ? r.revYoY : null) : r.streak) ?? -1e9;
    return data.rows.filter((r) => f.test(r) && (!q || r.ticker.includes(q.toUpperCase()))).sort((a, b) => key(b) - key(a) || a.ticker.localeCompare(b.ticker));
  }, [data, filter, sort, q]);

  if (error) return <div className="cf-panel rounded-xl p-4 text-[11px] text-rose-300">Không tải được Chất lượng KQKD: {error}</div>;
  if (isLoading || !data) return <div className="cf-panel rounded-xl p-4 text-[11px] italic text-slate-400">Đang tải Chất lượng KQKD…</div>;
  const c = data.counts;
  const tiles: { label: string; value: string; sub: string; cls?: string }[] = [
    { label: "Đã công bố", value: `${c.reportedLatest}/${c.tickers}`, sub: `mã có BCTC ${data.latestQuarter ?? ""}` },
    { label: "Trung vị LNST YoY", value: pct(data.medianNpatYoY, 1), sub: "mã có tăng trưởng hợp lệ", cls: tone(data.medianNpatYoY) },
    { label: "Tỷ lệ LNST tăng", value: data.shareNpatUp == null ? "—" : `${Math.round(data.shareNpatUp * 100)}%`, sub: "so với cùng kỳ" },
    { label: "Bất ngờ tích cực", value: String(c.positiveSue), sub: "SUE ≥ 2", cls: "text-emerald-300" },
    { label: "Lỗ → lãi / Lãi → lỗ", value: `${c.turnaround} / ${c.toLoss}`, sub: "đổi dấu so với cùng kỳ" },
    { label: "Nền thấp", value: String(c.lowBase), sub: "không xếp hạng tăng trưởng", cls: "text-amber-300" },
  ];
  return (
    <section className="tw-scope cf-panel space-y-3 rounded-xl p-4" aria-label="Chất lượng KQKD" data-testid="eq-panel">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-bold text-[#F5CE72]">🏆 Chất lượng KQKD — {data.latestQuarter ?? "—"}</h3>
          <p className="text-[11px] text-slate-400">Bất ngờ chuẩn hoá (SUE / SUR), tăng trưởng có kiểm soát nền thấp, biên lợi nhuận và độ bền tăng trưởng · BCTC quý VNDirect, chỉ quý đã công bố tới {data.asOf.split("-").reverse().join("/")}</p>
        </div>
        <span className="rounded border border-slate-500/40 px-2 py-0.5 text-[10px] font-bold text-slate-300" title={data.method.noteVi}>{data.version} · {data.label}</span>
      </header>
      {data.stale && <p className="text-[10.5px] text-amber-300" title={data.staleReason}>Đang dùng bản gần nhất (kho dữ liệu tạm lỗi khi làm mới).</p>}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="eq-tiles">
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
          {FILTERS.map((f) => {
            const n = data.rows.filter(f.test).length;
            return (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} title={f.title} data-testid={`eq-filter-${f.id}`} onClick={() => { setFilter(f.id); setLimit(PAGE); }}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${filter === f.id ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>
                {f.label} <span className="font-mono text-slate-500">{n}</span>
              </button>
            );
          })}
        </div>
        <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">Sắp xếp
          <select value={sort} onChange={(e) => { setSort(e.target.value as Sort); setLimit(PAGE); }} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-200" data-testid="eq-sort">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Lọc mã…" aria-label="Lọc mã" className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-slate-200" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[11px]" data-testid="eq-table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="border-b border-white/10 px-1.5 py-1.5">Hạng</th>
              <th className="border-b border-white/10 px-1.5 py-1.5">Mã · ngành</th>
              <th className="border-b border-white/10 px-1.5 py-1.5">Điểm</th>
              <th className="border-b border-white/10 px-1.5 py-1.5 text-right">LNST quý · YoY</th>
              <th className="border-b border-white/10 px-1.5 py-1.5 text-right">DT YoY</th>
              <th className="border-b border-white/10 px-1.5 py-1.5 text-right" title="Lợi nhuận bất ngờ chuẩn hoá: (LNST quý − cùng kỳ) ÷ độ lệch chuẩn 8 quý trước">SUE</th>
              <th className="border-b border-white/10 px-1.5 py-1.5 text-right" title="Doanh thu bất ngờ chuẩn hoá">SUR</th>
              <th className="border-b border-white/10 px-1.5 py-1.5 text-right" title="Biên LNST quý so với cùng kỳ, điểm %">Δ biên</th>
              <th className="border-b border-white/10 px-1.5 py-1.5" title="Số quý liên tiếp LNST tăng so với cùng kỳ (tối đa 8)">Chuỗi</th>
              <th className="border-b border-white/10 px-1.5 py-1.5">LNST 8 quý</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => {
              const st = STATUS_VI[r.npatStatus];
              return (
                <tr key={r.ticker} className="align-middle hover:bg-white/[0.03]" data-testid="eq-row">
                  <td className="border-b border-white/[0.05] px-1.5 py-1.5 font-mono text-slate-400">{r.rank ?? "—"}</td>
                  <td className="border-b border-white/[0.05] px-1.5 py-1.5">
                    <button type="button" onClick={() => onSelectTicker?.(r.ticker)} className="font-mono text-[12px] font-bold text-[#F5CE72] hover:underline">{r.ticker}</button>
                    <span className="block truncate text-[10px] text-slate-500" style={{ maxWidth: 130 }}>{sectorOf?.(r.ticker) ?? ""}{!r.current ? ` · ${r.quarter}` : ""}</span>
                  </td>
                  <td className="border-b border-white/[0.05] px-1.5 py-1.5">
                    {r.score == null ? <span className="text-slate-500">—</span> : (
                      <span className="flex items-center gap-1.5"><span className="h-1.5 w-14 overflow-hidden rounded bg-white/10"><span className="block h-full rounded bg-[#E8B84B]" style={{ width: `${r.score}%` }} /></span><b className="font-mono tabular-nums text-slate-100">{num(r.score, 0)}</b></span>
                    )}
                  </td>
                  <td className="border-b border-white/[0.05] px-1.5 py-1.5 text-right font-mono tabular-nums">
                    <span className="text-slate-200">{bn(r.npat)}</span>
                    <span className="block">{st ? <span className={`rounded border px-1 font-sans text-[10px] font-bold ${st.cls}`} title={r.npatYoYRaw != null ? `Tăng trưởng thô ${pct(r.npatYoYRaw)}` : undefined}>{st.t}</span> : <span className={tone(r.npatYoY)}>{pct(r.npatYoY)}</span>}</span>
                  </td>
                  <td className={`border-b border-white/[0.05] px-1.5 py-1.5 text-right font-mono tabular-nums ${r.revStatus === "NORMAL" ? tone(r.revYoY) : "text-slate-500"}`}>{r.revStatus === "NORMAL" ? pct(r.revYoY) : STATUS_VI[r.revStatus]?.t ?? "—"}</td>
                  <td className={`border-b border-white/[0.05] px-1.5 py-1.5 text-right font-mono tabular-nums ${tone(r.sue)}`}>{num(r.sue)}</td>
                  <td className={`border-b border-white/[0.05] px-1.5 py-1.5 text-right font-mono tabular-nums ${tone(r.sur)}`}>{num(r.sur)}</td>
                  <td className={`border-b border-white/[0.05] px-1.5 py-1.5 text-right font-mono tabular-nums ${tone(r.marginDelta)}`}>{r.marginDelta == null ? "—" : `${r.marginDelta > 0 ? "+" : r.marginDelta < 0 ? "−" : ""}${Math.abs(r.marginDelta * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}đ`}</td>
                  <td className="border-b border-white/[0.05] px-1.5 py-1.5" title={`${r.streak} quý liên tiếp`}>
                    <span className="flex gap-0.5" aria-label={`${r.streak} quý liên tiếp`}>{Array.from({ length: 8 }, (_, i) => <i key={i} className={`inline-block h-2 w-1.5 rounded-sm ${i < r.streak ? "bg-emerald-400" : "bg-white/10"}`} />)}</span>
                  </td>
                  <td className="border-b border-white/[0.05] px-1.5 py-1.5">
                    <span className="flex items-center gap-1"><Spark s={r.spark} />{r.notes.length > 0 && <span className="cursor-help text-[11px] text-amber-300" title={r.notes.join(" · ")} data-testid={`eq-note-${r.ticker}`}>ⓘ</span>}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="py-4 text-center text-[11px] text-slate-500">Không có mã nào trong nhóm này.</p>}
        {rows.length > limit && (
          <div className="flex items-center justify-center gap-3 py-2 text-[11px] text-slate-400">
            <span>Đang hiện {limit}/{rows.length} mã</span>
            <button type="button" onClick={() => setLimit((l) => l + PAGE)} data-testid="eq-more" className="rounded-md border border-[#E8B84B]/40 px-3 py-1 font-semibold text-[#F5CE72] hover:bg-[#E8B84B]/10">Xem thêm {Math.min(PAGE, rows.length - limit)}</button>
            <button type="button" onClick={() => setLimit(rows.length)} className="rounded-md border border-white/10 px-3 py-1 hover:text-slate-200">Hiện tất cả</button>
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-500">
        Điểm 0–100 = hạng phần trăm có trọng số: SUE 40% · SUR 20% · LNST YoY 20% · DT YoY 10% · Δ biên 10%. Tăng trưởng kỳ gốc dưới 5 tỷ hoặc dưới 10% mức thường lệ (nền thấp), hoặc đổi dấu lỗ/lãi, không dùng để xếp hạng; tăng trưởng giới hạn trong −100% … +300%. Chỉ xếp hạng mã đã công bố {data.latestQuarter}. {data.method.noteVi}
      </p>
    </section>
  );
}
