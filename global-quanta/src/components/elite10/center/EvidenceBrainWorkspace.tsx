import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSWRConfig } from "swr";
import { useEliteDecision, useEliteEvidence, useEliteLedger, useEliteRisk, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import { useAdjustedDaily } from "../../../hooks/elite10/useAdjustedDaily";
import { useEliteLiquidity, type EliteLiquidity } from "../../../hooks/elite10/useEliteLiquidity";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { useEventRadar, type EventRadarEvent } from "../../../hooks/useEventRadar";
import { useVolumeAnalysis, type VolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import PriceActionConfirmation from "../profile/PriceActionConfirmation";
import type { Lane } from "../../MainTabs/ChatXucTac/CatalystChatPanel";
import { LaneView } from "../../MainTabs/ChatXucTac/CatalystChatPanel";
import { buildEvidenceSnapshot, matchingTimingRow, sourceReadiness, type PriceActionEvidence, type TimelinePriceEvidence } from "../../../lib/evidenceBrain/snapshot";
import type { ClaimParseResult, EvidenceRef, EvidenceSnapshot } from "../../../lib/evidenceBrain/types";
import { PRIMARY_VI, type PrimaryState } from "../../../lib/elite10/cockpit";
import type { TimelineRow } from "../../../lib/cotuc/buy-timeline";
import LiveEvidenceGraph, { type NodeId, type RoomNode, type Tone } from "./evidenceRoom/LiveEvidenceGraph";
import { groupEvents, LiveTimeline } from "./evidenceRoom/LiveTimeline";
import { dateVi, DetailDialog, numberVi, sessionDay, WorkspaceFrame } from "./evidenceRoom/roomView";

type Props = {
  ticker: string;
  onTickerChange: (value: string) => void;
  active: boolean;
  busy: boolean;
  debateSubject: string | null;
  bull: Lane | null;
  bear: Lane | null;
  judge: Lane | null;
  bullClaims: ClaimParseResult | null;
  bearClaims: ClaimParseResult | null;
  judgeClaims: ClaimParseResult | null;
  reviewSnapshot: EvidenceSnapshot | null;
  reviewMessage?: string | null;
  onSession?: (session: string | null) => void;
  onRunReview: (snapshot: EvidenceSnapshot) => void;
  onStop: () => void;
};

type Detail = NodeId | "seasonal" | "liquidity" | "ticker" | "sources" | { event: EventRadarEvent };
type Layer = { id: Detail; label: string; status: string; detail: string; tone: Tone };
type Data = {
  pa: PriceActionEvidence | null;
  price: TimelinePriceEvidence | null;
  volume: VolumeAnalysis | null;
  liquidity: EliteLiquidity | null;
  events: EventRadarEvent[];
  timing: TimelineRow | null;
  sector: string | null;
};
type Projection = { snap: EvidenceSnapshot; data: Data };

const stateLabel = { LOADED: "ĐÃ TẢI", LOADING: "ĐANG TẢI", ERROR: "LỖI NGUỒN", NOT_REQUESTED: "CHƯA CÓ DỮ LIỆU", UNAVAILABLE: "KHÔNG KHẢ DỤNG" } as const;
const stepHints = ["Universe của phiên", "GTGD TB20 · giá", "LS-v1 · mô hình TA", "Tầng 1 + RRG ngành", "Thanh khoản theo phễu", "Chế độ PZ của phiên", "Giữ lại + mua mới"];
const sourceFor: Partial<Record<NodeId, string>> = { decision: "decision", events: "events", priceAction: "priceAction", volume: "volume" };
const refDomain: Partial<Record<NodeId, EvidenceRef["domain"]>> = { decision: "decision", events: "catalyst", priceAction: "price_action", volume: "volume" };
const roleTitle = { bull: "Claude · phe thuận", bear: "Gemini · phản biện", judge: "Claude · trọng tài" } as const;
const via = (error: unknown) => error ? String(error) : null;
const briefId = (snap?: EvidenceSnapshot | null) => snap?.snapshotId.length && snap.snapshotId.length > 22 ? `${snap.snapshotId.slice(0, 18)}…` : snap?.snapshotId ?? "—";
const clock = (value?: string | null) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—";
const verifiedEvent = (event: EventRadarEvent) => event.entityMatch === "EXACT" && event.corroborationCount > 1
  && ["verified", "crosschecked", "cross_checked", "corroborated"].includes(event.verificationStatus.toLowerCase());
function externalLink(raw: string | null) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

function RefRows({ refs }: { refs: EvidenceRef[] }) {
  return <>{refs.map((ref) => <article key={ref.id}>
    <p><b>{ref.fieldPath}</b> · {ref.status} / {ref.freshness}</p>
    <p className="eb-source-label">{ref.source} · đến {dateVi(ref.asOf, true)}{ref.unit ? ` · ${ref.unit}` : ""} · {ref.sourceVersion ?? ref.methodVersion ?? "chưa có phiên bản"}</p>
    <pre>{JSON.stringify(ref.value, null, 2)}</pre>
    {ref.limitation && <p className="eb-claim-check">{ref.limitation}</p>}
    {externalLink(ref.url) && <a href={externalLink(ref.url)!} target="_blank" rel="noreferrer">Mở nguồn ↗</a>}
  </article>)}</>;
}

function FunnelRail({ snap, current, onOpen, onStep }: {
  snap?: EvidenceSnapshot; current: number | null; onOpen: () => void; onStep: () => void;
}) {
  const decision = snap?.sources.find((s) => s.key === "decision");
  const pa = snap?.sources.find((s) => s.key === "priceAction");
  const news = snap?.sources.find((s) => s.key === "events");
  const ledger = snap?.sources.find((s) => s.key === "ledger");
  const step = (i: number) => {
    const item = snap?.funnel.steps.find((s) => s.index === i);
    const fallback = ["Bảng tín hiệu", "Giao dịch được", "Đạt tầng 1", "Hợp lưu", "Hợp lưu giao dịch được", "Vùng mua PZ", "Danh mục"];
    return <button type="button" className={`funnel-step ${i === current ? "active" : ""}`} onClick={onStep}>
      <span className="num">{i}</span><span><span className="funnel-name">{item?.label ?? fallback[i - 1]}</span><span className="funnel-rule">{stepHints[i - 1]}</span></span>
      <span className="funnel-count">{item?.displayOnly ? "DISPLAY" : item?.count ?? "—"}</span>
    </button>;
  };
  const row = (label: string, value: string) => <div className="status-row"><span>{label}</span><strong>{value}</strong></div>;
  return <aside className="panel panel-pad" aria-label="Trạng thái phễu và dữ liệu">
    <div className="section-head"><div><div className="eyebrow">Context rail</div><h2 style={{ marginTop: 4 }}>Phễu {snap?.portfolioKind === "ELITE_FLOW" ? "Elite" : "Elite HL"}</h2></div><button type="button" className="small-link" onClick={onOpen}>Mở nguồn</button></div>
    <div className="funnel">
      {step(1)}<div className="parallel">{step(2)}{step(3)}<div className="parallel-note">Bước 2 và 3 được tính song song</div></div>
      {step(4)}{step(5)}{step(6)}{step(7)}
    </div>
    <div style={{ height: 12 }} />
    <div className="section-head"><h3>Snapshot health</h3><span className={`mini-badge ${snap?.completeness === "COMPLETE" ? "" : "warn"}`}>{snap?.completeness === "COMPLETE" ? "ĐỦ NGUỒN" : snap?.completeness ?? "CHỜ SNAPSHOT"}</span></div>
    {row("Decision / rule version", decision?.asOf ? `${dateVi(decision.asOf)} · ${decision.version ?? "—"}` : "—")}
    {row("Hồ sơ / PA", pa?.asOf ? `${dateVi(pa.asOf)} · ${stateLabel[pa.state]}` : pa ? stateLabel[pa.state] : "—")}
    {row("Tin / catalyst", news ? stateLabel[news.state] : "—")}
    {row("Ledger", ledger?.version ?? (ledger ? stateLabel[ledger.state] : "—"))}
    {row("Snapshot", snap?.funnel.frozen ? "Data Guard · đóng băng" : snap ? "Đã lập" : "Đang tải")}
  </aside>;
}

function RightRail({ layers, title, description, blocker, events, newsState, onDetail }: {
  layers: Layer[]; title: string; description: string; blocker: string;
  events: EventRadarEvent[]; newsState: string; onDetail: (id: Detail) => void;
}) {
  const headline = events[0];
  const badge = (tone: Tone) => tone === "good" ? "" : tone === "neutral" ? "neutral" : "wait";
  return <aside className="right-panel">
    <section className="panel panel-pad">
      <div className="section-head"><div><div className="eyebrow">Decision timing</div><h2 style={{ marginTop: 4 }}>Các lớp xác nhận</h2></div><span className="soft-label">theo snapshot</span></div>
      <div className="decision-card"><strong>{title}</strong><p>{description}</p></div>
      <div className="signal-list">{layers.map((layer) => <button type="button" key={layer.label} className="signal-line eb-signal-button" onClick={() => onDetail(layer.id)}>
        <span className={`signal-icon ${badge(layer.tone)}`} aria-hidden>{layer.tone === "good" ? "✓" : layer.tone === "neutral" ? "•" : "!"}</span>
        <span><span className="signal-name">{layer.label}</span><span className="signal-detail">{layer.detail}</span></span>
        <span className={`signal-state ${badge(layer.tone)}`}>{layer.status}</span>
      </button>)}</div>
      <div className="blocker"><b>Điều kiện cần kiểm tra tiếp</b><br />{blocker}</div>
    </section>
    <section className="panel panel-pad">
      <div className="section-head"><h3>Tin &amp; xúc tác liên quan</h3><button type="button" className="small-link" onClick={() => onDetail("events")}>Chi tiết nguồn</button></div>
      {headline ? <article className="catalyst-card">
        <div className="inline" style={{ justifyContent: "space-between", gap: 5 }}>
          <h4><button type="button" className="small-link" onClick={() => onDetail({ event: headline })}>{headline.title}</button></h4>
          <span className={`mini-badge ${verifiedEvent(headline) ? "" : "warn"}`}>{verifiedEvent(headline) ? "ĐÃ ĐỐI CHIẾU" : "CẦN ĐỐI CHIẾU"}</span>
        </div>
        <p>{headline.sourceLabel} · Độ tin cậy gắn mã {numberVi(headline.entityConfidence)}</p>
        <div className="source-meta"><span>Phát hiện {clock(headline.firstSeenAt)}</span><span>{Math.max(0, headline.corroborationCount - 1)} nguồn đối chứng</span></div>
      </article> : <div className="catalyst-card"><p>{newsState}</p></div>}
      <p className="footer-note">Cửa sổ mùa vụ dùng số sự kiện, kỳ đo, kỳ vọng ròng và q. Trigger giá hiển thị theo engine Price Action.</p>
    </section>
  </aside>;
}

function layerStates(snap: EvidenceSnapshot | undefined, data: Data, ticker: string | null): Layer[] {
  const { pa, volume, liquidity, events, timing } = data;
  const membership = snap?.funnel.membership;
  const step = membership?.state;
  const held = step === "PORTFOLIO_CORE" || step === "PORTFOLIO_RUNNER";
  const decisionSession = sessionDay(snap?.decisionSession);
  const stale = (value?: string | null) => Boolean(decisionSession && sessionDay(value) !== decisionSession);
  const status = (id: string, fallback = "CHƯA CÓ DỮ LIỆU") => {
    const state = snap?.sources.find((s) => s.key === id)?.state;
    return state === "LOADED" ? fallback : state ? stateLabel[state] : "CHƯA CÓ DỮ LIỆU";
  };
  const rvol = volume?.today.rvolMode === "intraday" ? volume.today.rvolTimeAdjusted : volume?.today.rvol20;
  const paReady = pa?.state === "TRIGGERED" && pa.barClosed && !stale(pa.asOf);
  const newsVerified = events.length > 0 && events.every(verifiedEvent);
  const lqTier = liquidity?.liq?.tier;
  return [
    { id: "decision", label: "Tư cách phễu", status: snap?.funnel.frozen ? "DATA GUARD" : held ? "DANH MỤC" : step && step !== "UNKNOWN" ? "THEO DÕI" : status("decision"),
      detail: step && step !== "UNKNOWN" ? PRIMARY_VI[step as PrimaryState] ?? step : ticker ? "Chưa có tư cách mã theo engine" : "Đang xem danh mục", tone: snap?.funnel.frozen ? "bad" : held ? "good" : "neutral" },
    { id: "priceAction", label: "Price Action", status: status("priceAction", pa && stale(pa.asOf) ? "LỆCH PHIÊN" : paReady ? "TRIGGERED" : pa?.state === "TRIGGERED" ? "CHỜ NẾN ĐÓNG" : pa?.state ?? "CHƯA CÓ DỮ LIỆU"),
      detail: pa?.setup ? `${pa.setup.kind} · ${pa.barClosed ? "bar ngày đóng" : "bar chưa xác nhận đóng"}` : pa?.blockers[0] ?? "Kiểm tra nến và setup theo engine",
      tone: paReady ? "good" : pa ? "warn" : "neutral" },
    { id: "volume", label: "Khối lượng", status: status("volume", volume && stale(volume.today.date) ? "KHÁC PHIÊN" : volume?.partialToday ? "TRONG PHIÊN" : volume?.trend.divergence ? "PHÂN KỲ" : volume ? "ĐÃ NẠP" : "CHƯA CÓ DỮ LIỆU"),
      detail: volume ? `RVOL ${numberVi(rvol)}× · OBV ${volume.trend.obvDirection}` : "RVOL · OBV · CMF",
      tone: volume && (volume.partialToday || volume.trend.divergence || stale(volume.today.date)) ? "warn" : "neutral" },
    { id: "events", label: "Xúc tác", status: status("events", newsVerified ? "ĐÃ ĐỐI CHIẾU" : events.length ? "RÀ SOÁT" : "KHÔNG CÓ TIN"),
      detail: events.length ? `${events.length} cụm tin · ${newsVerified ? "có đối chứng" : "kiểm tra nguồn"}` : "Event Radar theo mã",
      tone: newsVerified ? "good" : events.length ? "warn" : "neutral" },
    { id: "seasonal", label: "Cửa sổ mùa vụ", status: status("timeline", timing?.status ?? "KHÔNG CÓ"),
      detail: timing ? `${timing.tier} · n=${timing.nEvents} · q ${numberVi(timing.fdrQValue, 3)}` : "Nghiên cứu theo mã và phiên", tone: "neutral" },
    { id: "liquidity", label: "Thanh khoản", status: status("liquidity", liquidity && stale(liquidity.date) ? "LỆCH PHIÊN" : lqTier ?? "CHƯA CÓ DỮ LIỆU"),
      detail: liquidity?.liq ? `GTGD trung vị ${numberVi(liquidity.liq.med20)} tỷ · ${dateVi(liquidity.date)}` : "Hồ sơ 360° · LQ-v1",
      tone: liquidity && stale(liquidity.date) || lqTier === "L3" || lqTier === "L4" ? "warn" : lqTier === "L1" || lqTier === "L2" ? "good" : "neutral" },
  ];
}

export default function EvidenceBrainWorkspace(props: Props) {
  const { active, busy, onRunReview, onSession } = props;
  const { mutate } = useSWRConfig();
  const ticker = /^[A-Z0-9]{3,10}$/.test(props.ticker) ? props.ticker : null;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState("");
  const [paEvidence, setPaEvidence] = useState<PriceActionEvidence | null>(null);
  const [latest, setLatest] = useState<Projection | null>(null);
  const [pinned, setPinned] = useState<Projection | null>(null);
  const [requested, setRequested] = useState(false);
  const [buildError, setBuildError] = useState(false);
  const [version, retryBuild] = useState(0);
  const [building, setBuilding] = useState(false);
  const [seeLatest, setSeeLatest] = useState(false);
  const enabled = active && requested;
  const decision = useEliteDecision(enabled);
  const selected = useEliteTicker(ticker, enabled);
  const evidence = useEliteEvidence(enabled);
  const ledger = useEliteLedger(null, enabled);
  const risk = useEliteRisk(enabled);
  const timing = useGatewayBuyTimeline(enabled);
  const news = useEventRadar({ ticker: ticker ?? undefined, limit: 12, enabled: enabled && Boolean(ticker), keepPreviousData: false });
  const volumes = useVolumeAnalysis(ticker, enabled);
  const liquidity = useEliteLiquidity(enabled ? ticker : null);
  const chart = useAdjustedDaily(enabled ? ticker : null);
  const onPriceAction = useCallback((value: PriceActionEvidence) => {
    setPaEvidence((previous) => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
  }, []);
  const pa = paEvidence?.ticker === ticker ? paEvidence : null;
  const volume = volumes.data?.symbol.toUpperCase() === ticker ? volumes.data : null;
  const lq = liquidity.data?.ticker.toUpperCase() === ticker ? liquidity.data : null;
  const panel = selected.panel?.ticker.toUpperCase() === ticker ? selected.panel : null;
  const tickerDecision = selected.decision?.ticker.toUpperCase() === ticker ? selected.decision : null;
  const decisionDay = decision.data?.date;
  const known = ticker ? Boolean(pa?.tickerVerified || panel || tickerDecision) : null;
  const price = useMemo<TimelinePriceEvidence | null>(() => {
    if (!ticker || !chart.priceBasis || !chart.bars.length) return null;
    return { priceBasis: chart.priceBasis, bars: chart.bars.slice(-30).flatMap((bar) =>
      typeof bar.close === "number" && Number.isFinite(bar.close) && bar.close > 0 ? [{ date: bar.date, close: bar.close }] : []) };
  }, [ticker, chart.priceBasis, chart.bars.length, chart.bars.length ? chart.bars : null]);
  const events = useMemo(() => news.data?.events.filter((event) => event.tickers.some((item) => item.toUpperCase() === ticker)) ?? null, [news.data, ticker]);
  const timingRow = useMemo(() => matchingTimingRow(timing.data, ticker), [ticker, timing.data]);
  const waiting = [
    ["decision", decision.isLoading], ["profile", ticker && selected.isLoading],
    ["evidence", evidence.isLoading], ["ledger", ledger.isLoading], ["risk", risk.isLoading], ["timeline", timing.loading],
    ["events", ticker && news.enabled && news.isLoading], ["volume", ticker && volumes.isLoading], ["liquidity", ticker && liquidity.isLoading],
    ["priceAction", enabled && ticker && (!pa || pa.loading || pa.state === "LOADING")],
  ].filter(([, loading]) => loading).map(([key]) => String(key)).join("|");
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    setBuilding(true);
    setBuildError(false);
    void buildEvidenceSnapshot({
      ticker, tickerVerified: known, now: new Date().toISOString(),
      decision: decision.data ?? null, decisionError: via(decision.error), selectedDecision: tickerDecision, panel, profileError: via(selected.error),
      evidence: evidence.data ?? null, evidenceError: via(evidence.error), ledger: ledger.data ?? null, ledgerError: via(ledger.error),
      risk: risk.data ?? null, riskError: via(risk.error), timeline: timing.data, timelineError: timing.error,
      events, eventAsOf: news.data?.generatedAt, eventError: via(news.error), priceAction: pa, priceActionError: pa?.error,
      volume, volumeError: via(volumes.error), chart: price, liquidity: lq, liquidityError: via(liquidity.error),
      sourceLoading: waiting ? waiting.split("|") : [], sourceUnavailable: ticker && !news.enabled ? ["events"] : [],
    }).then((snap) => {
      if (!current) return;
      setLatest({ snap, data: { pa, price, volume, liquidity: lq, events: groupEvents(events ?? []), timing: timingRow, sector: panel?.sector ?? null } });
    }).catch(() => {
      if (current) setBuildError(true);
    }).finally(() => { if (current) setBuilding(false); });
    return () => { current = false; };
  }, [enabled, ticker, known, decision.data, decision.error, tickerDecision, panel, selected.error, evidence.data, evidence.error,
    ledger.data, ledger.error, risk.data, risk.error, timing.data, timing.error, timingRow, events, news.enabled, news.data?.generatedAt,
    news.error, pa, volume, volumes.error, price, lq, liquidity.error, waiting, version]);

  useEffect(() => { setDetail(null); setSeeLatest(false); }, [ticker, active]);
  const current = latest?.snap.ticker === ticker ? latest : null;
  const hasPinned = pinned?.snap.ticker === ticker && pinned.snap.snapshotId === props.reviewSnapshot?.snapshotId;
  const visible = hasPinned && !seeLatest ? pinned : current;
  const snap = visible?.snap;
  useEffect(() => { if (active) onSession?.(snap?.decisionSession ?? null); }, [active, onSession, snap?.decisionSession]);
  const data: Data = visible?.data ?? { pa: null, price: null, liquidity: null, volume: null, events: [], timing: null, sector: null };
  const showAI = props.debateSubject === ticker && (props.reviewSnapshot ? snap?.snapshotId === props.reviewSnapshot.snapshotId : Boolean(props.bull || props.bear));
  const roles = showAI ? { bull: props.bull, bear: props.bear, judge: props.judge } : { bull: null, bear: null, judge: null };
  const bundles = showAI && props.reviewSnapshot ? { bull: props.bullClaims, bear: props.bearClaims, judge: props.judgeClaims } : { bull: null, bear: null, judge: null };
  const claims = [...(bundles.bull?.claims ?? []), ...(bundles.bear?.claims ?? []), ...(bundles.judge?.claims ?? [])];
  const readiness = current ? sourceReadiness(current.snap) : null;
  const canRun = Boolean(current && readiness?.canDebate && !building && !buildError && !waiting);
  const sources = snap?.sources ?? [];
  const sessionsBound = ["decision", "profile", "priceAction", "volume", "liquidity"];
  const fresh = sources.filter((source) => source.state === "LOADED" && source.asOf && source.warnings.length === 0
    && (!sessionsBound.includes(source.key) || sessionDay(source.asOf) === sessionDay(snap?.decisionSession))
    && (source.key !== "events" || data.events.every(verifiedEvent))).length;
  const layers = layerStates(snap, data, ticker);
  const concerns = layers.filter((layer) => layer.tone === "bad" || layer.tone === "warn");
  const locked = Boolean(hasPinned && !seeLatest);
  const state = snap?.funnel.membership.state;
  const held = state === "PORTFOLIO_CORE" || state === "PORTFOLIO_RUNNER";
  const graphNode = (id: NodeId, index: number, label: string, refPath: string): RoomNode => ({
    id, label, badge: layers[index].status, tone: layers[index].tone, title: layers[index].detail,
    meta: sources.find((source) => source.key === sourceFor[id])?.asOf ? `As-of ${dateVi(sources.find((source) => source.key === sourceFor[id])?.asOf, true)}` : undefined,
    ref: snap?.refs.find((ref) => ref.domain === refDomain[id] && ref.fieldPath.includes(refPath))?.fieldPath,
  });
  const aiNode = (id: keyof typeof roleTitle): RoomNode => {
    const lane = roles[id], bundle = bundles[id];
    return { id, label: roleTitle[id], tone: lane?.error || bundle?.error ? "warn" : lane?.done && bundle?.summary.refsMatched ? "good" : "neutral",
      badge: lane?.error ? "LỖI / DỪNG" : lane && !lane.done ? "ĐANG CHẠY" : bundle?.ok ? `${bundle.summary.refsMatched} REF KHỚP` : lane ? "CẦN RÀ SOÁT" : "CHƯA CHẠY",
      title: bundle?.claims[0]?.text ?? (lane?.text && !lane.done ? "Đang nhận nội dung" : lane?.text ? "Mở nội dung diễn giải" : "Chờ kiểm chứng"),
      meta: "Diễn giải AI" };
  };
  const nodes: RoomNode[] = [
    { id: "snapshot", label: "Snapshot", badge: locked ? "LOCKED" : snap?.completeness ?? "ĐANG TẢI", tone: locked ? "good" : "neutral",
      title: `${ticker ?? "Danh mục"} · ${dateVi(snap?.decisionSession ?? decisionDay, true)}`, meta: `${briefId(snap)} · ${sources.length} nguồn` },
    aiNode("bull"), aiNode("bear"), graphNode("decision", 0, "Funnel · engine", "funnel"), graphNode("events", 3, "Event Radar", "event"),
    graphNode("priceAction", 1, "Price Action", "setup"), graphNode("volume", 2, "Volume", "rvol"), aiNode("judge"),
  ];
  const quote = data.volume?.today;
  const bars = data.price?.bars ?? [];
  const lastBar = bars[bars.length - 1];
  const priceValue = quote?.price ?? lastBar?.close;
  const change = quote?.changePct;
  const tickerBar = <section className="ticker-bar" aria-label="Snapshot đang phân tích">
    <div className="ticker-head">
      <button type="button" className="eb-ticker-select" aria-label="Chọn mã cổ phiếu" onClick={() => { setDraft(props.ticker); setDetail("ticker"); }}>
        <div className="ticker-symbol">{ticker ?? "Danh mục"} {snap?.tickerVerified === true && <span className="mini-badge">MÃ ĐÃ XÁC THỰC</span>}</div>
        <div className="ticker-name">{[data.pa?.instrumentName, data.sector, data.pa?.venue].filter(Boolean).join(" · ") || "Chọn mã để đối chiếu nguồn"}</div>
      </button>
      {ticker && <div className="ticker-price"><strong>{numberVi(priceValue)}</strong><small className={typeof change === "number" ? change < 0 ? "negative" : "" : "neutral"}>
        {typeof change === "number" ? `${change > 0 ? "+" : ""}${numberVi(change)}% · ` : ""}{dateVi(quote?.date ?? lastBar?.date, true)}
      </small></div>}
    </div>
    <div className="snapshot-meta">
      <button className={`meta-chip ${locked ? "good" : ""}`} title={snap?.snapshotId} type="button" onClick={() => setDetail("snapshot")}>● Snapshot {briefId(snap)}</button>
      <span className="meta-chip">Decision {dateVi(snap?.decisionSession ?? decisionDay)}</span>
      <span className="meta-chip good">{fresh} nguồn hiện tại</span>
      <button type="button" className="meta-chip warn" onClick={() => setDetail("sources")}>{sources.length - fresh} nguồn cần lưu ý</button>
      <button type="button" className="primary-btn" disabled={!busy && requested && !canRun} onClick={() => {
        if (busy) props.onStop();
        else if (!requested) setRequested(true);
        else if (canRun && current) { setPinned(current); setSeeLatest(false); onRunReview(current.snap); }
      }}>{busy ? "■ Dừng" : !requested ? "✦ Nạp dữ liệu kiểm chứng" : waiting || building ? "Đang kiểm tra nguồn…" : "✦ Kiểm chứng & tranh luận"}</button>
    </div>
  </section>;
  const submitTicker = (e: FormEvent) => {
    e.preventDefault();
    if (draft && !/^[A-Z0-9]{3,10}$/.test(draft)) return;
    setDetail(null);
    props.onTickerChange(draft);
    setRequested(true);
  };
  const retry = () => {
    if (!requested) { setRequested(true); return; }
    retryBuild((n) => n + 1);
    const resourceKeys = ["elite-decision", "elite-evidence", "elite-ledger", "elite-risk", "elite-buy-timing", "market-universe-price-action"];
    const tickerKeys = ["volume-analysis", "event-radar", "elite-liquidity", "elite-decision-ticker", "elite-panel-ticker"];
    void mutate((key) => typeof key === "string" && (resourceKeys.includes(key) || key.includes("/api/market/ta-series")) ||
      Array.isArray(key) && tickerKeys.includes(String(key[0])) && key[1] === ticker,
    undefined, { revalidate: true, populateCache: false });
  };
  function renderDetail(id: Detail): { title: string; content: ReactNode } {
    if (id === "ticker") return { title: "Chọn mã phân tích", content: <form onSubmit={submitTicker}>
      <label htmlFor="elite-debate-subject">Mã cổ phiếu</label>
      <input id="elite-debate-subject" value={draft} onChange={(e) => setDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} placeholder="Ví dụ FPT" maxLength={10} />
      <button type="submit" className="primary-btn" disabled={Boolean(draft && draft.length < 3)}>Xem bằng chứng</button>
      <button type="button" className="small-link" onClick={() => { props.onTickerChange(""); setRequested(true); setDetail(null); }}>Xem danh mục</button>
    </form> };
    if (typeof id === "object") {
      const event = id.event;
      return { title: event.title, content: <>
        <p>{event.sourceLabel} · {event.verificationStatus} · Mã {event.entityMatch} ({numberVi(event.entityConfidence)})</p>
        <p>Công bố {dateVi(event.publishedAt, true)} {clock(event.publishedAt)} · Phát hiện {dateVi(event.firstSeenAt, true)} {clock(event.firstSeenAt)}</p>
        <p>{event.summary}</p><p>{Math.max(0, event.corroborationCount - 1)} nguồn đối chứng · {event.corroboratingSources.join(", ") || "chưa có"}</p>
        {externalLink(event.url) && <a href={externalLink(event.url)!} target="_blank" rel="noreferrer">Mở tài liệu nguồn ↗</a>}
        <RefRows refs={snap?.refs.filter((ref) => ref.domain === "catalyst" && ref.fieldPath.includes(event.eventId)) ?? []} />
      </> };
    }
    if (id === "snapshot" || id === "sources") return { title: id === "snapshot" ? "Snapshot bằng chứng" : "Nguồn của snapshot", content: <>
      <p>{snap?.snapshotId ?? "Đang lập snapshot"}</p><p>Phiên {dateVi(snap?.decisionSession, true)} · {snap?.completeness ?? "chưa có trạng thái"}</p>
      <button type="button" className="small-link" onClick={retry}>{requested ? "Thử tải lại nguồn" : "Nạp dữ liệu kiểm chứng"}</button>
      {hasPinned && <button type="button" className="small-link" onClick={() => setSeeLatest((v) => !v)}>{locked ? "Xem snapshot mới nhất" : "Xem snapshot đã kiểm chứng"}</button>}
      {sources.map((s) => <article key={s.key}><p><b>{s.label}</b> · {stateLabel[s.state]} · {dateVi(s.asOf, true)}</p><p>{s.endpoint} · {s.version ?? "—"}</p>
        {(s.error || s.warnings.length > 0) && <p className="eb-claim-check">{[s.error, ...s.warnings].filter(Boolean).join(" · ")}</p>}</article>)}
      <RefRows refs={snap?.refs.filter((ref) => ref.domain === "ledger" || ref.domain === "risk" || ref.domain === "profile") ?? []} />
    </> };
    if (id === "bull" || id === "bear" || id === "judge") return { title: roleTitle[id], content: <>
      <p>Snapshot {briefId(snap)} · {ticker ?? "Danh mục"}</p>
      {roles[id] ? <div className="tw-scope"><LaneView t={roles[id]!} showHeader headerLabel={roleTitle[id]} /></div> : <p>Chưa có luận điểm cho snapshot đang xem.</p>}
      <p className="eb-claim-check">Ref và số khớp là kiểm tra cấu trúc dữ liệu. Cần đọc luận điểm để đánh giá cách diễn giải.</p>
      {bundles[id]?.error && <p>{bundles[id]!.error}</p>}
      {bundles[id]?.claims.map((claim) => <article key={claim.id}><p><b>{claim.validation}</b> · {claim.classification}</p><p>{claim.text}</p>
        {claim.validationNotes.map((note, index) => <p key={index}>{note}</p>)}
        <RefRows refs={snap?.refs.filter((ref) => [...claim.refs, ...claim.supports, ...claim.invalidates].includes(ref.id)) ?? []} /></article>)}
    </> };
    if (id === "events") return { title: "Tin & xúc tác liên quan", content: <>
      <p>{layers[3].status} · {ticker ?? "Chọn mã để tải tin"}</p>
      {data.events.map((event) => <article key={event.eventId}><button type="button" className="small-link" onClick={() => setDetail({ event })}>{event.title}</button><p>{event.sourceLabel} · {event.verificationStatus} · {dateVi(event.firstSeenAt, true)} {clock(event.firstSeenAt)}</p></article>)}
    </> };
    const refs = snap?.refs.filter((ref) => id === "liquidity" ? ref.fieldPath === "liquidity" : id === "seasonal" ? ref.fieldPath.startsWith("timing.") : ref.domain === refDomain[id]) ?? [];
    const layer = layers.find((item) => item.id === id);
    return { title: layer?.label ?? "Chi tiết nguồn", content: <>
      <p>{layer?.status} · {layer?.detail}</p>
      {id === "seasonal" && data.timing && <p>{data.timing.windowLabel} · {data.timing.entryFromDate} → {data.timing.entryToDate} · kỳ vọng ròng {numberVi(data.timing.netExpectancy * 100)}% · FDR q {numberVi(data.timing.fdrQValue, 3)}</p>}
      {id === "priceAction" && data.pa?.setup && <p>Phiên {dateVi(data.pa.setup.stateDate, true)} · Trigger {numberVi(data.pa.setup.entryReference)} · Vô hiệu {numberVi(data.pa.setup.invalidationLevel)} · {data.pa.priceBasis ?? "chưa rõ cơ sở giá"}</p>}
      <RefRows refs={refs} />
    </> };
  }
  const dialog = detail === null ? null : renderDetail(detail);
  const message = showAI ? props.reviewMessage : null;
  const next = readiness?.blockers[0] ?? (concerns.length ? concerns.map((item) => item.label).join(" · ") : snap?.missing[0] ?? "Mở từng lớp để xem phạm vi và điều kiện xác nhận.");
  return <section data-testid="evidence-brain-workspace">
    {enabled && ticker && <PriceActionConfirmation key={ticker} ticker={ticker} onEvidence={onPriceAction} evidenceOnly />}
    <WorkspaceFrame ticker={tickerBar} left={<FunnelRail snap={snap} current={held ? 7 : null} onOpen={() => setDetail("sources")} onStep={() => setDetail("decision")} />}
      graph={<LiveEvidenceGraph key={`graph:${ticker ?? "portfolio"}`} nodes={nodes} refs={snap?.refs ?? []} claims={claims} onSelect={setDetail} />}
      timeline={<LiveTimeline key={`timeline:${ticker ?? "portfolio"}`} price={data.price} volume={data.volume} events={data.events} pa={data.pa} onEvent={(event) => setDetail({ event })} onPriceAction={() => setDetail("priceAction")} />}
      right={<RightRail layers={layers}
        title={snap?.funnel.frozen ? "DỮ LIỆU ĐANG ĐÓNG BĂNG" : snap?.completeness === "STALE" ? "NGUỒN LỆCH PHIÊN" : concerns.length ? "CHƯA ĐỦ ĐỒNG THUẬN" : "ĐỐI CHIẾU CÁC LỚP"}
        description={concerns.length ? concerns.map((layer) => `${layer.label}: ${layer.status.toLowerCase()}`).join(" · ") : "Các trạng thái dưới đây lấy theo nguồn của snapshot đang xem."}
        blocker={next} events={data.events} newsState={layers[3].status} onDetail={setDetail} />}
      footer={<p className="footer-note">Dữ liệu theo phiên và nguồn ghi trong snapshot. Luận điểm AI hỗ trợ kiểm chứng trước giao dịch.</p>} />
    {(message || buildError || readiness?.blockers.length) ? <div className="eb-status-line" role="status">
      {buildError ? "Không lập được snapshot. " : message || readiness?.blockers[0]}
      <button type="button" className="small-link" onClick={() => setDetail("sources")}>Xem tình trạng nguồn</button>
    </div> : null}
    {active && dialog && <DetailDialog title={dialog.title} onClose={() => setDetail(null)}>{dialog.content}</DetailDialog>}
  </section>;
}
