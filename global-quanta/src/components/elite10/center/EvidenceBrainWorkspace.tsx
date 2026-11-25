import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSWRConfig } from "swr";
import { useEliteDecision, useEliteEvidence, useEliteLedger, useEliteRisk, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import { useAdjustedDaily } from "../../../hooks/elite10/useAdjustedDaily";
import { useEliteLiquidity } from "../../../hooks/elite10/useEliteLiquidity";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { useEventRadar, type EventRadarEvent } from "../../../hooks/useEventRadar";
import { useVolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import PriceActionConfirmation from "../profile/PriceActionConfirmation";
import type { Lane } from "../../MainTabs/ChatXucTac/CatalystChatPanel";
import { LaneView } from "../../MainTabs/ChatXucTac/CatalystChatPanel";
import { buildEvidenceSnapshot, matchingTimingRow, sourceReadiness, type PriceActionEvidence } from "../../../lib/evidenceBrain/snapshot";
import { closedResearchChart } from "../../../lib/evidenceBrain/priceObservation";
import type { ClaimParseResult, EvidenceRef, EvidenceSnapshot } from "../../../lib/evidenceBrain/types";
import { PRIMARY_VI, type PrimaryState } from "../../../lib/elite10/cockpit";
import { evaluateConfirmation, eventKey, formatObservation, revisionKnownAt, sourceManifest, visibleRevision, withoutCatalyst,
  type ResearchData as Data, type ResearchProjection as Projection, type ResearchRun } from "../../../lib/evidenceBrain/research";
import type { ObsidianDesk } from "./obsidian/useObsidianDesk";
import LiveEvidenceGraph, { type NodeId, type RoomNode, type Tone } from "./evidenceRoom/LiveEvidenceGraph";
import { groupEvents, LiveTimeline } from "./evidenceRoom/LiveTimeline";
import { confirmationLabel, ResearchDialog, type ResearchView } from "./evidenceRoom/ResearchDesk";
import type { ScenarioEntry } from "./evidenceRoom/ScenarioCanvas";
import { useResearchAccount } from "./evidenceRoom/researchAccount";
import { lockResearchSnapshot, usePublishedReview, useResearchSession } from "../../../lib/evidenceBrain/researchGateway";
import { dateVi, DetailDialog, numberVi, sessionDay, WorkspaceFrame } from "./evidenceRoom/roomView";

const ScenarioCanvas = lazy(() => import("./evidenceRoom/ScenarioCanvas"));

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
  desk: ObsidianDesk;
  actions?: ReactNode;
  onRunReview: (snapshot: EvidenceSnapshot) => void;
  onStop: () => void;
};

type Detail = NodeId | "seasonal" | "liquidity" | "risk" | "ticker" | "sources" | { event: EventRadarEvent };
type Layer = { id: Detail; label: string; status: string; detail: string; tone: Tone };

const stateLabel = { LOADED: "ĐÃ TẢI", LOADING: "ĐANG TẢI", ERROR: "LỖI NGUỒN", NOT_REQUESTED: "CHƯA CÓ DỮ LIỆU", UNAVAILABLE: "KHÔNG KHẢ DỤNG" } as const;
const stepHints = ["Universe của phiên", "GTGD TB20 · giá", "LS-v1 · mô hình TA", "Tầng 1 + RRG ngành", "Thanh khoản theo phễu", "Chế độ PZ của phiên", "Giữ lại + mua mới"];
const sourceFor: Partial<Record<NodeId, string>> = { decision: "decision", events: "events", priceAction: "priceAction", volume: "volume" };
const refDomain: Partial<Record<NodeId, EvidenceRef["domain"]>> = { decision: "decision", events: "catalyst", priceAction: "price_action", volume: "volume" };
const roleTitle = { bull: "Claude · phe thuận", bear: "Gemini · phản biện", judge: "Claude · trọng tài" } as const;
const via = (error: unknown) => error ? String(error) : null;
const briefId = (snap?: EvidenceSnapshot | null) => snap?.snapshotId.length && snap.snapshotId.length > 22 ? `${snap.snapshotId.slice(0, 18)}…` : snap?.snapshotId ?? "—";
const clock = (value?: string | null) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—";
const officialPublication = (event: EventRadarEvent) => event.sourceAuthority === "configured_official_feed"
  && ["provider_tagged", "exchange_tag", "EXACT"].includes(event.entityMatch)
  && event.verificationStatus === "official_source_not_crosschecked";
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
          <span className={`mini-badge ${officialPublication(headline) ? "" : "warn"}`}>{officialPublication(headline) ? "CÔNG BỐ GỐC" : "CẦN ĐỐI CHIẾU"}</span>
        </div>
        <p>{headline.sourceLabel} · Độ tin cậy gắn mã {numberVi(headline.entityConfidence)}</p>
        <div className="source-meta"><span>Biết r{headline.revision} {clock(revisionKnownAt(headline) ?? undefined)}</span><span>{headline.documentCount} tài liệu</span></div>
      </article> : <div className="catalyst-card"><p>{newsState}</p></div>}
      <p className="footer-note">Cửa sổ mùa vụ dùng số sự kiện, kỳ đo, kỳ vọng ròng và q. Trigger giá hiển thị theo engine Price Action.</p>
    </section>
  </aside>;
}

function layerStates(snap: EvidenceSnapshot | undefined, data: Data, ticker: string | null): Layer[] {
  const { pa, volume, liquidity, events, timing, risk } = data;
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
  const primaryPublished = events.length > 0 && events.every(officialPublication);
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
    { id: "events", label: "Xúc tác", status: status("events", primaryPublished ? "CÓ CÔNG BỐ GỐC" : events.length ? "RÀ SOÁT" : "KHÔNG CÓ TIN"),
      detail: events.length ? `${events.length} cụm tin · ${primaryPublished ? "tác động cần kiểm tra" : "kiểm tra nguồn"}` : "Event Radar theo mã",
      tone: events.length ? "warn" : "neutral" },
    { id: "seasonal", label: "Cửa sổ mùa vụ", status: status("timeline", timing?.status ?? "KHÔNG CÓ"),
      detail: timing ? `${timing.tier} · n=${timing.nEvents} · q ${numberVi(timing.fdrQValue, 3)}` : "Nghiên cứu theo mã và phiên", tone: "neutral" },
    { id: "liquidity", label: "Thanh khoản", status: status("liquidity", liquidity && stale(liquidity.date) ? "LỆCH PHIÊN" : lqTier ?? "CHƯA CÓ DỮ LIỆU"),
      detail: liquidity?.liq ? `GTGD trung vị ${numberVi(liquidity.liq.med20)} tỷ · ${dateVi(liquidity.date)}` : "Hồ sơ 360° · LQ-v1",
      tone: liquidity && stale(liquidity.date) || lqTier === "L3" || lqTier === "L4" ? "warn" : lqTier === "L1" || lqTier === "L2" ? "good" : "neutral" },
    { id: "risk", label: "Rủi ro danh mục", status: risk?.available ? stale(risk.date) ? "LỆCH PHIÊN" : "BỐI CẢNH" : status("risk", "CHƯA CÓ SỐ ĐO"),
      detail: risk?.available ? `${dateVi(risk.date)} · ${risk.label}` : risk?.reasonVi ?? "Nguồn rủi ro của danh mục", tone: risk?.available && stale(risk.date) ? "warn" : "neutral" },
  ];
}

export default function EvidenceBrainWorkspace(props: Props) {
  const { active, busy, onRunReview } = props;
  const { mutate } = useSWRConfig();
  const ticker = /^[A-Z0-9]{3,10}$/.test(props.ticker) ? props.ticker : null;
  const account = useResearchAccount();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [researchView, setResearchView] = useState<ResearchView | null>(null);
  const [canvasEntry, setCanvasEntry] = useState<(ScenarioEntry & { account: string; ticker: string }) | null>(null);
  const [saved, setSaved] = useState<ResearchRun | null>(null);
  const [scenario, setScenario] = useState<{ base: Projection; cluster: string; account: string } | null>(null);
  const [showParent, setShowParent] = useState(false);
  const [draft, setDraft] = useState("");
  const [paEvidence, setPaEvidence] = useState<PriceActionEvidence | null>(null);
  const [latest, setLatest] = useState<Projection | null>(null);
  const [pinned, setPinned] = useState<Projection | null>(null);
  const [requested, setRequested] = useState(active);
  const [buildError, setBuildError] = useState(false);
  const [version, retryBuild] = useState(0);
  const [seeLatest, setSeeLatest] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [wantVolumeDetail, setWantVolumeDetail] = useState(false);
  useEffect(() => { setCanvasEntry(null); }, [ticker, account, active]);
  const lockRequest = useRef<AbortController | null>(null);
  const publication = useRef<string | null>(null);
  const enabled = active && requested;
  useEffect(() => { if (active) setRequested(true); }, [active]);
  const decision = useEliteDecision(enabled);
  const selected = useEliteTicker(ticker, enabled);
  const evidence = useEliteEvidence(enabled);
  const ledger = useEliteLedger(null, enabled);
  const risk = useEliteRisk(enabled);
  const timing = useGatewayBuyTimeline(enabled);
  const news = useEventRadar({ ticker: ticker ?? undefined, limit: 12, enabled: enabled && Boolean(ticker), keepPreviousData: false });
  const volumes = useVolumeAnalysis(ticker, enabled, "research");
  const session = useResearchSession(enabled);
  const published = usePublishedReview(enabled ? account : null, ticker, session.data);
  const liquidity = useEliteLiquidity(enabled ? ticker : null);
  const chart = useAdjustedDaily(enabled ? ticker : null, enabled);
  const onPriceAction = useCallback((value: PriceActionEvidence) => {
    setPaEvidence((previous) => JSON.stringify(previous) === JSON.stringify(value) ? previous : value);
  }, []);
  const pa = paEvidence?.ticker === ticker ? paEvidence : null;
  const volume = volumes.data?.symbol.toUpperCase() === ticker ? volumes.data : null;
  const expectedClosedSession = session.data?.expectedClosedSession ?? volume?.coverage?.expectedClosedSession ?? null;
  const lq = liquidity.data?.ticker.toUpperCase() === ticker ? liquidity.data : null;
  const panel = selected.panel?.ticker.toUpperCase() === ticker ? selected.panel : null;
  const tickerDecision = selected.decision?.ticker.toUpperCase() === ticker ? selected.decision : null;
  const decisionDay = decision.data?.date;
  const known = ticker ? Boolean(pa?.tickerVerified || panel || tickerDecision) : null;
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
    setBuildError(false);
    const observedAt = new Date().toISOString();
    const price = ticker ? closedResearchChart(chart.bars, chart.priceBasis, chart.warnings, observedAt) : null;
    const asObserved = events === null ? null : groupEvents(events.filter((event) => visibleRevision(event, observedAt)));
    void buildEvidenceSnapshot({
      ticker, tickerVerified: known, now: observedAt,
      decision: decision.data ?? null, decisionError: via(decision.error), selectedDecision: tickerDecision, panel, profileError: via(selected.error),
      evidence: evidence.data ?? null, evidenceError: via(evidence.error), ledger: ledger.data ?? null, ledgerError: via(ledger.error),
      risk: risk.data ?? null, riskError: via(risk.error), timeline: timing.data, timelineError: timing.error,
      events: asObserved, eventAsOf: news.data?.generatedAt, eventError: via(news.error), priceAction: pa, priceActionError: pa?.error,
      volume, volumeError: via(volumes.error), chart: price, liquidity: lq, liquidityError: via(liquidity.error),
      sourceLoading: waiting ? waiting.split("|") : [], sourceUnavailable: ticker && !news.enabled ? ["events"] : [],
    }).then((snap) => {
      if (!current) return;
      setLatest({ snap, data: { pa, price, volume, liquidity: lq, events: asObserved ?? [], timing: timingRow, sector: panel?.sector ?? null,
        risk: risk.data ?? null, expectedClosedSession } });
    }).catch(() => {
      if (current) setBuildError(true);
    });
    return () => { current = false; };
  }, [enabled, ticker, known, decision.data, decision.error, tickerDecision, panel, selected.error, evidence.data, evidence.error,
    ledger.data, ledger.error, risk.data, risk.error, timing.data, timing.error, timingRow, events, news.enabled, news.data?.generatedAt,
    news.error, pa, volume, volumes.error, chart.bars, chart.priceBasis, chart.warnings, lq, liquidity.error, waiting, version, expectedClosedSession]);

  const reloadSources = useCallback(() => {
    const resourceKeys = ["elite-decision", "elite-evidence", "elite-ledger", "elite-risk", "elite-buy-timing", "market-universe-price-action"];
    const tickerKeys = ["volume-analysis", "event-radar", "elite-liquidity", "elite-decision-ticker", "elite-panel-ticker"];
    void mutate((key) => typeof key === "string" && (resourceKeys.includes(key) || key.includes("/api/market/ta-series")) ||
      Array.isArray(key) && tickerKeys.includes(String(key[0])) && key[1] === ticker, undefined, { revalidate: true, populateCache: false });
  }, [mutate, ticker]);

  useEffect(() => {
    const next = session.data?.publication;
    if (!enabled || !next) return;
    if (publication.current && publication.current !== next) reloadSources();
    publication.current = next;
  }, [enabled, session.data?.publication, reloadSources]);

  useEffect(() => { setDetail(null); setSeeLatest(false); }, [ticker, active]);
  useEffect(() => { setResearchView(null); setSaved(null); setScenario(null); setShowParent(false); }, [ticker, account]);
  useEffect(() => {
    setWantVolumeDetail(false); setCaptureError(null); setCapturing(false);
    return () => { lockRequest.current?.abort(); lockRequest.current = null; };
  }, [ticker, account, active]);
  const current = latest?.snap.ticker === ticker ? latest : null;
  const hasPinned = pinned?.snap.ticker === ticker && pinned.snap.snapshotId === props.reviewSnapshot?.snapshotId;
  const localSaved = saved?.account === account && saved.projection.snap.ticker === ticker ? saved : null;
  const localScenario = scenario?.account === account && scenario.base.snap.ticker === ticker ? scenario : null;
  const publishedProjection = published.record?.projection ?? published.fallback;
  const original = localScenario?.base ?? localSaved?.projection ?? (hasPinned && !seeLatest ? pinned : !seeLatest && publishedProjection ? publishedProjection : current);
  const excluded = localScenario?.cluster ?? (showParent ? null : localSaved?.omittedCluster ?? null);
  const visible = original && excluded ? withoutCatalyst(original, excluded) : original;
  const replay = localScenario || showParent ? null : localSaved;
  const snap = visible?.snap;
  const data: Data = visible?.data ?? { pa: null, price: null, liquidity: null, volume: null, events: [], timing: null, sector: null };
  const fullVolume = useVolumeAnalysis(ticker, enabled && wantVolumeDetail && detail === "volume" && !(hasPinned && !seeLatest) && !localSaved && !localScenario);
  const showAI = !excluded && !localSaved && props.debateSubject === ticker && (props.reviewSnapshot ? snap?.snapshotId === props.reviewSnapshot.snapshotId : Boolean(props.bull || props.bear));
  const roles = showAI ? { bull: props.bull, bear: props.bear, judge: props.judge } : { bull: null, bear: null, judge: null };
  const cached = !excluded && !localSaved && !localScenario && published.record?.projection.snap.snapshotId === snap?.snapshotId ? published.record : null;
  const bundles = showAI && props.reviewSnapshot ? { bull: props.bullClaims, bear: props.bearClaims, judge: props.judgeClaims } :
    { bull: cached?.roles.BULL, bear: cached?.roles.BEAR, judge: cached?.roles.JUDGE };
  const claims = replay?.claims ?? [...(bundles.bull?.claims ?? []), ...(bundles.bear?.claims ?? []), ...(bundles.judge?.claims ?? [])];
  const readiness = original && !localSaved && !excluded ? sourceReadiness(original.snap) : null;
  const canRun = Boolean(account && original && readiness?.canDebate);
  const blockedReason = !account ? "Đăng nhập để kiểm chứng và lưu phiên." : localSaved || excluded ? "Chuyển về quan sát hiện tại để kiểm chứng." :
    buildError ? "Chưa lập được snapshot. Thử tải lại nguồn." : readiness?.blockers[0]?.trim() || (!current ? "Đang nạp nguồn thiết yếu." : "");
  const sources = snap?.sources ?? [];
  const sessionsBound = ["decision", "profile", "liquidity"];
  const fresh = sources.filter((source) => source.state === "LOADED" && source.asOf && source.warnings.length === 0
    && (!sessionsBound.includes(source.key) || sessionDay(source.asOf) === sessionDay(snap?.decisionSession))
    && (source.key !== "events" || data.events.length > 0 && data.events.every(officialPublication))).length;
  const layers = layerStates(snap, data, ticker);
  const confirmation = replay?.confirmation ?? (visible ? evaluateConfirmation(visible, Boolean(excluded)) : null);
  const attention = { FAIL: "CHƯA ĐẠT", MISSING: "THIẾU CĂN CỨ", WAIT: "ĐANG CHỜ" } as const;
  for (const check of confirmation?.checks ?? []) {
    if (check.state !== "FAIL" && check.state !== "MISSING" && check.state !== "WAIT") continue;
    const index = layers.findIndex((layer) => layer.id === check.id);
    if (index >= 0) layers[index] = { ...layers[index], tone: check.state === "FAIL" ? "bad" : "warn", status: attention[check.state], detail: check.reason };
  }
  if (excluded) layers[3] = { ...layers[3], tone: "warn", status: "MÔ PHỎNG", detail: "Đã loại một cụm tin khỏi phân tích." };
  const concerns = layers.filter((layer) => layer.tone === "bad" || layer.tone === "warn");
  const locked = Boolean(replay || hasPinned && !seeLatest || original && original === publishedProjection);
  const fallbackSession = original?.fallback?.expectedSession ?? (locked && expectedClosedSession && snap?.decisionSession && snap.decisionSession < expectedClosedSession ? expectedClosedSession : null);
  const hasNewObservation = Boolean(locked && current && original && Date.parse(current.snap.createdAt) > Date.parse(original.snap.createdAt) &&
    sourceManifest(current) !== sourceManifest(original));
  const observedExpected = locked || excluded ? data.expectedClosedSession ?? data.volume?.coverage?.expectedClosedSession : expectedClosedSession;
  const volumeDay = data.volume?.coverage?.lastClosedSession ?? (data.volume?.partialToday ? null : data.volume?.asOf);
  const pendingSession = !locked && !excluded && observedExpected && snap && (observedExpected !== snap.decisionSession ||
    Boolean(ticker && (volumeDay && volumeDay < observedExpected || data.pa?.asOf && data.pa.asOf < observedExpected)));
  const stageHint = session.data?.stage === "EOD" ? "Chờ đủ nến đóng phiên" : session.data?.stage === "MARKET_DAILY" ? "Chờ kho ngày" : session.data?.stage === "SCANNER" ? "Chờ Siêu Quét" :
    snap?.decisionSession !== observedExpected ? "Chờ Bảng quyết định" : "Chờ nến hoặc khối lượng chốt theo mã";
  const state = snap?.funnel.membership.state;
  const held = state === "PORTFOLIO_CORE" || state === "PORTFOLIO_RUNNER";
  const funnelStep = held ? 7 : confirmation?.checks.some((check) => check.id === "decision" && check.state === "PASS") ? 5 : null;
  const graphNode = (id: NodeId, index: number, label: string, refPath: string): RoomNode => ({
    id, label, badge: layers[index].status, tone: layers[index].tone, title: layers[index].detail,
    meta: sources.find((source) => source.key === sourceFor[id])?.asOf ? `As-of ${dateVi(sources.find((source) => source.key === sourceFor[id])?.asOf, true)}` : undefined,
    ref: snap?.refs.find((ref) => ref.domain === refDomain[id] && ref.fieldPath.includes(refPath))?.fieldPath,
  });
  const aiNode = (id: keyof typeof roleTitle): RoomNode => {
    const lane = roles[id], bundle = bundles[id];
    if (cached && bundle && !showAI) return { id, label: roleTitle[id], tone: bundle.summary.refsMatched ? "good" : "neutral",
      badge: "BẢN CHẠY NỀN", title: bundle.claims[0]?.text ?? "Đã xử lý", meta: `Phiên ${dateVi(cached.session)} · ${bundle.summary.refsMatched} ref khớp` };
    const archived = replay?.claims.filter((claim) => claim.side === id.toUpperCase()) ?? [];
    if (archived.length) return { id, label: roleTitle[id], tone: "neutral", badge: "BẢN ĐÃ LƯU",
      title: archived[0].text, meta: `${archived.length} luận điểm lưu cùng phiên` };
    return { id, label: roleTitle[id], tone: lane?.error || bundle?.error ? "warn" : lane?.done && bundle?.summary.refsMatched ? "good" : "neutral",
      badge: lane?.error ? "LỖI / DỪNG" : lane && !lane.done ? "ĐANG CHẠY" : bundle?.ok ? `${bundle.summary.refsMatched} REF KHỚP` : lane ? "CẦN RÀ SOÁT" : "CHƯA CHẠY",
      title: bundle?.claims[0]?.text ?? (lane?.text && !lane.done ? "Đang nhận nội dung" : lane?.text ? "Mở nội dung diễn giải" : "Chờ kiểm chứng"),
      meta: "Diễn giải AI" };
  };
  const nodes: RoomNode[] = [
    { id: "snapshot", label: "Snapshot", badge: excluded ? "MÔ PHỎNG" : replay ? "ĐÃ LƯU" : locked ? "LOCKED" : snap?.completeness ?? "ĐANG TẢI", tone: locked ? "good" : "neutral",
      title: `${ticker ?? "Danh mục"} · ${dateVi(snap?.decisionSession ?? decisionDay, true)}`, meta: `${briefId(snap)} · ${sources.length} nguồn` },
    aiNode("bull"), aiNode("bear"), graphNode("decision", 0, "Funnel · engine", "funnel"), graphNode("events", 3, "Event Radar", "event"),
    graphNode("priceAction", 1, "Price Action", "setup"), graphNode("volume", 2, "Volume", "rvol"), aiNode("judge"),
  ];
  const quote = data.volume?.today;
  const bars = data.price?.bars ?? [];
  const lastBar = bars[bars.length - 1];
  const priceValue = quote?.price ?? lastBar?.close;
  const change = quote?.changePct;
  async function captureReview() {
    if (lockRequest.current) return;
    if (!account || !ticker || localSaved || excluded) {
      setCaptureError(!account ? "Đăng nhập để kiểm chứng bằng snapshot Gateway." : !ticker ? "Chọn một mã cổ phiếu để kiểm chứng." : "Mở bản gốc trước khi chạy tranh luận.");
      return;
    }
    const controller = new AbortController();
    lockRequest.current = controller;
    setCapturing(true); setCaptureError(null);
    try {
      const projection = await lockResearchSnapshot(ticker, controller.signal);
      if (lockRequest.current !== controller || controller.signal.aborted) return;
      if (projection.snap.ticker !== ticker) throw new Error("Gateway trả snapshot sai mã.");
      setPinned(projection); setSeeLatest(false);
      onRunReview(projection.snap);
    } catch (error) {
      if (!controller.signal.aborted) setCaptureError(error instanceof Error ? error.message : "Không khóa được snapshot trên Gateway.");
    } finally {
      if (lockRequest.current === controller) { lockRequest.current = null; setCapturing(false); }
    }
  }
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
      {fallbackSession && <span className="meta-chip warn" role="status">Snapshot dự phòng · phiên {dateVi(snap?.decisionSession)} · chờ phiên {dateVi(fallbackSession)}</span>}
      {session.data?.worker?.blocked.map(({ provider, reason, retryAt }) => <span key={provider} className="meta-chip warn" role="status">
        {provider === "claude" ? "Claude" : "Gemini"} · {{ BILLING: "cần bổ sung credit", AUTH: "cần kiểm tra xác thực", RATE_LIMIT: "đang giới hạn lượt gọi", NOT_CONFIGURED: "chưa cấu hình" }[reason]}
        {retryAt ? " · thử lại " + clock(new Date(retryAt).toISOString()) : ""}
      </span>)}
      {cached && <span className="meta-chip" role="status">{cached.state === "READY" ? "Tam tài AI · đã phân tích" : cached.state === "FAILED" ? "Tam tài AI · cần kiểm tra" : cached.state === "RETRY" ? "Tam tài AI · chờ thử lại" : "Tam tài AI · đã khóa nguồn"}</span>}
      <button className={`meta-chip ${locked ? "good" : ""}`} title={replay?.contentId ?? snap?.snapshotId} type="button" onClick={() => setDetail("snapshot")}>● Snapshot {replay ? replay.contentId.slice(-12) : briefId(snap)}</button>
      <span className="meta-chip">Decision {dateVi(snap?.decisionSession ?? decisionDay)}</span>
      {data.pa?.asOf && <span className="meta-chip">Nến {dateVi(data.pa.asOf)}</span>}
      {data.events[0] && <span className="meta-chip" title="Mốc Gateway biết revision tin đang hiển thị">Tin biết {dateVi(revisionKnownAt(data.events[0]))} {clock(revisionKnownAt(data.events[0]) ?? undefined)}</span>}
      {observedExpected && <span className={`meta-chip${pendingSession ? " warn" : ""}`} title="Phiên đã đóng theo lịch thị trường">Phiên kỳ vọng {dateVi(observedExpected)}</span>}
      {volumeDay && <span className="meta-chip" title="Phiên khối lượng ngày mới nhất đang hiển thị">KL chốt {dateVi(volumeDay)}</span>}
      {hasNewObservation && <button className="meta-chip warn" type="button" onClick={() => { setSaved(null); setShowParent(false); setScenario(null); setSeeLatest(true); }}>Có quan sát mới</button>}
      {locked && !localSaved && !hasNewObservation && <button className="meta-chip" type="button" onClick={() => setSeeLatest(true)}>Xem nguồn hiện tại</button>}
      <span className="meta-chip good">{fresh} nguồn hợp lệ cho bản này</span>
      <button type="button" className="meta-chip warn" onClick={() => setDetail("sources")}>{sources.length - fresh} nguồn cần lưu ý</button>
      <button type="button" className="meta-chip" aria-haspopup="dialog" disabled={!account} onClick={() => setResearchView("sessions")}>Phiên đã lưu</button>
      {(localSaved || excluded) && <button type="button" className="meta-chip" onClick={() => {
        if (localScenario) setScenario(null);
        else if (localSaved?.omittedCluster && !showParent) setShowParent(true);
        else { setSaved(null); setShowParent(false); setSeeLatest(true); if (!current) setRequested(true); }
      }}>{excluded ? "Về bản gốc" : "Về nguồn đang nạp"}</button>}
      <button type="button" className="primary-btn" aria-busy={capturing} aria-describedby={!busy && blockedReason ? "eb-review-reason" : undefined} onClick={() => {
        if (busy) props.onStop();
        else if (!requested) setRequested(true);
        else void captureReview();
      }}>{capturing ? "Đang khóa trên Gateway…" : busy ? "■ Dừng" : !requested ? "✦ Nạp dữ liệu kiểm chứng" : "✦ Kiểm chứng & tranh luận"}</button>
      {props.actions}
      {(!busy && !canRun && blockedReason || pendingSession) && <div className="eb-session-hint">
        {!busy && !canRun && blockedReason && <span id="eb-review-reason">{blockedReason}</span>}
        {pendingSession && <span>{stageHint} phiên {dateVi(observedExpected)}{session.data?.retryAt ? ` · thử lại từ ${clock(session.data.retryAt)}` : ""}</span>}
      </div>}
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
    setCaptureError(null);
    reloadSources();
    void session.mutate();
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
        <p>Công bố {dateVi(event.publishedAt, true)} {clock(event.publishedAt)} · Biết revision r{event.revision} {dateVi(revisionKnownAt(event), true)} {clock(revisionKnownAt(event) ?? undefined)}</p>
        <p>{event.summary}</p><p>{event.documentCount} tài liệu · {event.corroboratingSources.join(", ") || event.sourceLabel}. Số kênh đăng chưa chứng minh nguồn gốc độc lập.</p>
        {externalLink(event.url) && <a href={externalLink(event.url)!} target="_blank" rel="noreferrer">Mở tài liệu nguồn ↗</a>}
        <RefRows refs={snap?.refs.filter((ref) => ref.domain === "catalyst" && ref.fieldPath.startsWith(`events.${event.eventId}.`) && ref.sourceVersion === String(event.revision)) ?? []} />
      </> };
    }
    if (id === "snapshot" || id === "sources") return { title: id === "snapshot" ? "Snapshot bằng chứng" : "Nguồn của snapshot", content: <>
      <p>{snap?.snapshotId ?? "Đang lập snapshot"}</p><p>Phiên {dateVi(snap?.decisionSession, true)} · {snap?.completeness ?? "chưa có trạng thái"}</p>
      {snap && <p>Mốc trình duyệt quan sát {formatObservation.format(new Date(snap.createdAt))}{replay ? ` · Bản lưu ${replay.id}` : ""}</p>}
      {!locked && !excluded && session.data && <p>Phiên kỳ vọng {dateVi(session.data.expectedClosedSession, true)} · Kho ngày {dateVi(session.data.marketDailySession, true)} · Siêu Quét {dateVi(session.data.scannerSession, true)} · Bảng quyết định {dateVi(session.data.decisionSession, true)}{session.data.eod ? ` · Nến đúng phiên ${session.data.eod.confirmed}/${session.data.eod.expected}` : ""}</p>}
      {!locked && !excluded && session.error && <p>Chưa đọc được tiến độ công bố phiên từ Gateway.</p>}
      <button type="button" className="small-link" onClick={retry}>{requested ? "Thử tải lại nguồn" : "Nạp dữ liệu kiểm chứng"}</button>
      {hasPinned && <button type="button" className="small-link" onClick={() => setSeeLatest((v) => !v)}>{locked ? "Xem snapshot mới nhất" : "Xem snapshot đã kiểm chứng"}</button>}
      {sources.map((s) => <article key={s.key}><p><b>{s.label}</b> · {stateLabel[s.state]} · {dateVi(s.asOf, true)}</p><p>{s.endpoint} · {s.version ?? "—"}</p>
        {(s.error || s.warnings.length > 0) && <p className="eb-claim-check">{[s.error, ...s.warnings].filter(Boolean).join(" · ")}</p>}</article>)}
      <RefRows refs={snap?.refs.filter((ref) => ref.domain === "ledger" || ref.domain === "risk" || ref.domain === "profile") ?? []} />
    </> };
    if (id === "bull" || id === "bear" || id === "judge") return { title: roleTitle[id], content: <>
      <p>Snapshot {briefId(snap)} · {ticker ?? "Danh mục"}</p>
      {roles[id] ? <div className="tw-scope"><LaneView t={roles[id]!} showHeader headerLabel={roleTitle[id]} /></div>
        : bundles[id]?.claims.length ? <p>Luận điểm từ bản phân tích Gateway của phiên này.</p> : replay?.claims.some((claim) => claim.side === id.toUpperCase()) ? <p>Luận điểm đã lưu cùng phiên.</p> : <p>Chưa có luận điểm cho snapshot đang xem.</p>}
      <p className="eb-claim-check">Ref và số khớp là kiểm tra cấu trúc dữ liệu. Cần đọc luận điểm để đánh giá cách diễn giải.</p>
      {bundles[id]?.error && <p>{bundles[id]!.error}</p>}
      {(replay ? replay.claims.filter((claim) => claim.side === id.toUpperCase()) : bundles[id]?.claims ?? []).map((claim) => <article key={claim.id}><p><b>{claim.validation}</b> · {claim.classification}</p><p>{claim.text}</p>
        {claim.validationNotes.map((note, index) => <p key={index}>{note}</p>)}
        <RefRows refs={snap?.refs.filter((ref) => [...claim.refs, ...claim.supports, ...claim.invalidates].includes(ref.id)) ?? []} /></article>)}
    </> };
    if (id === "events") return { title: "Tin & xúc tác liên quan", content: <>
      <p>{layers[3].status} · {ticker ?? "Chọn mã để tải tin"}</p>
      {data.events.map((event) => <article key={event.eventId}><button type="button" className="small-link" onClick={() => setDetail({ event })}>{event.title}</button><p>{event.sourceLabel} · {event.verificationStatus} · {dateVi(event.firstSeenAt, true)} {clock(event.firstSeenAt)}</p></article>)}
    </> };
    const refs = snap?.refs.filter((ref) => id === "liquidity" ? ref.fieldPath === "liquidity" : id === "seasonal" ? ref.fieldPath.startsWith("timing.") : id === "risk" ? ref.domain === "risk" : ref.domain === refDomain[id]) ?? [];
    const layer = layers.find((item) => item.id === id);
    return { title: layer?.label ?? "Chi tiết nguồn", content: <>
      <p>{layer?.status} · {layer?.detail}</p>
      {confirmation?.checks.filter((check) => check.id === id).map((check) => <p key={check.id}>{check.reason}</p>)}
      {id === "seasonal" && data.timing && <p>{data.timing.windowLabel} · {data.timing.entryFromDate} → {data.timing.entryToDate} · kỳ vọng ròng {numberVi(data.timing.netExpectancy * 100)}% · FDR q {numberVi(data.timing.fdrQValue, 3)}</p>}
      {id === "priceAction" && data.pa?.setup && <p>Phiên {dateVi(data.pa.setup.stateDate, true)} · Trigger {numberVi(data.pa.setup.entryReference)} · Vô hiệu {numberVi(data.pa.setup.invalidationLevel)} · {data.pa.priceBasis ?? "chưa rõ cơ sở giá"}</p>}
      {id === "priceAction" && data.price?.warnings?.map((warning) => <p className="eb-claim-check" key={warning}>{warning}</p>)}
      {id === "volume" && !locked && !excluded && <button type="button" className="small-link" onClick={() => setWantVolumeDetail(true)} disabled={fullVolume.isLoading}>
        {fullVolume.isLoading ? "Đang tải nến phút…" : "Tải phân tích nến phút"}
      </button>}
      {id === "volume" && data.volume?.intraday?.sameTime?.methodVersion && <p>Bằng chứng trong bản đang xem · {data.volume.intraday.sameTime.asOfTime} · RVOL {numberVi(data.volume.intraday.sameTime.ratio)}× · Trung vị {data.volume.intraday.sameTime.sessions} phiên nền.</p>}
      {id === "volume" && !locked && !excluded && fullVolume.error && <p>Phân tích nến phút chi tiết chưa khả dụng.</p>}
      {id === "volume" && !locked && !excluded && fullVolume.data?.symbol === ticker && <p>Phân tích chi tiết hiện tại · {dateVi(fullVolume.data.asOf, true)} · RVOL cùng mốc {numberVi(fullVolume.data.today.rvolTimeAdjusted)}× · {fullVolume.data.intraday?.sameTime?.sessions ?? "—"} phiên nền.</p>}
      <RefRows refs={refs} />
    </> };
  }
  const dialog = detail === null ? null : renderDetail(detail);
  function openCanvas(entry: ScenarioEntry = {}) {
    if (!account || !ticker || props.busy || capturing) return;
    setDetail(null); setResearchView(null);
    setCanvasEntry({ ...entry, account, ticker,
      source: localSaved && !localSaved.omittedCluster ? { kind: "run", id: localSaved.id }
        : hasPinned && !seeLatest && pinned ? { kind: "lock", id: pinned.snap.snapshotId } : undefined });
  }
  const canvasDisabled = !account || !ticker || props.busy || capturing;
  const message = showAI ? props.reviewMessage : null;
  const next = confirmation?.reason ?? readiness?.blockers[0] ?? (concerns.length ? concerns.map((item) => item.label).join(" · ") : snap?.missing[0] ?? "Mở từng lớp để xem phạm vi và điều kiện xác nhận.");
  return <section data-testid="evidence-brain-workspace">
    {enabled && ticker && <PriceActionConfirmation key={ticker} ticker={ticker} onEvidence={onPriceAction} evidenceOnly />}
    <WorkspaceFrame ticker={tickerBar} left={<FunnelRail snap={snap} current={funnelStep} onOpen={() => setDetail("sources")} onStep={() => setDetail("decision")} />}
      graph={<div className="eb-research-graph">
        <div className="eb-research-actions"><span>{excluded ? "Mô phỏng · Đã loại nguồn xúc tác" : showParent ? "Đang xem bản gốc của nhánh đã lưu" : replay ? "Đang xem bản đã lưu" : "Nguồn đang xem"}</span>
          <button type="button" className="meta-chip" onClick={() => setResearchView("scenario")} disabled={!account || !original?.data.events.length || Boolean(replay?.omittedCluster)}>Phản chứng</button>
          <button type="button" className="meta-chip eb-canvas-entry" aria-haspopup="dialog" disabled={canvasDisabled} onClick={() => openCanvas()}>Canvas phản chứng</button>
          <button type="button" className="meta-chip eb-research-obsidian" onClick={() => setResearchView("obsidian")} disabled={!account || !original?.snap.decisionSession}>Obsidian</button>
        </div>
        <LiveEvidenceGraph key={`graph:${ticker ?? "portfolio"}`} nodes={nodes} refs={snap?.refs ?? []} claims={claims} onSelect={setDetail} />
      </div>}
      timeline={<LiveTimeline key={`timeline:${ticker ?? "portfolio"}`} price={data.price} volume={data.volume} events={data.events} pa={data.pa} scenario={Boolean(excluded)} onEvent={(event) => setDetail({ event })} onPriceAction={() => setDetail("priceAction")} />}
      right={<RightRail layers={layers}
        title={confirmation ? confirmationLabel[confirmation.result].toUpperCase() : "ĐỐI CHIẾU CÁC LỚP"}
        description={concerns.length ? concerns.map((layer) => `${layer.label}: ${layer.status.toLowerCase()}`).join(" · ") : "Các trạng thái dưới đây lấy theo nguồn của snapshot đang xem."}
        blocker={next} events={data.events} newsState={layers[3].status} onDetail={setDetail} />}
      footer={<p className="footer-note">Dữ liệu theo phiên và nguồn ghi trong snapshot. Luận điểm AI hỗ trợ kiểm chứng trước giao dịch.</p>} />
    {(captureError || message || buildError || readiness?.blockers.length) ? <div className="eb-status-line" role="status">
      {captureError || (buildError ? "Không lập được snapshot. " : message || readiness?.blockers[0])}
      <button type="button" className="small-link" onClick={() => setDetail("sources")}>Xem tình trạng nguồn</button>
    </div> : null}
    {active && dialog && <DetailDialog title={dialog.title} onClose={() => setDetail(null)}>{dialog.content}
      {(detail === "events" || detail === "volume" || detail === "priceAction" || detail && typeof detail === "object") &&
        <button type="button" className="meta-chip eb-canvas-entry" disabled={canvasDisabled} onClick={() =>
          openCanvas(typeof detail === "object" ? { node: "events", key: eventKey(detail.event) } : { node: detail })}>Thử bằng chứng trên Canvas phản chứng</button>}
    </DetailDialog>}
    {active && canvasEntry && canvasEntry.account === account && canvasEntry.ticker === ticker &&
      <Suspense fallback={<p role="status">Đang mở Canvas phản chứng…</p>}>
        <ScenarioCanvas account={canvasEntry.account} ticker={canvasEntry.ticker} entry={canvasEntry} observation={original} desk={props.desk} onClose={() => setCanvasEntry(null)} />
      </Suspense>}
    {active && account && researchView && <ResearchDialog key={`${account}:${ticker}:${researchView}`} view={researchView} account={account} ticker={ticker} projection={original} replay={replay}
      omitted={excluded} claims={claims} desk={props.desk} onClose={() => setResearchView(null)}
      onScenarios={canvasDisabled ? undefined : () => openCanvas()}
      onReplay={(run) => { setScenario(null); setShowParent(false); setSaved(run); setResearchView(null); }}
      onOmit={(key) => { setScenario(original && key && original.data.events.some((event) => eventKey(event) === key) ? { base: original, cluster: key, account } : null); setResearchView(null); }} />}
  </section>;
}
