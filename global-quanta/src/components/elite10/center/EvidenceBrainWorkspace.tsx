import { useCallback, useEffect, useMemo, useState } from "react";
import { useEliteDecision, useEliteEvidence, useEliteLedger, useEliteRisk, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { useEventRadar } from "../../../hooks/useEventRadar";
import { useVolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import PriceActionConfirmation from "../profile/PriceActionConfirmation";
import type { Lane } from "../../MainTabs/ChatXucTac/CatalystChatPanel";
import { buildEvidenceSnapshot, matchingTimingRow, sourceReadiness, type PriceActionEvidence } from "../../../lib/evidenceBrain/snapshot";
import type { ClaimParseResult, EvidenceRef, EvidenceSnapshot, ValidatedClaim } from "../../../lib/evidenceBrain/types";

type Props = {
  ticker: string;
  onTickerChange: (value: string) => void;
  bull: Lane | null;
  bear: Lane | null;
  judge: Lane | null;
  bullClaims: ClaimParseResult | null;
  bearClaims: ClaimParseResult | null;
  judgeClaims: ClaimParseResult | null;
  reviewSnapshot: EvidenceSnapshot | null;
  reviewMessage?: string | null;
  onSnapshotChange: (snapshot: EvidenceSnapshot | null) => void;
  onRunReview: (snapshot: EvidenceSnapshot) => void;
};

const fmt = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value)
  ? "—" : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("vi-VN") : "—";
const safeHttpUrl = (value: string | null) => {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; }
  catch { return null; }
};

function Node({ title, status, children, tone = "cyan" }: { title: string; status: string; children?: React.ReactNode; tone?: "cyan" | "green" | "red" | "amber" }) {
  const palette = {
    cyan: "border-cyan-400/30 bg-cyan-400/[0.06]",
    green: "border-emerald-400/30 bg-emerald-400/[0.06]",
    red: "border-rose-400/30 bg-rose-400/[0.06]",
    amber: "border-amber-400/30 bg-amber-400/[0.06]",
  }[tone];
  return <article className={`relative z-10 min-w-0 rounded-lg border p-2.5 ${palette}`}>
    <div className="flex items-center justify-between gap-2"><h5 className="text-[10px] font-bold uppercase tracking-wide text-slate-200">{title}</h5><span className="text-[9px] text-slate-400">{status}</span></div>
    {children && <div className="mt-1.5 text-[10px] leading-relaxed text-slate-300">{children}</div>}
  </article>;
}

function OnDemandSources({ ticker, news, volume, onOpenRef }: { ticker: string; news: ReturnType<typeof useEventRadar>; volume: ReturnType<typeof useVolumeAnalysis>; onOpenRef: (id: string) => void }) {
  const events = (news.data?.events ?? []).filter((event) => event.tickers.some((item) => item.toUpperCase() === ticker));
  return <div className="grid gap-2 lg:grid-cols-2">
    <Node title="Tin tức & chất xúc tác" status={!news.enabled ? "Gateway chưa bật" : news.isLoading ? "đang tải" : news.error ? "lỗi nguồn" : `${events.length} sự kiện`} tone="amber">
      {!news.enabled ? "Event Radar không khả dụng khi Market Gateway chưa bật." : news.error ? "Không tải được Event Radar." : events.length ? <ul className="space-y-1.5">{events.slice(0, 5).map((event) => <li key={event.eventId} className="border-t border-white/5 pt-1.5">
        <span className="font-semibold text-slate-100">{event.title}</span><br />
        <span>{event.sourceLabel} · {event.sourceAuthority} · {event.verificationStatus} · entity {event.entityMatch} ({fmt(event.entityConfidence * 100, 0)}%) · {date(event.publishedAt ?? event.firstSeenAt)}</span>
        {event.clusterId && <span className="ml-1 rounded border border-white/10 px-1">cluster {event.clusterId}</span>}
        <button type="button" className="ml-2 text-cyan-300 underline" onClick={() => onOpenRef(`ref:catalyst:${ticker}:events.${event.eventId}.title`)}>Chi tiết/ref</button>
        {safeHttpUrl(event.url) && <a className="ml-2 text-cyan-300 underline" href={safeHttpUrl(event.url)!} target="_blank" rel="noreferrer">Mở nguồn</a>}
      </li>)}</ul> : news.isLoading ? "Đang tải tin theo mã đã chọn…" : "Không có sự kiện phù hợp trong phản hồi hiện tại; trạng thái này không đồng nghĩa không có tin."}
    </Node>
    <Node title="Khối lượng & thanh khoản" status={volume.isLoading ? "đang tải" : volume.error ? "lỗi nguồn" : volume.data ? `as of ${date(volume.data.asOf)}` : "chưa có dữ liệu"} tone="cyan">
      {volume.data ? <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>RVOL {volume.data.today.rvolMode === "intraday" ? "cùng thời điểm" : "20 phiên"}</span><b>{fmt(volume.data.today.rvolMode === "intraday" ? volume.data.today.rvolTimeAdjusted : volume.data.today.rvol20)}×</b>
        <span>GTGD hôm nay</span><b>{fmt(volume.data.today.value / 1e9)} tỷ</b>
        <span>Up/down volume 20p</span><b>{fmt(volume.data.trend.upDownVolumeRatio20)}×</b>
        <span>OBV · CMF20</span><b>{volume.data.trend.obvDirection} · {fmt(volume.data.trend.cmf20, 3)}</b>
        <span>Trạng thái nến</span><b>{volume.data.partialToday ? "đang diễn ra" : "đã chốt"}</b>
        {volume.data.trend.divergence && <p className="col-span-2 text-amber-200">Phân kỳ: {volume.data.trend.divergence.label}</p>}
      </div> : volume.error ? "Không tải được phân tích khối lượng." : "Chưa có dữ liệu khối lượng."}
    </Node>
  </div>;
}

function PriceVolumeTimeline({ volume, events, pa }: { volume: ReturnType<typeof useVolumeAnalysis>["data"] | null; events: NonNullable<ReturnType<typeof useEventRadar>["data"]>["events"]; pa: PriceActionEvidence | null }) {
  const bars = volume?.trend.bars30 ?? [];
  if (!bars.length) return <p className="text-[10px] text-slate-500">Timeline chưa có chuỗi 30 phiên khối lượng/giá đồng bộ.</p>;
  const closes = bars.map((bar) => bar.close), min = Math.min(...closes), max = Math.max(...closes), span = Math.max(max - min, 1);
  const points = bars.map((bar, index) => `${24 + index * (850 / Math.max(bars.length - 1, 1))},${16 + (max - bar.close) / span * 95}`).join(" ");
  const maxVolume = Math.max(...bars.map((bar) => bar.volume), 1);
  return <div className="overflow-x-auto" aria-label="Timeline 30 phiên: giá đóng cửa và khối lượng">
    <svg role="img" aria-label="Đường giá đóng cửa, thanh khối lượng và các mốc sự kiện" className="min-w-[620px] w-full" viewBox="0 0 900 180">
      <line x1="20" x2="880" y1="124" y2="124" stroke="#334155" />
      {bars.map((bar, index) => { const x = 24 + index * (850 / Math.max(bars.length - 1, 1)); const h = bar.volume / maxVolume * 38; return <rect key={`v-${bar.date}`} x={x - 4} y={169 - h} width="8" height={h} rx="1" fill={bar.up ? "#34d399" : "#fb7185"} opacity={volume?.partialToday && index === bars.length - 1 ? 0.45 : 0.72} />; })}
      <polyline points={points} fill="none" stroke="#22d3ee" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {events.map((event) => { const eventDay = (event.publishedAt ?? event.firstSeenAt).slice(0, 10); const index = bars.findIndex((bar) => bar.date.slice(0, 10) === eventDay); if (index < 0) return null; const x = 24 + index * (850 / Math.max(bars.length - 1, 1)); return <g key={event.eventId}><line x1={x} x2={x} y1="8" y2="124" stroke="#fbbf24" strokeDasharray="3 3" /><circle cx={x} cy="9" r="4" fill="#fbbf24" /><title>{event.title} · {event.verificationStatus}</title></g>; })}
      {pa?.setup && <g><line x1="24" x2="874" y1="120" y2="120" stroke="#a78bfa" strokeDasharray="6 4" /><text x="28" y="116" fill="#c4b5fd" fontSize="9">PA {pa.state} · trigger {fmt(pa.setup.entryReference)}</text></g>}
      <text x="20" y="178" fill="#64748b" fontSize="9">{bars[0]?.date.slice(0, 10)} → {bars[bars.length - 1]?.date.slice(0, 10)} · giá đóng cửa (cyan) · volume (xanh/đỏ) · catalyst (vàng)</text>
    </svg>
    <p className="text-[9px] text-slate-500">{volume?.partialToday ? "Volume phiên đang diễn ra; cột cuối mờ và RVOL dùng so sánh cùng thời điểm." : "Chuỗi volume từ analysis API; không đồng nhất với cây nến OHLCV điều chỉnh của Price Action."}</p>
  </div>;
}

function ClaimCard({ claim, onOpenRef }: { claim: ValidatedClaim; onOpenRef: (id: string) => void }) {
  const tone = claim.validation === "REFS_MATCHED" ? "text-emerald-300" : claim.validation === "UNSUPPORTED" || claim.validation === "MISREPRESENTED" ? "text-rose-300" : "text-amber-200";
  return <article className="rounded-md border border-white/10 bg-slate-950/50 p-2" data-claim-id={claim.id}>
    <div className="flex flex-wrap justify-between gap-1 text-[9px]"><b className={tone}>{claim.side} · {claim.validation}</b><span>{claim.classification} · {claim.asOf ?? "as-of ?"} · bất định {claim.uncertainty}</span></div>
    <p className="mt-1 text-[10px] text-slate-200">{claim.text}</p>
    <div className="mt-1 flex flex-wrap gap-1">{[...new Set([...claim.supports.map((id) => `${id}|hỗ trợ`), ...claim.invalidates.map((id) => `${id}|phản chứng`), ...claim.refs.map((id) => `${id}|ref`)])].map((token) => { const [id, label] = token.split("|"); return <button key={`${id}-${label}`} type="button" onClick={() => onOpenRef(id)} className="rounded border border-white/10 px-1.5 py-0.5 text-[8px] text-cyan-200">{label}: {id.split(":").slice(-1)[0]}</button>; })}</div>
    {claim.invalidation && <p className="mt-1 text-[9px] text-amber-200">Vô hiệu hóa: {claim.invalidation}</p>}
    {claim.validationNotes.length > 0 && <p className="mt-1 text-[9px] text-rose-200">{claim.validationNotes.join(" · ")}</p>}
  </article>;
}

function EvidenceGraph({ claims, refs }: { claims: ValidatedClaim[]; refs: EvidenceRef[] }) {
  const displayedClaims = claims.filter((claim) => ["REFS_MATCHED", "STRUCTURAL_ONLY"].includes(claim.validation)).slice(0, 6);
  const refIds = [...new Set(displayedClaims.flatMap((claim) => [...claim.supports, ...claim.invalidates, ...claim.refs]))].filter((id) => refs.some((ref) => ref.id === id)).slice(0, 6);
  const displayedRefs = refIds.map((id) => refs.find((ref) => ref.id === id)!).filter(Boolean);
  const height = Math.max(220, Math.max(displayedRefs.length, displayedClaims.length, 1) * 76 + 36);
  const rootY = height / 2 - 27;
  return <div className="mt-2 overflow-x-auto rounded-md border border-white/10 bg-slate-950/40" aria-label="กราฟ claim และ evidence; มี claim list tương đương bên dưới">
    <div className="relative min-w-[900px]" style={{ width: 900, height }}>
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox={`0 0 900 ${height}`}>
        {displayedRefs.map((ref, index) => { const y = 18 + index * 76 + 30; return <path key={`root-${ref.id}`} d={`M 380 ${rootY + 27} C 300 ${rootY + 27}, 300 ${y}, 250 ${y}`} fill="none" stroke="#64748b" strokeDasharray="4 4"><title>Evidence thuộc snapshot</title></path>; })}
        {displayedClaims.flatMap((claim, claimIndex) => {
          const targetY = 18 + claimIndex * 76 + 30;
          const relationIds = new Set([...claim.supports, ...claim.invalidates]);
          const relationRefs = [
            ...claim.refs.filter((id) => !relationIds.has(id)).map((id) => [id, "cited"] as const),
            ...claim.supports.map((id) => [id, "supports"] as const),
            ...claim.invalidates.map((id) => [id, "invalidates"] as const),
          ];
          return relationRefs.filter(([id]) => displayedRefs.some((ref) => ref.id === id)).map(([id, relation], refIndex) => {
            const sourceIndex = displayedRefs.findIndex((ref) => ref.id === id);
            const sourceY = 18 + sourceIndex * 76 + 30;
            const color = relation === "supports" ? "#34d399" : relation === "invalidates" ? "#fb7185" : "#94a3b8";
            const label = relation === "supports" ? "Ref được claim nêu là hỗ trợ (chưa chứng minh ngữ nghĩa)" : relation === "invalidates" ? "Ref được claim nêu là phản chứng" : "Ref được claim trích dẫn";
            return <path key={`${claim.id}-${id}-${refIndex}`} d={`M 620 ${sourceY} C 650 ${sourceY}, 620 ${targetY}, 650 ${targetY}`} fill="none" stroke={color} strokeDasharray={claim.validation === "REFS_MATCHED" ? undefined : "4 4"} strokeWidth="2"><title>{label}</title></path>;
          });
        })}
      </svg>
      <div className="absolute left-3 top-2 text-[8px] font-bold uppercase text-slate-500">Evidence refs</div>
      {displayedRefs.map((ref, index) => <div key={ref.id} className="absolute left-3 flex h-[60px] w-[230px] flex-col justify-center overflow-hidden rounded border border-cyan-400/25 bg-[#0b1b28] px-2" style={{ top: 18 + index * 76 }}>
        <b className="truncate text-[9px] text-cyan-200">{ref.domain} · {ref.fieldPath}</b><span className="truncate text-[8px] text-slate-400">{ref.source} · {ref.asOf ?? "as-of ?"} · {ref.freshness}</span>
      </div>)}
      <div className="absolute left-[380px] flex h-[54px] w-[210px] flex-col justify-center rounded-full border border-cyan-300/40 bg-[#0b1b28] px-3 text-center" style={{ top: rootY }}><b className="text-[10px] text-cyan-200">Snapshot node</b><span className="truncate text-[8px] text-slate-500">Evidence belongs to one snapshot</span></div>
      <div className="absolute right-3 top-2 text-[8px] font-bold uppercase text-slate-500">Validated claims</div>
      {displayedClaims.map((claim, index) => <div key={claim.id} className={`absolute right-3 flex h-[60px] w-[240px] flex-col justify-center overflow-hidden rounded border px-2 ${claim.validation === "REFS_MATCHED" ? "border-emerald-400/30 bg-emerald-950/30" : "border-amber-400/30 bg-amber-950/20"}`} style={{ top: 18 + index * 76 }}>
        <b className="truncate text-[9px] text-slate-200">{claim.side} · {claim.validation}</b><span className="truncate text-[8px] text-slate-400">{claim.text}</span>
      </div>)}
      {!displayedClaims.length && <p className="absolute inset-0 grid place-items-center text-[10px] text-slate-600">Chưa có claim JSON hợp lệ để nối cạnh. Claims không cấu trúc không được vẽ như bằng chứng.</p>}
    </div>
    <div className="flex gap-3 border-t border-white/10 px-2 py-1.5 text-[8px] text-slate-500"><span className="text-emerald-300">— hỗ trợ</span><span className="text-rose-300">— phản chứng</span><span>nét đứt = claim chưa đầy đủ</span></div>
  </div>;
}

export default function EvidenceBrainWorkspace({ ticker, onTickerChange, bull, bear, judge, bullClaims, bearClaims, judgeClaims, reviewSnapshot, reviewMessage, onSnapshotChange, onRunReview }: Props) {
  const normalized = ticker.trim().toUpperCase();
  const validTicker = /^[A-Z0-9]{3,10}$/.test(normalized) ? normalized : null;
  const [loadSources, setLoadSources] = useState(false);
  const [loadPriceAction, setLoadPriceAction] = useState(false);
  const [priceAction, setPriceAction] = useState<PriceActionEvidence | null>(null);
  const [snapshot, setSnapshot] = useState<EvidenceSnapshot | null>(null);
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const [focus, setFocus] = useState("snapshot");
  const decision = useEliteDecision(loadSources || loadPriceAction);
  const selected = useEliteTicker(validTicker, loadSources || loadPriceAction);
  const evidence = useEliteEvidence(loadSources);
  const ledger = useEliteLedger(null, loadSources);
  const risk = useEliteRisk(loadSources);
  const timeline = useGatewayBuyTimeline(loadSources);
  const news = useEventRadar({ ticker: validTicker ?? undefined, limit: 12, enabled: loadSources && Boolean(validTicker), keepPreviousData: false });
  const volume = useVolumeAnalysis(validTicker, loadSources && Boolean(validTicker));
  const pick = decision.data?.portfolio.find((row) => row.ticker.toUpperCase() === normalized);
  const candidate = decision.data?.candidates?.find((row) => row.ticker.toUpperCase() === normalized);
  const score = decision.data?.scores.find((row) => row.ticker.toUpperCase() === normalized);
  const timing = useMemo(() => matchingTimingRow(timeline.data, validTicker), [timeline.data, validTicker]);
  const eligibility = pick ? "Danh mục" : candidate ? "Hàng chờ" : score?.eligible ? "Đủ điều kiện · ngoài danh mục" : score ? "Chưa đủ điều kiện" : validTicker ? "Chưa xác minh trong phiên" : "Chọn mã";
  const paForTicker = priceAction?.ticker === normalized ? priceAction : null;
  const sourceLoading = [
    ...(decision.isLoading ? ["decision"] : []),
    ...(validTicker && selected.isLoading ? ["profile"] : []),
    ...(loadSources && evidence.isLoading ? ["evidence"] : []),
    ...(loadSources && ledger.isLoading ? ["ledger"] : []),
    ...(loadSources && risk.isLoading ? ["risk"] : []),
    ...(loadSources && timeline.loading ? ["timeline"] : []),
    ...(loadSources && validTicker && news.enabled && news.isLoading ? ["events"] : []),
    ...(loadSources && validTicker && volume.isLoading ? ["volume"] : []),
    ...(loadPriceAction && (!paForTicker || paForTicker.loading) ? ["priceAction"] : []),
  ];
  const sourceUnavailable = [...(loadSources && validTicker && !news.enabled ? ["events"] : [])];
  const paTickerVerified = !normalized ? null : selected.decision?.ticker === normalized || selected.panel?.ticker.toUpperCase() === normalized || paForTicker?.tickerVerified === true;
  useEffect(() => {
    if (!loadSources && !loadPriceAction) {
      setSnapshot(null);
      onSnapshotChange(null);
      return;
    }
    setSnapshot(null);
    onSnapshotChange(null);
    let active = true;
    void buildEvidenceSnapshot({
      ticker: normalized || null, tickerVerified: paTickerVerified,
      now: new Date().toISOString(), decision: decision.data ?? null, decisionError: decision.error ? String(decision.error) : null,
      selectedDecision: selected.decision, panel: selected.panel, profileError: selected.error ? String(selected.error) : null,
      evidence: evidence.data ?? null, evidenceError: evidence.error ? String(evidence.error) : null,
      ledger: ledger.data ?? null, ledgerError: ledger.error ? String(ledger.error) : null,
      risk: risk.data ?? null, riskError: risk.error ? String(risk.error) : null,
      timeline: timeline.data, timelineError: timeline.error, events: news.data?.events ?? null, eventAsOf: news.data?.generatedAt ?? null,
      eventError: news.error ? String(news.error) : null, volume: volume.data ?? null, volumeError: volume.error ? String(volume.error) : null,
      priceAction: paForTicker, priceActionError: paForTicker?.error, sourceLoading, sourceUnavailable,
    }).then((next) => {
      if (!active) return;
      setSnapshot(next);
      onSnapshotChange(next);
    }).catch((error: unknown) => {
      if (!active) return;
      setSnapshot(null);
      console.error("Evidence snapshot could not be sealed", error);
    });
    return () => { active = false; };
  }, [loadSources, loadPriceAction, normalized, paTickerVerified, decision.data, decision.error, selected.decision, selected.panel, evidence.data, ledger.data, risk.data, timeline.data, timeline.error, news.data, news.error, volume.data, volume.error, paForTicker, sourceLoading.join("|"), sourceUnavailable.join("|"), onSnapshotChange]);
  const readiness = snapshot ? sourceReadiness(snapshot) : null;
  const onOpenRef = useCallback((id: string) => setSelectedRefId(id), []);
  const onPriceActionEvidence = useCallback((item: PriceActionEvidence) => setPriceAction((current) => current?.ticker === item.ticker && JSON.stringify(current) === JSON.stringify(item) ? current : item), []);
  const hasClaims = Boolean(bullClaims?.claims.length || bearClaims?.claims.length || judgeClaims?.claims.length);
  const claimsSnapshot = hasClaims && reviewSnapshot ? reviewSnapshot : snapshot;
  const selectedRef: EvidenceRef | null = claimsSnapshot?.refs.find((ref) => ref.id === selectedRefId) ?? null;

  return <section className="rounded-xl border border-cyan-400/25 bg-[#07111d] p-3 text-slate-200 shadow-[0_16px_50px_rgba(0,0,0,.28)]" data-testid="evidence-brain-workspace">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-cyan-300">Evidence Brain · research workspace</p>
        <h3 className="mt-0.5 text-sm font-bold text-white">Phòng họp AI · bản đồ bằng chứng</h3>
        <p className="mt-0.5 text-[10px] text-slate-500">Phiên tham chiếu {snapshot?.decisionSession ?? "đang tải"} · {decision.data?.version ?? "chưa có phiên bản"} · {decision.data?.builtAt ? `dựng ${new Date(decision.data.builtAt).toLocaleString("vi-VN")}` : "nguồn quyết định chưa sẵn sàng"}</p>
        <p className="text-[9px] text-slate-600">Snapshot {snapshot?.snapshotId ?? "đang tạo"} · {snapshot?.sources.filter((source) => source.state === "LOADED").length ?? 0}/{snapshot?.sources.length ?? 0} nguồn đã tải · các request riêng được ghi as-of.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="elite-debate-subject" className="sr-only">Mã cổ phiếu phân tích</label>
        <input id="elite-debate-subject" value={ticker} onChange={(event) => onTickerChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} maxLength={10}
          placeholder="Mã cổ phiếu" aria-label="Chủ đề tranh luận" className="w-32 rounded-md border border-white/15 bg-slate-950 px-2.5 py-1.5 text-[11px] uppercase outline-none focus:border-cyan-400/50" />
        <span className={`rounded border px-2 py-1 text-[9px] ${pick ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-200"}`}>{eligibility}</span>
        <span className={`rounded border px-2 py-1 text-[9px] ${snapshot?.completeness === "COMPLETE" ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-200"}`}>{readiness?.label ?? "đang kiểm tra"}</span>
        <span className="rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400">AI = diễn giải</span>
      </div>
    </header>

    <div className="mt-3 grid gap-3 xl:grid-cols-[210px_minmax(0,1fr)_240px]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phễu tuyển chọn</h4><span className="text-[9px] text-slate-600">phiên {decision.data?.date ?? "—"}</span></div>
        {snapshot?.funnel.steps.length ? snapshot.funnel.steps.map((step) => <button key={step.index} type="button" onClick={() => setFocus(`funnel-${step.index}`)} className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left ${focus === `funnel-${step.index}` ? "border-cyan-300/40 bg-cyan-300/[.08]" : "border-white/8 bg-white/[.02]"}`}>
          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] ${step.index === 7 && pick ? "bg-emerald-400/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{String(step.index).padStart(2, "0")}</span>
          <span className="min-w-0 flex-1 text-[10px] text-slate-300">{step.label}<small className="ml-1 text-[8px] text-slate-600">{step.parallel ? "song song" : step.displayOnly ? "DISPLAY" : ""}</small></span><b className="text-[10px] text-slate-100">{step.count ?? "—"}</b>
        </button>) : <p className="rounded border border-white/10 p-2 text-[10px] text-slate-500">Funnel HL chưa có trong phiên này.</p>}
        <div className="rounded border border-white/10 bg-white/[.02] p-2 text-[9px] text-slate-400">Mã: <b className="text-slate-200">{snapshot?.funnel.membership.state ?? "UNKNOWN"}</b> · PZ {snapshot?.funnel.membership.pz ?? "—"} · {snapshot?.funnel.mode ?? "PZ chưa có"}{snapshot?.funnel.membership.reason ? <p className="mt-1">{snapshot.funnel.membership.reason}</p> : null}</div>
        {snapshot?.funnel.checks.map((check) => <p key={check} className="rounded border border-rose-400/30 p-1.5 text-[9px] text-rose-200">Invariant: {check}</p>)}
        {snapshot?.funnel.frozen && <p className="rounded border border-rose-400/40 bg-rose-400/5 p-2 text-[9px] text-rose-200">DATA GUARD · đóng băng. Không kết luận trạng thái đủ điều kiện.</p>}
      </aside>

      <main className="relative min-h-[290px] overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_50%_40%,rgba(15,63,82,.2),transparent_55%),linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:auto,24px_24px,24px_24px] p-2.5">
        <div className="mb-2 flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-wide text-cyan-200">Canvas 2D · snapshot {snapshot?.snapshotId ?? "đang dựng"}</h4><span className="text-[9px] text-slate-500">Read only · quan hệ chỉ vẽ theo ref hợp lệ</span></div>
        <div className="relative grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1.2fr_1fr]">
          <div className="space-y-2"><Node title="Nguồn · Elite" status={decision.isLoading || selected.isLoading ? "đang tải" : decision.error || selected.error ? "lỗi" : `as of ${date(decision.data?.date)}`}>
            {pick ? `${normalized} · hạng #${pick.rank} · tỷ trọng ${fmt(pick.weight * 100, 1)}% · Z ${fmt(pick.Z)}` : candidate ? `${normalized} · ứng viên #${candidate.rank} · ${candidate.reason}` : score ? `${normalized} · ${score.reason ?? (score.eligible ? "đạt điều kiện" : "chưa đạt")}` : "Dữ liệu membership/điểm từng mã chưa có."}
            {selected.panel && <div className="mt-1 border-t border-white/10 pt-1 text-slate-400">Ngành: {selected.panel.sector ?? "chưa phân loại"}{selected.panel.missingSources.length ? ` · thiếu nguồn: ${selected.panel.missingSources.join(", ")}` : ""}</div>}
          </Node><Node title="Price Action" status={paForTicker ? `${paForTicker.state} · ${paForTicker.asOf ?? "—"}` : loadPriceAction ? "đang tải" : "chưa tải"} tone="amber">{paForTicker ? `${paForTicker.trend ?? "trend chưa rõ"} · ${paForTicker.priceBasis ?? "basis ?"} · ${paForTicker.barClosed ? "nến đã đóng" : "nến chưa xác nhận đóng"}${paForTicker.setup ? ` · trigger ${fmt(paForTicker.setup.entryReference)} · invalidation ${fmt(paForTicker.setup.invalidationLevel)}` : " · chưa có setup bullish"}` : "OHLCV ngày · trạng thái setup chỉ được xác định từ engine khi tải dữ liệu kỹ thuật."}</Node></div>
          <div className="space-y-2 rounded-lg border border-cyan-300/30 bg-[#0b1b28]/90 p-3 text-center shadow-[0_0_35px_rgba(34,211,238,.08)]">
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-cyan-300/50 bg-cyan-300/10 text-xs font-bold text-cyan-200">{validTicker ?? "E10"}</span>
            <h5 className="text-[11px] font-bold text-white">{validTicker ? `${validTicker} · phiên tham chiếu` : "Danh mục Elite 10 · phiên tham chiếu"}</h5>
            <p className="text-[9px] text-slate-500">{decision.data?.date ? `Phiên ${decision.data.date}` : "Đang chờ dữ liệu phiên"} · ID {snapshot?.snapshotId ?? "—"} · không tạo điểm mua</p>
            <div className="grid grid-cols-3 gap-1 border-t border-white/10 pt-2 text-[9px]"><span className="text-emerald-300">MUA · {bull?.text ? `${bullClaims?.summary.refsMatched ?? 0}/${bullClaims?.claims.length ?? 0} claim ref/số khớp` : "chờ tranh luận"}</span><span className="text-rose-300">BÁN · {bear?.text ? `${bearClaims?.summary.refsMatched ?? 0}/${bearClaims?.claims.length ?? 0} claim ref/số khớp` : "chờ phản biện"}</span><span className="text-amber-200">TRỌNG TÀI · {judge?.text ? `${judgeClaims?.claims.length ?? 0} claims` : "chưa chạy"}</span></div>
          </div>
          <div className="space-y-2"><Node title="Chất xúc tác" status={timing ? `${timing.tier} · ${timing.status}` : news.isLoading ? "đang tải" : "chưa có nghiên cứu phù hợp"} tone="amber">{timing ? `${timing.kind} · ${timing.eventLabel} · ${timing.entryFromDate}→${timing.entryToDate} · n=${timing.nEvents} · q=${fmt(timing.fdrQValue, 3)}` : `${news.data?.events.filter((event) => event.tickers.some((symbol) => symbol.toUpperCase() === normalized)).length ?? 0} sự kiện Event Radar`}</Node><Node title="Volume" status={volume.data ? volume.data.partialToday ? "intraday · partial" : `daily · ${date(volume.data.asOf)}` : volume.isLoading ? "đang tải" : "chưa tải"}>RVOL {fmt(volume.data?.today.rvolMode === "intraday" ? volume.data.today.rvolTimeAdjusted : volume.data?.today.rvol20)}× · OBV {volume.data?.trend.obvDirection ?? "?"} · CMF {fmt(volume.data?.trend.cmf20, 3)}.</Node></div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><Node title="Phe mua · Claude" status={bull?.text ? "diễn giải AI" : "chưa có claim"} tone="green">{bull?.text ? `${bull.text.slice(0, 220)}${bull.text.length > 220 ? "…" : ""}` : "Chạy tranh luận bên dưới để thêm luận điểm."}</Node><Node title="Phe bán · Gemini" status={bear?.text ? "diễn giải AI" : "chưa có claim"} tone="red">{bear?.text ? `${bear.text.slice(0, 220)}${bear.text.length > 220 ? "…" : ""}` : "Luận điểm AI chưa được gắn ref nguồn có cấu trúc."}</Node></div>
        {judge?.text && <div className="mt-2"><Node title="Trọng tài · Claude" status="diễn giải AI · không thay người quyết định" tone="amber">{judge.text.slice(0, 360)}{judge.text.length > 360 ? "…" : ""}</Node></div>}
        {(bullClaims?.claims.length || bearClaims?.claims.length || judgeClaims?.claims.length) ? <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h5 className="text-[10px] font-bold uppercase text-slate-300">Claim list · validator cấu trúc</h5><p className="text-[8px] text-slate-500">{claimsSnapshot?.ticker ?? "Danh mục"} · claims khóa theo snapshot {claimsSnapshot?.snapshotId ?? "—"}</p></div><span className="text-[9px] text-slate-500">Bull ref/số khớp {bullClaims?.summary.refsMatched ?? 0} · Bear ref/số khớp {bearClaims?.summary.refsMatched ?? 0} · cấu trúc cần đọc {((bullClaims?.summary.structuralOnly ?? 0) + (bearClaims?.summary.structuralOnly ?? 0))} · thiếu/không khớp {(bullClaims?.summary.unsupported ?? 0) + (bearClaims?.summary.unsupported ?? 0)}</span></div>
          <p className="text-[9px] text-amber-200">“REFS_MATCHED” chỉ nghĩa là mã ref và số khai báo khớp snapshot; không chứng minh ref hỗ trợ về mặt ngữ nghĩa cho câu claim.</p>
          <EvidenceGraph claims={[...(bullClaims?.claims ?? []), ...(bearClaims?.claims ?? []), ...(judgeClaims?.claims ?? [])]} refs={claimsSnapshot?.refs ?? []} />
          <div className="grid gap-2 lg:grid-cols-2">{[...(bullClaims?.claims ?? []), ...(bearClaims?.claims ?? []), ...(judgeClaims?.claims ?? [])].slice(0, 20).map((claim) => <ClaimCard key={`${claim.side}-${claim.id}`} claim={claim} onOpenRef={onOpenRef} />)}</div>
        </div> : (bullClaims?.error || bearClaims?.error) && <p className="mt-2 rounded border border-amber-400/30 p-2 text-[9px] text-amber-200">Claim chưa được cấu trúc/kiểm ref: {bullClaims?.error ?? bearClaims?.error}. Nội dung gốc vẫn được giữ trong lane AI.</p>}
        <div className="mt-3"><PriceVolumeTimeline volume={volume.data ?? null} events={news.data?.events ?? []} pa={paForTicker} /></div>
      </main>

      <aside className="space-y-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ma trận thời điểm</h4>
        <Node title="Tư cách danh mục" status={eligibility} tone={pick ? "green" : "amber"}>{pick ? `Tỷ trọng ${fmt(pick.weight * 100, 1)}% · theo snapshot Elite.` : candidate ? "Ứng viên, chưa thuộc danh mục." : "Mã không được xác nhận là thành viên danh mục."}</Node>
        <Node title="Catalyst timing" status={timing ? `${timing.tier} · ${timing.status}` : timeline.loading ? "đang tải" : "chưa có nghiên cứu phù hợp"} tone="amber">{timing ? `${timing.kind === "DIVIDEND" ? "Cổ tức" : "KQKD"} · ${timing.eventLabel} · ${timing.windowLabel} · ${timing.entryFromDate} → ${timing.entryToDate} · thắng ${fmt(timing.winRate * 100, 0)}% / ${timing.nEvents} sự kiện · kỳ vọng ròng ${fmt(timing.netExpectancy * 100, 1)}% (cận dưới ${fmt(timing.netExpectancyLcb * 100, 1)}%)${pick ? " · mã thuộc danh mục" : " · mã ngoài danh mục"}` : timeline.error ?? "Chưa có dữ liệu catalyst cho mã này; không suy ra không có sự kiện."}<br /><span className="text-slate-500">FDR q {timing ? fmt(timing.fdrQValue, 3) : "—"} · lịch mùa vụ không phải trigger giá.</span></Node>
        <Node title="Price Action" status={paForTicker ? `${paForTicker.state} · ${paForTicker.asOf ?? "—"}` : loadPriceAction ? "đang tải" : "UNKNOWN"} tone="amber">{paForTicker ? `${paForTicker.trend ?? "trend ?"} · ${paForTicker.priceBasis ?? "basis ?"} · ${paForTicker.blockers.join(" · ") || (paForTicker.confirmed ? "trigger được engine xác nhận" : "chưa có xác nhận kỹ thuật")}` : "Chưa tải OHLCV điều chỉnh; không đồng nghĩa setup không tồn tại."}</Node>
        <Node title="Volume · timeframe-aware" status={volume.data ? volume.data.partialToday ? "INTRADAY_INCOMPLETE" : "daily" : volume.isLoading ? "đang tải" : "UNKNOWN"}>{volume.data ? `RVOL ${volume.data.today.rvolMode === "intraday" ? "cùng thời điểm" : "20 phiên"}: ${fmt(volume.data.today.rvolMode === "intraday" ? volume.data.today.rvolTimeAdjusted : volume.data.today.rvol20)}× · up/down ${fmt(volume.data.trend.upDownVolumeRatio20)}× · OBV ${volume.data.trend.obvDirection} · CMF20 ${fmt(volume.data.trend.cmf20, 3)}${volume.data.trend.divergence ? ` · phân kỳ ${volume.data.trend.divergence.label}` : ""}${volume.data.foreign.pendingToday ? " · ngoại đang pending" : ""}` : "Volume chưa nạp; không quy missing thành 0."}</Node>
        <Node title="Ledger / bằng chứng" status={ledger.data ? `${ledger.data.summary.label} · ${ledger.data.version}` : loadSources ? ledger.error ? "lỗi nguồn" : "đang tải" : "chưa nạp"}>{ledger.data ? `Basis ${ledger.data.summary.basisVi ?? "chưa khai báo"} · cập nhật ${date(ledger.data.updatedAt)} · ${ledger.data.entries.length} bản ghi.` : evidence.data ? `${evidence.data.version} · ${evidence.data.tests} kiểm định tín hiệu` : "Chưa tải nguồn tab 4."}</Node>
        <Node title="Rủi ro portfolio" status={risk.data ? risk.data.available ? `${risk.data.label} · ${risk.data.date}` : "unavailable" : loadSources ? risk.error ? "lỗi nguồn" : "đang tải" : "chưa nạp"}>{risk.data ? risk.data.available ? `Vol annual ${fmt(risk.data.volatility?.annual)} · beta ${fmt(risk.data.beta)} · max drawdown ${risk.data.maxDrawdown?.value == null ? "—" : `${fmt(risk.data.maxDrawdown.value * 100, 1)}%`}` : risk.data.reasonVi ?? "Risk engine không khả dụng." : "Risk portfolio không phải stop giá đơn mã."}</Node>
        <Node title="Thanh khoản / khớp lệnh" status={pick ? "tham chiếu Elite" : "chưa đánh giá"}>{pick ? `Giá đóng cửa ${fmt(pick.close)} · stop mô hình ${fmt(pick.stop)} · mục tiêu ${fmt(pick.target)}.` : "Không suy thanh khoản hoặc khả năng khớp lệnh từ điểm số."}</Node>
        <div className="grid grid-cols-1 gap-1.5 pt-1"><button type="button" disabled={!validTicker} onClick={() => setLoadPriceAction((value) => !value)} className="rounded-md border border-cyan-400/30 px-2.5 py-2 text-left text-[10px] font-semibold text-cyan-200 disabled:opacity-40">{loadPriceAction ? "Ẩn" : "Tải"} xác nhận Price Action</button><button type="button" onClick={() => { const next = !loadSources; setLoadSources(next); setLoadPriceAction(next); }} className="rounded-md border border-white/15 px-2.5 py-2 text-left text-[10px] font-semibold text-slate-300">{loadSources ? "Ẩn" : "Tải dữ liệu đã kiểm chứng"} · quyết định, hồ sơ 360, Price Action, tab 2/4 · tin · volume · lịch</button>
          <button type="button" disabled={!snapshot || !readiness?.canDebate || sourceLoading.length > 0} onClick={() => snapshot && onRunReview(snapshot)} className="rounded-md bg-cyan-400/15 px-2.5 py-2 text-left text-[10px] font-bold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">{sourceLoading.length ? "Đang đóng băng snapshot…" : "Kiểm chứng & tranh luận trên snapshot"}</button>
        </div>
        {reviewMessage && <p className="rounded border border-white/10 bg-white/[0.02] px-2 py-1.5 text-[9px] text-slate-400" role="status">{reviewMessage}</p>}
        {readiness?.blockers.map((blocker) => <p key={blocker} className="text-[9px] text-rose-200">{blocker}</p>)}
        <p className="text-[9px] leading-relaxed text-slate-600">Các lớp là trạng thái riêng biệt. Thiếu dữ liệu = chưa rõ; không quy đổi thành tín hiệu mua.</p>
      </aside>
    </div>
    {validTicker && loadPriceAction && <div className="mt-3"><PriceActionConfirmation ticker={validTicker} onEvidence={onPriceActionEvidence} /></div>}
    {validTicker && loadSources && <div className="mt-3 space-y-2"><h4 className="text-[10px] font-bold uppercase text-slate-400">Source tray · tin, catalyst và volume</h4><OnDemandSources ticker={validTicker} news={news} volume={volume} onOpenRef={onOpenRef} /></div>}
    {validTicker && volume.data && <section className="mt-3 rounded-lg border border-white/10 bg-slate-950/40 p-2"><h4 className="mb-2 text-[10px] font-bold uppercase text-slate-400">Timeline · giá / volume / catalyst / setup</h4><PriceVolumeTimeline volume={volume.data} events={news.data?.events ?? []} pa={paForTicker} /></section>}
    {selectedRef && <section className="mt-3 rounded-lg border border-cyan-400/30 bg-[#0b1b28] p-3" role="region" aria-label="Chi tiết bằng chứng" tabIndex={-1}>
      <div className="flex items-start justify-between gap-2"><div><h4 className="text-[10px] font-bold uppercase text-cyan-200">Evidence drawer · {selectedRef.id}</h4><p className="text-[9px] text-slate-500">{selectedRef.source} · as-of {selectedRef.asOf ?? "—"} · {selectedRef.status}/{selectedRef.freshness} · version {selectedRef.sourceVersion ?? selectedRef.methodVersion ?? "—"}</p></div><button type="button" onClick={() => setSelectedRefId(null)} className="rounded border border-white/15 px-2 py-1 text-[9px]">Đóng</button></div>
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded bg-black/20 p-2 text-[10px] text-slate-200">{JSON.stringify(selectedRef.value, null, 2)}</pre>
      <p className="mt-1 text-[9px] text-amber-200">{selectedRef.limitation ?? "Giá trị nguồn/engine; không hàm ý nhân quả hoặc chắc chắn lợi nhuận."}</p>
      {selectedRef.url && <a href={selectedRef.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[9px] text-cyan-300 underline">Mở nguồn HTTP(S)</a>}
    </section>}
  </section>;
}
