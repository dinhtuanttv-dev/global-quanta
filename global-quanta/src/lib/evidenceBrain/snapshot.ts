import type { EliteDecision, EliteEvidence, EliteLedger, EliteRisk, DecisionTicker, PanelTicker } from "../elite10/decisionTypes";
import { funnelModel, resolveBoardState, sessionSeal } from "../elite10/cockpit";
import type { EventRadarEvent } from "../../hooks/useEventRadar";
import type { VolumeAnalysis } from "../../hooks/useVolumeAnalysis";
import type { BuyTimeline, TimelineRow } from "../cotuc/buy-timeline";
import type { EvidenceRef, EvidenceSnapshot, JsonValue, SnapshotSource } from "./types";

export interface PriceActionEvidence {
  ticker: string;
  state: "TRIGGERED" | "FORMING" | "INVALIDATED" | "EXPIRED" | "INSUFFICIENT" | "UNKNOWN" | "LOADING" | "NOT_APPLICABLE";
  trend: string | null;
  asOf: string | null;
  priceBasis: string | null;
  venue: string | null;
  barClosed: boolean | null;
  confirmed: boolean;
  setup: { kind: string; stateDate: string; entryReference: number | null; invalidationLevel: number | null; target: number | null } | null;
  patterns: string[];
  blockers: string[];
  source: string;
  methodVersion: string;
  loading: boolean;
  error: string | null;
  tickerVerified: boolean;
}

export interface SnapshotInput {
  ticker: string | null;
  tickerVerified: boolean | null;
  now: string;
  decision: EliteDecision | null;
  decisionError?: string | null;
  profileError?: string | null;
  selectedDecision: DecisionTicker | null;
  panel: PanelTicker | null;
  evidence: EliteEvidence | null;
  evidenceError?: string | null;
  ledger: EliteLedger | null;
  ledgerError?: string | null;
  risk: EliteRisk | null;
  riskError?: string | null;
  timeline: BuyTimeline | null;
  timelineError?: string | null;
  events: EventRadarEvent[] | null;
  eventAsOf?: string | null;
  eventError?: string | null;
  volume: VolumeAnalysis | null;
  volumeError?: string | null;
  priceAction: PriceActionEvidence | null;
  priceActionError?: string | null;
  sourceLoading?: string[];
  sourceUnavailable?: string[];
}

const safeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null; }
  catch { return null; }
};
const jsonValue = (value: unknown): JsonValue => {
  if (value == null || typeof value === "string" || typeof value === "boolean") return value as JsonValue;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, jsonValue(v)]));
  return String(value);
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  // Non-secure embedded runtimes may lack SubtleCrypto; make fallback explicit in the ID.
  let a = 0x811c9dc5, b = 0x9e3779b9, c = 0x85ebca6b, d = 0xc2b2ae35;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    a = Math.imul(a ^ char, 0x01000193) >>> 0;
    b = Math.imul(b ^ (char + i), 0x85ebca6b) >>> 0;
    c = Math.imul(c ^ (char + (i << 1)), 0xc2b2ae35) >>> 0;
    d = Math.imul(d ^ (char + (i << 2)), 0x27d4eb2f) >>> 0;
  }
  return `fallback-${[a, b, c, d].map((part) => part.toString(16).padStart(8, "0")).join("")}`;
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

const refId = (domain: EvidenceRef["domain"], subject: string, field: string) => `ref:${domain}:${subject}:${field}`;

export async function buildEvidenceSnapshot(input: SnapshotInput): Promise<EvidenceSnapshot> {
  const ticker = input.ticker?.trim().toUpperCase() || null;
  const decision = input.decision;
  const selected = ticker ? decision?.scores.find((row) => row.ticker.toUpperCase() === ticker) ?? null : null;
  const selectedTicker = input.selectedDecision?.ticker.toUpperCase() === ticker ? input.selectedDecision : null;
  const selectedPanel = input.panel?.ticker.toUpperCase() === ticker ? input.panel : null;
  const board = decision ? resolveBoardState(decision) : null;
  const state = ticker ? board?.byTicker.get(ticker) ?? [...(board?.byTicker.entries() ?? [])].find(([symbol]) => symbol.toUpperCase() === ticker)?.[1] ?? null : null;
  const funnel = decision ? funnelModel(decision) : null;
  const seal = decision ? sessionSeal(decision, [
    { key: "panel", label: "Bảng tín hiệu", date: selectedPanel?.date },
    { key: "ledger", label: "Sổ theo dõi", date: input.ledger?.updatedAt },
    { key: "risk", label: "Rủi ro", date: input.risk?.date },
    { key: "timeline", label: "Timeline catalyst", date: input.timeline?.asOf?.decisions },
    { key: "evidence", label: "Bằng chứng tín hiệu", date: input.evidence?.generatedAt },
    { key: "priceAction", label: "Price Action", date: input.priceAction?.asOf },
    { key: "volume", label: "Volume", date: input.volume?.asOf },
    { key: "events", label: "Event Radar", date: input.eventAsOf },
  ]) : null;
  const timing = ticker ? input.timeline?.rows.find((row) => row.ticker.toUpperCase() === ticker) ?? null : null;
  const events = (input.events ?? []).filter((event) => ticker && event.tickers.some((symbol) => symbol.toUpperCase() === ticker)).slice(0, 12);
  const freshnessAtSession = (asOf: string | null | undefined) => {
    const date = asOf?.slice(0, 10);
    if (!date || !decision?.date) return "UNKNOWN" as const;
    if (date === decision.date) return "CURRENT" as const;
    return date < decision.date ? "STALE" as const : "UNKNOWN" as const;
  };
  const refs: EvidenceRef[] = [];
  const add = (domain: EvidenceRef["domain"], subject: string, fieldPath: string, value: unknown, unit: string | null, source: string, asOf: string | null, version: string | null, options: Partial<EvidenceRef> = {}) => {
    if (value === undefined) return;
    refs.push({ id: refId(domain, subject, fieldPath), domain, subject, fieldPath, value: jsonValue(value), unit, status: options.status ?? "VERIFIED", freshness: options.freshness ?? (value === null ? "UNKNOWN" : freshnessAtSession(asOf)), asOf, source, sourceVersion: version, methodVersion: options.methodVersion ?? null, limitation: options.limitation ?? null, url: safeUrl(options.url) });
  };

  if (decision) {
    add("decision", ticker ?? "portfolio", "date", decision.date, "session", "/api/elite/decision", decision.date, decision.version);
    add("decision", ticker ?? "portfolio", "version", decision.version, null, "/api/elite/decision", decision.date, decision.version);
    add("decision", ticker ?? "portfolio", "portfolioKind", decision.hl ? "ELITE_HL" : "ELITE_FLOW", null, "/api/elite/decision", decision.date, decision.version);
    add("decision", ticker ?? "portfolio", "frozen", seal?.frozen ?? false, null, "/api/elite/decision", decision.date, decision.version);
    add("decision", ticker ?? "portfolio", "freshness.sessionsBehind", decision.freshness?.sessionsBehind ?? null, "sessions", "/api/elite/decision", decision.freshness?.latestSession ?? decision.date, decision.version, { freshness: decision.freshness?.sessionsBehind == null ? "UNKNOWN" : decision.freshness.sessionsBehind > 0 ? "STALE" : "CURRENT" });
    funnel?.steps.forEach((step, index) => add("decision", ticker ?? "portfolio", `funnel.steps.${index + 1}`, { count: step.n, label: step.label, countedOn: step.countedOn, parallel: Boolean(step.parallel), displayOnly: Boolean(step.displayOnly) }, "stocks", "/api/elite/decision", decision.date, decision.version, { status: "DERIVED", methodVersion: "cockpit.funnelModel" }));
    funnel?.checks.forEach((check, index) => add("decision", ticker ?? "portfolio", `funnel.invariant.${index + 1}`, check, null, "/api/elite/decision", decision.date, decision.version, { status: "DERIVED", methodVersion: "cockpit.funnelModel" }));
    if (selected) {
      add("decision", ticker!, "rank", selected.rank, "rank", "/api/elite/decision", decision.date, decision.version);
      add("decision", ticker!, "eligible", selected.eligible, null, "/api/elite/decision", decision.date, decision.version);
      add("decision", ticker!, "Z", selected.Z, "z-score", "/api/elite/decision", decision.date, decision.version);
      add("decision", ticker!, "close", selected.close, "VND", "/api/elite/decision", decision.date, decision.version);
    }
    if (state) {
      add("decision", ticker!, "membership.primary", state.primary, null, "/api/elite/decision", decision.date, decision.version, { status: "DERIVED", methodVersion: "cockpit.resolveBoardState" });
      add("decision", ticker!, "membership.pz", state.pz, null, "/api/elite/decision", decision.date, decision.version, { status: "DERIVED", methodVersion: "cockpit.resolveBoardState" });
      add("decision", ticker!, "membership.reason", state.detail, null, "/api/elite/decision", decision.date, decision.version, { status: "DERIVED", methodVersion: "cockpit.resolveBoardState" });
    }
  }
  if (selectedTicker) {
    add("profile", ticker!, "inPortfolio", selectedTicker.inPortfolio, null, "/api/elite/decision/{ticker}", selectedTicker.date, selectedTicker.version);
    add("profile", ticker!, "reason", selectedTicker.reason, null, "/api/elite/decision/{ticker}", selectedTicker.date, selectedTicker.version);
  }
  if (selectedPanel) {
    add("profile", ticker!, "sector", selectedPanel.sector, null, "/api/elite/panel/{ticker}", selectedPanel.date, null);
    add("profile", ticker!, "missingSources", selectedPanel.missingSources, null, "/api/elite/panel/{ticker}", selectedPanel.date, null, { status: "DERIVED" });
    const selectedWeights = new Set(decision?.weights.map((weight) => weight.id) ?? []);
    for (const [key, value] of Object.entries(selectedPanel.values)) if (selectedWeights.has(key)) add("profile", ticker!, `signals.${key}`, value, null, "/api/elite/panel/{ticker}", selectedPanel.date, decision?.version ?? null);
  }
  if (input.priceAction && input.priceAction.ticker.toUpperCase() === ticker) {
    const pa = input.priceAction;
    add("price_action", ticker!, "state", pa.state, null, pa.source, pa.asOf, pa.methodVersion, { status: "DERIVED", methodVersion: pa.methodVersion, limitation: pa.blockers.join("; ") || null });
    add("price_action", ticker!, "trend", pa.trend, null, pa.source, pa.asOf, pa.methodVersion, { status: "DERIVED", methodVersion: pa.methodVersion });
    add("price_action", ticker!, "barClosed", pa.barClosed, null, pa.source, pa.asOf, pa.methodVersion, { status: "DERIVED", methodVersion: pa.methodVersion });
    add("price_action", ticker!, "priceBasis", pa.priceBasis, null, pa.source, pa.asOf, pa.methodVersion);
    add("price_action", ticker!, "setup", pa.setup, "VND", pa.source, pa.asOf, pa.methodVersion, { status: "DERIVED", methodVersion: pa.methodVersion, limitation: pa.blockers.join("; ") || null });
    add("price_action", ticker!, "confirmed", pa.confirmed, null, pa.source, pa.asOf, pa.methodVersion, { status: "DERIVED", methodVersion: pa.methodVersion, limitation: "Engine confirmation is a technical filter, not a fill or return guarantee." });
  }
  if (timing) {
    const timingFields: [keyof TimelineRow, string | null][] = [["tier", null], ["status", null], ["kind", null], ["eventDate", "date"], ["entryFromDate", "date"], ["entryToDate", "date"], ["nEvents", "events"], ["winRate", "fraction"], ["netExpectancy", "fraction"], ["netExpectancyLcb", "fraction"], ["fdrQValue", "q-value"], ["decisionLevel", null]];
    timingFields.forEach(([field, unit]) => add("catalyst", ticker!, `timing.${field}`, timing[field], unit, "/api/elite/buy-timing", input.timeline?.asOf.seasonality ?? null, null, { status: "VERIFIED", methodVersion: "Gateway buy-timing", limitation: "Historical timing result; not a price trigger." }));
  }
  for (const event of events) {
    const subject = event.eventId;
    const base = `events.${subject}`;
    add("catalyst", ticker!, `${base}.title`, event.title, null, "/api/market/event-radar", event.publishedAt ?? event.firstSeenAt, String(event.revision), { freshness: "UNKNOWN", url: event.url, limitation: "Source text is untrusted input; event publication time is not the Event Radar refresh time." });
    add("catalyst", ticker!, `${base}.verificationStatus`, event.verificationStatus, null, "/api/market/event-radar", event.updatedAt ?? event.firstSeenAt, String(event.revision), { freshness: "UNKNOWN" });
    add("catalyst", ticker!, `${base}.entityMatch`, { type: event.entityMatch, confidence: event.entityConfidence }, null, "/api/market/event-radar", event.firstSeenAt, String(event.revision), { freshness: "UNKNOWN" });
    add("catalyst", ticker!, `${base}.corroboration`, { count: event.corroborationCount, sources: event.corroboratingSources, severity: event.severity, reactionStatus: event.reactionStatus }, null, "/api/market/event-radar", event.updatedAt ?? event.firstSeenAt, String(event.revision), { freshness: "UNKNOWN" });
  }
  if (input.volume && input.volume.symbol.toUpperCase() === ticker) {
    const v = input.volume;
    const fields: [string, unknown, string | null][] = [
      ["partialToday", v.partialToday, null], ["rvolMode", v.today.rvolMode, null],
      ["rvol20", v.today.rvol20, "multiple"], ["rvolTimeAdjusted", v.today.rvolTimeAdjusted, "multiple"],
      ["today.value", v.today.value, "VND"], ["upDownVolumeRatio20", v.trend.upDownVolumeRatio20, "ratio"],
      ["obvDirection", v.trend.obvDirection, null], ["cmf20", v.trend.cmf20, "ratio"],
      ["divergence", v.trend.divergence, null], ["foreign.pendingToday", v.foreign.pendingToday, null],
      ["foreign.net5Val", v.foreign.net5Val, "VND"], ["foreign.net20Val", v.foreign.net20Val, "VND"],
      ["profile", v.profile ? { sessions: v.profile.sessions, poc: v.profile.poc, valueAreaLow: v.profile.valueAreaLow, valueAreaHigh: v.profile.valueAreaHigh, position: v.profile.position } : null, "VND"],
    ];
    fields.forEach(([field, value, unit]) => add("volume", ticker!, field, value, unit, `/api/market/scanner/${ticker}/volume`, v.asOf, "volume-analysis", { status: "DERIVED", methodVersion: "volume-analysis", freshness: v.partialToday ? "CURRENT" : "CURRENT", limitation: v.partialToday && field === "rvol20" ? "Intraday partial volume; use time-adjusted RVOL where available." : null }));
  }
  if (input.evidence) {
    const ev = input.evidence;
    for (const s of ev.signals.filter((signal) => decision?.weights.some((weight) => weight.id === signal.id)).slice(0, 24)) {
      add("ledger", ticker ?? "portfolio", `signalEvidence.${s.id}`, { tier: s.tier, reason: s.reasonVi, source: s.source, horizon: s.mainH, sample: s.byH[String(s.mainH)] ?? null }, null, "/api/elite/evidence", ev.generatedAt, ev.version, { status: "VERIFIED", methodVersion: ev.version, limitation: "Signal evidence does not validate today's technical setup." });
    }
  }
  if (input.ledger) {
    const ledger = input.ledger;
    add("ledger", ticker ?? "portfolio", "label", ledger.summary.label, null, "/api/elite/ledger", ledger.updatedAt, ledger.version, { limitation: ledger.summary.basisVi ?? null });
    add("ledger", ticker ?? "portfolio", "summary", ledger.summary.horizons, null, "/api/elite/ledger", ledger.updatedAt, ledger.version, { status: "VERIFIED", methodVersion: ledger.version, limitation: ledger.summary.basisVi ?? "Portfolio ledger describes historical outcomes and is not a forecast." });
    add("ledger", ticker ?? "portfolio", "sample", { entries: ledger.entries.length, first: ledger.entries[ledger.entries.length - 1]?.date ?? null, latest: ledger.entries[0]?.date ?? null }, "sessions", "/api/elite/ledger", ledger.updatedAt, ledger.version);
  }
  if (input.risk) {
    add("risk", ticker ?? "portfolio", "summary", { date: input.risk.date, version: input.risk.version, label: input.risk.label, available: input.risk.available, reason: input.risk.reasonVi ?? null, volatility: input.risk.volatility ?? null, beta: input.risk.beta ?? null, corrWithVnIndex: input.risk.corrWithVnIndex ?? null, maxDrawdown: input.risk.maxDrawdown ?? null, diversification: input.risk.diversification ?? null }, null, "/api/elite/risk", input.risk.date, input.risk.version, { limitation: "Portfolio risk metrics are not single-stock stop levels." });
  }

  const loading = new Set(input.sourceLoading ?? []), unavailable = new Set(input.sourceUnavailable ?? []);
  const errors: Record<string, string | null | undefined> = { decision: input.decisionError, profile: input.profileError, evidence: input.evidenceError, ledger: input.ledgerError, risk: input.riskError, timeline: input.timelineError, events: input.eventError, volume: input.volumeError, priceAction: input.priceActionError };
  const sourceInput: [string, string, string, string | null, string | null, boolean][] = [
    ["decision", "Bảng quyết định", "/api/elite/decision", decision?.date ?? null, decision?.version ?? null, Boolean(decision)],
    ["profile", "Hồ sơ 360", "/api/elite/panel/{ticker}", selectedPanel?.date ?? selectedTicker?.date ?? null, selectedTicker?.version ?? null, Boolean(selectedPanel || selectedTicker)],
    ["evidence", "Bằng chứng tín hiệu", "/api/elite/evidence", input.evidence?.generatedAt ?? null, input.evidence?.version ?? null, Boolean(input.evidence)],
    ["ledger", "Sổ theo dõi", "/api/elite/ledger", input.ledger?.updatedAt ?? null, input.ledger?.version ?? null, Boolean(input.ledger)],
    ["risk", "Rủi ro danh mục", "/api/elite/risk", input.risk?.date ?? null, input.risk?.version ?? null, Boolean(input.risk)],
    ["timeline", "Catalyst timing", "/api/elite/buy-timing", input.timeline?.asOf.seasonality ?? input.timeline?.asOf.decisions ?? null, null, Boolean(input.timeline)],
    ["events", "Event Radar", "/api/market/event-radar", input.eventAsOf ?? null, null, input.events != null],
    ["volume", "Volume", `/api/market/scanner/${ticker ?? "{ticker}"}/volume`, input.volume?.asOf ?? null, "volume-analysis", Boolean(input.volume)],
    ["priceAction", "Price Action", "/api/market/ta-series", input.priceAction?.asOf ?? null, input.priceAction?.methodVersion ?? null, Boolean(input.priceAction)],
  ];
  const sources: SnapshotSource[] = sourceInput.map(([key, label, endpoint, asOf, version, exists]) => {
    const state: SnapshotSource["state"] = errors[key] ? "ERROR" : loading.has(key) ? "LOADING" : unavailable.has(key) ? "UNAVAILABLE" : exists ? "LOADED" : "NOT_REQUESTED";
    const warnings = key === "events" && input.events?.some((event) => event.entityMatch !== "EXACT") ? ["Một số sự kiện có entity match chưa chính xác; không dùng làm xác nhận mã."] : [];
    if (state === "LOADED" && !asOf) warnings.push("Nguồn chưa cung cấp mốc as-of; không thể xác nhận độ mới của dữ liệu.");
    return { key, label, endpoint, asOf, version, state, error: errors[key] ?? null, warnings };
  });
  const missing = sources.filter((source) => ["ERROR", "UNAVAILABLE", "NOT_REQUESTED"].includes(source.state)).map((source) => `${source.label}: ${source.state === "NOT_REQUESTED" ? "chưa tải" : source.error ?? "không khả dụng"}`);
  missing.push(...sources.filter((source) => source.state === "LOADED" && !source.asOf).map((source) => `${source.label}: thiếu mốc as-of`));
  const stale: string[] = [];
  if (decision?.freshness?.overdue || (decision?.freshness?.sessionsBehind ?? 0) > 0) stale.push(`Bảng quyết định trễ ${decision?.freshness?.sessionsBehind ?? "?"} phiên.`);
  if (input.timeline?.stale) stale.push("Timeline catalyst được nguồn đánh dấu là dữ liệu cũ.");
  if ((input.timeline?.ageSessions ?? 0) > 1) stale.push(`Timeline catalyst cũ ${input.timeline?.ageSessions} phiên.`);
  if (seal?.frozen) stale.push(...seal.frozenWhy.map((reason) => `Dữ liệu đóng băng: ${reason}`));
  for (const item of seal?.sources ?? []) if (item.lag) stale.push(`${item.label} lệch phiên (${item.date ?? "không rõ"}).`);
  const conflicts = funnel?.checks ?? [];
  const limitations = [
    "Snapshot front-end kết hợp các endpoint riêng lẻ; không phải giao dịch nguyên tử từ một endpoint Gateway.",
    "Lượt gọi AI có thể dùng thêm công cụ server; mọi dữ liệu mới ngoài snapshot phải được đánh dấu sau snapshot.",
    "Validator chỉ xác nhận ref tồn tại và numeric assertion khớp dữ liệu; không xác nhận ngữ nghĩa của câu claim.",
  ];
  if (input.volume?.partialToday) limitations.push("Volume phiên hiện tại chưa chốt; RVOL intraday chỉ so sánh cùng thời điểm.");
  if (input.risk && !input.risk.available) limitations.push(input.risk.reasonVi ?? "Dữ liệu rủi ro danh mục không khả dụng.");
  if (input.panel?.missingSources.length) limitations.push(`Hồ sơ thiếu nguồn: ${input.panel.missingSources.join(", ")}.`);
  const completeness = conflicts.length ? "CONFLICT" : stale.length ? "STALE" : missing.length ? "PARTIAL" : "COMPLETE";
  const data = jsonValue({
    decision: decision ? { date: decision.date, builtAt: decision.builtAt, version: decision.version, portfolioKind: decision.hl ? "ELITE_HL" : "ELITE_FLOW", freshness: decision.freshness ?? null, guard: decision.hl?.dataGuard ?? null, funnel: funnel ?? null, membership: state ?? null, selected: selected ? { ticker: selected.ticker, rank: selected.rank, Z: selected.Z, eligible: selected.eligible, reason: selected.reason, close: selected.close, advBn: selected.advBn, sectorKey: selected.sectorKey } : null, queue: ticker ? decision.hl?.queue.find((row) => row.ticker.toUpperCase() === ticker) ?? null : null, pz: ticker ? decision.hl?.watch?.find((row) => row.ticker.toUpperCase() === ticker)?.pz ?? decision.hl?.queue.find((row) => row.ticker.toUpperCase() === ticker)?.pz ?? decision.portfolio.find((row) => row.ticker.toUpperCase() === ticker)?.hl?.pz ?? null : null, weights: decision.weights.slice(0, 32) } : null,
    profile: selectedPanel ? { date: selectedPanel.date, sector: selectedPanel.sector, icb: selectedPanel.icb, values: selectedPanel.values, missingSources: selectedPanel.missingSources } : null,
    evidence: input.evidence ? { version: input.evidence.version, generatedAt: input.evidence.generatedAt, tests: input.evidence.tests, selected: input.evidence.signals.filter((row) => decision?.weights.some((weight) => weight.id === row.id)).slice(0, 24) } : null,
    priceAction: input.priceAction?.ticker.toUpperCase() === ticker ? input.priceAction : null,
    catalystTiming: timing,
    events: events.map((event) => ({ eventId: event.eventId, clusterId: event.clusterId, source: event.source, sourceLabel: event.sourceLabel, sourceAuthority: event.sourceAuthority, verificationStatus: event.verificationStatus, title: event.title.slice(0, 240), summary: event.summary.slice(0, 600), url: safeUrl(event.url), publishedAt: event.publishedAt, firstSeenAt: event.firstSeenAt, updatedAt: event.updatedAt, eventType: event.eventType, entityMatch: event.entityMatch, entityConfidence: event.entityConfidence, severity: event.severity, corroboratingSources: event.corroboratingSources.slice(0, 8), corroborationCount: event.corroborationCount, reactionStatus: event.reactionStatus })),
    volume: input.volume ? { symbol: input.volume.symbol, asOf: input.volume.asOf, partialToday: input.volume.partialToday, today: input.volume.today, trend: { bars30: input.volume.trend.bars30.slice(-30), ma20Volume: input.volume.trend.ma20Volume, upDownVolumeRatio20: input.volume.trend.upDownVolumeRatio20, obvDirection: input.volume.trend.obvDirection, obvChangeVsAvgVolume: input.volume.trend.obvChangeVsAvgVolume, cmf20: input.volume.trend.cmf20, divergence: input.volume.trend.divergence }, foreign: { pendingToday: input.volume.foreign.pendingToday, lastSettledDate: input.volume.foreign.lastSettledDate, today: input.volume.foreign.today, net5Val: input.volume.foreign.net5Val, net20Val: input.volume.foreign.net20Val, streak: input.volume.foreign.streak }, profile: input.volume.profile ? { sessions: input.volume.profile.sessions, poc: input.volume.profile.poc, valueAreaLow: input.volume.profile.valueAreaLow, valueAreaHigh: input.volume.profile.valueAreaHigh, position: input.volume.profile.position } : null, intraday: input.volume.intraday ? { buckets15m: input.volume.intraday.buckets15m, totalVolume: input.volume.intraday.totalVolume, sameTime: input.volume.intraday.sameTime, peak: input.volume.intraday.peak } : null } : null,
    ledger: input.ledger ? { version: input.ledger.version, updatedAt: input.ledger.updatedAt, label: input.ledger.summary.label, basis: input.ledger.summary.basisVi ?? null, summary: input.ledger.summary.horizons, entries: input.ledger.entries.slice(0, 10) } : null,
    risk: input.risk ? { date: input.risk.date, version: input.risk.version, label: input.risk.label, available: input.risk.available, reason: input.risk.reasonVi ?? null, volatility: input.risk.volatility ?? null, beta: input.risk.beta ?? null, corrWithVnIndex: input.risk.corrWithVnIndex ?? null, maxDrawdown: input.risk.maxDrawdown ?? null, diversification: input.risk.diversification ?? null, var95: input.risk.var?.["0.95"] ? { level: input.risk.var["0.95"].level, historical: input.risk.var["0.95"].historical, tenDayNoteVi: input.risk.var.tenDayNoteVi } : null } : null,
  });
  const payload = { schemaVersion: "vee-1.0" as const, createdAt: input.now, scope: ticker ? "ticker" as const : "portfolio" as const, ticker, tickerVerified: ticker ? input.tickerVerified : null, decisionSession: decision?.date ?? null, portfolioKind: decision ? decision.hl ? "ELITE_HL" : "ELITE_FLOW" : null, completeness, sources, funnel: { mode: seal?.pzMode ?? null, steps: (funnel?.steps ?? []).map((step, index) => ({ index: index + 1, label: step.label, count: step.n, parallel: Boolean(step.parallel), displayOnly: Boolean(step.displayOnly), countedOn: step.countedOn })), membership: { state: state?.primary ?? "UNKNOWN", rank: state?.rank ?? selected?.rank ?? null, reason: state?.detail ?? selected?.reason ?? null, pz: state?.pz ?? null }, branch: funnel ? { previous: funnel.branch.prevHeld, kept: funnel.branch.kept, added: funnel.branch.added, exited: funnel.branch.exited, held: funnel.branch.held } : null, checks: conflicts, frozen: seal?.frozen ?? false, frozenReasons: seal?.frozenWhy ?? [] }, data, refs, missing, stale, conflicts, limitations };
  const snapshotId = `vee1-${await sha256(canonicalJson(payload))}`;
  return freezeDeep({ ...payload, snapshotId }) as EvidenceSnapshot;
}

export function sourceReadiness(snapshot: EvidenceSnapshot): { canDebate: boolean; label: string; blockers: string[] } {
  const sourceState = (key: string) => snapshot.sources.find((source) => source.key === key)?.state ?? "NOT_REQUESTED";
  const requiredSources = snapshot.scope === "ticker"
    ? [["decision", "Bảng quyết định"], ["priceAction", "Price Action"]] as const
    : [["decision", "Bảng quyết định"]] as const;
  const unavailableSources = requiredSources
    .filter(([key]) => ["ERROR", "UNAVAILABLE", "NOT_REQUESTED", "LOADING"].includes(sourceState(key)))
    .map(([, label]) => `${label} chưa có dữ liệu nguồn hợp lệ.`);
  const blockers = [
    snapshot.scope === "ticker" && snapshot.tickerVerified !== true ? "Chưa xác minh mã cổ phiếu trong registry thị trường." : null,
    !snapshot.decisionSession ? "Thiếu phiên quyết định." : null,
    ...unavailableSources,
    snapshot.funnel.frozen ? "Engine đang đóng băng dữ liệu." : null,
    snapshot.stale.length ? "Có nguồn lệch phiên hoặc quá hạn." : null,
  ].filter((item): item is string => Boolean(item));
  const canDebate = blockers.length === 0;
  return { canDebate, label: !canDebate ? "Bị chặn" : snapshot.completeness === "COMPLETE" ? "Đủ dữ liệu" : "Có thể chạy · kết quả partial", blockers };
}

export function matchingTimingRow(timeline: BuyTimeline | null, ticker: string | null): TimelineRow | null {
  if (!timeline || !ticker) return null;
  return timeline.rows.find((row) => row.ticker.toUpperCase() === ticker.toUpperCase()) ?? null;
}
