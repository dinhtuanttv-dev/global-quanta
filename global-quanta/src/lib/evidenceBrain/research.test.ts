import { describe, expect, it } from "vitest";
import type { EventRadarEvent } from "../../hooks/useEventRadar";
import type { VolumeAnalysis } from "../../hooks/useVolumeAnalysis";
import type { EliteLiquidity } from "../../hooks/elite10/useEliteLiquidity";
import { buildResearchNote, compareResearchRuns, contentFingerprint, evaluateConfirmation, makeResearchRun, prepareProjection,
  revisionKnownAt, sourceManifest, visibleRevision, withoutCatalyst, type ResearchProjection } from "./research";
import { validResearchRun } from "./researchStore";

const marketSession = "2026-11-24";
const observedAt = "2026-11-24T03:17:00.000Z";
function event(overrides: Partial<EventRadarEvent> = {}): EventRadarEvent {
  return {
    eventId: "notice-01", clusterId: "cluster-01", title: "Công bố tiến độ", source: "ISSUER",
    sourceLabel: "Doanh nghiệp", sourceAuthority: "configured_official_feed", usageTermsStatus: "ok",
    verificationStatus: "official_source_not_crosschecked", summary: "", url: null, attachment: null,
    publishedAt: "2026-11-24T01:52:00.000Z", firstSeenAt: "2026-11-24T03:08:00.000Z", updatedAt: null,
    eventType: "DISCLOSURE", eventLabel: "Công bố", tickers: ["FPT"], entityMatch: "code",
    entityConfidence: 1, severity: "watch", severityScore: 1, corroboratingSources: [], corroborationCount: 1,
    documentCount: 1, sourceDocuments: [], revision: 1, reactionStatus: "pending", ...overrides,
  };
}

function projection(): ResearchProjection {
  const news = event();
  return {
    snap: {
      schemaVersion: "vee-1.0", snapshotId: "original", createdAt: observedAt, scope: "ticker", ticker: "FPT",
      tickerVerified: true, decisionSession: marketSession, portfolioKind: "ELITE_HL", completeness: "COMPLETE",
      sources: [{ key: "decision", label: "Elite HL", endpoint: "/api/elite/decision", state: "LOADED", asOf: marketSession, version: "HL", error: null, warnings: [] }],
      funnel: { mode: "DISPLAY", steps: [], membership: { state: "QUEUE", rank: null, reason: null, pz: null }, branch: null, checks: [], frozen: false, frozenReasons: [] },
      data: { decision: { queue: { code: "ready" } }, events: [{ eventId: news.eventId }] },
      refs: [{ id: "e01", domain: "catalyst", subject: "FPT", fieldPath: "events.notice-01.title", value: news.title,
        unit: null, status: "VERIFIED", freshness: "UNKNOWN", source: "Event Radar", asOf: news.publishedAt, sourceVersion: "1", methodVersion: null, limitation: null, url: null }],
      missing: [], stale: [], conflicts: [], limitations: [],
    },
    data: {
      pa: { ticker: "FPT", state: "TRIGGERED", trend: "bullish", asOf: marketSession, confirmed: true, barClosed: true,
        priceBasis: "adjusted", setup: { kind: "breakout", stateDate: marketSession, entryReference: 100, invalidationLevel: 95, target: null },
        blockers: [], patterns: [], venue: "HOSE", methodVersion: "pa-1", source: "Market Gateway", loading: false, error: null, tickerVerified: true },
      price: { priceBasis: "adjusted", bars: [{ date: marketSession, close: 103 }] },
      volume: { symbol: "FPT", asOf: marketSession, partialToday: false,
        today: { date: marketSession, avgVolume20: 100, volume: 123, rvolMode: "daily", rvol20: 1.23 },
        trend: { divergence: null, bars30: [] } } as unknown as VolumeAnalysis,
      liquidity: { ticker: "FPT", date: marketSession, liq: { tier: "L2" } } as EliteLiquidity,
      events: [news], timing: null, sector: null,
    },
  };
}

describe("lưu theo mốc quan sát và phản chứng", () => {
  it("báo thay đổi khi chỉ nguồn rủi ro đổi và bỏ qua giờ dựng lại quan sát", () => {
    const first = projection(), next = projection();
    next.snap.createdAt = "2026-11-24T03:19:00.000Z";
    next.snap.snapshotId = "new-id";
    expect(sourceManifest(next)).toBe(sourceManifest(first));
    next.snap.data.risk = { available: true, beta: 1.2 };
    expect(sourceManifest(next)).not.toBe(sourceManifest(first));
  });
  it("không mượn mốc biết của bản gốc cho revision được biết sau cutoff", () => {
    const corrected = event({ revision: 2, updatedAt: "2026-11-24T03:35:00.000Z" });
    expect(revisionKnownAt(corrected)).toBe(corrected.updatedAt);
    expect(visibleRevision(corrected, observedAt)).toBe(false);
    expect(visibleRevision(corrected, "2026-11-24T03:42:00.000Z")).toBe(true);
    expect(visibleRevision(event({ revision: 2 }), observedAt)).toBe(false);
    expect(visibleRevision(event({ firstSeenAt: "2026-11-24" }), observedAt)).toBe(false);
    expect(visibleRevision(event({ publishedAt: "2026-11-25" }), observedAt)).toBe(false);
    expect(visibleRevision(event({ firstSeenAt: "2026-02-30T00:00:00Z" }), observedAt)).toBe(false);
    const input = projection();
    input.data.events = [corrected];
    expect(prepareProjection(input).snap.refs).toEqual([]);
    expect(input.snap.refs).toHaveLength(1);
  });

  it("tạo fingerprint ổn định, giữ riêng lần lưu và không ghi đè nguồn khi mô phỏng", async () => {
    const input = projection();
    const same = projection();
    same.snap.createdAt = "2026-11-24T03:19:00.000Z";
    same.snap.snapshotId = "different-source-envelope";
    expect(await contentFingerprint(same)).toBe(await contentFingerprint(input));
    const base = await makeResearchRun("owner", input, [], null);
    const branch = await makeResearchRun("owner", input, [], "cluster-01");
    expect(base.id).not.toBe(branch.id);
    expect(branch.parentContentId).toBe(base.contentId);
    expect(branch.contentId).not.toBe(base.contentId);
    expect(withoutCatalyst(input, "cluster-01").snap.refs).toEqual([]);
    expect(branch.projection.data.events).toHaveLength(1);
    expect(branch.confirmation.checks.find((check) => check.id === "events")?.state).toBe("EXCLUDED");
    expect(compareResearchRuns(base, branch)).toEqual([{ label: "Xúc tác", before: "r1 · Công bố tiến độ", after: "Không có trong bản này" }]);
    const markdown = buildResearchNote(branch, observedAt).markdown;
    expect(markdown).toContain('review_status: "APPROVED_LOCAL"');
    expect(markdown).toContain("is_scenario: true");
    expect(markdown).not.toContain("Công bố tiến độ");
  });

  it("verifies the archived scope, source payload and confirmation before replay", async () => {
    const run = await makeResearchRun("owner", projection(), [], null);
    expect(await validResearchRun(run, "owner")).toEqual(run);
    expect(await validResearchRun(run, "other")).toBe(null);
    expect(await validResearchRun({ ...run, confirmation: { ...run.confirmation, result: "BLOCKED" } }, "owner")).toBe(null);
    const changed = structuredClone(run);
    changed.projection.data.events[0].revision = 7;
    expect(await validResearchRun(changed, "owner")).toBe(null);
  });
});

describe("phiếu xác nhận kỹ thuật", () => {
  it("giữ policy xác định, không làm thay đổi tư cách đang giữ và không bỏ qua PZ", () => {
    const input = projection();
    expect(evaluateConfirmation(input).result).toBe("CRITERIA_MET");
    input.snap.funnel.mode = "GATE";
    expect(evaluateConfirmation(input).result).toBe("INDETERMINATE");
    input.snap.funnel.membership.state = "PORTFOLIO_CORE";
    expect(evaluateConfirmation(input).result).toBe("CONTEXT");
    input.snap.funnel.frozen = true;
    expect(evaluateConfirmation(input).result).toBe("BLOCKED");
  });

  it("phân biệt nến mở, cơ sở giá sai và volume trong phiên thiếu baseline", () => {
    const input = projection();
    input.data.pa!.barClosed = false;
    expect(evaluateConfirmation(input).result).toBe("PENDING");
    input.data.price!.priceBasis = "raw";
    expect(evaluateConfirmation(input).result).toBe("INDETERMINATE");
    input.data.pa!.barClosed = true;
    input.data.price!.priceBasis = "adjusted";
    const volume = input.data.volume!;
    volume.partialToday = true;
    volume.today.rvolMode = "intraday";
    volume.today.rvolTimeAdjusted = 1.8;
    expect(evaluateConfirmation(input).reason).toContain("Thiếu nền RVOL intraday");
    volume.intraday = { sameTime: { ratio: 1.8, sessions: 20, asOfTime: "10:15" } } as VolumeAnalysis["intraday"];
    expect(evaluateConfirmation(input).result).toBe("PENDING");
    expect(evaluateConfirmation(withoutCatalyst(input, "cluster-01"), true).result).toBe("PENDING");
    volume.intraday!.sameTime!.asOfTime = "10:18";
    expect(evaluateConfirmation(input).result).toBe("INDETERMINATE");
  });

  it("detects inconsistent or rounded RVOL and a stale decision", () => {
    const input = projection();
    input.data.volume!.today.rvol20 = 5;
    expect(evaluateConfirmation(input).reason).toContain("không khớp");
    input.data.volume!.today.rvol20 = 1;
    input.data.volume!.today.volume = 100;
    expect(evaluateConfirmation(input).result).toBe("PENDING");
    input.snap.data.decision = { queue: { code: "ready" }, freshness: { sessionsBehind: 1 } };
    expect(evaluateConfirmation(input).result).toBe("INDETERMINATE");
  });
});
