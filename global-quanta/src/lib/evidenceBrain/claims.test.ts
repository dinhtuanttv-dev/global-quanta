import { describe, expect, it } from "vitest";
import { markClaimsWithExternalTools, parseAndValidateClaims } from "./claims";
import type { EvidenceSnapshot } from "./types";

const snapshot: EvidenceSnapshot = {
  schemaVersion: "vee-1.0", snapshotId: "vee1-test-snapshot", createdAt: "2026-11-22T10:00:00.000Z",
  scope: "ticker", ticker: "FPT", tickerVerified: true, decisionSession: "2026-11-21", portfolioKind: "ELITE_HL", completeness: "PARTIAL",
  sources: [], funnel: { mode: "GATE", steps: [], membership: { state: "ELIGIBLE", rank: 2, reason: null, pz: "PZ2" }, branch: null, checks: [], frozen: false, frozenReasons: [] },
  data: {}, refs: [{ id: "ref:decision:FPT:rank", domain: "decision", subject: "FPT", fieldPath: "rank", value: 2, unit: "rank", status: "VERIFIED", freshness: "CURRENT", asOf: "2026-11-21", source: "/api/elite/decision", sourceVersion: "e1", methodVersion: null, limitation: null, url: null }],
  missing: [], stale: [], conflicts: [], limitations: [],
};

const bundle = (snapshotId: string, value: number) => JSON.stringify({
  schemaVersion: "claims-1.0", snapshotId, limitations: [],
  claims: [{ id: "c1", side: "BULL", ticker: "FPT", asOf: "2026-11-21", text: `FPT rank ${value}.`, classification: "FACT", refs: ["ref:decision:FPT:rank"], supports: ["ref:decision:FPT:rank"], invalidates: [], numericAssertions: [{ refId: "ref:decision:FPT:rank", value, unit: "rank" }], horizon: "5 sessions", uncertainty: "MEDIUM", invalidation: null, missingData: [] }],
});

describe("Evidence Brain claim binding", () => {
  it("accepts only claims bound to this snapshot and verifies numeric values against the cited ref", () => {
    const accepted = parseAndValidateClaims(bundle(snapshot.snapshotId, 2), snapshot, "BULL");
    expect(accepted.ok).toBe(true);
    expect(accepted.claims[0]?.validation).toBe("SUPPORTED");

    const mismatch = parseAndValidateClaims(bundle(snapshot.snapshotId, 3), snapshot, "BULL");
    expect(mismatch.claims[0]?.validation).toBe("UNSUPPORTED");
    expect(mismatch.claims[0]?.validationNotes.join(" ")).toContain("không khớp value");
    const toolAssisted = markClaimsWithExternalTools(accepted, ["elite_ticker"]);
    expect(toolAssisted.claims[0]?.validation).toBe("UNKNOWN");
    expect(toolAssisted.summary.supported).toBe(0);
  });

  it("rejects another snapshot ID and unknown references", () => {
    expect(parseAndValidateClaims(bundle("vee1-another-snapshot", 2), snapshot, "BULL").ok).toBe(false);
    const badRef = bundle(snapshot.snapshotId, 2).replace("ref:decision:FPT:rank", "ref:unknown");
    expect(parseAndValidateClaims(badRef, snapshot, "BULL").claims[0]?.validation).toBe("UNSUPPORTED");
  });
});
