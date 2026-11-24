import type { EliteLiquidity } from "../../hooks/elite10/useEliteLiquidity";
import type { EventRadarEvent } from "../../hooks/useEventRadar";
import type { VolumeAnalysis } from "../../hooks/useVolumeAnalysis";
import type { TimelineRow } from "../cotuc/buy-timeline";
import type { EliteRisk } from "../elite10/decisionTypes";
import { cleanLine, frontmatter } from "../obsidian/yaml";
import { canonicalJson, type PriceActionEvidence, type TimelinePriceEvidence } from "./snapshot";
import type { EvidenceSnapshot, EvidenceRef, ValidatedClaim } from "./types";

export const RESEARCH_POLICY = "research-confirmation-2";

export interface ResearchData {
  pa: PriceActionEvidence | null;
  price: TimelinePriceEvidence | null;
  volume: VolumeAnalysis | null;
  liquidity: EliteLiquidity | null;
  events: EventRadarEvent[];
  timing: TimelineRow | null;
  sector: string | null;
  risk?: EliteRisk | null;
  expectedClosedSession?: string | null;
}

export interface ResearchProjection { snap: EvidenceSnapshot; data: ResearchData }
type LayerId = "decision" | "priceAction" | "volume" | "liquidity" | "events";
type LayerState = "PASS" | "FAIL" | "MISSING" | "WAIT" | "CONTEXT" | "EXCLUDED";
type Result = "BLOCKED" | "NO_CONFIRMATION" | "INDETERMINATE" | "PENDING" | "CRITERIA_MET" | "CONTEXT";
export interface ResearchCheck { id: LayerId; state: LayerState; reason: string }
export interface Confirmation { result: Result; reason: string; checks: ResearchCheck[] }
export interface ResearchRun {
  schema: 1;
  id: string;
  contentId: string;
  account: string;
  savedAt: string;
  observedAt: string;
  policy: "research-confirmation-1" | typeof RESEARCH_POLICY;
  artifactId?: string;
  projection: ResearchProjection;
  omittedCluster: string | null;
  parentContentId: string | null;
  confirmation: Confirmation;
  claims: ValidatedClaim[];
}

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
const timestampWithZone = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i;
const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });
export const formatObservation = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" });
export const eventKey = (event: EventRadarEvent) => event.clusterId || event.eventId;

function exactTimestamp(value: string | null | undefined) {
  if (typeof value !== "string" || !timestampWithZone.test(value) || !validDay(value.slice(0, 10))) return null;
  return Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
}

function validDay(value: string) {
  return dateOnly.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function marketDay(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  if (validDay(value)) return value;
  const timestamp = exactTimestamp(value);
  if (timestamp === null) return null;
  const parts = Object.fromEntries(localDate.formatToParts(timestamp).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** firstSeenAt is for the event. An updated record needs its own observed revision timestamp. */
export function revisionKnownAt(event: EventRadarEvent): string | null {
  const first = exactTimestamp(event.firstSeenAt);
  const updated = exactTimestamp(event.updatedAt);
  if (first === null || !Number.isSafeInteger(event.revision) || event.revision < 1 ||
    (event.revision > 1 && (updated === null || updated <= first))) return null;
  return updated !== null && updated >= first ? event.updatedAt : event.firstSeenAt;
}

export function visibleRevision(event: EventRadarEvent, cutoff: string) {
  const known = exactTimestamp(revisionKnownAt(event));
  const observed = exactTimestamp(cutoff);
  const publication = exactTimestamp(event.publishedAt);
  return known !== null && observed !== null && known <= observed && (publication === null || publication <= observed) &&
    (!event.publishedAt || publication !== null || Boolean(validDay(event.publishedAt) && event.publishedAt <= (marketDay(cutoff) ?? "")));
}

export function prepareProjection(projection: ResearchProjection): ResearchProjection {
  const { snap, data } = projection;
  const eligible = new Set(data.events.filter((event) => visibleRevision(event, snap.createdAt)).map((event) => event.eventId));
  return withEvents(projection, data.events.filter((event) => eligible.has(event.eventId)));
}

function withEvents({ snap, data }: ResearchProjection, events: EventRadarEvent[]): ResearchProjection {
  const ids = new Set(events.map((event) => event.eventId));
  return {
    snap: {
      ...snap,
      data: { ...snap.data, events: (Array.isArray(snap.data.events) ? snap.data.events : []).filter((event) =>
        event !== null && typeof event === "object" && !Array.isArray(event) && typeof event.eventId === "string" && ids.has(event.eventId)) },
      refs: snap.refs.filter((ref) => !isEventRef(ref) || events.some((event) =>
        ref.fieldPath.startsWith(`events.${event.eventId}.`) &&
        ["title", "verificationStatus", "entityMatch", "corroboration"].includes(ref.fieldPath.slice(event.eventId.length + 8)) &&
        ref.sourceVersion === String(event.revision))),
    },
    data: { ...data, events },
  };
}

const isEventRef = (ref: EvidenceRef) => ref.domain === "catalyst" && ref.fieldPath.startsWith("events.");

export function withoutCatalyst(projection: ResearchProjection, cluster: string) {
  return withEvents(projection, projection.data.events.filter((event) => eventKey(event) !== cluster));
}

function check(id: LayerId, state: LayerState, reason: string): ResearchCheck {
  return { id, state, reason };
}

function decisionCheck(snap: EvidenceSnapshot, day: string | null, observedDay: string | null) {
  const member = snap.funnel.membership.state;
  const source = snap.sources.find((item) => item.key === "decision");
  if (!day || !observedDay || day > observedDay || snap.portfolioKind !== "ELITE_HL" || source?.state !== "LOADED" || marketDay(source.asOf) !== day)
    return check("decision", "MISSING", "Thiếu quyết định Elite HL hợp lệ cho phạm vi đang xem.");
  const decision = snap.data.decision;
  const raw = decision && typeof decision === "object" && !Array.isArray(decision) ? decision : null;
  const freshness = raw?.freshness;
  if (freshness && typeof freshness === "object" && !Array.isArray(freshness) &&
    (freshness.overdue === true || typeof freshness.sessionsBehind === "number" && freshness.sessionsBehind > 0))
    return check("decision", "MISSING", "Bảng quyết định đã quá hạn theo engine.");
  if (["BLOCKED", "EXITED_TODAY", "SECTOR_AGAINST"].includes(member))
    return check("decision", "FAIL", snap.funnel.membership.reason ?? "Engine chưa xác nhận tư cách theo Phễu.");
  if (member === "PORTFOLIO_CORE" || member === "PORTFOLIO_RUNNER")
    return check("decision", "CONTEXT", "Mã đang được giữ. Phiếu này trình bày bối cảnh vị thế.");
  if (member !== "QUEUE") return check("decision", "MISSING", "Chưa xác minh được đường vào mới từ dữ liệu Phễu.");
  const queue = raw?.queue;
  if (!queue || typeof queue !== "object" || Array.isArray(queue) || queue.code === "illiquid")
    return check("decision", "MISSING", "Cần hàng chờ giao dịch được đã xác thực từ engine.");
  if (snap.funnel.mode === "GATE" && snap.funnel.membership.pz !== "BUY_ZONE")
    return check("decision", snap.funnel.membership.pz && snap.funnel.membership.pz !== "UNKNOWN" ? "WAIT" : "MISSING", "Engine đang áp cổng PZ. Cần dữ liệu vùng mua theo phiên.");
  return check("decision", "PASS", "Engine ghi nhận mã trong hàng chờ hợp lưu giao dịch được.");
}

function priceActionCheck(data: ResearchData, ticker: string, day: string | null) {
  const { pa, price } = data;
  if (!day || !pa || pa.ticker !== ticker || marketDay(pa.asOf) !== day || !pa.priceBasis || /unknown/i.test(pa.priceBasis)
    || (price && price.priceBasis !== pa.priceBasis))
    return check("priceAction", "MISSING", "Cần đúng mã, phiên và cơ sở giá Price Action.");
  if (pa.state === "INVALIDATED" || pa.state === "EXPIRED")
    return check("priceAction", "FAIL", "Engine báo setup vô hiệu hoặc hết hiệu lực.");
  if (pa.state === "FORMING" || (pa.state === "TRIGGERED" && pa.barClosed !== true))
    return check("priceAction", "WAIT", "Chờ setup kích hoạt trên nến đã đóng.");
  if (pa.confirmed && pa.barClosed && pa.state === "TRIGGERED" && marketDay(pa.setup?.stateDate) === day)
    return check("priceAction", "PASS", "Engine đã xác nhận setup trên nến đóng cùng phiên quyết định.");
  return check("priceAction", "MISSING", "Chưa có xác nhận kỹ thuật đầy đủ từ engine.");
}

function volumeCheck(volume: VolumeAnalysis | null, ticker: string, day: string | null, observedDay: string | null, observedAt: string) {
  if (!volume || volume.symbol.toUpperCase() !== ticker)
    return check("volume", "MISSING", "Cần dữ liệu khối lượng đúng mã.");
  const partial = volume.partialToday;
  const volumeDay = marketDay(volume.today.date);
  if (!volumeDay || volumeDay !== (partial ? observedDay : day) || marketDay(volume.asOf) !== volumeDay)
    return check("volume", "MISSING", "Cần dữ liệu khối lượng đúng phiên và mốc quan sát.");
  if (partial) {
    const sameTime = volume.intraday?.sameTime;
    const rvol = volume.today.rvolTimeAdjusted;
    const knownTime = exactTimestamp(observedAt);
    const intradayTime = sameTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(sameTime.asOfTime) ? exactTimestamp(`${volumeDay}T${sameTime.asOfTime}:00+07:00`) : null;
    if (volume.today.rvolMode !== "intraday" || !sameTime || intradayTime === null || knownTime === null || intradayTime > knownTime ||
      !Number.isSafeInteger(sameTime.sessions) || sameTime.sessions < 1
      || typeof rvol !== "number" || !Number.isFinite(rvol) || rvol < 0 || rvol !== sameTime.ratio)
      return check("volume", "MISSING", "Thiếu nền RVOL intraday có thể đối chiếu tại cùng mốc.");
    return check("volume", "WAIT", `Đã đối chiếu RVOL intraday trên ${sameTime.sessions} phiên tại ${sameTime.asOfTime}. Chờ khối lượng ngày chốt.`);
  }
  const { avgVolume20, rvol20, volume: traded, rvolMode } = volume.today;
  if (rvolMode !== "daily" || typeof avgVolume20 !== "number" || !Number.isSafeInteger(avgVolume20) || avgVolume20 < 1
    || !Number.isFinite(traded) || traded < 0 || typeof rvol20 !== "number" || !Number.isFinite(rvol20) || rvol20 < 0)
    return check("volume", "MISSING", "Thiếu khối lượng ngày chốt hoặc bình quân 20 phiên hợp lệ.");
  // Gateway rounds the displayed baseline to whole shares and RVOL to two decimals.
  const minRatio = traded / (avgVolume20 + .5);
  const maxRatio = traded / (avgVolume20 - .5);
  if (rvol20 + .005000001 < minRatio || rvol20 - .005000001 > maxRatio)
    return check("volume", "MISSING", "RVOL công bố không khớp khối lượng và mẫu nền.");
  if (volume.trend.divergence)
    return check("volume", "WAIT", `Cần giải quyết phân kỳ được engine ghi nhận: ${volume.trend.divergence.label}.`);
  if (minRatio < 1 && maxRatio >= 1)
    return check("volume", "WAIT", "RVOL nằm sát ngưỡng 1×. Cần mẫu nền chưa làm tròn.");
  return minRatio >= 1
    ? check("volume", "PASS", `RVOL ngày ${rvol20}×, đạt mức nền 1× của chính sách nghiên cứu.`)
    : check("volume", "FAIL", `RVOL ngày ${rvol20}×, dưới nền 1× của chính sách nghiên cứu.`);
}

function liquidityCheck(liquidity: EliteLiquidity | null, ticker: string, day: string | null) {
  const tier = liquidity?.liq?.tier;
  if (!day || !liquidity || liquidity.ticker.toUpperCase() !== ticker || marketDay(liquidity.date) !== day || !tier)
    return check("liquidity", "MISSING", "Cần phân tầng thanh khoản đúng mã và phiên quyết định.");
  if (tier === "L1" || tier === "L2") return check("liquidity", "PASS", `${tier} theo vốn tham chiếu của engine.`);
  if (tier === "L3" || tier === "L4") return check("liquidity", "FAIL", `${tier} ngoài lớp thanh khoản của chính sách nghiên cứu.`);
  return check("liquidity", "MISSING", "Engine chưa phân tầng được thanh khoản.");
}

export function evaluateConfirmation({ snap, data }: ResearchProjection, omitted = false): Confirmation {
  if (snap.funnel.frozen || snap.conflicts.length) return { result: "BLOCKED", reason: "Data Guard hoặc bất biến Phễu đang chặn kết luận.", checks: [] };
  if (exactTimestamp(snap.createdAt) === null) return { result: "BLOCKED", reason: "Chưa xác định được mốc quan sát của snapshot.", checks: [] };
  if (!snap.ticker) return { result: "CONTEXT", reason: "Chọn mã để kiểm tra các điều kiện kỹ thuật theo cổ phiếu.", checks: [] };
  if (snap.tickerVerified !== true) return { result: "BLOCKED", reason: "Mã chưa được xác thực trong dữ liệu nguồn.", checks: [] };
  const day = marketDay(snap.decisionSession);
  const observedDay = marketDay(snap.createdAt);
  const expected = marketDay(data.expectedClosedSession ?? data.volume?.coverage?.expectedClosedSession);
  const checks = [
    decisionCheck(snap, day, observedDay),
    expected && day && expected > day
      ? check("priceAction", "WAIT", "Đã qua phiên đóng mới. Chờ liên kết nến ngày với Bảng quyết định của phiên mới.")
      : priceActionCheck(data, snap.ticker, day),
    expected && marketDay(data.volume?.coverage?.lastClosedSession ?? data.volume?.today.date) !== expected && !data.volume?.partialToday
      ? check("volume", "MISSING", `Dữ liệu ngày chưa có đủ phiên đóng ${expected}.`)
      : volumeCheck(data.volume, snap.ticker, day, observedDay, snap.createdAt),
    liquidityCheck(data.liquidity, snap.ticker, day),
    check("events", omitted ? "EXCLUDED" : "CONTEXT", omitted
      ? `Đã loại một cụm xúc tác. Còn ${data.events.length} cụm trong nhánh mô phỏng.`
      : `${data.events.length} cụm tin. Các nguồn dẫn lại cùng tài liệu không xác nhận tác động độc lập.`),
  ];
  if (checks[0].state === "CONTEXT") return { result: "CONTEXT", reason: checks[0].reason, checks };
  for (const [state, result] of [["FAIL", "NO_CONFIRMATION"], ["MISSING", "INDETERMINATE"], ["WAIT", "PENDING"]] as const) {
    const resultCheck = checks.find((entry) => entry.state === state);
    if (resultCheck) return { result, reason: resultCheck.reason, checks };
  }
  return { result: "CRITERIA_MET", reason: "Các lớp Phễu, Price Action, khối lượng ngày và thanh khoản của chính sách cục bộ đều đạt.", checks };
}

function compareKey(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function contentFingerprint({ snap, data }: ResearchProjection) {
  const { createdAt: _createdAt, snapshotId: _snapshotId, ...payload } = snap;
  const refs = [...payload.refs].sort((a, b) => compareKey(a.id, b.id));
  return researchDigest({ snapshot: { ...payload, refs }, projection: data });
}

async function researchDigest(value: unknown) {
  if (!globalThis.crypto?.subtle) throw new Error("Trình duyệt cần ngữ cảnh bảo mật để tạo SHA-256.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return `eb-research-${Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function expectedContentId(projection: ResearchProjection, omittedCluster: string | null, policy: ResearchRun["policy"]) {
  const baseId = await contentFingerprint(projection);
  const branchId = omittedCluster && policy !== "research-confirmation-1" ? await researchDigest({ parent: baseId, excluded: omittedCluster, policy }) : baseId;
  return { contentId: branchId, parentContentId: omittedCluster ? baseId : null };
}

export function expectedArtifactId(run: ResearchRun) {
  const { id, account, contentId, observedAt, savedAt, policy, confirmation, claims, projection } = run;
  return researchDigest({ id, account, contentId, observedAt, savedAt, policy, confirmation, claims, snapshotId: projection.snap.snapshotId });
}

export async function makeResearchRun(account: string, projection: ResearchProjection, claims: ValidatedClaim[], omittedCluster: string | null): Promise<ResearchRun> {
  const base = prepareProjection(structuredClone(projection));
  if (exactTimestamp(base.snap.createdAt) === null || !validDay(base.snap.decisionSession ?? "")) throw new Error("Snapshot thiếu mốc quan sát hoặc phiên quyết định.");
  if (omittedCluster && !base.data.events.some((event) => eventKey(event) === omittedCluster)) throw new Error("Cụm xúc tác không có trong snapshot gốc.");
  const ids = await expectedContentId(base, omittedCluster, RESEARCH_POLICY);
  const acceptedIds = new Set(base.snap.refs.map((ref) => ref.id));
  const run: ResearchRun = {
    schema: 1, account, id: crypto.randomUUID(), ...ids, savedAt: new Date().toISOString(), observedAt: base.snap.createdAt,
    projection: base, omittedCluster, policy: RESEARCH_POLICY,
    confirmation: evaluateConfirmation(omittedCluster ? withoutCatalyst(base, omittedCluster) : base, Boolean(omittedCluster)),
    claims: omittedCluster ? [] : structuredClone(claims.filter((claim) => (claim.ticker ?? null) === base.snap.ticker &&
      [...claim.refs, ...claim.supports, ...claim.invalidates, ...claim.numericAssertions.map((value) => value.refId)].every((refId) => acceptedIds.has(refId)))),
  };
  return { ...run, artifactId: await expectedArtifactId(run) };
}

export function compareResearchRuns(from: ResearchRun, to: ResearchRun) {
  if (from.account !== to.account || from.projection.snap.ticker !== to.projection.snap.ticker)
    throw new Error("Chỉ đối chiếu các phiên cùng tài khoản và phạm vi.");
  const keys = (run: ResearchRun) => new Map(run.projection.data.events
    .filter((event) => eventKey(event) !== run.omittedCluster)
    .map((event) => [eventKey(event), event]));
  const oldEvents = keys(from), newEvents = keys(to);
  const rows: { label: string; before: string; after: string }[] = [];
  for (const id of new Set([...oldEvents.keys(), ...newEvents.keys()])) {
    const old = oldEvents.get(id), next = newEvents.get(id);
    if (canonicalJson(old ?? null) === canonicalJson(next ?? null)) continue;
    const describe = (event: EventRadarEvent | undefined) => event ? `r${event.revision} · ${event.title}` : "Không có trong bản này";
    rows.push({ label: "Xúc tác", before: describe(old), after: describe(next) });
  }
  const refs = (run: ResearchRun) => new Map(run.projection.snap.refs.filter((ref) => !isEventRef(ref)).map((ref) => [ref.id, ref]));
  const oldRefs = refs(from), newRefs = refs(to);
  for (const key of new Set([...oldRefs.keys(), ...newRefs.keys()])) {
    const left = oldRefs.get(key), right = newRefs.get(key);
    if (canonicalJson(left ?? null) === canonicalJson(right ?? null)) continue;
    const describe = (ref?: EvidenceRef) => ref ? `${canonicalJson(ref.value).slice(0, 160)} ${ref.unit ?? ""} · ${ref.asOf ?? "chưa có mốc"} · ${ref.sourceVersion ?? ref.methodVersion ?? "chưa có phiên bản"}` : "Không có trong bản này";
    rows.push({ label: left?.fieldPath ?? right!.fieldPath, before: describe(left), after: describe(right) });
  }
  for (const side of ["BULL", "BEAR", "JUDGE"] as const) {
    const summarize = (run: ResearchRun) => run.claims.filter((claim) => claim.side === side)
      .map((claim) => `${claim.validation} · ${claim.text}`).join(" / ");
    const left = summarize(from), right = summarize(to);
    if (left !== right) rows.push({ label: `Luận điểm ${side}`, before: left || "Chưa lưu luận điểm", after: right || "Chưa lưu luận điểm" });
  }
  return rows;
}

export function buildResearchNote(run: ResearchRun, approvedAt: string | null, approvalOrigin: "local" | "gateway" = "local") {
  const { snap } = run.projection;
  const scenario = run.omittedCluster !== null;
  const escape = (value: string) => cleanLine(value).replace(/[<>\[\]\\`*_!~{}]/g, "\\$&");
  const label = snap.ticker ?? "Danh mục";
  const fileName = `Research - ${snap.ticker ?? "Portfolio"} - ${run.id}.md`;
  const markdown = [
    frontmatter([
      ["schema_version", "room-note-1"], ["note_kind", "session"], ["snapshot_id", snap.snapshotId], ["run_id", run.id],
      ["decision_session", snap.decisionSession], ["browser_observed_at", run.observedAt], ["research_content_id", run.contentId],
      ["parent_content_id", run.parentContentId], ["omitted_cluster", run.omittedCluster], ["policy_version", run.policy],
      ["review_status", !approvedAt ? "DRAFT" : approvalOrigin === "gateway" ? "APPROVED_GATEWAY" : "APPROVED_LOCAL"], ["reviewed_at", approvedAt],
      ["technical_status", run.confirmation.result], ["is_scenario", scenario], ["tags", ["global-quanta/evidence-brain"]],
    ], new Set(["decision_session"])),
    "", `# Phiên kiểm chứng · ${label}`, "",
    scenario ? "> Nhánh mô phỏng. Xúc tác đã loại khỏi phép so sánh." : "> Ghi nhận nguồn dữ liệu theo mốc quan sát của phiên đã lưu.",
    "", "## Phiếu xác nhận", "", escape(run.confirmation.reason), "",
    ...run.confirmation.checks.map((entry) => `- ${entry.id} · ${entry.state} · ${escape(entry.reason)}`),
    "", "## Nguồn và revision", "",
    ...snap.sources.map((source) => `- ${escape(source.label)} · ${source.state} · ${escape(source.asOf ?? "—")} · ${escape(source.version ?? "—")}`),
    "", ...run.projection.data.events.filter((event) => eventKey(event) !== run.omittedCluster).map((event) =>
      `- ${escape(event.title)} · r${event.revision} · biết revision ${escape(revisionKnownAt(event) ?? "—")} · ref ${escape(event.eventId)}`),
    "", "## Luận điểm kiểm tra cấu trúc", "",
    ...run.claims.map((claim) => `- ${claim.side} · ${claim.validation} · ${escape(claim.text)} · refs ${escape(claim.refs.join(", "))}`),
    "",
  ].join("\n");
  return { fileName, folder: "Inbox", markdown };
}
