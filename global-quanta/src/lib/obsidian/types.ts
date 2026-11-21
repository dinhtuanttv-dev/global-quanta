// Bàn nghiên cứu Obsidian (đặc tả docs/obsidian-elite-ai-room v2, 21/11/2026) — kiểu dữ liệu và cấu hình dùng chung.
// Thư viện này THUẦN: không import thành phần giao diện, dịch vụ mạng hay store. Kiểu Lane được mô tả lại theo cấu trúc
// (structural) để không phụ thuộc module giao diện CatalystChatPanel.

export const OBSIDIAN_DEFAULT_FOLDER = "Global Quanta/Elite 10";
/** Mốc hậu kiểm của Nhật ký quyết định (phiên giao dịch sau ngày dữ liệu) — chủ dự án chốt 21/11/2026. */
export const REVIEW_SESSIONS = [5, 10, 20] as const;
/** Ngưỡng độ dài URI (đếm SAU khi encode) — giả định bảo thủ, tài liệu Obsidian không nêu giới hạn. */
export const URI_MAX = 2000;
export const CANVAS_TEXT_MAX = 1500;
export const TOOL_INPUT_MAX = 200;
export const SOURCE_URL = "https://dinhtuan-ck.vercel.app/?tab=quyet-dinh";
export const SCHEMA_VERSION = 1;

export type Provider = "claude" | "gemini";
export interface ToolResultLike { ok: boolean; notice?: string | null; data?: unknown; guidance?: string[]; error?: string }
export interface ToolRunLike { id: string; name: string; result?: ToolResultLike }
/** Cùng hình dạng với `Lane` của CatalystChatPanel (không import để giữ thư viện độc lập). */
export interface LaneLike {
  provider: Provider; model?: string; text: string; notices: string[]; tools: ToolRunLike[]; untraceable: string[];
  error?: string; done: boolean; fallback?: boolean;
}
/** Bản vết song song (ghi bên cạnh laneReducer, không thay nó): thông tin reducer không giữ. */
export interface LaneTrace {
  startedAt?: number | null; finishedAt?: number | null; host?: string | null; macroMode?: string | null; worldMode?: string | null;
  stopReason?: string | null; rounds?: number | null; toolInputs?: Record<string, string>;
}
export interface ExportOptions { includeQuestions: boolean; includeEvidence: boolean; includeLinks: boolean }
export const DEFAULT_OPTIONS: ExportOptions = { includeQuestions: true, includeEvidence: true, includeLinks: true };

/** Lịch giao dịch: cùng giao diện với makeVnTradingCalendar (src/lib/cotuc/vn-trading-calendar.ts). */
export interface TradingCalendar { isTradingDay(dayNumber: number): boolean }

interface CommonInput {
  /** Mốc "bây giờ" (ms) — truyền vào để hàm thuần, test được. */
  now: number;
  /** 4 ký tự ngẫu nhiên chống trùng tên tệp (adapter tạo bằng crypto). */
  suffix: string;
  folder?: string;
  options?: Partial<ExportOptions>;
  /** Tên ngành ICB theo mã ngành (nếu giao diện có); thiếu -> chỉ ghi mã ngành. */
  sectorNames?: Record<string, string>;
}
export interface DebateInput extends CommonInput {
  subject: string | null;
  bull: LaneLike | null; bear: LaneLike | null; judge: LaneLike | null;
  trace?: { bull?: LaneTrace; bear?: LaneTrace; judge?: LaneTrace };
}
export interface BriefInput extends CommonInput { brief: LaneLike; trace?: LaneTrace }
export type QaTurn = { role: "user"; text: string } | { role: "assistant"; lanes: LaneLike[]; traces?: LaneTrace[] };
export interface QaInput extends CommonInput { turns: QaTurn[]; meta?: { macroMode?: string | null; worldMode?: string | null } | null }
export interface JournalInput extends DebateInput { calendar: TradingCalendar; debateFileName?: string | null }

export type NoteType = "elite10-ai-debate" | "elite10-ai-brief" | "elite10-ai-qa" | "elite10-decision-journal";
export interface NoteOut {
  fileName: string; folder: string; markdown: string;
  meta: { type: NoteType; evidenceStatus: EvidenceStatus; dataAsOf: string | null; ticker: string | null; sectorIcb: string | null };
}
export type EvidenceStatus = "complete" | "partial" | "fallback";

export type ExportResult =
  | "uri-requested" | "uri-clipboard" | "clipboard-copied" | "download-started"
  | "clipboard-denied" | "invalid-name" | "storage-unavailable" | "failed";
