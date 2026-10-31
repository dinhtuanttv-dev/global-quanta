import { useMemo, useState } from "react";
import useSWR from "swr";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../../services/marketDataClient";
import { getMarketGateway } from "../../../../config/marketGateway";
import { useWorldSectorScores } from "../../../../hooks/useWorldSectorScores";
import { useWorldStrategy } from "../../../../hooks/useWorldStrategy";
import { useAppStore } from "../../../../store/useAppStore";
import { fmtAgo, fmtSigned, fmtVnTime } from "../../../../lib/world/monitor";
import WorldSectorDrawer from "../worldSectors/WorldSectorDrawer";

interface Citation { ref: string; kind: "market" | "news" | "sector" | "macro" | "broker"; label: string; source: string; at: string | null; url: string | null; verification: string | null }
interface BriefLine { text: string; citations: Citation[] }
interface BriefSector extends BriefLine { icb: string; nameVi: string; direction: "bullish" | "bearish" | "neutral"; quantZ: number }
interface BriefRun { id: string; generatedAt: string; trigger: string; model?: string | null; summary: BriefLine[]; sectors: BriefSector[]; rejected: { text: string; reason: string }[]; inputCounts: { market: number; news: number; sector: number; macro?: number; broker?: number } }
interface BriefDoc { latest: BriefRun | null; runs: { id: string; generatedAt: string }[]; running: boolean; lastError: { at: string; message: string } | null; nextManualAt: string | null; capReached: boolean; schedule: string[]; configured?: boolean }

const STALE_HOURS = 36;
const muted = { color: "var(--text-tertiary, #64748b)" };
const DIR = { bullish: { vi: "Tích cực", color: "#7cb4f5", bg: "rgba(57,135,229,0.08)" }, bearish: { vi: "Tiêu cực", color: "#f09595", bg: "rgba(230,103,103,0.08)" }, neutral: { vi: "Trung tính", color: "#94a3b8", bg: "rgba(148,163,184,0.06)" } };
type Filter = "all" | keyof typeof DIR;

function Citations({ items }: { items: Citation[] }) {
  return <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
    {items.map((c) => {
      const when = c.kind === "news" ? fmtVnTime(c.at) : c.at?.split("-").reverse().join("/");
      const title = `${c.label} · ${c.source}${when ? ` · ${when}` : ""}`;
      const base = { background: "rgba(148,163,184,0.1)", color: "var(--text-secondary, #94a3b8)" };
      return c.url
        ? <a key={c.ref} href={c.url} target="_blank" rel="noopener noreferrer" title={title} className="rounded px-1 text-[11px] hover:underline" style={base} data-testid="brief-cite">{c.source} · {when} <ExternalLink className="inline h-2 w-2" aria-hidden /></a>
        : <span key={c.ref} title={title} className="rounded px-1 text-[11px]" style={base} data-testid="brief-cite">{c.kind === "market" ? c.label.split(":")[0] : c.source}{when ? ` · ${when}` : ""}</span>;
    })}
  </span>;
}

/** Bản tin AI có kiểm chứng: thay cho Bảng tác động và khối Phân tích AI. Mỗi câu kèm trích dẫn; không có xác suất do AI tự chấm. */
export default function AiBriefPanel({ compact = false, onOpenFull }: { compact?: boolean; onOpenFull?: () => void } = {}) {
  const [runId, setRunId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const key = runId ? `/api/world/brief?runId=${encodeURIComponent(runId)}` : "/api/world/brief";
  const { data, error, mutate } = useSWR<BriefDoc>(key, () => fetchMarketJson<BriefDoc>(key), { refreshInterval: (d) => (d?.running ? 5_000 : 60_000), revalidateOnFocus: true });
  const { data: scores } = useWorldSectorScores();
  const { data: strategy } = useWorldStrategy();
  const selectTicker = useAppStore((s) => s.selectTicker);
  const run = data?.latest ?? null;
  const shown = useMemo(() => (run?.sectors ?? []).filter((s) => filter === "all" || s.direction === filter), [run, filter]);
  const row = open ? scores?.rows.find((r) => r.icb === open) : undefined;
  const now = Date.now();
  const ageH = run ? (now - Date.parse(run.generatedAt)) / 3_600_000 : null;
  const blocked = data?.configured === false || !!data?.running || !!data?.capReached || (!!data?.nextManualAt && Date.parse(data.nextManualAt) > now);

  const start = async () => {
    setNotice(null);
    try {
      if (!isMarketGatewayEnabled()) throw new Error("Gateway chưa bật.");
      const r = await fetch(`${getMarketGateway().baseUrl}/api/world/brief/run`, { method: "POST" });
      const body = await r.json();
      if (body.status === "cooldown") setNotice(`Lượt tiếp theo sau ${fmtVnTime(body.nextManualAt)}.`);
      else if (body.status === "cap") setNotice("Đã đạt trần số lượt trong ngày.");
      else if (!r.ok) throw new Error(body.error ?? `Lỗi ${r.status}`);
      await mutate();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Không chạy được."); }
  };

  return (
    <section className="rounded-xl p-3.5" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="ai-brief">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#f1f5f9" }}><Sparkles className="h-3.5 w-3.5" style={{ color: "var(--gold, #f59e0b)" }} aria-hidden />Bản tin AI có kiểm chứng</h4>
          <p className="text-[11px]" style={muted}>AI chỉ diễn giải số liệu và tin đã có. Code kiểm tra từng câu: trích dẫn có thật, con số khớp bằng chứng, chiều ngành không trái điểm định lượng. {data?.schedule ? `Tự chạy ${data.schedule.join(" và ")} ngày làm việc.` : ""}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {(data?.runs.length ?? 0) > 1 && <select aria-label="Xem lần chạy" value={runId ?? ""} onChange={(e) => setRunId(e.target.value || null)} className="rounded px-1.5 py-1 text-[11px]" style={{ background: "#0b1220", color: "#e2e8f0", border: "1px solid rgba(148,163,184,0.2)" }}>
            {data!.runs.map((r, i) => <option key={r.id} value={i === 0 ? "" : r.id}>{fmtVnTime(r.generatedAt)}{i === 0 ? " (mới nhất)" : ""}</option>)}
          </select>}
          <button type="button" onClick={start} disabled={blocked} title={data?.nextManualAt ? `Lượt tiếp theo sau ${fmtVnTime(data.nextManualAt)}` : "Gọi Gemini, tốn phí mỗi lần; có giãn cách và trần lượt theo ngày"} className="rounded-lg px-2.5 py-1 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "rgba(245,158,11,0.15)", color: "var(--gold-bright, #fbbf24)", border: "1px solid rgba(245,158,11,0.35)" }} data-testid="brief-run">{data?.running ? "Đang phân tích…" : "Cập nhật ngay"}</button>
        </div>
      </div>
      {notice && <p className="mt-2 text-[11px]" role="status" style={{ color: "var(--gold, #f59e0b)" }}>{notice}</p>}
      {error && !data && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--negative, #f87171)" }}>Không tải được bản tin: {error.message}</p>}
      {data?.lastError && <p className="mt-2 text-[11px]" role="note" style={{ color: "var(--gold, #f59e0b)" }}>Lần chạy lúc {fmtVnTime(data.lastError.at)} không thành công: {data.lastError.message}</p>}
      {data && data.configured === false && <p className="mt-2 text-[11px]" role="note" data-testid="brief-no-key" style={{ color: "var(--gold, #f59e0b)" }}>Gateway chưa có khoá Gemini nên bản tin AI chưa chạy. Không hiển thị nội dung thay thế.</p>}
      {data && !run && !data.running && data.configured !== false && <p className="mt-3 text-[11px]" style={muted}>Chưa có bản tin nào.</p>}
      {run && <>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px]" style={muted} data-testid="brief-meta">
          <CheckCircle2 className="h-3 w-3" style={{ color: "var(--positive, #34d399)" }} aria-hidden />
          Tạo lúc {fmtVnTime(run.generatedAt)} ({fmtAgo(run.generatedAt, now)}) · {run.summary.length + run.sectors.length} câu đạt kiểm chứng{run.rejected.length ? `, loại ${run.rejected.length} câu` : ""} · dùng {run.inputCounts.market} dòng giá, {run.inputCounts.news} tin, {run.inputCounts.sector} ngành{run.inputCounts.macro ? `, ${run.inputCounts.macro} số liệu Việt Nam` : ""}{run.inputCounts.broker ? `, ${run.inputCounts.broker} nhận định CTCK` : ""}{run.model ? ` · ${run.model}` : ""}
        </p>
        {ageH != null && ageH > STALE_HOURS && !runId && <p className="mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px]" role="note" style={{ background: "rgba(245,158,11,0.08)", color: "var(--gold, #f59e0b)" }}>Bản tin đã {Math.floor(ageH / 24) || 1} ngày, không phản ánh thị trường hiện tại.</p>}
        <ul className="mt-2 space-y-1.5" data-testid="brief-summary">
          {(compact ? run.summary.slice(0, 3) : run.summary).map((s, i) => <li key={i} className="text-[11.5px] leading-relaxed" style={{ color: "#e2e8f0" }}>{s.text}<Citations items={s.citations} /></li>)}
        </ul>
        {compact && onOpenFull && <button type="button" onClick={onOpenFull} className="mt-2 text-[11px] text-sky-300 underline decoration-sky-300/30 hover:decoration-sky-300" data-testid="brief-open-full">Xem bản tin đầy đủ và đồng thuận CTCK trong Phân tích vĩ mô →</button>}
        {!compact && run.sectors.length > 0 && <>
          <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Lọc theo chiều">
            {(["all", "bullish", "bearish", "neutral"] as Filter[]).map((k) => {
              const n = k === "all" ? run.sectors.length : run.sectors.filter((s) => s.direction === k).length;
              return <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className="rounded px-2 py-0.5 text-[11px]" style={{ background: filter === k ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.06)", color: filter === k ? "var(--gold, #f59e0b)" : "var(--text-secondary, #94a3b8)" }}>{k === "all" ? "Tất cả" : DIR[k].vi} ({n})</button>;
            })}
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2" data-testid="brief-sectors">
            {shown.map((s) => {
              const tickers = strategy?.short.rows.find((r) => r.icb === s.icb)?.constituents?.slice(0, 4) ?? [];
              return <div key={s.icb} className="rounded-lg p-2.5" style={{ background: DIR[s.direction].bg, border: "1px solid rgba(148,163,184,0.08)" }}>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={() => setOpen(s.icb)} className="text-[11px] font-bold hover:underline" style={{ color: "#f1f5f9" }} data-testid={`brief-sector-${s.icb}`}>{s.nameVi}</button>
                  <span className="shrink-0 text-[11px] font-bold" style={{ color: DIR[s.direction].color }}>{DIR[s.direction].vi}<span className="font-normal" style={muted}> · z {fmtSigned(s.quantZ, 2)}</span></span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--text-secondary, #94a3b8)" }}>{s.text}<Citations items={s.citations} /></p>
                {tickers.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{tickers.map((t) => <button key={t.ticker} type="button" onClick={() => selectTicker(t.ticker)} className="rounded px-1.5 py-0.5 text-[11px] font-black" style={{ background: "rgba(2,6,15,0.6)", color: "var(--gold-bright, #fbbf24)" }}>{t.ticker}</button>)}</div>}
              </div>;
            })}
          </div>
        </>}
        {!compact && run.rejected.length > 0 && <details className="mt-2 text-[11px]" style={muted} data-testid="brief-rejected"><summary style={{ cursor: "pointer" }}>Xem {run.rejected.length} câu bị loại và lý do</summary><ul className="mt-1 space-y-0.5">{run.rejected.map((r, i) => <li key={i}>{r.reason}: {r.text}</li>)}</ul></details>}
        <p className="mt-2 text-[11px]" style={muted}>Suy luận của AI, có thể sai. Chiều ngành chưa được kiểm định thống kê riêng. Không phải khuyến nghị đầu tư.</p>
      </>}
      {row && <WorldSectorDrawer icb={row.icb} row={row} onClose={() => setOpen(null)} />}
    </section>
  );
}
