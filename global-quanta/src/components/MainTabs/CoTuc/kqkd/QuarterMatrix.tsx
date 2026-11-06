// K1 (06/11/2026) — Ma trận KQKD: mỗi năm Q1–Q4 (số riêng từng quý) + lũy kế 6T / 9T / cả năm + so CÙNG KỲ LŨY KẾ, đối chiếu BCTC năm,
// cập nhật theo ngày công bố thật (quý chưa công bố để trống, ghi hạn nộp). Kèm biểu đồ lũy kế cùng kỳ qua các năm.
import { useMemo, useState } from "react";
import { bn, dmy, fin, growthText, num, pctPlain, toCsv, downloadText } from "../../../../lib/kqkd/format";
import type { Growth, KqkdDetail, MatrixRow, RatioRow } from "../../../../lib/kqkd/types";

type Mode = "quarter" | "cumulative";
const CUM_LABEL = ["Q1", "6T", "9T", "Cả năm"];
const cumWord = (to: number) => (to === 4 ? "cả năm" : CUM_LABEL[to - 1]);
const RATIO_OPTS = [{ key: "grossMargin", label: "Biên gộp" }, { key: "coreMargin", label: "Biên LN cốt lõi" }, { key: "netMargin", label: "Biên ròng" }] as const;

type Fmt = (v: number | null) => string;
const fmtFor = (metric: string, isRatio: boolean): Fmt => (isRatio ? (v) => pctPlain(v) : metric === "eps" ? (v) => num(v, 0) : (v) => bn(v, false));

function Cell({ v, g, fmt, latest, created, testId }: { v: number | null; g?: Growth | null; fmt: Fmt; latest?: boolean; created?: string | null; testId?: string }) {
  const gt = growthText(g ?? null);
  return (
    <td className={`border-b border-white/[0.05] px-1.5 py-1 text-right align-top ${latest ? "bg-[#E8B84B]/[0.07]" : ""}`} data-testid={testId} title={created ? `Công bố ${dmy(created)}` : undefined}>
      <span className="block font-mono tabular-nums text-slate-100">{fmt(v)}</span>
      {g !== undefined && <span className={`block font-mono text-[10px] tabular-nums ${gt.cls}`} title={gt.title}>{g ? gt.text : ""}</span>}
    </td>
  );
}

/** Thanh ngang so sánh lũy kế cùng kỳ (tới quý mới nhất) qua các năm. */
function YtdBars({ rows, to, fmt }: { rows: MatrixRow[]; to: number; fmt: Fmt }) {
  const data = rows.map((r) => { const a = r.q.slice(0, to); return { year: r.year, v: a.every(fin) ? a.reduce((s, x) => s + (x as number), 0) : null }; }).filter((x) => fin(x.v)).slice(0, 10);
  if (data.length < 2) return null;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.v as number)));
  const hasNeg = data.some((d) => (d.v as number) < 0);
  return (
    <figure className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="kq-ytd-bars">
      <figcaption className="mb-2 text-[11px] font-bold text-slate-300">Lũy kế {cumWord(to)} qua các năm (cùng kỳ)</figcaption>
      <div className="space-y-1">
        {data.map((d, i) => {
          const w = (Math.abs(d.v as number) / max) * (hasNeg ? 50 : 100), neg = (d.v as number) < 0;
          const prev = data[i + 1]?.v;
          return (
            <div key={d.year} className="grid grid-cols-[44px_1fr_92px] items-center gap-2 text-[11px]">
              <span className="font-mono text-slate-400">{d.year}</span>
              <span className="relative h-3 rounded-sm bg-white/[0.04]">
                <span className={`absolute top-0 h-full rounded-sm ${neg ? "bg-rose-400/80" : i === 0 ? "bg-[#E8B84B]" : "bg-[#E8B84B]/45"}`}
                  style={hasNeg ? (neg ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }) : { left: 0, width: `${w}%` }} />
              </span>
              <span className="text-right font-mono tabular-nums text-slate-200">{fmt(d.v)}{fin(prev) && prev > 0 && fin(d.v) && <span className={`ml-1 text-[10px] ${(d.v as number) >= prev ? "text-emerald-300" : "text-rose-300"}`}>{(d.v as number) >= prev ? "▲" : "▼"}</span>}</span>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export default function QuarterMatrix({ d, nextDeadline }: { d: KqkdDetail; nextDeadline?: string | null }) {
  const [metric, setMetric] = useState<string>("npatParent");
  const [mode, setMode] = useState<Mode>("quarter");
  const [years, setYears] = useState(8);
  const isRatio = RATIO_OPTS.some((o) => o.key === metric);
  const rows: MatrixRow[] = d.matrix[metric] ?? [];
  const ratioRows: RatioRow[] = isRatio ? d.ratios[metric as keyof KqkdDetail["ratios"]] : [];
  const latestYear = Number(d.latest.quarter.slice(3)), latestQ = Number(d.latest.quarter[1]);
  const head = rows[0];
  const metricLabel = [...d.metrics, ...RATIO_OPTS].find((m) => m.key === metric)?.label ?? metric;
  const fmt = fmtFor(metric, isRatio);
  const shown = useMemo(() => (isRatio ? ratioRows : rows).slice(0, years), [isRatio, ratioRows, rows, years]);

  const exportCsv = () => {
    const header = ["Năm", "Q1", "Q2", "Q3", "Q4", "Lũy kế 6T", "Lũy kế 9T", "Cả năm (tổng 4 quý)", "BCTC năm", "Lệch %"];
    const body = (isRatio ? ratioRows : rows).map((r) => {
      const m = r as MatrixRow;
      const f = (x: number | null) => (fin(x) ? (isRatio ? Math.round(x * 10000) / 100 : metric === "eps" ? Math.round(x) : Math.round(x / 1e7) / 100) : "");
      return [r.year, ...r.q.map(f), f(r.ytd.h1), f(r.ytd.m9), f(r.ytd.fy), isRatio ? "" : f(m.fyAudited), !isRatio && m.auditDiff != null ? Math.round(m.auditDiff * 1000) / 10 : ""];
    });
    downloadText(`KQKD_${d.ticker}_${metric}_${d.latest.quarter.replace("/", "-")}.csv`, toCsv(header, body));
  };

  return (
    <div className="space-y-3" data-testid="kq-matrix">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <label className="flex items-center gap-1 text-slate-400">Chỉ tiêu
          <select value={metric} onChange={(e) => setMetric(e.target.value)} data-testid="kq-matrix-metric" className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200">
            <optgroup label="Giá trị (tỷ đồng)">{d.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</optgroup>
            <optgroup label="Tỷ suất">{RATIO_OPTS.filter((o) => d.ratios[o.key].length).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
          </select>
        </label>
        {!isRatio && (
          <div className="flex gap-1" role="tablist" aria-label="Cách xem">
            {([["quarter", "Theo quý + lũy kế"], ["cumulative", "Lũy kế lũy tiến"]] as [Mode, string][]).map(([m, t]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-testid={`kq-matrix-mode-${m}`}
                className={`rounded-md border px-2 py-1 font-semibold ${mode === m ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{t}</button>
            ))}
          </div>
        )}
        <label className="flex items-center gap-1 text-slate-400">Số năm
          <select value={years} onChange={(e) => setYears(Number(e.target.value))} className="rounded-md border border-white/10 bg-black/40 px-2 py-1 text-slate-200">{[4, 8, 12, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        </label>
        <button type="button" onClick={exportCsv} className="ml-auto rounded-md border border-white/10 px-2 py-1 text-slate-300 hover:text-slate-100" data-testid="kq-matrix-csv">⬇ CSV</button>
      </div>

      {!isRatio && head?.ytdTo && (
        <p className="rounded-lg border border-[#E8B84B]/25 bg-[#E8B84B]/[0.05] px-3 py-2 text-[12px] text-slate-200" data-testid="kq-ytd-line">
          <b className="text-[#F5CE72]">{metricLabel} lũy kế {cumWord(head.ytdTo)} {head.year}:</b> <span className="font-mono">{metric === "eps" ? `${fmt(head.ytdNow)} đ` : bn(head.ytdNow)}</span>
          {head.ytdGrowth && <> · so cùng kỳ {cumWord(head.ytdTo)} {head.year - 1} (<span className="font-mono">{metric === "eps" ? `${fmt(head.ytdPrev)} đ` : bn(head.ytdPrev)}</span>): <b className={growthText(head.ytdGrowth, 1).cls} title={growthText(head.ytdGrowth).title}>{growthText(head.ytdGrowth, 1).text}</b></>}
          {head.ytdTo < 4 && nextDeadline && <span className="text-slate-400"> · Q{head.ytdTo + 1}/{head.year} chưa công bố (hạn hợp nhất ước tính {dmy(nextDeadline)})</span>}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[11px]" data-testid="kq-matrix-table">
          <thead>
            <tr className="text-right text-[10px] uppercase tracking-wide text-slate-500">
              <th className="border-b border-white/10 px-1.5 py-1.5 text-left">Năm</th>
              {(mode === "cumulative" && !isRatio ? CUM_LABEL : ["Q1", "Q2", "Q3", "Q4"]).map((h) => <th key={h} className="border-b border-white/10 px-1.5 py-1.5">{h}</th>)}
              {(mode === "quarter" || isRatio) && <><th className="border-b border-l border-white/10 px-1.5 py-1.5">Lũy kế 6T</th><th className="border-b border-white/10 px-1.5 py-1.5">Lũy kế 9T</th><th className="border-b border-white/10 px-1.5 py-1.5">Cả năm</th></>}
              {!isRatio && <th className="border-b border-white/10 px-1.5 py-1.5" title="Số trên BCTC năm (đã kiểm toán) để đối chiếu với tổng 4 quý">BCTC năm</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const m = r as MatrixRow;
              const cum = [r.q[0], r.ytd.h1, r.ytd.m9, r.ytd.fy];
              const cumG = isRatio ? [] : [m.yoyQ[0], m.yoyYtd.h1, m.yoyYtd.m9, m.yoyYtd.fy];
              const vals = mode === "cumulative" && !isRatio ? cum : r.q;
              return (
                <tr key={r.year} className="hover:bg-white/[0.03]" data-testid="kq-matrix-row">
                  <td className="border-b border-white/[0.05] px-1.5 py-1 align-top font-mono font-bold text-slate-300">{r.year}</td>
                  {vals.map((v, i) => {
                    const pending = v == null && r.year === latestYear && i + 1 > latestQ;
                    if (pending) return <td key={i} className="border-b border-white/[0.05] px-1.5 py-1 text-right align-top text-[10px] italic text-slate-500">chưa công bố</td>;
                    return <Cell key={i} v={v} fmt={fmt} g={isRatio ? undefined : mode === "cumulative" ? cumG[i] : m.yoyQ[i]} latest={r.year === latestYear && i + 1 === latestQ} created={isRatio ? null : m.created?.[i]} testId={r.year === latestYear && i + 1 === latestQ ? "kq-matrix-latest" : undefined} />;
                  })}
                  {(mode === "quarter" || isRatio) && <>
                    <Cell v={r.ytd.h1} fmt={fmt} g={isRatio ? undefined : m.yoyYtd.h1} />
                    <Cell v={r.ytd.m9} fmt={fmt} g={isRatio ? undefined : m.yoyYtd.m9} />
                    <Cell v={r.ytd.fy} fmt={fmt} g={isRatio ? undefined : m.yoyYtd.fy} />
                  </>}
                  {!isRatio && (
                    <td className="border-b border-white/[0.05] px-1.5 py-1 text-right align-top">
                      <span className="block font-mono tabular-nums text-slate-300">{fmt(m.fyAudited)}</span>
                      {m.auditDiff != null && <span className="block text-[10px] font-bold text-amber-300" title="Tổng 4 quý khác số BCTC năm quá 2%: thường do điều chỉnh khi kiểm toán">lệch {pctPlain(m.auditDiff)}</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!isRatio && head?.ytdTo && <YtdBars rows={rows} to={head.ytdTo} fmt={fmt} />}
      <p className="text-[10px] text-slate-500">
        Đơn vị tỷ đồng (EPS: đồng). Số quý là số riêng từng quý theo BCTC VNDirect; lũy kế = cộng các quý trong năm; dòng dưới mỗi số là so với cùng kỳ (quý với quý, lũy kế với lũy kế cùng kỳ).
        Tăng trưởng trên kỳ gốc nhỏ hoặc đổi dấu ghi bằng chữ (nền thấp, lỗ → lãi…). Ô vàng = quý mới nhất. Rê chuột vào ô để xem ngày công bố.
      </p>
    </div>
  );
}
