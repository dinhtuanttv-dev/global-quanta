// Obsidian URI `new` (https://obsidian.md/help/uri, đối chiếu 21/11/2026): vault = tên hoặc ID; file = đường dẫn trong Vault;
// content hoặc clipboard. Mọi giá trị encodeURIComponent ("/" -> %2F, dấu cách -> %20). KHÔNG BAO GIỜ append / prepend / overwrite.
import { URI_MAX } from "./types";

export interface UriTarget { vault?: string | null; folder: string; fileName: string }
const fileParam = (t: UriTarget) => {
  const base = t.fileName.replace(/\.md$/i, "");
  return t.folder ? `${t.folder}/${base}` : base;
};
export function obsidianNewUri(t: UriTarget, body: { content: string } | { clipboard: true }): string {
  const q: string[] = [];
  if (t.vault) q.push(`vault=${encodeURIComponent(t.vault)}`);
  q.push(`file=${encodeURIComponent(fileParam(t))}`);
  if ("content" in body) q.push(`content=${encodeURIComponent(body.content)}`);
  else q.push("clipboard=true");
  return `obsidian://new?${q.join("&")}`;
}
/** Chọn cách gửi: nội dung nằm trong URI nếu độ dài SAU encode ≤ ngưỡng; ngược lại chép rồi dùng `clipboard`. */
export function planUriExport(markdown: string, t: UriTarget, max = URI_MAX): { mode: "content" | "clipboard"; uri: string } {
  const direct = obsidianNewUri(t, { content: markdown });
  return direct.length <= max ? { mode: "content", uri: direct } : { mode: "clipboard", uri: obsidianNewUri(t, { clipboard: true }) };
}
