import { describe, expect, it } from "vitest";
import type { EvidenceRef, ValidatedClaim } from "../../../../lib/evidenceBrain/types";
import type { EventRadarEvent } from "../../../../hooks/useEventRadar";
import { graphEdges } from "./LiveEvidenceGraph";
import { groupEvents } from "./LiveTimeline";
import { sessionDay } from "./roomView";

const ref: EvidenceRef = {
  id: "pa", domain: "price_action", subject: "FPT", fieldPath: "setup.entryReference", value: 132000, unit: "VND",
  status: "DERIVED", freshness: "CURRENT", asOf: "2026-11-20", source: "Price Action", sourceVersion: null,
  methodVersion: "v1", limitation: null, url: null,
};
const claim: ValidatedClaim = {
  id: "claim", ticker: "FPT", side: "BULL", asOf: ref.asOf, text: "Điều kiện theo PA", classification: "MODEL_INTERPRETATION",
  refs: ["pa", "unavailable"], supports: ["pa", "unavailable"], invalidates: [], numericAssertions: [], horizon: null,
  uncertainty: "HIGH", invalidation: null, missingData: [], validation: "STRUCTURAL_ONLY", validationNotes: [],
};

describe("Evidence Brain visualization", () => {
  it("draws actual snapshot refs and identifies relationships that passed structural checks only", () => {
    expect(graphEdges([ref], [claim])).toEqual([
      { from: "snapshot", to: "priceAction", relation: "context" },
      { from: "bull", to: "priceAction", relation: "support", preliminary: true },
    ]);
    expect(graphEdges([ref], [{ ...claim, validation: "MISREPRESENTED" }])).toHaveLength(1);
  });

  it("keeps the source with the most corroboration when merging duplicate news", () => {
    const press = { eventId: "A", clusterId: "C", firstSeenAt: "2026-11-20T16:58:00Z", corroborationCount: 3 } as EventRadarEvent;
    const duplicate = { ...press, eventId: "B", firstSeenAt: "2026-11-20T17:01:00Z", corroborationCount: 1 };
    expect(groupEvents([duplicate, press])).toEqual([press]);
    expect(sessionDay(duplicate.firstSeenAt)).toBe("2026-11-21");
  });
});
