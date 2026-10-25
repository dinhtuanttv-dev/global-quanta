"use client";
import { useEffect, useMemo, useState } from "react";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { getAccessToken } from "../../../services/api";
import { isTrustedUrl } from "../../../lib/urlSafety";
import { useEventRadar, type EventRadarEvent } from "../../../hooks/useEventRadar";

type ReactionStudy = {
  status: string;
  event: { stockReturn: number | null; excessReturn: number | null; abnormalVolumeRatio: number | null; absorptionInterpretation: string };
  drift: { horizon: number; excessReturn: number | null; status: string }[];
  meta: { asOf: string | null; warnings: string[]; methodVersion: string; sourceEventDate?: string | null; eventSessionDate?: string | null; timeMappingReason?: string | null };
};

const EVENT_LABEL: Record<string, string> = {
  MONETARY_POLICY: "Chính sách tiền tệ", FISCAL_POLICY: "Chính sách tài khóa / thuế",
  MACRO_DATA: "Dữ liệu vĩ mô", SYSTEMIC_STRESS: "Cú sốc / rủi ro hệ thống",
  MARKET_STRUCTURE: "Hạ tầng thị trường", LEGAL: "Pháp lý", EARNINGS: "Kết quả kinh doanh",
  DIVIDEND: "Cổ tức", MNA: "M&A / thoái vốn", ISSUANCE: "Phát hành / tăng vốn",
  CONTRACT: "Hợp đồng / dự án", AGM: "ĐHĐCĐ / nghị quyết", OTHER: "Tin doanh nghiệp",
};
const STATUS_LABEL: Record<string, string> = {
  disclosure_tagged_unverified: "Nguồn gắn nhãn công bố · chưa đối chiếu bản gốc",
  official_source_not_crosschecked: "Nguồn chính thức cấu hình · chưa đối chiếu độc lập",
  unconfirmed: "Chưa xác nhận độc lập", updated_needs_review: "Có cập nhật · cần rà soát",
};
const SEVERITY_LABEL: Record<string, string> = {
  critical_watch: "Cảnh báo cần xác minh", high_attention: "Chú ý cao", material: "Trọng yếu", monitor: "Theo dõi",
};
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : "−"}${Math.abs(value * 100).toFixed(2)}%`;
const ratio = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}×`;
const vnDate = (value: string | null) => value ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "";
const asOf = (value: string | null) => value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa có thời điểm";

function ReactionDetail({ event }: { event: EventRadarEvent }) {
  const [study, setStudy] = useState<ReactionStudy | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const symbol = event.tickers[0];
  const eventTimestamp = event.publishedAt ?? event.firstSeenAt;
  const date = vnDate(eventTimestamp);

  async function run() {
    if (!symbol || !date) return;
    setLoading(true); setError(""); setStudy(null);
    try {
      const result = await fetchMarketJson<ReactionStudy>("/api/market/research/event-reaction", {
        symbol, eventDate: date, eventTimestamp,
        eventTimeSource: event.publishedAt ? "publisher_timestamp" : "gateway_first_seen",
        eventLabel: event.eventLabel || event.title,
      });
      setStudy(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không tải được nghiên cứu phản ứng sự kiện.");
    } finally { setLoading(false); }
  }

  return <div className="mt-3 border-t border-white/10 pt-3">
    <button type="button" onClick={run} disabled={!symbol || !date || loading}
      className="rounded border border-cyan-700/60 bg-cyan-950/40 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">
      {loading ? "Đang phân tích…" : `Nghiên cứu H1${symbol ? ` · ${symbol}` : ""}`}
    </button>
    {!symbol && <span className="ml-2 text-[10px] text-slate-500">Sự kiện chưa ghép được mã cổ phiếu.</span>}
    {error && <p role="alert" className="mt-2 text-[10px] text-rose-300">{error}</p>}
    {study && <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Metric label="Lợi suất phiên đo" value={pct(study.event.stockReturn)} />
        <Metric label="Vượt VN-Index" value={pct(study.event.excessReturn)} />
        <Metric label="KL / median 20 phiên" value={ratio(study.event.abnormalVolumeRatio)} />
      </div>
      <p className="text-[10px] text-slate-300">{study.event.absorptionInterpretation}</p>
      <div className="flex flex-wrap gap-3 text-[10px] text-slate-400">
        {study.drift.map((row) => <span key={row.horizon}>T+{row.horizon}: <b className="text-slate-200">{pct(row.excessReturn)}</b></span>)}
      </div>
      <p className="text-[9px] text-slate-500">Phiên đo {study.meta.eventSessionDate ?? study.meta.sourceEventDate ?? date} · as-of {asOf(study.meta.asOf)} · {study.meta.methodVersion} · nghiên cứu mô tả, không phải xác suất hoặc khuyến nghị.</p>
      {study.meta.warnings.map((warning) => <p key={warning} className="text-[9px] text-amber-300">{warning}</p>)}
    </div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-white/[0.035] p-2"><div className="text-[9px] text-slate-500">{label}</div><div className="mt-1 text-xs font-semibold text-slate-200">{value}</div></div>;
}

function EventCard({ event }: { event: EventRadarEvent }) {
  const accent = event.severityScore >= 4 ? "border-rose-500/50" : event.severityScore >= 3 ? "border-amber-500/40" : "border-white/10";
  return <article className={`rounded-lg border ${accent} bg-slate-950/65 p-3`}>
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-cyan-200">{EVENT_LABEL[event.eventType] ?? event.eventLabel}</span>
      <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[9px] text-amber-200">{SEVERITY_LABEL[event.severity] ?? event.severity}</span>
      <span className="text-[9px] text-slate-500">{STATUS_LABEL[event.verificationStatus] ?? event.verificationStatus}</span>
      <span className="ml-auto text-[9px] text-slate-500">Đăng {asOf(event.publishedAt)} · phát hiện {asOf(event.firstSeenAt)}</span>
    </div>
    <h3 className="mt-2 text-xs font-semibold leading-relaxed text-slate-100">{event.title}</h3>
    {event.summary && <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">{event.summary}</p>}
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {event.tickers.map((ticker) => <span key={ticker} className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[9px] text-slate-200">{ticker}</span>)}
      <span className="text-[9px] text-slate-500">Ghép mã: {Math.round(event.entityConfidence * 100)}% · phiên bản {event.revision}</span>
      {event.usageTermsStatus !== "approved" && <span className="text-[9px] text-amber-300">Điều khoản lưu/trích dẫn: cần rà soát</span>}
      {event.corroborationCount > 1 && <span className="text-[9px] text-emerald-300">{event.corroborationCount} nguồn: {event.corroboratingSources.join(", ")}</span>}
      {isTrustedUrl(event.url) && <a href={event.url!} target="_blank" rel="noopener noreferrer" className="ml-auto text-[9px] text-sky-300 underline">Mở nguồn: {event.sourceLabel}</a>}
    </div>
    {event.sourceDocuments.length > 1 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/5 pt-2">
      {event.sourceDocuments.slice(0, 6).map((source) => isTrustedUrl(source.url) ? <a key={source.eventId} href={source.url!} target="_blank" rel="noopener noreferrer" className="text-[9px] text-sky-300/80 underline">{source.sourceLabel}</a> : null)}
    </div>}
    <ReactionDetail event={event} />
  </article>;
}

function RadarPlot({ events, selectedId, onSelect }: {
  events: EventRadarEvent[];
  selectedId: string | null;
  onSelect: (eventId: string) => void;
}) {
  const plotted = events.slice(0, 80);
  const xFor = (count: number) => 70 + (Math.min(5, Math.max(1, count)) - 1) * 92;
  const yFor = (level: number) => 206 - (Math.min(4, Math.max(1, level)) - 1) * 48;
  const colorFor = (event: EventRadarEvent) => event.severityScore >= 4 ? "#fb7185" : event.severityScore >= 3 ? "#fbbf24" : event.severityScore >= 2 ? "#22d3ee" : "#94a3b8";
  return <div className="overflow-hidden rounded-xl border border-cyan-900/50 bg-[#07111f] p-3 shadow-[inset_0_0_42px_rgba(8,145,178,0.08)]">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="text-xs font-semibold tracking-wide text-cyan-100">RADAR 2D · mức chú ý × đối chiếu nguồn</h3>
        <p className="mt-1 text-[9px] leading-relaxed text-slate-400">Định vị heuristic để ưu tiên rà soát; không phải xác suất tác động hay dự báo giá. Chọn điểm để mở sự kiện.</p></div>
      <span className="rounded border border-cyan-800/60 bg-cyan-950/50 px-2 py-1 text-[9px] text-cyan-200">{plotted.length}/{events.length} sự kiện</span>
    </div>
    <div className="mt-3 w-full" role="group" aria-label="Biểu đồ radar sự kiện hai chiều">
      <svg viewBox="0 0 540 250" className="h-auto max-h-[290px] w-full" role="group" aria-labelledby="event-radar-plot-title event-radar-plot-desc">
        <title id="event-radar-plot-title">Mức chú ý heuristic theo số nguồn ghi nhận</title>
        <desc id="event-radar-plot-desc">Trục ngang là số nguồn ghi nhận, trục dọc là mức chú ý heuristic từ thấp đến cao. Kích thước điểm phản ánh độ mới tương đối.</desc>
        <defs><linearGradient id="radar-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0e2435"/><stop offset="1" stopColor="#07111f"/></linearGradient></defs>
        <rect x="48" y="20" width="460" height="190" rx="9" fill="url(#radar-bg)" stroke="#164e63" strokeOpacity=".5" />
        {[1, 2, 3, 4].map((level) => <g key={`y-${level}`}>
          <line x1="48" x2="508" y1={yFor(level)} y2={yFor(level)} stroke="#164e63" strokeOpacity=".35" strokeDasharray="3 5" />
          <text x="39" y={yFor(level) + 3} textAnchor="end" fill="#64748b" fontSize="8">{level}</text>
        </g>)}
        {[1, 2, 3, 4, 5].map((count) => <g key={`x-${count}`}>
          <line x1={xFor(count)} x2={xFor(count)} y1="20" y2="210" stroke="#164e63" strokeOpacity=".24" />
          <text x={xFor(count)} y="226" textAnchor="middle" fill="#64748b" fontSize="8">{count}{count === 5 ? "+" : ""}</text>
        </g>)}
        <text x="278" y="244" textAnchor="middle" fill="#94a3b8" fontSize="9">Số nguồn ghi nhận trong cụm</text>
        <text x="10" y="118" textAnchor="middle" fill="#94a3b8" fontSize="9" transform="rotate(-90 10 118)">Mức chú ý heuristic</text>
        {plotted.map((event) => {
          const parsedAt = Date.parse(event.publishedAt ?? event.firstSeenAt);
          const ageHours = Number.isFinite(parsedAt) ? Math.max(0, (Date.now() - parsedAt) / 3_600_000) : 24 * 7;
          const radius = 4 + 6 * Math.exp(-ageHours / 72);
          const selected = event.eventId === selectedId;
          return <g key={event.eventId} role="button" tabIndex={0} aria-label={`${event.title}; mức chú ý ${event.severityScore} trên 4; ${event.corroborationCount} nguồn`} aria-pressed={selected}
            onClick={() => onSelect(event.eventId)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(event.eventId); } }} className="group cursor-pointer outline-none">
            <title>{event.title} · {SEVERITY_LABEL[event.severity] ?? event.severity} · {event.corroborationCount} nguồn</title>
            <circle cx={xFor(event.corroborationCount)} cy={yFor(event.severityScore)} r={selected ? radius + 4 : radius + 2} fill="transparent" />
            <circle className="group-focus-visible:stroke-white" cx={xFor(event.corroborationCount)} cy={yFor(event.severityScore)} r={radius} fill={colorFor(event)} fillOpacity={selected ? ".95" : ".68"} stroke={selected ? "#e0f2fe" : colorFor(event)} strokeWidth={selected ? 2 : 1} />
          </g>;
        })}
      </svg>
    </div>
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-slate-400" aria-label="Chú giải mức chú ý">
      <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400"/>Theo dõi</span>
      <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-400"/>Trọng yếu</span>
      <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400"/>Chú ý cao</span>
      <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-400"/>Cần xác minh</span>
      <span className="ml-auto">Kích thước = độ mới tương đối</span>
    </div>
  </div>;
}

export default function EventRadarPanel() {
  const [tickerInput, setTickerInput] = useState("");
  const [tickerFilter, setTickerFilter] = useState("");
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshingSources, setRefreshingSources] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const { data, error, isLoading, refresh, enabled } = useEventRadar({ ticker: tickerFilter || undefined, category: category || undefined, limit: 250 });
  const events = useMemo(() => data?.events ?? [], [data?.events]);
  const categories = useMemo(() => [...new Set(events.map((event) => event.eventType))].sort(), [events]);

  useEffect(() => {
    if (!selectedId) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`event-${selectedId}`)?.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [selectedId]);

  async function refreshSources() {
    setRefreshingSources(true);
    setRefreshError("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Đăng nhập để yêu cầu Gateway quét nguồn ngay.");
      await fetchMarketJson("/api/market/event-radar/refresh", {}, {
        method: "POST", headers: { authorization: `Bearer ${token}` },
      });
      await refresh();
    } catch (cause) {
      setRefreshError(cause instanceof Error ? cause.message : "Không thể yêu cầu cập nhật nguồn.");
    } finally { setRefreshingSources(false); }
  }

  if (!enabled) return <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4 text-xs text-amber-200">Event Radar cần Market Gateway được bật. Kiểm tra cấu hình kết nối Gateway của ứng dụng.</div>;

  return <section className="space-y-3" aria-labelledby="event-radar-heading">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><h2 id="event-radar-heading" className="text-sm font-semibold text-amber-300">Event Radar · Sự kiện → phản ứng → drift</h2>
        <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-400">Tổng hợp tin và công bố có gắn nguồn; mức độ chú ý là bộ lọc heuristic, không phải xác suất tác động hay khuyến nghị giao dịch.</p></div>
      <button type="button" onClick={() => void refreshSources()} disabled={refreshingSources} className="rounded border border-white/10 px-2.5 py-1.5 text-[10px] text-slate-300 disabled:opacity-50">{refreshingSources ? "Đang quét nguồn…" : "Cập nhật nguồn"}</button>
    </div>

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]">
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); setTickerFilter(tickerInput.trim().toUpperCase()); }}>
        <input aria-label="Lọc sự kiện theo mã" value={tickerInput} onChange={(e) => setTickerInput(e.target.value)} placeholder="Lọc mã, ví dụ FPT" maxLength={12} className="min-w-0 flex-1 rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-100" />
        <button className="rounded border border-white/10 px-2 text-[10px] text-slate-300">Lọc</button>
      </form>
      <select aria-label="Lọc loại sự kiện" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-[10px] text-slate-200">
        <option value="">Tất cả nhóm sự kiện</option>{categories.map((key) => <option key={key} value={key}>{EVENT_LABEL[key] ?? key}</option>)}
      </select>
      {tickerFilter && <button type="button" onClick={() => { setTickerFilter(""); setTickerInput(""); }} className="text-left text-[10px] text-sky-300">Xóa lọc {tickerFilter}</button>}
    </div>

    {data && <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[9px] text-slate-400">
      <div className="flex flex-wrap gap-x-4 gap-y-1"><span>Cập nhật nguồn: {asOf(data.generatedAt)}</span><span>Kho: Gateway file · {data.meta.storage.durability === "persistent_volume_required" ? "cần xác nhận volume đã mount" : "đường dẫn volume chưa được xác nhận"}</span><span>{data.meta.disclosureCoverage}</span></div>
      <div className="mt-2 flex flex-wrap gap-2">{Object.entries(data.sources).map(([name, source]) => <span key={name} className={source.ok ? "text-emerald-300" : "text-rose-300"} title={source.error}>{source.ok ? "●" : "○"} {name}{source.items != null ? ` · ${source.items}` : ""}</span>)}</div>
    </div>}

    {error && <div role="alert" className="rounded border border-rose-700/40 bg-rose-950/20 p-3 text-[10px] text-rose-300">Không tải được Event Radar: {error.message}.<button type="button" onClick={() => void refresh()} className="ml-2 underline">Thử lại</button></div>}
    {refreshError && <div role="alert" className="rounded border border-amber-700/40 bg-amber-950/20 p-2.5 text-[10px] text-amber-200">{refreshError}</div>}
    {isLoading && !data && <div className="rounded border border-white/5 p-4 text-[10px] text-slate-400">Đang lấy sự kiện và kiểm tra trạng thái nguồn…</div>}
    {!isLoading && !error && events.length === 0 && <div className="rounded border border-white/5 p-4 text-[10px] text-slate-400">Chưa có sự kiện phù hợp. Radar chỉ ghi nhận những nội dung tìm thấy từ các nguồn hiện được cấu hình.</div>}
    {events.length > 0 && <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <RadarPlot events={events} selectedId={selectedId} onSelect={setSelectedId} />
      <div className="max-h-[620px] space-y-2 overflow-y-auto pr-1" aria-label="Danh sách sự kiện Radar">
        {events.map((event) => <div key={event.eventId} id={`event-${event.eventId}`} className={event.eventId === selectedId ? "rounded-xl ring-1 ring-cyan-400/70" : "rounded-xl"}>
          <EventCard event={event} />
        </div>)}
      </div>
    </div>}
    {data && <p className="text-[9px] leading-relaxed text-slate-500">{data.meta.disclaimer} Việc tin xuất hiện trong Radar không xác nhận nguyên nhân biến động giá. Sự kiện không có mã ghép sẽ không có nghiên cứu H1 theo cổ phiếu.</p>}
  </section>;
}

