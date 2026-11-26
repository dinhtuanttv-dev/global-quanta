import { describe, expect, it } from "vitest";
import { buildBriefNote, buildDebateNote, buildJournalNote, buildQaNote, evidenceStatus, noteFileName, safeFolder, safeVault, vnClock } from "./note";
import { frontmatter, yamlScalar } from "./yaml";
import { DECISION_DATA, lane, parseFrontmatter, TICKER_DATA, tool } from "./testUtil";
import { makeVnTradingCalendar } from "../cotuc/vn-trading-calendar";

const NOW = Date.parse("2026-11-21T07:30:05Z"); // 14:30:05 giờ Việt Nam
const cal = makeVnTradingCalendar(null);
const bull = lane({ provider: "claude", model: "claude-opus-5-5", text: "## Lập luận mua\r\nHPG: biên lợi nhuận \"cải thiện\": 12% — xem [[liên kết có sẵn]]\n```js\nconst a = 1;\n```", tools: [tool("t1", "elite_ticker", TICKER_DATA), tool("t2", "macro_overview", { x: 1 })] });
const bear = lane({ provider: "gemini", model: "gemini-3-pro", text: "Rủi ro: ---\ntitle: giả\n--- vẫn là nội dung", tools: [tool("t3", "elite_decision", DECISION_DATA), tool("t4", "world_events", null, false)], untraceable: ["12,3%"] });
const judge = lane({ provider: "claude", model: "claude-opus-5-5", text: "Kết luận cân bằng.", tools: [tool("t5", "elite_ticker", TICKER_DATA)] });

describe("YAML an toàn", () => {
  it("quote mọi chuỗi, thoát \\ và \", bỏ xuống dòng / ký tự điều khiển; ngày ISO để trần", () => {
    expect(yamlScalar('a "b" \\ c\nd\u0007')).toBe('"a \\"b\\" \\\\ c d"');
    expect(yamlScalar("2026-11-20", { date: true })).toBe("2026-11-20");
    expect(yamlScalar("2026-11-20")).toBe('"2026-11-20"');
    expect(yamlScalar(Number.NaN)).toBe("null");
  });
  it("không chèn được khoá lạ qua giá trị; khoá phải snake_case", () => {
    const fm = frontmatter([["title", 'x"\nevil: true\n---']]);
    const { data } = parseFrontmatter(`${fm}\n`);
    expect(Object.keys(data)).toEqual(["title"]);
    expect(() => frontmatter([["Bad-Key", 1]])).toThrow();
  });
});

describe("Ghi chú Tranh luận", () => {
  const n = buildDebateNote({ subject: "hpg", bull, bear, judge, now: NOW, suffix: "ab12", trace: { bull: { startedAt: NOW - 140_000, host: "gateway", macroMode: "real", toolInputs: { t1: '{"ticker":"HPG"}' } }, judge: { finishedAt: NOW - 5_000 } } });
  const { data, body } = parseFrontmatter(n.markdown);
  it("frontmatter đúng schema 1, giờ Việt Nam, metadata chỉ từ nguồn có cấu trúc", () => {
    expect(data).toMatchObject({
      schema_version: 1, type: "elite10-ai-debate", date: "2026-11-21", exported_at: "2026-11-21T14:30:05+07:00", started_at: "2026-11-21T14:27:45+07:00",
      finished_at: "2026-11-21T14:30:00+07:00", data_as_of: "2026-11-20", scope: "ticker", ticker: "HPG", sector_icb: "1750", timeframe: "5-10 phiên",
      host: "gateway", macro_mode: "real", untraceable_count: 1, judge_input_clipped: false, portfolio_kind: "ELITE_HL", in_portfolio: true,
      source_url: "https://dinhtuan-ck.vercel.app/?tab=quyet-dinh",
    });
    expect(data.models).toEqual({ bull: "claude-opus-5-5", bear: "gemini-3-pro", judge: "claude-opus-5-5" });
    expect(data.tags).toEqual(["trading", "global-quanta/elite10", "global-quanta/ai-debate"]);
  });
  it("giữ NGUYÊN VĂN lời AI (chỉ chuẩn hoá xuống dòng), kể cả khối mã, liên kết có sẵn và '---' trong nội dung", () => {
    expect(body).toContain(bull.text.replace(/\r\n/g, "\n"));
    expect(body).toContain(bear.text);
    expect(body).toContain(judge.text);
  });
  it("bằng chứng theo allowlist: không lộ trường lạ / token; có dòng 'đã lược dữ liệu thô'", () => {
    expect(n.markdown).not.toContain("KHÔNG ĐƯỢC LỘ");
    expect(n.markdown).not.toContain("Bearer");
    expect(body).toContain("Đã lược bỏ dữ liệu thô");
    expect(body).toContain("`elite_ticker`");
    expect(body).toContain('{"ticker":"HPG"}');
    expect(body).toMatch(/world_events.*lỗi/);
  });
  it("liên kết chỉ từ thực thể có nguồn, nằm ở mục Liên kết, không chèn vào nguyên văn", () => {
    const links = body.slice(body.indexOf("## Liên kết"));
    expect(links).toContain("[[HPG]]"); expect(links).toContain("[[ICB 1750]]"); expect(links).toContain("[[Vĩ mô Việt Nam]]");
    expect(links).not.toContain("[[VJC]]"); // phạm vi mã -> không liệt kê cả danh mục
    expect(body.slice(0, body.indexOf("## Liên kết"))).not.toContain("[[HPG]]");
  });
  it("tên tệp an toàn, luôn có giây + hậu tố; thư mục mặc định", () => {
    expect(n.fileName).toBe("2026-11-21 143005 - HPG - Tranh luận - ab12.md");
    expect(n.folder).toBe("Global Quanta/Elite 10");
  });
});

describe("Trạng thái trung thực", () => {
  it("Dừng giữa chừng / làn rỗng -> partial; dự phòng -> fallback; model lấy từ lane.model, thiếu -> null", () => {
    expect(evidenceStatus([bull, { ...bear, error: "Đã dừng." }])).toBe("partial");
    expect(evidenceStatus([bull, { ...bear, text: "" }])).toBe("partial");
    expect(evidenceStatus([bull, { ...bear, done: false }])).toBe("partial");
    expect(evidenceStatus([bull, { ...bear, fallback: true }])).toBe("fallback");
    const n = buildDebateNote({ subject: null, bull: { ...bull, model: undefined }, bear: { ...bear, fallback: true }, judge, now: NOW, suffix: "x" });
    const { data } = parseFrontmatter(n.markdown);
    expect((data.models as Record<string, unknown>).bull).toBeNull();
    expect(data.evidence_status).toBe("fallback");
    expect(data.scope).toBe("portfolio");
    expect(data.ticker).toBeNull();
  });
  it("hai phe rỗng -> không có trọng tài, ghi rõ; phe dài > 6.000 ký tự -> judge_input_clipped", () => {
    const n = buildDebateNote({ subject: null, bull: lane({ provider: "claude", text: "" }), bear: lane({ provider: "gemini", text: "", error: "x" }), judge: null, now: NOW, suffix: "x" });
    expect(n.markdown).toContain("Không có phán quyết");
    expect(parseFrontmatter(n.markdown).data.evidence_status).toBe("partial");
    const long = buildDebateNote({ subject: "HPG", bull: { ...bull, text: "a".repeat(7000) }, bear, judge, now: NOW, suffix: "x" });
    expect(parseFrontmatter(long.markdown).data.judge_input_clipped).toBe(true);
    expect(long.markdown).toContain("Trọng tài chỉ đọc tối đa 740 ký tự");
  });
  it("mã chưa được công cụ xác nhận -> ticker null, phạm vi ghi rõ", () => {
    const n = buildDebateNote({ subject: "ZZZ", bull: lane({ provider: "claude", text: "x" }), bear: lane({ provider: "gemini", text: "y" }), judge: null, now: NOW, suffix: "x" });
    expect(parseFrontmatter(n.markdown).data.ticker).toBeNull();
    expect(n.markdown).toContain("chưa được công cụ xác nhận");
  });
});

describe("Bản tin, Hỏi đáp, Nhật ký", () => {
  it("Bản tin: phạm vi danh mục, liên kết cả danh mục và ngành", () => {
    const n = buildBriefNote({ brief: lane({ provider: "claude", model: "m", text: "Bản tin…", tools: [tool("a", "elite_decision", DECISION_DATA)] }), now: NOW, suffix: "q1" });
    const { data, body } = parseFrontmatter(n.markdown);
    expect(data).toMatchObject({ type: "elite10-ai-brief", data_as_of: "2026-11-20", timeframe: "phiên mới nhất", portfolio_kind: "ELITE_HL" });
    expect(body).toContain("[[HPG]]"); expect(body).toContain("[[VJC]]"); expect(body).toContain("[[ICB 5750]]");
    expect(n.fileName).toBe("2026-11-21 143005 - Elite 10 - Bản tin - q1.md");
  });
  it("Hỏi đáp: lượt cuối / toàn bộ; ẩn câu hỏi khi người dùng tắt; so sánh 2 mô hình không lẫn làn", () => {
    const turns = [
      { role: "user" as const, text: "Câu 1?" }, { role: "assistant" as const, lanes: [lane({ provider: "claude", model: "c", text: "Trả lời 1" })] },
      { role: "user" as const, text: "Câu 2 bí mật?" }, { role: "assistant" as const, lanes: [lane({ provider: "claude", model: "c", text: "C2" }), lane({ provider: "gemini", model: "g", text: "G2" })] },
    ];
    const all = buildQaNote({ turns, now: NOW, suffix: "z" }, "all");
    expect(all.markdown).toContain("Câu 1?"); expect(all.markdown).toContain("Trả lời 1"); expect(all.markdown.indexOf("C2")).toBeLessThan(all.markdown.indexOf("G2"));
    expect(parseFrontmatter(all.markdown).data.turns).toBe(2);
    const last = buildQaNote({ turns, now: NOW, suffix: "z", options: { includeQuestions: false } }, "last");
    expect(last.markdown).not.toContain("Câu 1?"); expect(last.markdown).not.toContain("Câu 2 bí mật?"); expect(last.markdown).toContain("## Lượt 2");
    expect(last.markdown).toContain("Câu hỏi đã được ẩn");
  });
  it("Nhật ký: mốc hậu kiểm +5/+10/+20 phiên theo lịch giao dịch VN, ô kết quả để trống, bối cảnh từ elite_*", () => {
    const n = buildJournalNote({ subject: "HPG", bull, bear, judge, now: NOW, suffix: "j1", calendar: cal, debateFileName: "2026-11-21 143005 - HPG - Tranh luận - ab12.md" });
    const { data, body } = parseFrontmatter(n.markdown);
    expect(data).toMatchObject({ type: "elite10-decision-journal", review_base: "2026-11-20", review_5: "2026-11-27", review_10: "2026-12-04", review_20: "2026-12-18", outcome_5: null, outcome_10: null, outcome_20: null, judge_was_right: null });
    for (const k of ["date", "data_as_of", "review_base", "review_5", "review_10", "review_20"]) expect(n.markdown).toMatch(new RegExp(`\\n${k}: \\d{4}-\\d{2}-\\d{2}\\n`)); // ngày để trần cho Dataview
    expect(body).toContain("Kết luận cân bằng.");
    expect(body).toMatch(/\| \[\[HPG\]\] \| 10 \| 9,9 \| 83 \| Dẫn dắt \| 27\.150 \| -8,1 \|/);
    expect(body).toContain("- [ ] Xem lại sau 20 phiên 📅 2026-12-18");
    expect(body).toContain("[[2026-11-21 143005 - HPG - Tranh luận - ab12]]");
  });
});

describe("Tên tệp, thư mục, Vault", () => {
  it("bỏ ký tự cấm; thư mục cấm '..' và ký tự cấm; Vault giới hạn độ dài", () => {
    expect(noteFileName(NOW, 'A/B:C*?"<>|', "Kind\\..", "!!")).toBe("2026-11-21 143005 - A B C - Kind . - 0000.md");
    expect(safeFolder("Global Quanta/Elite 10")).toBe("Global Quanta/Elite 10");
    expect(safeFolder("a/../b")).toBeNull(); expect(safeFolder("a:b")).toBeNull(); expect(safeFolder("")).toBe("");
    expect(safeVault("My Vault")).toBe("My Vault"); expect(safeVault("x".repeat(101))).toBeNull();
    expect(vnClock(Date.parse("2026-12-31T17:00:00Z")).date).toBe("2027-01-01");
  });
});
