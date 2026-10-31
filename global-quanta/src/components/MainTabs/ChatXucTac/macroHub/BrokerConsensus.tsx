import { useMemo, useState } from "react";
import useSWR from "swr";
import { ExternalLink, Landmark } from "lucide-react";
import { fetchMarketJson } from "../../../../services/marketDataClient";

// Đồng thuận CTCK: mọi ô đều bấm được để xem câu trích và link gốc. Số do code tính, AI không chấm điểm.
export type Stance = "positive" | "neutral" | "negative";
export interface Cited { broker: string; reportId: string; title: string; date: string; url: string | null; quote: string; page: number; publicSummary?: boolean }
export interface BrokerDoc {
  asOf: string; lastRun: string | null; running: boolean; backlog: number; brokers: Record<string, { name: string }>; topicNames: Record<string, string>;
  coverage: { brokers: number; listedBrokers: number; reports: number; verified: number; rejected: number; skippedNoText: number };
  sources: Record<string, { at: string; found: number; error: string | null }>;
  reports: { id: string; broker: string; brokerName: string; title: string; type: string; publishedAt: string | null; url: string | null; rejected: number }[];
  view: { n: number; items: (Cited & { stance: Stance; weight: number })[]; score: number | null; disagreement: number | null; nEff: number | null; dist: Record<Stance, number> };
  topics: Record<string, Cited & { stance: Stance }>;
  targets: { items: (Cited & { value: number; scenario: "base" | "bull" | "bear"; horizonEnd: string | null })[]; horizon: string | null; n: number; median: number | null; q1: number | null; q3: number | null; indexClose: number | null; upsidePct: number | null };
  sectors: { icb: string; nameVi: string; net: number; n: number; quantZ: number | null; diverges: boolean; items: (Cited & { stance: Stance })[] }[];
  changes: (Cited & { from: Stance; to: Stance })[];
  ledger: { horizon: number; minN: number; baseUpRate: number | null; brokers: Record<string, { n: number; hits: number; pending: number; neutral: number; ready: boolean; shrunkHit: number | null }> };
}

const ST: Record<Stance, { vi: string; glyph: string; color: string; bg: string }> = {
  positive: { vi: "Tích cực", glyph: "▲", color: "#7cb4f5", bg: "rgba(57,135,229,0.2)" },
  neutral: { vi: "Trung lập", glyph: "■", color: "#cbd5e1", bg: "rgba(148,163,184,0.14)" },
  negative: { vi: "Thận trọng", glyph: "▼", color: "#f09595", bg: "rgba(230,103,103,0.2)" },
};
const nf = (v: number, d = 0) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const sgn = (v: number, d = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(Math.abs(v), d)}`;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "—");
const horizonVi = (h: string | null) => (h ? `${h.slice(5, 7)}/${h.slice(0, 4)}` : "chưa rõ kỳ");

/** Nhãn đọc số đồng thuận; số vẫn hiện bên cạnh. */
export function viewLabel(score: number | null): string {
  if (score == null) return "Chưa đủ dữ liệu";
  return score >= 0.34 ? "Nghiêng tích cực" : score <= -0.34 ? "Nghiêng thận trọng" : "Trung lập";
}
export function disagreementLabel(h: number | null): string {
  if (h == null) return "—";
  return h < 0.34 ? "thấp" : h < 0.67 ? "vừa" : "cao";
}

function QuoteBox({ q, onClose }: { q: Cited & { stance?: Stance }; onClose: () => void }) {
  return (
    <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-2.5 text-[12px]" role="region" aria-label="Câu trích từ báo cáo" data-testid="bc-quote">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-slate-100">{q.broker}{q.stance ? <span className="ml-1.5 font-normal" style={{ color: ST[q.stance].color }}>{ST[q.stance].glyph} {ST[q.stance].vi}</span> : null}</b>
        <button type="button" onClick={onClose} className="text-[11px] text-slate-400 hover:text-slate-200">Đóng</button>
      </div>
      <p className="mt-1 text-slate-200">“{q.quote}”</p>
      <p className="mt-1 text-[11px] text-slate-400">{q.title} · {day(q.date)} · {q.publicSummary ? "tóm tắt công khai" : `trang ${q.page}`}
        {q.url && <a href={q.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-sky-300 hover:underline">{q.publicSummary ? "Mở trang nguồn" : "Mở báo cáo gốc"} <ExternalLink className="inline h-3 w-3" aria-hidden /></a>}
      </p>
    </div>
  );
}

function Matrix({ d, pick }: { d: BrokerDoc; pick: (q: Cited & { stance?: Stance }) => void }) {
  const brokers = Object.keys(d.brokers).filter((b) => Object.keys(d.topics).some((k) => k.startsWith(`${b}|`)));
  const topics = Object.keys(d.topicNames).filter((t) => Object.keys(d.topics).some((k) => k.endsWith(`|${t}`)));
  if (!brokers.length) return <p className="text-[12px] text-slate-400">Chưa có nhận định theo chủ đề.</p>;
  return (
    <div className="overflow-x-auto" data-testid="bc-matrix">
      <table className="w-full min-w-[520px] border-separate text-[11px]" style={{ borderSpacing: 2 }}>
        <thead><tr><th className="text-left font-normal text-slate-400">CTCK</th>{topics.map((t) => <th key={t} className="px-1 font-normal text-slate-400">{d.topicNames[t]}</th>)}</tr></thead>
        <tbody>{brokers.map((b) => <tr key={b}><td className="whitespace-nowrap pr-2 font-semibold text-slate-200">{b}</td>{topics.map((t) => {
          const c = d.topics[`${b}|${t}`];
          if (!c) return <td key={t} className="rounded text-center text-slate-600" style={{ background: "rgba(148,163,184,0.04)" }}>·</td>;
          const s = ST[c.stance];
          return <td key={t} className="p-0"><button type="button" onClick={() => pick(c)} title={c.quote} aria-label={`${b}, ${d.topicNames[t]}: ${s.vi}`} className="h-7 w-full rounded hover:ring-1 hover:ring-amber-400" style={{ background: s.bg, color: s.color }} data-testid={`bc-cell-${b}-${t}`}>{s.glyph}</button></td>;
        })}</tr>)}</tbody>
      </table>
    </div>
  );
}

function TargetPlot({ t, pick }: { t: BrokerDoc["targets"]; pick: (q: Cited) => void }) {
  const items = t.items;
  if (!items.length) return <p className="text-[12px] text-slate-400">Chưa có báo cáo nêu mục tiêu VN-Index kèm câu trích.</p>;
  const vals = [...items.map((x) => x.value), ...(t.indexClose ? [t.indexClose] : [])];
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = Math.max(40, (hi - lo) * 0.1);
  const W = 560, L = 118, R = 54, RH = 24, T = 22, H = T + items.length * RH + 22;
  const X = (v: number) => L + ((v - (lo - pad)) / (hi - lo + 2 * pad)) * (W - L - R);
  const COLOR = { base: "#fcd34d", bull: "#7cb4f5", bear: "#f09595" };
  return (
    <div className="overflow-x-auto" data-testid="bc-targets">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ minWidth: 500, maxWidth: 640 }} role="img" aria-label={`Mục tiêu VN-Index của các CTCK, trung vị ${t.median ?? "chưa có"}`}>
        {t.q1 != null && t.q3 != null && <rect x={X(t.q1)} y={T - 4} width={Math.max(2, X(t.q3) - X(t.q1))} height={H - T - 14} fill="rgba(252,211,77,0.08)" />}
        {t.median != null && <><line x1={X(t.median)} x2={X(t.median)} y1={T - 4} y2={H - 18} stroke="#fcd34d" strokeDasharray="3 3" /><text x={X(t.median)} y={12} fontSize={11} fill="#fcd34d" textAnchor="middle">Trung vị {nf(t.median)}</text></>}
        {t.indexClose != null && <><line x1={X(t.indexClose)} x2={X(t.indexClose)} y1={T - 4} y2={H - 18} stroke="#e2e8f0" /><text x={X(t.indexClose)} y={H - 5} fontSize={11} fill="#e2e8f0" textAnchor="middle">Hiện tại {nf(t.indexClose, 1)}</text></>}
        {items.map((x, i) => {
          const y = T + i * RH + RH / 2 - 4;
          const label = `${x.broker} ${horizonVi(x.horizonEnd)}`;
          return <g key={`${x.reportId}-${i}`} role="button" tabIndex={0} style={{ cursor: "pointer" }} onClick={() => pick(x)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(x); } }} aria-label={`${label}: ${x.value}`} data-testid="bc-target">
            <text x={0} y={y + 4} fontSize={11} fill="#cbd5e1">{label}</text>
            <line x1={L} x2={W - R} y1={y} y2={y} stroke="rgba(148,163,184,0.08)" />
            <circle cx={X(x.value)} cy={y} r={5} fill={COLOR[x.scenario]} stroke="#0b1220" strokeWidth={1.5} />
            <text x={X(x.value) + 9} y={y + 4} fontSize={11} fill="#e2e8f0">{nf(x.value)}</text>
            <title>{x.quote}</title>
          </g>;
        })}
      </svg>
      <p className="text-[11px] text-slate-400">Vàng: kịch bản cơ sở · xanh: tích cực · đỏ: tiêu cực. {t.median != null ? `Trung vị và khoảng tứ phân vị chỉ gộp ${t.n} kịch bản cơ sở cùng kỳ ${horizonVi(t.horizon)}.` : "Chưa có đủ kịch bản cùng kỳ để gộp."}</p>
    </div>
  );
}

function SectorBars({ rows, pick }: { rows: BrokerDoc["sectors"]; pick: (q: Cited & { stance?: Stance }) => void }) {
  if (!rows.length) return <p className="text-[12px] text-slate-400">Chưa có nhận định ngành kèm câu trích.</p>;
  return (
    <ul className="space-y-1" data-testid="bc-sectors">
      {rows.slice(0, 12).map((s) => {
        const w = Math.abs(s.net) * 50;
        const zw = s.quantZ == null ? 0 : Math.min(1, Math.abs(s.quantZ) / 2) * 50;
        return <li key={s.icb}>
          <button type="button" onClick={() => pick(s.items[0])} className="grid w-full grid-cols-[minmax(92px,150px)_minmax(0,1fr)] items-center gap-x-2 rounded sm:grid-cols-[minmax(92px,150px)_minmax(0,1fr)_190px] px-1 py-0.5 text-left text-[11px] hover:bg-white/5" data-testid={`bc-sector-${s.icb}`}>
            <span className="truncate text-slate-200" title={s.nameVi}>{s.nameVi}</span>
            <span aria-hidden className="relative h-4 rounded bg-white/5">
              <i className="absolute left-1/2 top-0 h-full w-px bg-slate-500" />
              <i className="absolute top-0 h-2 rounded-sm" style={{ left: s.net >= 0 ? "50%" : `${50 - w}%`, width: `${w}%`, background: s.net >= 0 ? "#7cb4f5" : "#f09595" }} />
              {s.quantZ != null && <i className="absolute bottom-0 h-1.5 rounded-sm" style={{ left: s.quantZ >= 0 ? "50%" : `${50 - zw}%`, width: `${zw}%`, background: "#fcd34d" }} />}
            </span>
            <span className="col-span-2 whitespace-nowrap font-mono text-slate-300 sm:col-span-1">{s.n} CTCK {sgn(s.net, 2)}{s.quantZ != null ? ` · z ${sgn(s.quantZ, 2)}` : ""}{s.diverges ? <span className="ml-1 font-sans text-amber-300" data-testid="bc-diverges">Lệch</span> : null}</span>
          </button>
        </li>;
      })}
    </ul>
  );
}

export default function BrokerConsensus() {
  const { data: d, error } = useSWR<BrokerDoc>("/api/broker-views", () => fetchMarketJson<BrokerDoc>("/api/broker-views"), { refreshInterval: (x) => (x?.backlog || x?.running ? 60_000 : 600_000), revalidateOnFocus: false });
  const [q, setQ] = useState<(Cited & { stance?: Stance }) | null>(null);
  const failed = useMemo(() => Object.entries(d?.sources ?? {}).filter(([, s]) => s.error), [d]);
  const box = "rounded-lg border border-white/10 bg-white/[0.02] p-2.5 min-w-0";
  return (
    <section className="rounded-xl p-3.5" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }} aria-label="Đồng thuận công ty chứng khoán" data-testid="broker-consensus">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-100"><Landmark className="h-3.5 w-3.5 text-amber-300" aria-hidden />Đồng thuận công ty chứng khoán</h4>
        {d && <span className="text-[11px] text-slate-400" data-testid="bc-coverage">{d.coverage.brokers}/{d.coverage.listedBrokers} CTCK · {d.coverage.reports} báo cáo · {d.coverage.verified} nhận định có câu trích{d.coverage.rejected ? `, loại ${d.coverage.rejected}` : ""}{d.lastRun ? ` · quét ${day(d.lastRun)}` : ""}{d.backlog ? ` · còn ${d.backlog} báo cáo chờ đọc` : ""}</span>}
      </div>
      {error && !d && <p role="alert" className="mt-2 text-[12px] text-rose-300">Không tải được: {error.message}</p>}
      {!d && !error && <div className="mt-2 h-24 animate-pulse rounded-lg bg-slate-800/20" aria-hidden />}
      {d && !d.coverage.reports && <p className="mt-2 text-[12px] text-slate-400" data-testid="bc-empty">{d.running || d.backlog ? "Đang đọc báo cáo, kết quả sẽ hiện dần." : "Chưa có báo cáo nào đọc xong."}</p>}
      {d && d.coverage.reports > 0 && <div className="mt-2 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-400/25 bg-amber-400/[0.05] px-2.5 py-1.5 text-[13px] font-semibold text-slate-100" data-testid="bc-headline">
          {d.view.n >= 2 ? <>
            <span>{viewLabel(d.view.score)} ({sgn(d.view.score ?? 0, 2)})</span>
            <span className="text-[12px] font-normal text-slate-300">Bất đồng {disagreementLabel(d.view.disagreement)} ({nf(d.view.disagreement ?? 0, 2)})</span>
          </> : <span>Chưa đủ CTCK để tính đồng thuận{d.view.items[0] ? `: mới có ${d.view.items[0].broker} nêu rõ quan điểm` : ""}</span>}
          {d.targets.median != null && <span className="text-[12px] font-normal text-slate-300">Mục tiêu trung vị {nf(d.targets.median)}{d.targets.upsidePct != null ? ` (${sgn(d.targets.upsidePct)}%)` : ""}, kỳ {horizonVi(d.targets.horizon)}</span>}
          {d.view.n >= 2 && <span className="text-[12px] font-normal text-slate-300">{d.view.n} CTCK có quan điểm</span>}
        </div>
        {d.view.items.length > 0 && <ul className="flex flex-wrap gap-1.5" data-testid="bc-views">{d.view.items.map((x) => <li key={x.broker}><button type="button" onClick={() => setQ(x)} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] hover:border-amber-400/50" style={{ background: ST[x.stance].bg, color: ST[x.stance].color }}>{ST[x.stance].glyph} {x.broker} · {day(x.date)}</button></li>)}</ul>}
        {q && <QuoteBox q={q} onClose={() => setQ(null)} />}
        <div className="grid gap-2.5 2xl:grid-cols-2">
          <div className={box}><h5 className="mb-1.5 text-[12px] font-semibold text-slate-200">Quan điểm theo chủ đề</h5><Matrix d={d} pick={setQ} /></div>
          <div className={box}><h5 className="mb-1.5 text-[12px] font-semibold text-slate-200">Mục tiêu VN-Index</h5><TargetPlot t={d.targets} pick={setQ} /></div>
          <div className={box}><h5 className="mb-1.5 text-[12px] font-semibold text-slate-200">Ngành: CTCK so với mô hình</h5><p className="mb-1 text-[11px] text-slate-400">Thanh trên: đồng thuận CTCK. Thanh vàng: điểm z định lượng.</p><SectorBars rows={d.sectors} pick={setQ} /></div>
          <div className={box}>
            <h5 className="mb-1.5 text-[12px] font-semibold text-slate-200">Thay đổi quan điểm</h5>
            {d.changes.length ? <ul className="space-y-1 text-[11px]" data-testid="bc-changes">{d.changes.slice(0, 6).map((c) => <li key={`${c.reportId}`}><button type="button" onClick={() => setQ(c)} className="text-left text-slate-200 hover:text-amber-200">{day(c.date)} · <b>{c.broker}</b>: <span style={{ color: ST[c.from].color }}>{ST[c.from].vi}</span> → <span style={{ color: ST[c.to].color }}>{ST[c.to].vi}</span></button></li>)}</ul> : <p className="text-[12px] text-slate-400">Chưa ghi nhận CTCK nào đổi quan điểm.</p>}
            <h5 className="mb-1 mt-3 text-[12px] font-semibold text-slate-200">Sổ chấm điểm sau {d.ledger.horizon} phiên</h5>
            <ul className="space-y-0.5 text-[11px] text-slate-300" data-testid="bc-ledger">{Object.entries(d.ledger.brokers).map(([b, s]) => <li key={b}><b>{b}</b>: {s.ready && s.shrunkHit != null ? `đúng chiều ${nf(s.shrunkHit * 100, 0)}% sau hiệu chỉnh (${s.hits}/${s.n}), nền ${nf((d.ledger.baseUpRate ?? 0) * 100, 0)}%` : `đang tích luỹ ${s.n}/${d.ledger.minN} lần chấm${s.pending ? `, ${s.pending} chờ đủ ${d.ledger.horizon} phiên` : ""}`}</li>)}</ul>
          </div>
        </div>
        {failed.length > 0 && <p className="text-[11px] text-amber-300" data-testid="bc-source-error">Không đọc được lần gần nhất: {failed.map(([k]) => k).join(", ")}.</p>}
        <p className="text-[11px] text-slate-400">Chỉ gồm các CTCK công khai báo cáo, nên chưa đại diện cho toàn thị trường. Nhận định thuộc về từng công ty, chưa kiểm định khả năng dự báo. Không phải khuyến nghị đầu tư.</p>
      </div>}
    </section>
  );
}
