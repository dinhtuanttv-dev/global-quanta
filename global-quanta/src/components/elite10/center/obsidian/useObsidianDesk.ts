// Bàn nghiên cứu Obsidian — trạng thái giao diện dùng chung trong Phòng họp AI: cấu hình Vault, thông báo kết quả, đánh dấu đã lưu.
// Không gọi mạng; mọi thao tác chỉ chạy sau cú bấm của người dùng.
import { useCallback, useMemo, useState } from "react";
import { copyText, DEFAULT_PREFS, downloadFile, loadPrefs, openInObsidian, randomSuffix, savePrefs, type ObsidianPrefs } from "../../../../lib/obsidian/adapters";
import type { ExportOptions, ExportResult, NoteOut } from "../../../../lib/obsidian/types";

export type ExportAction = "obsidian" | "download" | "copy";
export interface DeskStatus { id: number; tone: "ok" | "warn" | "error"; text: string }

const OK: ExportResult[] = ["uri-requested", "uri-clipboard", "clipboard-copied", "download-started"];
export function resultText(r: ExportResult, fileName: string): { tone: DeskStatus["tone"]; text: string } {
  switch (r) {
    case "uri-requested": return { tone: "ok", text: `Đã gửi yêu cầu mở Obsidian cho “${fileName}”. Nếu Obsidian không mở, dùng Tải .md.` };
    case "uri-clipboard": return { tone: "ok", text: `Đã chép ghi chú và gửi yêu cầu mở Obsidian (nội dung dài). Nếu ghi chú trống, dán bằng Ctrl+V.` };
    case "clipboard-copied": return { tone: "ok", text: "Đã chép Markdown — dán vào một ghi chú mới." };
    case "download-started": return { tone: "ok", text: `Đang tải tệp “${fileName}”.` };
    case "clipboard-denied": return { tone: "warn", text: "Trình duyệt chặn bộ nhớ tạm — hãy dùng Tải .md." };
    case "invalid-name": return { tone: "error", text: "Tên Vault hoặc thư mục không hợp lệ — mở Cấu hình để sửa." };
    case "storage-unavailable": return { tone: "warn", text: "Trình duyệt không cho lưu cấu hình — cấu hình chỉ dùng trong phiên này." };
    default: return { tone: "error", text: "Không xuất được ghi chú — hãy dùng Tải .md." };
  }
}

export interface ObsidianDesk {
  prefs: ObsidianPrefs;
  setPrefs: (p: ObsidianPrefs) => ExportResult | "ok";
  setOptions: (o: Partial<ExportOptions>) => void;
  status: DeskStatus | null;
  announce: (tone: DeskStatus["tone"], text: string) => void;
  /** Hậu tố chống trùng tên — cố định cho mỗi lần mở menu / xem trước để tên tệp nhất quán. */
  newSuffix: () => string;
  run: (note: Pick<NoteOut, "fileName" | "folder" | "markdown">, action: ExportAction, savedKey?: string | null) => Promise<ExportResult>;
  /** Tệp không phải Markdown (Canvas): chỉ có đường tải tệp. */
  download: (fileName: string, text: string, type: string, savedKey?: string | null) => ExportResult;
  isSaved: (key: string | null | undefined) => boolean;
}

export function useObsidianDesk(): ObsidianDesk {
  const [prefs, setPrefsState] = useState<ObsidianPrefs>(() => loadPrefs());
  const [status, setStatus] = useState<DeskStatus | null>(null);
  const [saved, setSaved] = useState<Set<string>>(() => new Set());
  const announce = useCallback((tone: DeskStatus["tone"], text: string) => setStatus((s) => ({ id: (s?.id ?? 0) + 1, tone, text })), []);
  const mark = useCallback((key?: string | null) => { if (key) setSaved((s) => (s.has(key) ? s : new Set(s).add(key))); }, []);

  const setPrefs = useCallback((p: ObsidianPrefs) => {
    const r = savePrefs(p);
    if (r === "invalid-name") return r;
    setPrefsState({ ...p, vault: p.vault.trim(), folder: p.folder.trim() });
    if (r === "storage-unavailable") announce("warn", resultText(r, "").text);
    return r;
  }, [announce]);
  const setOptions = useCallback((o: Partial<ExportOptions>) => {
    setPrefsState((cur) => { const next = { ...cur, options: { ...cur.options, ...o } }; savePrefs(next); return next; });
  }, []);

  const run = useCallback(async (note: Pick<NoteOut, "fileName" | "folder" | "markdown">, action: ExportAction, savedKey?: string | null) => {
    let r: ExportResult;
    if (action === "copy") r = await copyText(note.markdown);
    else if (action === "download") r = downloadFile(note.fileName, note.markdown);
    else r = await openInObsidian(note.markdown, { vault: prefs.vault || null, folder: note.folder, fileName: note.fileName });
    const t = resultText(r, note.fileName);
    announce(t.tone, t.text);
    if (OK.includes(r)) mark(savedKey);
    return r;
  }, [announce, mark, prefs.vault]);
  const download = useCallback((fileName: string, text: string, type: string, savedKey?: string | null) => {
    const r = downloadFile(fileName, text, type);
    const t = resultText(r, fileName); announce(t.tone, t.text);
    if (OK.includes(r)) mark(savedKey);
    return r;
  }, [announce, mark]);

  return useMemo(() => ({
    prefs, setPrefs, setOptions, status, announce, newSuffix: randomSuffix, run, download, isSaved: (k) => Boolean(k && saved.has(k)),
  }), [prefs, setPrefs, setOptions, status, announce, run, download, saved]);
}
export { DEFAULT_PREFS };
