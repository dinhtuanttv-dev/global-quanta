import { describe, expect, it } from "vitest";
import { markClaimsWithExternalTools, parseAndValidateClaims } from "./claims";
import type { EvidenceSnapshot } from "./types";
import { prepareSealedReview, sealedReviewPrompt } from "./sealedReview";

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
    expect(accepted.claims[0]?.validation).toBe("REFS_MATCHED");

    const mismatch = parseAndValidateClaims(bundle(snapshot.snapshotId, 3), snapshot, "BULL");
    expect(mismatch.claims[0]?.validation).toBe("UNSUPPORTED");
    expect(mismatch.claims[0]?.validationNotes.join(" ")).toContain("không khớp value");
    const toolAssisted = markClaimsWithExternalTools(accepted, ["elite_ticker"]);
    expect(toolAssisted.claims[0]?.validation).toBe("UNKNOWN");
    expect(toolAssisted.summary.refsMatched).toBe(0);
  });

  it("rejects another snapshot ID and unknown references", () => {
    expect(parseAndValidateClaims(bundle("vee1-another-snapshot", 2), snapshot, "BULL").ok).toBe(false);
    const badRef = bundle(snapshot.snapshotId, 2).replace("ref:decision:FPT:rank", "ref:unknown");
    expect(parseAndValidateClaims(badRef, snapshot, "BULL").claims[0]?.validation).toBe("UNSUPPORTED");
  });

  it("does not let an unrelated assertion validate an extra number in the prose", () => {
    const fabricated = bundle(snapshot.snapshotId, 2).replace("FPT rank 2.", "FPT rank 2, return 99%.");
    expect(parseAndValidateClaims(fabricated, snapshot, "BULL").claims[0]?.validation).toBe("UNSUPPORTED");
    expect(parseAndValidateClaims(bundle(snapshot.snapshotId, 2).replace("FPT rank 2.", "FPT rank 200%."), snapshot, "BULL").claims[0]?.validation).toBe("UNSUPPORTED");
  });

  it("packs the same evidence into all three roles within the gateway's 2,000 character limit", () => {
    const source = snapshot.refs[0];
    const huge: EvidenceSnapshot = {
      ...snapshot, snapshotId: `vee1-${"a".repeat(64)}`, data: { payload: "PRIVATE-NOISE".repeat(4000) },
      refs: [source, { ...source, id: "stale", freshness: "STALE" }, ...Array.from({ length: 300 }, (_, index) =>
        ({ ...source, id: `ref:decision:FPT:${"row".repeat(18)}:${index}`, value: { foo: 1, bar: "observed" } }))],
    };
    const packet = prepareSealedReview(huge);
    const validated = parseAndValidateClaims(bundle(huge.snapshotId, 2), packet.snapshot, "BULL");
    expect(validated.summary.refsMatched).toBe(1);
    expect(packet.snapshot.refs.map((ref) => ref.id)).not.toContain("stale");
    for (const role of ["BULL", "BEAR", "JUDGE"] as const) {
      const text = sealedReviewPrompt(packet, role, [validated, validated]);
      expect(text.length).toBeLessThanOrEqual(2000);
      expect(text).not.toContain("PRIVATE-NOISE");
      expect(text.endsWith(packet.lines.join("\n"))).toBe(true);
    }
  });

  it("requires the claim's as-of and rejects duplicate claim IDs or unknown schema fields", () => {
    const missingAsOf = bundle(snapshot.snapshotId, 2).replace('"asOf":"2026-11-21"', '"asOf":null');
    expect(parseAndValidateClaims(missingAsOf, snapshot, "BULL").claims[0]?.validation).toBe("UNSUPPORTED");

    const duplicate = JSON.parse(bundle(snapshot.snapshotId, 2)) as { claims: Record<string, unknown>[] };
    duplicate.claims.push({ ...duplicate.claims[0] });
    expect(parseAndValidateClaims(JSON.stringify(duplicate), snapshot, "BULL").ok).toBe(false);

    const unknownField = JSON.parse(bundle(snapshot.snapshotId, 2)) as { claims: Record<string, unknown>[] };
    unknownField.claims[0].modelConfidence = 0.99;
    expect(parseAndValidateClaims(JSON.stringify(unknownField), snapshot, "BULL").ok).toBe(false);
  });
});
