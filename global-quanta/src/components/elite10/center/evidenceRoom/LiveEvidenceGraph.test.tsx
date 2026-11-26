// 27/11/2026 — đường 5 nguồn → Phán quyết: trích dẫn thật giữ cạnh bằng chứng; chưa trích dẫn = luồng "đưa vào trọng tài"; nguồn trống mờ.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "../../../../test/rtl-lite";
import LiveEvidenceGraph, { type RoomNode } from "./LiveEvidenceGraph";
import type { EvidenceRef, ValidatedClaim } from "../../../../lib/evidenceBrain/types";

afterEach(() => cleanup());
const node = (id: RoomNode["id"], muted = false): RoomNode => ({ id, label: id, badge: "X", tone: "neutral", title: id, muted });
const nodes = [node("snapshot"), node("bull"), node("bear"), node("decision"), node("events"), node("priceAction"), node("volume"), node("seasonal", true), node("judge")];
const refs = [{ id: "d1", domain: "decision", fieldPath: "funnel.membership" }, { id: "p1", domain: "price_action", fieldPath: "setup" }] as EvidenceRef[];
const judge = { side: "JUDGE", validation: "REFS_MATCHED", refs: ["d1"], supports: [], invalidates: [] } as unknown as ValidatedClaim;

describe("Evidence Brain · đường nguồn → Phán quyết", () => {
  it("nguồn đã được trọng tài trích dẫn: cạnh bằng chứng; 4 nguồn còn lại: luồng đưa vào (nguồn trống mờ, không xung)", () => {
    const { container } = render(<LiveEvidenceGraph nodes={nodes} refs={refs} claims={[judge]} onSelect={() => {}} />);
    const edge = (key: string) => container.querySelector(`[data-edge="${key}"]`);
    expect(edge("decision>judge")?.getAttribute("class")).toMatch(/\bai\b/);
    for (const id of ["events", "priceAction", "volume", "seasonal"]) expect(edge(`${id}>judge`)?.getAttribute("class")).toMatch(/\bfeed\b/);
    expect(container.querySelectorAll('[data-edge$=">judge"]').length).toBe(5);
    expect(edge("seasonal>judge")?.getAttribute("class")).toMatch(/\bmuted\b/);
    expect(edge("seasonal>judge")?.querySelector(".eb-edge-pulse")).toBeNull();
    expect(edge("volume>judge")?.querySelector(".eb-edge-pulse")).not.toBeNull();
  });
  it("số liên kết bằng chứng không tính luồng phiên", () => {
    const { container } = render(<LiveEvidenceGraph nodes={nodes} refs={refs} claims={[]} onSelect={() => {}} />);
    expect(container.querySelectorAll(".eb-edge.feed").length).toBe(5);
    expect(container.querySelectorAll(".eb-edge.context").length).toBe(2);
    expect(container.querySelectorAll(".eb-edge.flow").length).toBe(2);
  });
});
