import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeVnTradingCalendar } from "../cotuc/vn-trading-calendar";
import { addTradingSessions, reviewDates } from "./review";
import { obsidianNewUri, planUriExport } from "./uri";
import { buildDebateCanvas } from "./canvas";
import { buildVaultKit } from "./vaultKit";
import { buildBriefNote, buildDebateNote, buildJournalNote, buildQaNote } from "./note";
import { copyText, DEFAULT_PREFS, downloadFile, loadPrefs, openInObsidian, openUri, PREFS_KEY, randomSuffix, savePrefs } from "./adapters";
import { DECISION_DATA, lane, TICKER_DATA, tool } from "./testUtil";

const cal = makeVnTradingCalendar(null);
const NOW = Date.parse("2026-11-21T07:30:05Z");
const debate = {
  subject: "HPG", now: NOW, suffix: "ab12",
  bull: lane({ provider: "claude", model: "c", text: "Mua", tools: [tool("t1", "elite_ticker", TICKER_DATA)] }),
  bear: lane({ provider: "gemini", model: "g", text: "Bán", tools: [tool("t2", "elite_decision", DECISION_DATA)] }),
  judge: lane({ provider: "claude", model: "c", text: "Trọng tài" }),
};

describe("Hậu kiểm theo lịch giao dịch Việt Nam", () => {
  it("bỏ cuối tuần và lễ 30/4–1/5; mốc +5/+10/+20", () => {
    expect(addTradingSessions("2026-04-28", 5, cal)).toBe("2026-05-07"); // 29/4, (30/4 + 1/5 nghỉ), 4, 5, 6, 7/5
    expect(reviewDates("2026-11-20", [5, 10, 20], cal)).toEqual({ 5: "2026-11-27", 10: "2026-12-04", 20: "2026-12-18" });
  });
  it("qua Tết: mọi ngày trả về là phiên giao dịch và đúng số phiên", () => {
    const from = "2027-01-29", to = addTradingSessions(from, 20, cal);
    let n = 0; const DAY = 86_400_000;
    for (let d = Date.parse(`${from}T00:00:00Z`) / DAY + 1; d <= Date.parse(`${to}T00:00:00Z`) / DAY; d++) if (cal.isTradingDay(d)) n++;
    expect(n).toBe(20);
    expect(cal.isTradingDay(Date.parse(`${to}T00:00:00Z`) / DAY)).toBe(true);
  });
});

describe("Obsidian URI", () => {
  it("encode đúng (/ -> %2F, dấu cách -> %20); bỏ vault khi trống; không bao giờ append/prepend/overwrite", () => {
    const u = obsidianNewUri({ vault: "My Vault", folder: "Global Quanta/Elite 10", fileName: "2026 a.md" }, { content: "# Tiêu đề & x=1" });
    expect(u).toBe("obsidian://new?vault=My%20Vault&file=Global%20Quanta%2FElite%2010%2F2026%20a&content=%23%20Ti%C3%AAu%20%C4%91%E1%BB%81%20%26%20x%3D1");
    expect(obsidianNewUri({ folder: "", fileName: "n.md" }, { clipboard: true })).toBe("obsidian://new?file=n&clipboard=true");
    expect(u).not.toMatch(/append|prepend|overwrite|silent/);
  });
  it("vượt ngưỡng (đếm SAU encode, tiếng Việt nở nhiều lần) -> chế độ clipboard", () => {
    const t = { folder: "F", fileName: "n.md" };
    expect(planUriExport("ngắn", t).mode).toBe("content");
    const vi = "Đánh giá rủi ro ".repeat(80); // ~1.300 ký tự nhưng > 2.000 sau encode
    expect(vi.length).toBeLessThan(2000);
    const p = planUriExport(vi, t);
    expect(p.mode).toBe("clipboard"); expect(p.uri).toBe("obsidian://new?file=F%2Fn&clipboard=true");
  });
});

describe("Canvas JSON 1.0", () => {
  it("id duy nhất, toạ độ nguyên, cạnh trỏ đúng nút, màu preset, nút file trỏ ghi chú", () => {
    const c = buildDebateCanvas({ ...debate, bull: { ...debate.bull, text: "x".repeat(3000) } }, "Global Quanta/Elite 10/n.md");
    const ids = new Set(c.doc.nodes.map((n) => n.id));
    expect(ids.size).toBe(c.doc.nodes.length);
    for (const n of c.doc.nodes) for (const k of ["x", "y", "width", "height"] as const) expect(Number.isInteger(n[k])).toBe(true);
    for (const e of c.doc.edges) { expect(ids.has(e.fromNode)).toBe(true); expect(ids.has(e.toNode)).toBe(true); }
    expect(c.doc.nodes.find((n) => n.type === "file")?.file).toBe("Global Quanta/Elite 10/n.md");
    expect(c.doc.nodes.every((n) => !n.color || /^[1-6]$/.test(n.color))).toBe(true);
    expect(c.doc.nodes.find((n) => n.id === "bull")!.text!.length).toBeLessThan(1700);
    expect(c.fileName).toBe("2026-11-21 143005 - HPG - Tranh luận - ab12.canvas");
    expect(() => JSON.parse(c.json)).not.toThrow();
  });
});

describe("Bộ khởi tạo Vault", () => {
  it("bảng Dataview theo thư mục, có hậu kiểm đến hạn và 3 mẫu; thư mục có nháy kép được thoát", () => {
    const k = buildVaultKit();
    expect(k.fileName).toBe("Elite 10 · Bàn điều khiển.md");
    expect(k.markdown.match(/```dataview/g)!.length).toBeGreaterThanOrEqual(9);
    expect(k.markdown).toContain('FROM "Global Quanta/Elite 10"');
    expect(k.markdown).toContain("review_20 <= date(today)");
    for (const m of ["Mẫu - Mã.md", "Mẫu - Ngành.md", "Mẫu - Vĩ mô.md"]) expect(k.markdown).toContain(m);
    expect(buildVaultKit("a/../b").folder).toBe("Global Quanta/Elite 10");
  });
});

describe("Adapter trình duyệt", () => {
  let store: Record<string, string>;
  beforeEach(() => { store = {}; });
  afterEach(() => vi.restoreAllMocks());
  const mem = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } };

  it("cấu hình: lưu / đọc lại; dữ liệu hỏng hoặc storage bị chặn -> mặc định, không ném lỗi; không lưu nội dung ghi chú", () => {
    expect(savePrefs({ vault: " V ", folder: "Global Quanta/Elite 10", options: { includeQuestions: false, includeEvidence: true, includeLinks: true } }, mem)).toBe("ok");
    expect(loadPrefs(mem)).toEqual({ vault: "V", folder: "Global Quanta/Elite 10", options: { includeQuestions: false, includeEvidence: true, includeLinks: true } });
    expect(Object.keys(JSON.parse(store[PREFS_KEY])).sort()).toEqual(["folder", "options", "vault"]);
    store[PREFS_KEY] = "{hỏng"; expect(loadPrefs(mem)).toEqual(DEFAULT_PREFS);
    expect(loadPrefs({ getItem: () => { throw new Error("blocked"); } })).toEqual(DEFAULT_PREFS);
    expect(savePrefs(DEFAULT_PREFS, { setItem: () => { throw new Error("full"); } })).toBe("storage-unavailable");
    expect(savePrefs({ ...DEFAULT_PREFS, folder: "../x" }, mem)).toBe("invalid-name");
  });
  it("bộ nhớ tạm bị chặn / không có -> clipboard-denied; nội dung dài -> chép rồi mở URI clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) }, configurable: true });
    expect(await copyText("x")).toBe("clipboard-denied");
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.getAttribute("href") ?? ""); });
    expect(await openInObsidian("Đánh giá ".repeat(400), { folder: "F", fileName: "n.md" })).toBe("uri-clipboard");
    expect(write).toHaveBeenCalledTimes(1);
    expect(clicks).toEqual(["obsidian://new?file=F%2Fn&clipboard=true"]);
    expect(await openInObsidian("ngắn", { folder: "F", fileName: "n.md" })).toBe("uri-requested");
    expect(await openInObsidian("x", { folder: "../F", fileName: "n.md" })).toBe("invalid-name");
    expect(document.querySelectorAll('a[href^="obsidian:"]').length).toBe(0); // thẻ tạm đã gỡ
  });
  it("hậu tố ngẫu nhiên 4 ký tự an toàn cho tên tệp", () => {
    for (let i = 0; i < 20; i++) expect(randomSuffix()).toMatch(/^[a-z2-9]{4}$/);
  });
});

describe("0 request: mọi builder và adapter không gọi mạng", () => {
  it("fetch / XMLHttpRequest / sendBeacon / WebSocket đều không bị gọi", async () => {
    const fetchSpy = vi.fn(); const xhrOpen = vi.fn(); const beacon = vi.fn(); const ws = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.spyOn(XMLHttpRequest.prototype, "open").mockImplementation(xhrOpen);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    vi.stubGlobal("WebSocket", ws);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const d = buildDebateNote(debate);
    buildBriefNote({ brief: debate.judge, now: NOW, suffix: "b" });
    buildQaNote({ turns: [{ role: "user", text: "q" }, { role: "assistant", lanes: [debate.bull] }], now: NOW, suffix: "q" });
    buildJournalNote({ ...debate, calendar: cal });
    buildDebateCanvas(debate, "x.md"); buildVaultKit();
    await openInObsidian(d.markdown, { folder: d.folder, fileName: d.fileName });
    await copyText(d.markdown);
    expect(downloadFile(d.fileName, d.markdown)).toBe("download-started");
    openUri("obsidian://new?file=x");

    expect(fetchSpy).not.toHaveBeenCalled(); expect(xhrOpen).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled(); expect(ws).not.toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalledTimes(1); // chỉ blob cục bộ của tệp tải về
    vi.unstubAllGlobals();
  });
});
