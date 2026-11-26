// 27/11/2026 (phương án A) — nút "Mùa vụ · Timeline" của Evidence Brain: bằng chứng timing.* nối về nút riêng; chọn đúng cửa sổ.
import { describe, expect, it } from "vitest";
import { graphEdges } from "./LiveEvidenceGraph";
import { matchingTimingRow } from "../../../../lib/evidenceBrain/snapshot";
import type { EvidenceRef, ValidatedClaim } from "../../../../lib/evidenceBrain/types";

const ref = (id: string, domain: EvidenceRef["domain"], fieldPath: string) => ({ id, domain, fieldPath } as EvidenceRef);

describe("Evidence Brain · nút Mùa vụ", () => {
  it("ref timing.* nối từ Snapshot tới nút Mùa vụ (không gộp vào Event Radar); trọng tài dẫn ref mùa vụ -> cạnh Mùa vụ → Trọng tài", () => {
    const refs = [ref("t1", "catalyst", "timing.netExpectancy"), ref("e1", "catalyst", "events.evt_1.title"), ref("d1", "decision", "funnel.membership")];
    const claims = [{ side: "JUDGE", validation: "REFS_MATCHED", refs: ["t1"], supports: [], invalidates: [] } as unknown as ValidatedClaim];
    const edges = graphEdges(refs, claims).map((e) => `${e.from}>${e.to}:${e.relation}`);
    expect(edges).toContain("snapshot>seasonal:context");
    expect(edges).toContain("snapshot>events:context");
    expect(edges).toContain("seasonal>judge:ai");
    expect(edges).not.toContain("events>judge:ai");
  });
  it("nhiều cửa sổ: ưu tiên đang mở, rồi sắp tới gần nhất, rồi đã qua gần nhất", () => {
    const row = (status: string, from: string) => ({ ticker: "IDC", status, entryFromDate: from } as never);
    const tl = (rows: unknown[]) => ({ rows } as never);
    expect(matchingTimingRow(tl([row("UPCOMING", "2027-03-11"), row("UPCOMING", "2027-01-22")]), "IDC")).toMatchObject({ entryFromDate: "2027-01-22" });
    expect(matchingTimingRow(tl([row("UPCOMING", "2027-01-22"), row("IN_WINDOW", "2026-11-20")]), "idc")).toMatchObject({ status: "IN_WINDOW" });
    expect(matchingTimingRow(tl([row("PASSED", "2026-05-01"), row("PASSED", "2026-09-01")]), "IDC")).toMatchObject({ entryFromDate: "2026-09-01" });
    expect(matchingTimingRow(tl([row("UPCOMING", "2027-01-22")]), "AAS")).toBeNull();
  });
});

import { layoutBoxes } from "./LiveEvidenceGraph";
describe("Evidence Brain v2 · bố cục cân theo cột nguồn", () => {
  it("Snapshot và Trọng tài nằm đúng tâm cột nguồn; hai phe AI đối xứng qua tâm; cột nguồn xếp chồng không chồng lấn", () => {
    const ids = ["snapshot", "bull", "bear", "decision", "events", "priceAction", "volume", "seasonal", "judge"] as const;
    const heights = { decision: 92, events: 80, priceAction: 86, volume: 78, seasonal: 96, snapshot: 64, bull: 70, bear: 70, judge: 72 };
    const b = layoutBoxes(ids.map((id) => ({ id })), heights);
    const src = ["decision", "events", "priceAction", "volume", "seasonal"].map((id) => b.get(id as never)!);
    for (let i = 1; i < src.length; i++) expect(src[i].y).toBeGreaterThanOrEqual(src[i - 1].y + src[i - 1].height);
    const mid = (src[src.length - 1].y + src[src.length - 1].height) / 2;
    const center = (id: string) => b.get(id as never)!.y + b.get(id as never)!.height / 2;
    expect(center("snapshot")).toBeCloseTo(mid, 5);
    expect(center("judge")).toBeCloseTo(mid, 5);
    expect(mid - center("bull")).toBeCloseTo(center("bear") - mid, 5);
    expect(b.get("snapshot")!.x + b.get("snapshot")!.width).toBeLessThan(b.get("bull")!.x);
    expect(b.get("decision")!.x + b.get("decision")!.width).toBeLessThan(b.get("judge")!.x);
  });
  it("thiếu nút mùa vụ (Canvas phản chứng) vẫn bố cục được", () => {
    const b = layoutBoxes([{ id: "snapshot" }, { id: "decision" }, { id: "judge" }], {});
    expect(b.size).toBe(3);
  });
});
