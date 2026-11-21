// L4 — bản đồ tranh luận dạng JSON Canvas 1.0 (https://jsoncanvas.org/spec/1.0/): nút text / file, cạnh có toEnd "arrow".
// Toạ độ và kích thước là số nguyên; màu dùng preset "1"–"6". Nguyên văn đầy đủ nằm trong ghi chú .md (nút file).
import { CANVAS_TEXT_MAX, type DebateInput } from "./types";
import { noteFileName } from "./note";

export interface CanvasNode { id: string; type: "text" | "file"; x: number; y: number; width: number; height: number; color?: string; text?: string; file?: string }
export interface CanvasEdge { id: string; fromNode: string; toNode: string; fromSide?: "top" | "right" | "bottom" | "left"; toSide?: "top" | "right" | "bottom" | "left"; toEnd?: "none" | "arrow"; label?: string }
export interface CanvasDoc { nodes: CanvasNode[]; edges: CanvasEdge[] }

const clip = (s: string, n = CANVAS_TEXT_MAX) => {
  const t = s.replace(/\r\n?/g, "\n").trim();
  return t.length > n ? `${t.slice(0, n)}…\n\n_Xem nguyên văn trong ghi chú._` : t || "_(không có nội dung)_";
};
/** `notePath` = đường dẫn ghi chú .md trong Vault (thư mục/tên.md) để nút file mở đúng ghi chú. */
export function buildDebateCanvas(i: DebateInput, notePath: string): { fileName: string; doc: CanvasDoc; json: string } {
  const who = i.subject?.trim().toUpperCase() || "Elite 10";
  const tools = [...new Set([i.bull, i.bear, i.judge].flatMap((l) => l?.tools.map((t) => t.name) ?? []))];
  const nodes: CanvasNode[] = [
    { id: "bull", type: "text", x: -560, y: -200, width: 480, height: 400, color: "4", text: `## Phe mua${i.bull?.model ? ` · ${i.bull.model}` : ""}\n\n${clip(i.bull?.text ?? "")}` },
    { id: "bear", type: "text", x: 80, y: -200, width: 480, height: 400, color: "1", text: `## Phe bán${i.bear?.model ? ` · ${i.bear.model}` : ""}\n\n${clip(i.bear?.text ?? "")}` },
    { id: "judge", type: "text", x: -240, y: 300, width: 480, height: 400, color: "3", text: `## Trọng tài${i.judge?.model ? ` · ${i.judge.model}` : ""}\n\n${i.judge ? clip(i.judge.text) : "_Không có phán quyết._"}` },
    { id: "evidence", type: "text", x: 320, y: 360, width: 320, height: 220, color: "5", text: `## Bằng chứng công cụ\n\n${tools.length ? tools.map((t) => `- \`${t}\``).join("\n") : "_Không có._"}` },
    { id: "note", type: "file", x: -800, y: 360, width: 400, height: 120, file: notePath },
  ];
  const edges: CanvasEdge[] = [
    { id: "e-bull-judge", fromNode: "bull", fromSide: "bottom", toNode: "judge", toSide: "top", toEnd: "arrow", label: "lập luận" },
    { id: "e-bear-judge", fromNode: "bear", fromSide: "bottom", toNode: "judge", toSide: "top", toEnd: "arrow", label: "lập luận" },
    { id: "e-evidence-judge", fromNode: "evidence", fromSide: "left", toNode: "judge", toSide: "right", toEnd: "arrow", label: "kiểm chứng" },
    { id: "e-note-judge", fromNode: "note", fromSide: "right", toNode: "judge", toSide: "left", toEnd: "none", label: "nguyên văn" },
  ];
  const doc = { nodes, edges };
  return { fileName: noteFileName(i.now, who, "Tranh luận", i.suffix, "canvas"), doc, json: JSON.stringify(doc, null, 2) };
}
