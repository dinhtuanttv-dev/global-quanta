import { describe, expect, it } from "vitest";
import { sourceReadiness } from "./snapshot";
import type { EvidenceSnapshot, SnapshotSource } from "./types";

const source = (key: string, state: SnapshotSource["state"] = "LOADED"): SnapshotSource => ({ key, label: key, endpoint: `/api/${key}`, state, asOf: "2026-11-21", version: "v1", error: null, warnings: [] });
const snapshot: EvidenceSnapshot = {
  schemaVersion: "vee-1.0", snapshotId: "vee1-readiness-test", createdAt: "2026-11-22T10:00:00.000Z", scope: "ticker", ticker: "FPT", tickerVerified: true,
  decisionSession: "2026-11-21", portfolioKind: "ELITE_HL", completeness: "COMPLETE", sources: [source("decision"), source("priceAction")],
  funnel: { mode: "GATE", steps: [], membership: { state: "PORTFOLIO_CORE", rank: 1, reason: null, pz: null }, branch: null, checks: [], frozen: false, frozenReasons: [] },
  data: {}, refs: [], missing: [], stale: [], conflicts: [], limitations: [],
};

describe("Evidence Brain source readiness", () => {
  it("requires an available decision source and, for a ticker review, Price Action", () => {
    expect(sourceReadiness(snapshot).canDebate).toBe(true);
    const unavailablePa = { ...snapshot, sources: [source("decision"), source("priceAction", "ERROR")] };
    expect(sourceReadiness(unavailablePa).canDebate).toBe(false);
    const unavailableDecision = { ...snapshot, sources: [source("decision", "ERROR"), source("priceAction")] };
    expect(sourceReadiness(unavailableDecision).canDebate).toBe(false);
  });

  it("does not turn a stale or frozen snapshot into an AI review", () => {
    expect(sourceReadiness({ ...snapshot, stale: ["risk stale"] }).canDebate).toBe(false);
    expect(sourceReadiness({ ...snapshot, funnel: { ...snapshot.funnel, frozen: true } }).canDebate).toBe(false);
  });

  it("does not review an inconsistent decision funnel", () => {
    expect(sourceReadiness({ ...snapshot, completeness: "CONFLICT", conflicts: ["Hợp lưu vượt tầng 1"] }).canDebate).toBe(false);
  });
});
