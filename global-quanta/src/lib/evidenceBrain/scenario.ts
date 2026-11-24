import { canonicalJson } from "./snapshot";
import { evaluateConfirmation, eventKey, summarizeConfirmation, visibleRevision, withoutCatalyst, type Confirmation, type ResearchProjection } from "./research";
import type { EvidenceRef, ValidatedClaim } from "./types";

export const SCENARIO_VERSION = "canvas-scenario-1";
export type ScenarioKind = "EVENT_CLUSTER" | "VOLUME_LAYER" | "PA_TRIGGER";
export interface ScenarioTarget { kind: ScenarioKind; key: string; label: string }
export interface ScenarioParent {
  projection: ResearchProjection;
  claims: ValidatedClaim[];
  claimCoverage: "full" | "partial" | "none";
}
export interface ScenarioRecord {
  version: typeof SCENARIO_VERSION;
  id: string;
  digest: string;
  parent: ScenarioParent;
  target: ScenarioTarget;
  baseline: Confirmation;
  confirmation: Confirmation;
  savedAt: string | null;
  approvedAt?: string;
}
export type ParentRef = { kind: "lock" | "run" | "scenario"; id: string };
export type ScenarioSummary = { id: string; target: ScenarioTarget; ticker: string; observedAt: string; savedAt: string };

/** Freeze visibility by event revision before grouping related news. */
export function scenarioEvents(events: ResearchProjection["data"]["events"], cutoff: string) {
  const latest = new Map<string, typeof events[number]>();
  for (const event of events) {
    if (!visibleRevision(event, cutoff)) continue;
    const previous = latest.get(event.eventId);
    if (!previous || event.revision > previous.revision) latest.set(event.eventId, event);
  }
  return [...latest.values()];
}

export function scenarioTargets({ snap, data }: ResearchProjection): ScenarioTarget[] {
  if (!snap.tickerVerified || !snap.ticker) return [];
  const clusters = new Map<string, ScenarioTarget>();
  for (const item of scenarioEvents(data.events, snap.createdAt)) {
    const key = eventKey(item);
    if (!clusters.has(key)) clusters.set(key, { kind: "EVENT_CLUSTER", key, label: item.title });
  }
  const targets = [...clusters.values()];
  if (data.volume?.symbol.toUpperCase() === snap.ticker)
    targets.push({ kind: "VOLUME_LAYER", key: data.volume.asOf, label: "Khối lượng · " + data.volume.asOf });
  const pa = data.pa;
  if (pa?.ticker === snap.ticker && pa.state === "TRIGGERED" && pa.barClosed && pa.setup?.id)
    targets.push({ kind: "PA_TRIGGER", key: canonicalJson([pa.setup.id, pa.setup.stateDate, pa.methodVersion]), label: pa.setup.kind + " · " + pa.setup.stateDate });
  return targets;
}

function claimRefs(claim: ValidatedClaim) {
  return [...new Set([...claim.refs, ...claim.supports, ...claim.invalidates, ...claim.numericAssertions.map((item) => item.refId)])];
}

/** Relations between fields actually produced by the room's PA adapter. */
function removedPriceRefs(refs: EvidenceRef[]) {
  const fields = refs.filter((ref) => ref.domain === "price_action");
  const roots = fields.filter((ref) => !["barClosed", "trend", "priceBasis", "state", "confirmed"].includes(ref.fieldPath));
  const byField = new Map(fields.map((ref) => [ref.fieldPath, ref.id]));
  const removed = new Set(roots.map((ref) => ref.id));
  const dependencies = new Map<string, string[]>();
  for (const [field, inputs] of [["state", ["setup"]], ["confirmed", ["state", "setup", "trend", "barClosed", "priceBasis"]]] as const) {
    const id = byField.get(field);
    if (!id) continue;
    const lost = inputs.flatMap((input) => {
      const dependency = byField.get(input);
      return dependency && removed.has(dependency) ? [dependency] : [];
    });
    // The corresponding structured setup was excluded even in archives missing its standalone ref.
    removed.add(id);
    dependencies.set(id, lost);
  }
  return { removed, dependencies };
}

export function scenarioComparison(parent: ScenarioParent, choice: Pick<ScenarioTarget, "kind" | "key">) {
  const base = parent.projection;
  const target = scenarioTargets(base).find((item) => item.kind === choice.kind && item.key === choice.key);
  if (!target) throw new Error("Bằng chứng đã chọn không có trong snapshot này.");
  const baseline = evaluateConfirmation(base);
  let projection: ResearchProjection;
  const layer = target.kind === "EVENT_CLUSTER" ? "events" : target.kind === "VOLUME_LAYER" ? "volume" : "priceAction";
  let dependentLiquidity = false;
  let lostDependencies = new Map<string, string[]>();
  if (target.kind === "EVENT_CLUSTER") {
    projection = withoutCatalyst(base, target.key);
  } else {
    const volume = target.kind === "VOLUME_LAYER";
    // LQ-v1 is sealed independently by the liquidity endpoint. Unknown provenance is not evidence of independence.
    const independentLiquidity = base.snap.refs.some((ref) => ref.fieldPath === "liquidity" &&
      ref.source === "/api/elite/liquidity/" + base.snap.ticker && ref.sourceVersion && ref.sourceVersion === base.data.liquidity?.rules.version);
    dependentLiquidity = Boolean(volume && base.data.liquidity && !independentLiquidity);
    const priceRefs = volume ? null : removedPriceRefs(base.snap.refs);
    if (priceRefs) lostDependencies = priceRefs.dependencies;
    const keep = (ref: EvidenceRef) => volume ? ref.domain !== "volume" && !(dependentLiquidity && ref.fieldPath === "liquidity")
      : !priceRefs!.removed.has(ref.id);
    const data = { ...base.data, expectedClosedSession: base.data.expectedClosedSession ?? base.data.volume?.coverage?.expectedClosedSession ?? null };
    const snapshotData = { ...base.snap.data };
    if (volume) {
      data.volume = null;
      snapshotData.volume = null;
      if (dependentLiquidity) { data.liquidity = null; snapshotData.liquidity = null; }
    } else if (data.pa) {
      data.pa = { ...data.pa, setup: null, state: "UNKNOWN", confirmed: false, patterns: [], blockers: [] };
      snapshotData.priceAction = JSON.parse(JSON.stringify(data.pa));
    }
    projection = { data, snap: { ...base.snap, data: snapshotData, refs: base.snap.refs.filter(keep) } };
  }
  const evaluated = evaluateConfirmation(projection, layer === "events");
  const checks = evaluated.checks.map((check) => {
    if (check.id === layer) return { ...check, state: "EXCLUDED" as const, reason: "Tạm loại trong mô phỏng · " + target.label };
    if (dependentLiquidity && check.id === "liquidity") return { ...check, state: "MISSING" as const, reason: "Chưa xác minh được nguồn thanh khoản độc lập với lớp khối lượng." };
    return check;
  });
  const confirmation = checks.length ? summarizeConfirmation(checks) : evaluated;
  const remaining = new Set(projection.snap.refs.map((ref) => ref.id));
  const removedRefs = base.snap.refs.filter((ref) => !remaining.has(ref.id));
  const removedIds = new Set(removedRefs.map((ref) => ref.id));
  const claims = parent.claims.map((claim) => {
    const ids = claimRefs(claim);
    return { claim, lost: ids.filter((id) => removedIds.has(id)), kept: ids.filter((id) => remaining.has(id)) };
  });
  const supported = claims.filter((item) => !item.lost.length && item.kept.length && item.claim.validation === "REFS_MATCHED").map((item) => item.claim);
  return { target, baseline, confirmation, projection, removedRefs, lostDependencies, claims, supported };
}
