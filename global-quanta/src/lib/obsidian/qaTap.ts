// O3 (21/11/2026): kênh để khung Hỏi đáp dùng chung (CatalystChatPanel) báo lịch sử hỏi đáp cho Phòng họp AI.
// Dùng React context thay cho prop để CatalystChatPanel chỉ cần CHÈN dòng (không sửa chữ ký hàm). Không có Provider
// (tab Chat xúc tác) -> giá trị null -> không làm gì: hành vi khung hỏi đáp không đổi.
import { createContext } from "react";
import type { QaTurn } from "./types";

export interface QaMeta { remaining?: number; macroMode?: string | null; worldMode?: string | null }
export type QaTap = (turns: QaTurn[], meta: QaMeta | null) => void;
export const QaTapContext = createContext<QaTap | null>(null);
