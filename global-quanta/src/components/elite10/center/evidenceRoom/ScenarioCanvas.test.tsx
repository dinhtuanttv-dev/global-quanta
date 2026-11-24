import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import { scenarioGateway } from "../../../../lib/evidenceBrain/researchGateway";
import { scenarioComparison, scenarioTargets, SCENARIO_VERSION, type ScenarioParent, type ScenarioRecord } from "../../../../lib/evidenceBrain/scenario";
import type { VolumeAnalysis } from "../../../../hooks/useVolumeAnalysis";
import type { ObsidianDesk } from "../obsidian/useObsidianDesk";
import ScenarioCanvas from "./ScenarioCanvas";

vi.mock("./researchAccount", () => ({ assertResearchAccount: vi.fn() }));
vi.mock("../../../../lib/evidenceBrain/researchGateway", () => ({ scenarioGateway: { list: vi.fn(), parent: vi.fn(), preview: vi.fn(), save: vi.fn(), get: vi.fn() } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("mở từ nút khối lượng, so sánh, phục hồi cùng snapshot và lưu riêng nhánh", async () => {
  const date = "2026-11-23", id = "vee1-test";
  const parent: ScenarioParent = { claims: [], claimCoverage: "none", projection: {
    snap: { schemaVersion: "vee-1.0", snapshotId: id, ticker: "FPT", tickerVerified: true, scope: "ticker", decisionSession: date, createdAt: date + "T09:00:00Z",
      portfolioKind: "ELITE_HL", completeness: "PARTIAL", sources: [], missing: [], conflicts: [], stale: [], limitations: [], refs: [], data: {},
      funnel: { mode: "DISPLAY", frozen: false, frozenReasons: [], checks: [], branch: null, steps: [], membership: { state: "QUEUE", rank: null, reason: null, pz: null } } },
    data: { sector: null, timing: null, liquidity: null, pa: null, events: [], price: { bars: [{ date, close: 100 }], priceBasis: "adjusted" },
      volume: { symbol: "FPT", asOf: date, partialToday: false, today: { date, rvolMode: "daily", volume: 100, avgVolume20: 80, rvol20: 1.25 },
        trend: { bars30: [{ date, close: 100, volume: 100 }], divergence: null } } as VolumeAnalysis },
  } };
  const wanted = scenarioTargets(parent.projection)[0];
  const compared = scenarioComparison(parent, wanted);
  const record: ScenarioRecord = { id: "test-id", version: SCENARIO_VERSION, digest: "test-digest", parent, target: wanted, savedAt: null,
    baseline: compared.baseline, confirmation: compared.confirmation };
  vi.mocked(scenarioGateway.list).mockResolvedValue([]);
  vi.mocked(scenarioGateway.parent).mockResolvedValue(parent);
  vi.mocked(scenarioGateway.preview).mockResolvedValue(record);
  vi.mocked(scenarioGateway.save).mockResolvedValue({ ...record, savedAt: parent.projection.snap.createdAt });
  const close = vi.fn();
  const download = vi.fn(), run = vi.fn();
  render(<ScenarioCanvas account="alice" ticker="FPT" entry={{ node: "volume", source: { kind: "lock", id } }} observation={parent.projection} desk={{ prefs: {}, download, run } as unknown as ObsidianDesk} onClose={close} />);
  const click = async (text: string) => { await act(async () => { fireEvent.click(screen.getByText(text)); }); };
  await click("Mở snapshot đang xem");
  expect(document.querySelectorAll("rect.volume-bar")).toHaveLength(1);
  await click("Thử trên canvas");
  expect(document.querySelectorAll("rect.volume-bar")).toHaveLength(0);
  expect(document.querySelector("table")?.textContent).toContain("Tạm loại");
  await click("Về bản gốc");
  expect(document.querySelectorAll("rect.volume-bar")).toHaveLength(1);
  await click("Xem mô phỏng");
  await click("Lưu kịch bản");
  expect(screen.getByText("Đã lưu kịch bản")).toBeTruthy();
  await click("Tải Markdown");
  expect(run.mock.calls[0][0].markdown).toContain("is_scenario: true");
  await click("Tải Canvas");
  expect(JSON.parse(download.mock.calls[0][1]).nodes[0].text).toContain("Snapshot cha " + id);
  expect(parent.projection.data.volume!.trend.bars30).toHaveLength(1);
  await click("Đóng ×");
  expect(close).toHaveBeenCalledOnce();
});
