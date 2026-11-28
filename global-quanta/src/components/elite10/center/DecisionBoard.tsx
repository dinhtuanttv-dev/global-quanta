// Bảng quyết định hôm nay — danh mục chính thức Elite HL (E4-HL, từ 12/11/2026). Mọi số đến từ Gateway /api/elite/decision.
// G1–G2 (18/11/2026): gỡ bảng Elite 10 dòng tiền cũ (FlowBoard), bảng "Ứng viên tiếp theo" theo Z và cột ⏱ Timeline khỏi Bảng quyết định;
// danh mục dòng tiền (E3) chỉ còn làm ĐỐI CHỨNG ở tab "4. Bằng chứng & sổ theo dõi" (FlowBenchmarkPanel). Không đổi danh mục.
import EliteHlBoard from "./EliteHlBoard";
import { useEliteDecision } from "../../../hooks/elite10/useEliteCenter";
import { TIER_TITLE, type Tier } from "../../../lib/elite10/decisionTypes";

export function TierChip({ tier }: { tier: Tier }) {
  const cls = tier === "A" ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40" : tier === "B" ? "bg-white/5 text-q-text-2 border-white/15" : "bg-slate-500/15 text-slate-400 border-slate-500/40";
  return <span title={TIER_TITLE[tier]} className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>Bậc {tier}</span>;
}

/** onNavigateToEvidence (QĐ-R 20/11/2026): Hub truyền vào để thẻ tóm tắt nhảy sang tab "4. Bằng chứng & sổ theo dõi"; không truyền -> không có nút. */
export default function DecisionBoard({ onOpenTicker, onNavigateToEvidence }: { onOpenTicker: (ticker: string) => void; onNavigateToEvidence?: () => void }) {
  const { data: d, error, isLoading } = useEliteDecision();
  if (!d) {
    if (error) return <p className="tw-scope text-xs text-rose-400" data-testid="elite-decision-error">Không tải được bảng quyết định: {String((error as Error).message ?? error)}</p>;
    return <p className="tw-scope py-6 text-center text-xs italic text-slate-500" data-testid="elite-decision-loading">{isLoading ? "Đang tải Bảng quyết định Elite HL…" : "Chưa có bảng quyết định."}</p>;
  }
  if (!d.hl) {
    return <p className="tw-scope rounded-lg border border-amber-400/30 p-3 text-xs text-amber-200" data-testid="elite-no-hl">Gateway chưa trả danh mục Elite HL cho phiên {d.date} (tài liệu cũ). Bảng sẽ hiện khi phiên kế tiếp được dựng.</p>;
  }
  // Có dữ liệu cũ nhưng lần làm mới gần nhất lỗi: vẫn hiện bảng, kèm cảnh báo rõ là số chưa được cập nhật.
  const refreshError = error ? String((error as Error).message ?? error) : null;
  return <EliteHlBoard d={d} onOpenTicker={onOpenTicker} refreshError={refreshError} onNavigateToEvidence={onNavigateToEvidence} />;
}
