import { useMemo, useState } from "react";
import useSWR from "swr";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { fmtAgo, fmtVnTime, sourceHealth, VERIFICATION_VI, type NewsDoc, type Verification } from "../../../../lib/world/monitor";

const CHIP: Record<Verification, { color: string; bg: string }> = {
  official: { color: "var(--positive, #34d399)", bg: "rgba(52,211,153,0.1)" },
  corroborated: { color: "#7cb4f5", bg: "rgba(57,135,229,0.12)" },
  single: { color: "var(--text-secondary, #94a3b8)", bg: "rgba(148,163,184,0.1)" },
};
const muted = { color: "var(--text-tertiary, #64748b)" };
const PAGE = 12;

/** Tin kinh tế thế giới: mỗi tin có nguồn, mức xác nhận, giờ đăng theo nguồn và giờ hệ thống thấy. Không tin nào thiếu đường dẫn gốc. */
export default function WorldNewsPanel() {
  const { data, error } = useSWR<NewsDoc>("world-news", () => fetchMarketJson<NewsDoc>("/api/world/news?limit=200"), { refreshInterval: 60_000, revalidateOnFocus: true, dedupingInterval: 30_000 });
  const [topic, setTopic] = useState<string | null>(null);
  const [level, setLevel] = useState<Verification | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [showSources, setShowSources] = useState(false);
  const items = useMemo(() => (data?.items ?? []).filter((x) => (!topic || x.topics.includes(topic)) && (!level || x.verification === level)), [data, topic, level]);
  const health = data ? sourceHealth(data.sources) : null;
  const now = Date.now();
  const chipBtn = (on: boolean) => ({ background: on ? "rgba(245,158,11,0.15)" : "rgba(148,163,184,0.06)", color: on ? "var(--gold, #f59e0b)" : "var(--text-secondary, #94a3b8)", border: `1px solid ${on ? "rgba(245,158,11,0.35)" : "transparent"}` });

  return (
    <section className="rounded-xl p-3.5" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }} data-testid="world-news">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold" style={{ color: "#f1f5f9" }}>Tin kinh tế thế giới</h4>
          <p className="text-[10px]" style={muted}>{data?.noteVi ?? "Tin từ nguồn có danh tính, kèm giờ đăng và mức xác nhận."}</p>
        </div>
        {data && health && <button type="button" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources} className="flex items-center gap-1 text-[10px]" style={{ color: health.failed.length ? "var(--gold, #f59e0b)" : "var(--text-secondary, #94a3b8)" }} data-testid="news-health">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Cập nhật {fmtVnTime(data.refreshedAt)} · {health.ok}/{health.total} nguồn hoạt động
        </button>}
      </div>
      {error && !data && <p role="alert" className="mt-2 text-[11px]" style={{ color: "var(--negative, #f87171)" }}>Không tải được tin: {error.message}</p>}
      {!data && !error && <div className="mt-2 h-40 animate-pulse rounded-lg" style={{ background: "rgba(148,163,184,0.05)" }} aria-busy="true" />}
      {data && showSources && <div className="mt-2 overflow-x-auto rounded-lg" style={{ background: "rgba(148,163,184,0.04)" }} data-testid="news-sources">
        <table className="w-full text-[10px]" style={{ minWidth: 480, color: "var(--text-secondary, #94a3b8)" }}>
          <thead><tr style={muted}><th className="px-2 py-1 text-left font-normal">Nguồn</th><th className="px-2 py-1 text-left font-normal">Loại</th><th className="px-2 py-1 text-left font-normal">Trạng thái</th><th className="px-2 py-1 text-right font-normal">Tin phù hợp</th><th className="px-2 py-1 text-right font-normal">Tin mới nhất</th></tr></thead>
          <tbody>{data.sources.map((s) => <tr key={s.label}><td className="px-2 py-0.5" style={{ color: "#e2e8f0" }}>{s.label}</td><td className="px-2 py-0.5">{s.authority === "official" ? "Chính thức" : "Báo chí"}</td><td className="px-2 py-0.5" style={{ color: s.ok ? "var(--positive, #34d399)" : "var(--negative, #f87171)" }}>{s.ok ? "Hoạt động" : `Lỗi lúc ${fmtVnTime(s.checkedAt)}`}</td><td className="px-2 py-0.5 text-right">{s.items}</td><td className="px-2 py-0.5 text-right">{fmtVnTime(s.newestAt)}</td></tr>)}</tbody>
        </table>
      </div>}
      {data && <>
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Lọc theo mức xác nhận">
          {(Object.keys(VERIFICATION_VI) as Verification[]).map((k) => <button key={k} type="button" aria-pressed={level === k} onClick={() => { setLevel(level === k ? null : k); setLimit(PAGE); }} title={VERIFICATION_VI[k].title} className="rounded px-2 py-0.5 text-[9.5px] font-semibold" style={chipBtn(level === k)}>{VERIFICATION_VI[k].label} ({data.counts[k]})</button>)}
        </div>
        <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Lọc theo chủ đề">
          {Object.entries(data.topics).map(([k, v]) => <button key={k} type="button" aria-pressed={topic === k} onClick={() => { setTopic(topic === k ? null : k); setLimit(PAGE); }} className="rounded px-2 py-0.5 text-[9.5px]" style={chipBtn(topic === k)}>{v}</button>)}
        </div>
        {items.length === 0 && <p className="mt-3 text-[11px]" style={muted}>Không có tin phù hợp bộ lọc trong 7 ngày gần nhất.</p>}
        <ul className="mt-2" data-testid="news-list">
          {items.slice(0, limit).map((n) => <li key={n.url} className="py-2" style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }} data-testid="news-item">
            <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-[11.5px] font-medium hover:underline" style={{ color: "#e2e8f0" }}>{n.title} <ExternalLink className="inline h-2.5 w-2.5" aria-hidden style={muted} /></a>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px]" style={muted}>
              <span className="rounded px-1.5 py-px text-[8.5px] font-bold" title={VERIFICATION_VI[n.verification].title} style={CHIP[n.verification]}>{VERIFICATION_VI[n.verification].label}</span>
              <span style={{ color: "var(--text-secondary, #94a3b8)" }}>{n.sourceLabel}</span>
              <time dateTime={n.publishedAt} title={`Hệ thống thấy lần đầu: ${fmtVnTime(n.firstSeenAt)}`}>Đăng {fmtVnTime(n.publishedAt)} ({fmtAgo(n.publishedAt, now)})</time>
              <span>· {n.topics.map((t) => data.topics[t] ?? t).join(", ")}</span>
              {n.corroborating.length > 0 && <span>· Cũng đưa tin: {n.corroborating.map((c, i) => <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer" className="underline">{i ? ", " : ""}{c.sourceLabel}</a>)}</span>}
            </div>
          </li>)}
        </ul>
        {items.length > limit && <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-1 text-[10px] hover:underline" style={{ color: "var(--gold, #f59e0b)" }}>Xem thêm {Math.min(PAGE, items.length - limit)} tin</button>}
      </>}
    </section>
  );
}
