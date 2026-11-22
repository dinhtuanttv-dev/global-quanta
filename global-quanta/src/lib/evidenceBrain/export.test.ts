import { describe, expect, it } from "vitest";
import { buildEvidenceBrainCanvas } from "./export";
import type { EvidenceSnapshot, ValidatedClaim } from "./types";

const snapshot: EvidenceSnapshot = {
  schemaVersion: "vee-1.0", snapshotId: "vee1-canvas-test", createdAt: "2026-11-22T10:00:00.000Z", scope: "ticker", ticker: "FPT", tickerVerified: true,
  decisionSession: "2026-11-21", portfolioKind: "ELITE_HL", completeness: "PARTIAL", sources: [],
  funnel: { mode: "GATE", steps: [], membership: { state: "PORTFOLIO_CORE", rank: 1, reason: null, pz: null }, branch: null, checks: [], frozen: false, frozenReasons: [] },
  data: {}, refs: [{ id: "ref:price_action:FPT:state", domain: "price_action", subject: "FPT", fieldPath: "state", value: "TRIGGERED", unit: null, status: "DERIVED", freshness: "CURRENT", asOf: "2026-11-21", source: "ta-series", sourceVersion: null, methodVersion: "pa-v1", limitation: null, url: null }],
  missing: [], stale: [], conflicts: [], limitations: [],
};

const claim: ValidatedClaim = {
  id: "same/id", side: "BULL", ticker: "FPT", asOf: "2026-11-21", text: "Engine reports TRIGGERED.", classification: "ENGINE_OUTPUT",
  refs: ["ref:price_action:FPT:state"], supports: [], invalidates: [], numericAssertions: [], horizon: null, uncertainty: "MEDIUM", invalidation: null,
  missingData: [], validation: "REFS_MATCHED", validationNotes: [],
};

describe("Evidence Brain Canvas graph", () => {
  it("connects the snapshot, each reference, claims, and the exported note without dangling edges", () => {
    const canvas = buildEvidenceBrainCanvas(snapshot, [claim], "Evidence/Note.md");
    const ids = new Set(canvas.nodes.map((node) => node.id));
    expect(canvas.edges.length).toBeGreaterThanOrEqual(3);
    expect(canvas.edges.every((edge) => ids.has(edge.fromNode) && ids.has(edge.toNode))).toBe(true);
    expect(canvas.edges.some((edge) => edge.label === "snapshot ref")).toBe(true);
    expect(canvas.edges.some((edge) => edge.label === "được trích dẫn")).toBe(true);
  });
});
