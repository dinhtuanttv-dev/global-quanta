// Phân tích AI đa tác nhân (Gemini — Project A /api/ai/analyze). Gọi BẰNG TAY (tốn phí mỗi lần).
// 2026-10-17: hiển thị định dạng mới (overallSummaryVi + sectors[] theo mã ICB, kiểm chứng bằng code). Trước đây panel đọc định dạng cũ
// (market.summaryVi / affectedSectorKeys) nên sau khi chạy không hiện gì.
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useMacroAnalysis, type AiSector } from "../../../hooks/useMacroAnalysis";
import { sectorNameOf } from "../../../lib/worldSectors/sectorNames";
import { fmtZ } from "../../../lib/worldSectors/types";

const T = {
  gold: "var(--gold, #f59e0b)", goldBright: "var(--gold-bright, #fbbf24)", positive: "var(--positive, #34d399)", negative: "var(--negative, #f87171)",
  textSecondary: "var(--text-secondary, #94a3b8)", textTertiary: "var(--text-tertiary, #64748b)",
};
const DIR: Record<AiSector["direction"], { vi: string; color: string }> = {
  bullish: { vi: "Tích cực", color: T.positive }, bearish: { vi: "Tiêu cực", color: T.negative }, neutral: { vi: "Trung tính", color: T.textTertiary },
};

export default function AiAnalysisPanel() {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const { result, isLoading, error, analyze } = useMacroAnalysis();
  const sectors = result?.sectors ?? [];
  return (
    <div className="tw-scope rounded-xl p-4" data-testid="ai-analysis-panel" style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Phân Tích AI Đa Tác Nhân (Gemini)</p>
          <span title="Suy luận của AI — có thể sai; luôn kèm độ tin cậy và kiểm chứng" className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: T.gold }}>ESTIMATED</span>
          {result?.cached && <span title="Kết quả đã lưu (không gọi Gemini lần này)" className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>CACHE · {result.cacheAgeMinutes}p trước</span>}
          {result?.mode === "gateway-icb" && <span title="Dữ liệu Gateway có ngày + điểm ngành ICB đã kiểm định đặt trước; kết luận kiểm chứng bằng code" className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.1)", color: T.textSecondary }}>DỮ LIỆU GATEWAY · {result.context?.dataPoints ?? 0} điểm dữ liệu</span>}
          {result?.mode === "legacy" && <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: T.gold }}>DỰ PHÒNG · bảng Supabase</span>}
        </div>
        <button onClick={analyze} disabled={isLoading} title="Gọi Gemini AI thật - tốn phí mỗi lần bấm"
          style={{ background: isLoading ? "rgba(148,163,184,0.1)" : `linear-gradient(135deg, ${T.gold}, ${T.goldBright})` }}
          className="text-[10px] font-black px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:cursor-not-allowed">
          <Sparkles className="w-3 h-3" style={{ color: isLoading ? T.textTertiary : "#0a1020" }} />
          <span style={{ color: isLoading ? T.textTertiary : "#0a1020" }}>{isLoading ? "Đang phân tích..." : "Chạy Phân Tích AI"}</span>
        </button>
      </div>
      {error && <p className="text-[10px] rounded-lg p-2.5 mb-2" style={{ color: T.negative, background: "rgba(248,113,113,0.06)" }}>Không phân tích được: {error}</p>}
      {!result && !error && !isLoading && (
        <p className="text-[10px] italic" style={{ color: T.textTertiary }}>
          Bấm "Chạy Phân Tích AI" để 3 agent (Market/News/Evidence) đọc chỉ số, hàng hoá, điểm ngành thế giới → ngành VN và tin tức, rồi giải thích ngành nào chịu tác động.
          Mọi kết luận được kiểm chứng bằng code: trích dẫn phải có thật, không trái chiều điểm định lượng mạnh.
        </p>
      )}
      {result && (
        <div className="space-y-2.5">
          <p className="text-xs" style={{ color: "#f1f5f9" }}>{result.overallSummaryVi}</p>
          {sectors.length === 0 && <p className="text-[10px] italic" style={{ color: T.textTertiary }}>AI không đưa ra kết luận ngành nào đủ cơ sở.</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {sectors.map((s) => (
              <div key={s.sectorKey} className="rounded-lg p-2.5" style={{ background: "rgba(148,163,184,0.04)", border: "1px solid rgba(148,163,184,0.1)" }}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-bold" style={{ color: "#f1f5f9" }}>
                    {s.verified ? <CheckCircle2 className="inline w-3 h-3 mr-1" style={{ color: T.positive }} /> : <AlertTriangle className="inline w-3 h-3 mr-1" style={{ color: T.gold }} />}
                    {s.sectorNameVi ?? sectorNameOf(s.sectorKey)}
                  </p>
                  <span className="text-[10px] font-bold shrink-0" style={{ color: DIR[s.direction].color }}>{DIR[s.direction].vi} · {Math.round(s.confidence * 100)}%</span>
                </div>
                <p className="text-[10px] mt-1" style={{ color: T.textSecondary }}>{s.reasoningVi}</p>
                {s.quant && <p className="text-[9px] mt-1" style={{ color: T.textTertiary }}>Điểm định lượng: ngắn hạn {fmtZ(s.quant.shortScore, 2)} σ · trung hạn {fmtZ(s.quant.mediumScore, 2)} σ</p>}
                {s.discrepancies.length > 0 && <p className="text-[9px] mt-1" style={{ color: T.gold }}>⚠ {s.discrepancies.join(" · ")}</p>}
                {(s.vnTickers ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {s.vnTickers!.map((t) => <button key={t} type="button" onClick={() => selectTicker(t)} className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: T.goldBright }}>{t}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
          {result.newsDiscrepancies?.length > 0 && <p className="text-[9px]" style={{ color: T.gold }}>⚠ Tin tức: {result.newsDiscrepancies.join(" · ")}</p>}
        </div>
      )}
      <p className="text-[9px] italic mt-3 pt-2 border-t" style={{ borderColor: "rgba(148,163,184,0.08)", color: T.textTertiary }}>
        {result?.disclaimer ?? "Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư."}
      </p>
    </div>
  );
}
