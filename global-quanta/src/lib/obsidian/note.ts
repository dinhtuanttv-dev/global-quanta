// L1 — dựng ghi chú Markdown cho Tranh luận / Bản tin / Hỏi đáp / Nhật ký quyết định (đặc tả 03). Hàm THUẦN.
// Nguyên tắc: lời AI giữ NGUYÊN VĂN (chỉ chuẩn hoá xuống dòng); metadata chỉ từ nguồn có cấu trúc, thiếu -> null.
import {
  collectEvidence, confirmedTicker, decisionSummary, linksFor, sectorOf, tickerSummary, type Evidence,
} from "./entities";
import { reviewDates } from "./review";
import {
  DEFAULT_OPTIONS, OBSIDIAN_DEFAULT_FOLDER, REVIEW_SESSIONS, SCHEMA_VERSION, SOURCE_URL, TOOL_INPUT_MAX,
  type BriefInput, type DebateInput, type EvidenceStatus, type ExportOptions, type JournalInput, type LaneLike, type LaneTrace,
  type NoteOut, type NoteType, type QaInput,
} from "./types";
import { cleanLine, frontmatter, type YamlValue } from "./yaml";

export const JUDGE_INPUT_MAX = 740; // = JUDGE_MAX trong EliteAiRoom.tsx (26/11/2026: giới hạn Gateway 2.000 ký tự -> trọng tài chế độ nhanh đọc tối đa 740 ký tự mỗi phe)
const DISCLAIMER = "> Tham khảo định lượng — không phải khuyến nghị đầu tư. AI chỉ giải thích và phản biện số liệu từ công cụ.";
const PROVIDER_VI = { claude: "GPT", gemini: "Gemini" } as const;

// ---------------------------------------------------------------- thời gian (giờ Việt Nam, +07:00)
const pad = (n: number) => String(n).padStart(2, "0");
export function vnClock(ms: number) {
  const d = new Date(ms + 7 * 3_600_000);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const hms = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return { date, hms, iso: `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+07:00` };
}
const isoOrNull = (ms?: number | null) => (typeof ms === "number" && Number.isFinite(ms) ? vnClock(ms).iso : null);

// ---------------------------------------------------------------- tên tệp & thư mục
// eslint-disable-next-line no-control-regex
const BAD_NAME = /[\\/:*?"<>|\u0000-\u001F]/g;
/** Thư mục Vault: cho phép "/", cấm "..", ký tự cấm của hệ điều hành, ký tự điều khiển; tối đa 100 ký tự. null = không hợp lệ. */
export function safeFolder(input: string | null | undefined): string | null {
  const s = (input ?? OBSIDIAN_DEFAULT_FOLDER).trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/|\/$/g, "");
  if (!s) return "";
  // eslint-disable-next-line no-control-regex
  if (s.length > 100 || /[:*?"<>|\u0000-\u001F]/.test(s) || s.split("/").some((p) => p === ".." || p === "." || !p.trim())) return null;
  return s;
}
export function safeVault(input: string | null | undefined): string | null {
  const s = (input ?? "").trim();
  // eslint-disable-next-line no-control-regex
  if (s.length > 100 || /[\u0000-\u001F]/.test(s)) return null;
  return s;
}
export function noteFileName(now: number, who: string, kind: string, suffix: string, ext = "md") {
  const c = vnClock(now);
  const part = (x: string) => cleanLine(x).replace(BAD_NAME, " ").replace(/\.{2,}/g, ".").replace(/\s{2,}/g, " ").trim() || "—";
  const sfx = suffix.replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "0000";
  return `${c.date} ${c.hms} - ${part(who)} - ${part(kind)} - ${sfx}.${ext}`;
}

// ---------------------------------------------------------------- trạng thái & nội dung làn
const norm = (s: string) => s.replace(/\r\n?/g, "\n");
export function laneState(l: LaneLike | null | undefined): "missing" | "running" | "partial" | "fallback" | "complete" {
  if (!l) return "missing";
  if (!l.done) return "running";
  if (l.error || !l.text.trim()) return "partial";
  return l.fallback ? "fallback" : "complete";
}
export function evidenceStatus(lanes: (LaneLike | null | undefined)[]): EvidenceStatus {
  const st = lanes.filter(Boolean).map(laneState);
  if (st.some((s) => s === "partial" || s === "running")) return "partial";
  return st.some((s) => s === "fallback") ? "fallback" : "complete";
}
const opts = (o?: Partial<ExportOptions>): ExportOptions => ({ ...DEFAULT_OPTIONS, ...(o ?? {}) });

function laneBlock(title: string, l: LaneLike | null | undefined, level = "##"): string[] {
  if (!l) return [`${level} ${title}`, "", "_Chưa có._", ""];
  const out = [`${level} ${title}${l.model ? ` · ${cleanLine(l.model)}` : ""}`, ""];
  const st = laneState(l);
  if (st === "running") out.push("> [!warning] Đang chạy — nội dung chưa hoàn tất.", "");
  if (l.fallback) out.push("> [!note] Trả lời bởi mô hình dự phòng.", "");
  for (const n of l.notices) out.push(`> [!warning] ${cleanLine(n)}`, "");
  out.push(l.text.trim() ? norm(l.text) : "_(không có nội dung)_", "");
  if (l.error) out.push(`> [!danger] ${cleanLine(l.error)}`, "");
  if (l.untraceable.length) out.push(`> [!info] ${l.untraceable.length} con số không truy được tới dữ liệu công cụ: ${l.untraceable.slice(0, 10).map(cleanLine).join(", ")}`, "");
  return out;
}

const cell = (s: string) => cleanLine(s).replace(/\|/g, "\\|");
function toolSummary(name: string, data: unknown): string {
  if (name === "elite_decision") {
    const d = decisionSummary(data); if (!d) return "—";
    return `phiên ${d.date ?? "—"} · ${d.portfolioKind ?? "—"} · ${d.rows.length} mã · tiền mặt ${d.cashPct ?? "—"}%`;
  }
  if (name === "elite_ticker") {
    const t = tickerSummary(data); if (!t) return "—";
    return `${t.ticker} · phiên ${t.date ?? "—"} · hạng ${t.rank ?? "—"} · ${t.inPortfolio == null ? "—" : t.inPortfolio ? "trong danh mục" : "ngoài danh mục"}`;
  }
  return "—";
}
function evidenceBlock(ev: Evidence, traces: Record<string, LaneTrace | undefined>): string[] {
  if (!ev.tools.length) return ["## Bằng chứng công cụ", "", "_Không có lệnh gọi công cụ._", ""];
  const out = ["## Bằng chứng công cụ", "", "| Làn | Công cụ | Đầu vào (rút gọn) | Kết quả | Tóm tắt |", "|---|---|---|---|---|"];
  for (const { lane, tool } of ev.tools) {
    const input = traces[lane]?.toolInputs?.[tool.id];
    const res = !tool.result ? "chưa có" : tool.result.ok ? "ok" : `lỗi${tool.result.error ? `: ${tool.result.error}` : ""}`;
    out.push(`| ${cell(lane)} | \`${cell(tool.name)}\` | ${input ? cell(input.slice(0, TOOL_INPUT_MAX)) : "—"} | ${cell(res)} | ${cell(tool.result?.ok ? toolSummary(tool.name, tool.result.data) : "—")} |`);
  }
  out.push("", "_Đã lược bỏ dữ liệu thô của công cụ; chỉ giữ các trường trong danh sách cho phép._", "");
  return out;
}
const linksBlock = (links: string[]) => (links.length ? ["## Liên kết", "", links.map((l) => `[[${l}]]`).join(" · "), ""] : []);

interface BaseFm { type: NoteType; title: string; now: number; dataAsOf: string | null; scope: string; ticker: string | null; sectorIcb: string | null; timeframe: string | null; status: EvidenceStatus; tag: string }
function baseFields(b: BaseFm, rest: [string, YamlValue][] = []): string {
  const c = vnClock(b.now);
  const head: [string, YamlValue][] = [
    ["schema_version", SCHEMA_VERSION], ["type", b.type], ["title", b.title], ["date", c.date], ["exported_at", c.iso],
  ];
  const tail: [string, YamlValue][] = [
    ["tags", ["trading", "global-quanta/elite10", b.tag]], ["source_url", SOURCE_URL], ["created_by", "Global Quanta Terminal"],
  ];
  return frontmatter([...head, ...rest.filter(([k]) => k === "started_at" || k === "finished_at"),
    ["data_as_of", b.dataAsOf], ["scope", b.scope], ["ticker", b.ticker], ["sector_icb", b.sectorIcb], ["timeframe", b.timeframe],
    ...rest.filter(([k]) => k !== "started_at" && k !== "finished_at"), ["evidence_status", b.status], ...tail],
  new Set(["date", "data_as_of", "review_base", "review_5", "review_10", "review_20"]));
}
const span = (traces: (LaneTrace | undefined)[]) => {
  const s = traces.map((t) => t?.startedAt).filter((x): x is number => typeof x === "number");
  const f = traces.map((t) => t?.finishedAt).filter((x): x is number => typeof x === "number");
  return { started: s.length ? isoOrNull(Math.min(...s)) : null, finished: f.length ? isoOrNull(Math.max(...f)) : null };
};
const firstOf = <T,>(xs: (T | null | undefined)[]) => xs.find((x) => x != null) ?? null;

// ---------------------------------------------------------------- Tranh luận
function debateCore(i: DebateInput) {
  const ev = collectEvidence([["Phe mua", i.bull], ["Phe bán", i.bear], ["Trọng tài", i.judge]]);
  const subject = i.subject?.trim().toUpperCase() || null;
  const ticker = confirmedTicker(ev, subject);
  const sectorIcb = sectorOf(ev, ticker);
  const status = evidenceStatus([i.bull, i.bear, i.judge]);
  const clipped = [i.bull, i.bear].some((l) => (l?.text.length ?? 0) > JUDGE_INPUT_MAX);
  const t = i.trace ?? {};
  const traces = { "Phe mua": t.bull, "Phe bán": t.bear, "Trọng tài": t.judge };
  return { ev, subject, ticker, sectorIcb, status, clipped, traces, t };
}

export function buildDebateNote(i: DebateInput): NoteOut {
  const o = opts(i.options), c = debateCore(i);
  const folder = safeFolder(i.folder) ?? OBSIDIAN_DEFAULT_FOLDER;
  const who = c.subject ?? "Elite 10";
  const sp = span([c.t.bull, c.t.bear, c.t.judge]);
  const tk = c.ticker ? c.ev.tickers.get(c.ticker) : null;
  const fm = baseFields(
    { type: "elite10-ai-debate", title: `Tranh luận AI — ${who}`, now: i.now, dataAsOf: c.ev.dataAsOf, scope: c.subject ? "ticker" : "portfolio", ticker: c.ticker, sectorIcb: c.sectorIcb, timeframe: "5-10 phiên", status: c.status, tag: "global-quanta/ai-debate" },
    [
      ["started_at", sp.started], ["finished_at", sp.finished],
      ["models", { bull: i.bull?.model ?? null, bear: i.bear?.model ?? null, judge: i.judge?.model ?? null }],
      ["fallback", { bull: Boolean(i.bull?.fallback), bear: Boolean(i.bear?.fallback), judge: Boolean(i.judge?.fallback) }],
      ["host", firstOf([c.t.bull?.host, c.t.bear?.host, c.t.judge?.host])],
      ["macro_mode", firstOf([c.t.judge?.macroMode, c.t.bull?.macroMode, c.t.bear?.macroMode])],
      ["untraceable_count", [i.bull, i.bear, i.judge].reduce((a, l) => a + (l?.untraceable.length ?? 0), 0)],
      ["judge_input_clipped", c.clipped],
      ["portfolio_kind", c.ev.decision?.portfolioKind ?? null],
      ["in_portfolio", tk?.inPortfolio ?? null],
    ],
  );
  const noJudge = !i.judge && i.bull?.done && i.bear?.done;
  const body = [
    `# Tranh luận AI — ${who}`, "", DISCLAIMER, "",
    "## Tóm tắt", "",
    `- Phạm vi: ${c.subject ? `mã ${c.subject}${c.ticker ? "" : " (chưa được công cụ xác nhận)"}` : "danh mục chính thức của phiên mới nhất"}`,
    "- Kỳ hạn: 5–10 phiên",
    `- Trạng thái bằng chứng: ${c.status === "complete" ? "đầy đủ" : c.status === "fallback" ? "có mô hình dự phòng" : "dở dang"}`,
    `- Dữ liệu tới phiên: ${c.ev.dataAsOf ?? "chưa xác định"}`, "",
    ...laneBlock("Phe mua", i.bull),
    ...laneBlock("Phe bán", i.bear),
    ...(noJudge ? ["## Phán quyết trọng tài", "", "_Không có phán quyết — cả hai phe không trả lời được._", ""] : laneBlock("Phán quyết trọng tài", i.judge)),
    ...(o.includeEvidence ? evidenceBlock(c.ev, c.traces) : []),
    ...limits(c.clipped, [i.bull, i.bear, i.judge], c.traces),
    ...(o.includeLinks ? linksBlock(linksFor(c.ev, c.ticker, i.sectorNames)) : []),
  ];
  return { fileName: noteFileName(i.now, who, "Tranh luận", i.suffix), folder, markdown: `${fm}\n\n${body.join("\n").trimEnd()}\n`, meta: { type: "elite10-ai-debate", evidenceStatus: c.status, dataAsOf: c.ev.dataAsOf, ticker: c.ticker, sectorIcb: c.sectorIcb } };
}

function limits(clipped: boolean, lanes: (LaneLike | null | undefined)[], traces: Record<string, LaneTrace | undefined>): string[] {
  const out: string[] = [];
  if (clipped) out.push(`- Trọng tài chỉ đọc tối đa ${JUDGE_INPUT_MAX.toLocaleString("vi-VN")} ký tự đầu của mỗi phe.`);
  if (lanes.some((l) => l?.fallback)) out.push("- Có làn được trả lời bởi mô hình dự phòng.");
  if (lanes.some((l) => l && laneState(l) === "partial")) out.push("- Có làn dở dang (lỗi, bị dừng hoặc không có nội dung).");
  const unt = lanes.reduce((a, l) => a + (l?.untraceable.length ?? 0), 0);
  if (unt) out.push(`- ${unt} con số không truy được tới dữ liệu công cụ.`);
  if (Object.values(traces).some((t) => t?.toolInputs && Object.keys(t.toolInputs).length)) out.push(`- Đầu vào công cụ được rút gọn còn tối đa ${TOOL_INPUT_MAX} ký tự.`);
  return out.length ? ["## Giới hạn", "", ...out, ""] : [];
}

// ---------------------------------------------------------------- Bản tin phiên
export function buildBriefNote(i: BriefInput): NoteOut {
  const o = opts(i.options);
  const ev = collectEvidence([["Bản tin", i.brief]]);
  const status = evidenceStatus([i.brief]);
  const folder = safeFolder(i.folder) ?? OBSIDIAN_DEFAULT_FOLDER;
  const fm = baseFields(
    { type: "elite10-ai-brief", title: `Bản tin phiên — ${ev.dataAsOf ?? vnClock(i.now).date}`, now: i.now, dataAsOf: ev.dataAsOf, scope: "portfolio", ticker: null, sectorIcb: null, timeframe: "phiên mới nhất", status, tag: "global-quanta/ai-brief" },
    [
      ["started_at", isoOrNull(i.trace?.startedAt)], ["finished_at", isoOrNull(i.trace?.finishedAt)],
      ["models", { brief: i.brief.model ?? null }], ["fallback", { brief: Boolean(i.brief.fallback) }],
      ["host", i.trace?.host ?? null], ["macro_mode", i.trace?.macroMode ?? null],
      ["untraceable_count", i.brief.untraceable.length], ["portfolio_kind", ev.decision?.portfolioKind ?? null],
    ],
  );
  const body = [
    `# Bản tin phiên — ${ev.dataAsOf ?? vnClock(i.now).date}`, "", DISCLAIMER, "",
    ...laneBlock("Bản tin", i.brief),
    ...(o.includeEvidence ? evidenceBlock(ev, { "Bản tin": i.trace }) : []),
    ...limits(false, [i.brief], { "Bản tin": i.trace }),
    ...(o.includeLinks ? linksBlock(linksFor(ev, null, i.sectorNames)) : []),
  ];
  return { fileName: noteFileName(i.now, "Elite 10", "Bản tin", i.suffix), folder, markdown: `${fm}\n\n${body.join("\n").trimEnd()}\n`, meta: { type: "elite10-ai-brief", evidenceStatus: status, dataAsOf: ev.dataAsOf, ticker: null, sectorIcb: null } };
}

// ---------------------------------------------------------------- Hỏi đáp
export function buildQaNote(i: QaInput, scope: "last" | "all" = "all"): NoteOut {
  const o = opts(i.options);
  const pairs: { q: string | null; lanes: LaneLike[] }[] = [];
  let pending: string | null = null;
  for (const t of i.turns) {
    if (t.role === "user") pending = t.text;
    else { pairs.push({ q: pending, lanes: t.lanes }); pending = null; }
  }
  const chosen = scope === "last" ? pairs.slice(-1) : pairs;
  const lanes = chosen.flatMap((p) => p.lanes);
  const ev = collectEvidence(lanes.map((l, k) => [`Lượt ${k + 1} · ${PROVIDER_VI[l.provider]}`, l]));
  const status = evidenceStatus(lanes);
  const folder = safeFolder(i.folder) ?? OBSIDIAN_DEFAULT_FOLDER;
  const fm = baseFields(
    { type: "elite10-ai-qa", title: `Hỏi đáp Elite 10 — ${vnClock(i.now).date}`, now: i.now, dataAsOf: ev.dataAsOf, scope: "qa", ticker: null, sectorIcb: null, timeframe: null, status, tag: "global-quanta/ai-qa" },
    [
      ["qa_scope", scope], ["turns", chosen.length], ["models", [...new Set(lanes.map((l) => l.model).filter((m): m is string => Boolean(m)))]],
      ["macro_mode", i.meta?.macroMode ?? null], ["untraceable_count", lanes.reduce((a, l) => a + l.untraceable.length, 0)],
    ],
  );
  const body: string[] = [`# Hỏi đáp Elite 10 — ${vnClock(i.now).date}`, "", DISCLAIMER, ""];
  if (i.meta?.macroMode) body.push(`_Chế độ dữ liệu vĩ mô (\`macro_mode\`) phản ánh lượt cuối của phiên hỏi đáp._`, "");
  chosen.forEach((p, k) => {
    body.push(`## Lượt ${scope === "last" ? pairs.length : k + 1}`, "");
    if (o.includeQuestions && p.q != null) body.push("**Câu hỏi:**", "", ...norm(p.q).split("\n").map((x) => `> ${x}`), "");
    else if (!o.includeQuestions) body.push("_Câu hỏi đã được ẩn khi xuất._", "");
    for (const l of p.lanes) body.push(...laneBlock(PROVIDER_VI[l.provider], l, "###"));
  });
  if (o.includeEvidence) body.push(...evidenceBlock(ev, {}));
  body.push(...limits(false, lanes, {}));
  if (o.includeLinks) body.push(...linksBlock(linksFor(ev, null, i.sectorNames)));
  return { fileName: noteFileName(i.now, "Elite 10", "Hỏi đáp", i.suffix), folder, markdown: `${fm}\n\n${body.join("\n").trimEnd()}\n`, meta: { type: "elite10-ai-qa", evidenceStatus: status, dataAsOf: ev.dataAsOf, ticker: null, sectorIcb: null } };
}

// ---------------------------------------------------------------- Nhật ký quyết định
const fmtN = (x: number | null, d = 1) => (x == null ? "chưa có" : x.toLocaleString("vi-VN", { maximumFractionDigits: d }));
export function buildJournalNote(i: JournalInput): NoteOut {
  const c = debateCore(i);
  const folder = safeFolder(i.folder) ?? OBSIDIAN_DEFAULT_FOLDER;
  const who = c.subject ?? "Elite 10";
  const base = c.ev.dataAsOf ?? vnClock(i.now).date;
  const rev = reviewDates(base, REVIEW_SESSIONS, i.calendar);
  const reviewFields: [string, YamlValue][] = REVIEW_SESSIONS.map((n) => [`review_${n}`, rev[n]]);
  const outcomeFields: [string, YamlValue][] = REVIEW_SESSIONS.map((n) => [`outcome_${n}`, null]);
  const fm = baseFields(
    { type: "elite10-decision-journal", title: `Nhật ký quyết định — ${who} — ${vnClock(i.now).date}`, now: i.now, dataAsOf: c.ev.dataAsOf, scope: c.subject ? "ticker" : "portfolio", ticker: c.ticker, sectorIcb: c.sectorIcb, timeframe: "5-10 phiên", status: c.status, tag: "global-quanta/decision-journal" },
    [
      ["models", { bull: i.bull?.model ?? null, bear: i.bear?.model ?? null, judge: i.judge?.model ?? null }],
      ["review_base", base], ...reviewFields, ["review_calendar", "vn-rules"], ...outcomeFields, ["judge_was_right", null],
      ["portfolio_kind", c.ev.decision?.portfolioKind ?? null],
    ],
  );
  const rowsFor = c.ticker ? c.ev.decision?.rows.filter((r) => r.ticker === c.ticker) ?? [] : c.ev.decision?.rows ?? [];
  const tk = c.ticker ? c.ev.tickers.get(c.ticker) : null;
  const ctx: string[] = ["## Bối cảnh định lượng lúc quyết định", ""];
  if (rowsFor.length || tk) {
    ctx.push(`_Nguồn: kết quả công cụ \`elite_decision\` / \`elite_ticker\`, dữ liệu tới phiên ${c.ev.dataAsOf ?? "chưa xác định"}._`, "");
    if (rowsFor.length) {
      ctx.push("| Mã | Hạng HL | Tỷ trọng % | Phân vị LS | RRG ngành | Giá đóng cửa | Lãi từ phiên khoá % |", "|---|---|---|---|---|---|---|");
      for (const r of rowsFor) ctx.push(`| [[${r.ticker}]] | ${fmtN(r.hlRank, 0)} | ${fmtN(r.weightPct)} | ${fmtN(r.lsPercentile, 0)} | ${cell(r.sectorRrg ?? "chưa có")} | ${fmtN(r.close, 0)} | ${fmtN(r.returnSinceEntryPct)} |`);
      ctx.push("");
    }
    if (tk) ctx.push(`- ${tk.ticker}: hạng Elite ${fmtN(tk.rank, 0)} · ${tk.inPortfolio == null ? "chưa rõ trong danh mục" : tk.inPortfolio ? "đang trong danh mục" : "ngoài danh mục"} · ngành ICB ${sectorOf(c.ev, tk.ticker) ?? "chưa có"}`, "");
  } else ctx.push("_Chưa có — các làn không gọi `elite_decision` / `elite_ticker`._", "");
  const body = [
    `# Nhật ký quyết định — ${who} — ${vnClock(i.now).date}`, "", DISCLAIMER, "",
    "## Luận điểm (trọng tài)", "",
    i.judge?.text.trim() ? norm(i.judge.text) : "_Chưa có phán quyết của trọng tài._", "",
    ...ctx,
    "## Điều kiện làm sai luận điểm", "", "- [ ] ", "",
    "## Hậu kiểm", "",
    `_Tính theo lịch giao dịch Việt Nam tự tính từ phiên ${base} (chưa gồm ngày nghỉ nối đột xuất). Điền \`outcome_*\` và \`judge_was_right\` trong frontmatter khi xem lại._`, "",
    ...REVIEW_SESSIONS.map((n) => `- [ ] Xem lại sau ${n} phiên 📅 ${rev[n]}`), "",
    ...linksBlock(linksFor(c.ev, c.ticker, i.sectorNames, i.debateFileName ? [i.debateFileName.replace(/\.md$/, "")] : [])),
  ];
  return { fileName: noteFileName(i.now, who, "Nhật ký", i.suffix), folder, markdown: `${fm}\n\n${body.join("\n").trimEnd()}\n`, meta: { type: "elite10-decision-journal", evidenceStatus: c.status, dataAsOf: c.ev.dataAsOf, ticker: c.ticker, sectorIcb: c.sectorIcb } };
}
