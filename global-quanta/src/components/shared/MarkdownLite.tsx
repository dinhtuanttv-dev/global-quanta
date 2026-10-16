// Markdown tối giản, AN TOÀN (dựng phần tử React, không dùng innerHTML) cho văn bản do máy chủ/mô hình sinh:
// tiêu đề #..####, đoạn, gạch đầu dòng / danh sách số, bảng | a | b |, trích dẫn >, **đậm**, _nghiêng_ / *nghiêng*.
// Dùng chung cho chat "Hỏi đáp xúc tác" và báo cáo tháng của Trung tâm vĩ mô.
import { Fragment, type CSSProperties, type ReactNode } from "react";

export function renderInline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*|_[^_\s][^_]*_|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && ((part.startsWith("_") && part.endsWith("_")) || (part.startsWith("*") && part.endsWith("*")))) return <em key={i}>{part.slice(1, -1)}</em>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isTableSep = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

const th: CSSProperties = { textAlign: "left", fontWeight: 600, padding: "4px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
const td: CSSProperties = { padding: "3px 8px", borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)", verticalAlign: "top" };

export function MarkdownLite({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.split("\n");
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (!list) return;
    const items = list.items.map((l, i) => <li key={i} style={{ margin: "2px 0" }}>{renderInline(l)}</li>);
    blocks.push(list.ordered
      ? <ol key={`l${blocks.length}`} style={{ margin: "4px 0 6px", paddingLeft: 20 }}>{items}</ol>
      : <ul key={`l${blocks.length}`} style={{ margin: "4px 0 6px", paddingLeft: 18 }}>{items}</ul>);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    // bảng: dòng tiêu đề + dòng phân cách
    if (line.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushList();
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      i--;
      blocks.push(
        <div key={`t${blocks.length}`} style={{ overflowX: "auto", margin: "6px 0" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.92em" }}>
            <thead><tr>{head.map((h, k) => <th key={k} style={th}>{renderInline(h)}</th>)}</tr></thead>
            <tbody>{rows.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} style={td}>{renderInline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]);
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(bullet[2]);
      continue;
    }
    flushList();
    if (!line.trim()) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push(<p key={`h${blocks.length}`} style={{ margin: h[1].length <= 2 ? "12px 0 6px" : "8px 0 4px", fontWeight: 700, fontSize: h[1].length === 1 ? "1.15em" : h[1].length === 2 ? "1.05em" : "1em" }}>{renderInline(h[2])}</p>);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      blocks.push(<p key={`q${blocks.length}`} style={{ margin: "6px 0", padding: "4px 10px", borderLeft: "3px solid var(--warning, #f59e0b)", color: "var(--text-secondary)" }}>{renderInline(q[1])}</p>);
      continue;
    }
    blocks.push(<p key={`p${blocks.length}`} style={{ margin: "4px 0" }}>{renderInline(line)}</p>);
  }
  flushList();
  return <div className={className}>{blocks}</div>;
}
