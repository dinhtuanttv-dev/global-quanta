import { describe, expect, it } from "vitest";
import { toLegacyConvergence } from "./useConvergenceFilter";
import { computeTAConsensus } from "../lib/ta-command-center/golden-filter/taConsensus";
import type { ConvergenceDoc, ConvergenceRow } from "./useConvergenceV2";

const row = (ticker: string, side: "buy" | "sell", score: number, phase = "spring"): ConvergenceRow => ({
  ticker, sector: "Test", status: "WATCH", grade: "B", side, date: "2026-10-08", metrics: { score, close: 1, side },
  components: [], zone: null, levels: [], liquidityCapacity: [], plan: null, version: "convergence-v2/H1",
  wyckoff: { engine: "v2", phase, wyckoffPhase: null, kind: null, cyclePhase: "C", rangeHigh: null, rangeLow: null, rangeStartDate: null, rangeEndDate: null, testsPassed: null, testsAvail: null, tranche: null, signals: [] },
});

describe("Golden / TA Consensus đọc Hợp lưu v2 (Gateway)", () => {
  it("chỉ phía mua, sắp theo điểm, đúng các trường cũ; TA Consensus giao thoa như trước", () => {
    const doc = { results: [row("AAA", "buy", 55), row("BBB", "sell", 90, "decline"), row("CCC", "buy", 80, "markup")] } as unknown as ConvergenceDoc;
    const legacy = toLegacyConvergence(doc);
    expect(legacy.map((r) => r.ticker)).toEqual(["CCC", "AAA"]);
    expect(legacy[0]).toMatchObject({ ticker: "CCC", wyckoffPhase: "markup", compositeScore: 80 });
    const golden = [{ ticker: "CCC", sector: "Test", pattern: "VCP", patternLabel: "VCP", tag: "x", confidenceScore: 90, status: "confirmed" as const }];
    const { results, intersectionCount } = computeTAConsensus(golden as never, legacy);
    expect(intersectionCount).toBe(1);
    expect(results[0]).toMatchObject({ ticker: "CCC", inGoldenFilter: true, inConvergenceFilter: true, convergenceScore: 80, wyckoffPhase: "markup" });
    expect(toLegacyConvergence(undefined)).toEqual([]);
  });
});
