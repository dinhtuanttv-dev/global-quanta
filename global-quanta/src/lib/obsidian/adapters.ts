// Adapter trình duyệt (chỉ gọi sau cú bấm của người dùng): bộ nhớ tạm, tải tệp, mở URI obsidian://, cấu hình Vault trong localStorage.
// KHÔNG gọi mạng (fetch / XHR / Beacon / WebSocket). Tải tệp dùng lại downloadText có sẵn (src/lib/kqkd/format.ts).
import { downloadText } from "../kqkd/format";
import { planUriExport, type UriTarget } from "./uri";
import { DEFAULT_OPTIONS, OBSIDIAN_DEFAULT_FOLDER, URI_MAX, type ExportOptions, type ExportResult } from "./types";
import { safeFolder, safeVault } from "./note";

/** 4 ký tự chống trùng tên tệp. */
export function randomSuffix(): string {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  try {
    const a = new Uint8Array(4); crypto.getRandomValues(a);
    return [...a].map((b) => abc[b % abc.length]).join("");
  } catch { return Math.random().toString(36).slice(2, 6).padEnd(4, "0"); }
}

export async function copyText(text: string): Promise<ExportResult> {
  try {
    if (!navigator.clipboard?.writeText) return "clipboard-denied";
    await navigator.clipboard.writeText(text);
    return "clipboard-copied";
  } catch { return "clipboard-denied"; }
}
export function downloadFile(fileName: string, text: string, type = "text/markdown;charset=utf-8"): ExportResult {
  try { downloadText(fileName, text, type); return "download-started"; } catch { return "failed"; }
}
/** Mở obsidian:// bằng thẻ <a> tạm (không điều hướng trang hiện tại). */
export function openUri(uri: string): ExportResult {
  try {
    const a = document.createElement("a"); a.href = uri; a.rel = "noopener"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    return "uri-requested";
  } catch { return "failed"; }
}
/**
 * Mở trong Obsidian: nội dung ngắn -> nằm trong URI; dài -> chép trước (ngay trong sự kiện click để giữ quyền), rồi mở với `clipboard`.
 * Kết quả chỉ nói "đã GỬI yêu cầu" — trình duyệt không biết Obsidian có nhận hay không.
 */
export async function openInObsidian(markdown: string, t: UriTarget, max = URI_MAX): Promise<ExportResult> {
  if (safeFolder(t.folder) === null || safeVault(t.vault) === null) return "invalid-name";
  const plan = planUriExport(markdown, t, max);
  if (plan.mode === "clipboard") {
    const c = await copyText(markdown);
    if (c !== "clipboard-copied") return c;
    return openUri(plan.uri) === "uri-requested" ? "uri-clipboard" : "failed";
  }
  return openUri(plan.uri);
}

// ---------------------------------------------------------------- cấu hình người dùng (không lưu nội dung ghi chú)
export const PREFS_KEY = "gq.obsidian.v1";
export interface ObsidianPrefs { vault: string; folder: string; options: ExportOptions }
export const DEFAULT_PREFS: ObsidianPrefs = { vault: "", folder: OBSIDIAN_DEFAULT_FOLDER, options: DEFAULT_OPTIONS };

export function loadPrefs(storage: Pick<Storage, "getItem"> | null = safeStorage()): ObsidianPrefs {
  try {
    const raw = storage?.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<ObsidianPrefs>;
    return {
      vault: safeVault(typeof p.vault === "string" ? p.vault : "") ?? "",
      folder: safeFolder(typeof p.folder === "string" ? p.folder : OBSIDIAN_DEFAULT_FOLDER) ?? OBSIDIAN_DEFAULT_FOLDER,
      options: { ...DEFAULT_OPTIONS, ...(p.options && typeof p.options === "object" ? pickBools(p.options) : {}) },
    };
  } catch { return DEFAULT_PREFS; }
}
export function savePrefs(p: ObsidianPrefs, storage: Pick<Storage, "setItem"> | null = safeStorage()): ExportResult | "ok" {
  const vault = safeVault(p.vault), folder = safeFolder(p.folder);
  if (vault === null || folder === null) return "invalid-name";
  try {
    if (!storage) return "storage-unavailable";
    storage.setItem(PREFS_KEY, JSON.stringify({ vault, folder, options: pickBools(p.options) }));
    return "ok";
  } catch { return "storage-unavailable"; }
}
function pickBools(o: Partial<ExportOptions>): Partial<ExportOptions> {
  const out: Partial<ExportOptions> = {};
  for (const k of ["includeQuestions", "includeEvidence", "includeLinks"] as const) if (typeof o[k] === "boolean") out[k] = o[k];
  return out;
}
function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}
