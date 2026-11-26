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
