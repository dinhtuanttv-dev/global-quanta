// Chỉ dùng trong test: bộ đọc YAML tối giản cho đúng tập con mà yaml.ts xuất ra (vô hướng, map một cấp, danh sách),
// và dữ liệu Lane mẫu có hình dạng giống luồng chat thật.
import type { LaneLike, ToolRunLike } from "./types";

type V = string | number | boolean | null | V[] | { [k: string]: V };
function scalar(raw: string): V {
  const s = raw.trim();
  if (s === "null") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "[]") return [];
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.startsWith('"') && s.endsWith('"')) {
    const inner = s.slice(1, -1);
    if (/(^|[^\\])"/.test(inner.replace(/\\\\/g, ""))) throw new Error(`nháy kép chưa thoát: ${s}`);
    return inner.replace(/\\(["\\])/g, "$1");
  }
  throw new Error(`giá trị YAML không được quote: ${s}`);
}
/** Trả { data, body } hoặc ném lỗi nếu frontmatter sai cú pháp của tập con. */
export function parseFrontmatter(md: string): { data: Record<string, V>; body: string } {
  if (!md.startsWith("---\n")) throw new Error("thiếu mở frontmatter");
  const end = md.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("thiếu đóng frontmatter");
  const lines = md.slice(4, end).split("\n"), data: Record<string, V> = {};
  let cur: string | null = null;
  for (const line of lines) {
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^([a-z][a-z0-9_]*):\s*(.*)$/))) {
      cur = m[1];
      if (cur in data) throw new Error(`khoá trùng: ${cur}`);
      data[cur] = m[2] === "" ? null : scalar(m[2]);
    } else if ((m = line.match(/^ {2}- (.*)$/)) && cur) {
      const arr = Array.isArray(data[cur]) ? (data[cur] as V[]) : [];
      arr.push(scalar(m[1])); data[cur] = arr;
    } else if ((m = line.match(/^ {2}([a-z][a-z0-9_]*): (.*)$/)) && cur) {
      const o = data[cur] && typeof data[cur] === "object" && !Array.isArray(data[cur]) ? (data[cur] as Record<string, V>) : {};
      o[m[1]] = scalar(m[2]); data[cur] = o;
    } else throw new Error(`dòng YAML lạ: ${JSON.stringify(line)}`);
  }
  return { data, body: md.slice(end + 5) };
}

export const lane = (p: Partial<LaneLike> & Pick<LaneLike, "provider">): LaneLike => ({ text: "", notices: [], tools: [], untraceable: [], done: true, ...p });
export const tool = (id: string, name: string, data?: unknown, ok = true): ToolRunLike => ({ id, name, result: ok ? { ok: true, data } : { ok: false, error: "lỗi nguồn" } });
export const DECISION_DATA = {
  date: "2026-11-20", portfolioKind: "ELITE_HL", hl: { cashPct: 27.7, secretInternal: "KHÔNG ĐƯỢC LỘ" },
  portfolio: [
    { ticker: "HPG", sectorIcb: "1750", weightPct: 9.9, hlRank: 10, lsPercentile: 83, sectorRrg: "Dẫn dắt", close: 27150, returnSinceEntryPct: -8.1, token: "Bearer abc" },
    { ticker: "VJC", sectorIcb: "5750", weightPct: 15, hlRank: 1, lsPercentile: 85, sectorRrg: "Dẫn dắt", close: 137300, returnSinceEntryPct: 0.6 },
  ],
};
export const TICKER_DATA = { ticker: "HPG", date: "2026-11-20", icb: { l1: "1000", l2: "1700", l3: "1750" }, elite: { rank: 12, inPortfolio: true }, signals: [{ id: "x", value: 1 }] };
