import { useCycleRanking } from "../../../hooks/useCycleStats";

function fmtPct2(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
}

// "Quet toan bo danh muc" (Tab C, phan 2 cua cong cu HTML goc) - xep
// hang MOI MA theo cua so tot nhat cua CHINH NO, dua tren lich su that
// (khong nhap lieu thu cong).
export function CycleRankingPanel({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  const { ranking, isLoading, error } = useCycleRanking();

  if (isLoading) {
    return <div className="text-center py-10 text-[10px] text-cf-tertiary">Đang tải bảng xếp hạng...</div>;
  }
  if (error) {
    return <div className="text-center py-10 text-[10px] text-cf-tertiary">Không tải được dữ liệu xếp hạng lúc này.</div>;
  }

  return (
    <div className="space-y-3">
      <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-lg p-2.5">
        <p className="text-[9px] text-sky-300">
          Xếp hạng từng mã theo <b>cửa sổ giải ngân tốt nhất của chính mã đó</b> (tính từ lịch sử cổ tức thật, 5 năm gần nhất).
          Bấm vào 1 mã để xem chi tiết 5 cửa sổ trong tab "🎯 Xác Suất Giải Ngân". Đây là <b>thống kê lịch sử, không phải khuyến nghị đầu tư</b>.
        </p>
      </div>

      {ranking.length === 0 ? (
        <div className="text-center py-10 text-[10px] text-cf-tertiary">Chưa có mã nào đủ dữ liệu lịch sử — Cron Job đang quét dần theo vòng xoay hàng tuần.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cf-border text-[9px] text-cf-tertiary uppercase">
                <th className="py-2 text-left">Mã</th>
                <th className="py-2 text-right">Chu kỳ</th>
                <th className="py-2 text-left">Cửa sổ tốt nhất</th>
                <th className="py-2 text-right">TB</th>
                <th className="py-2 text-right">Thắng</th>
                <th className="py-2 text-right">Quy năm</th>
                <th className="py-2 text-right">Score</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.ticker} className="border-b border-cf-border/40 cursor-pointer hover:bg-cf-base/60" onClick={() => onSelectTicker(r.ticker)}>
                  <td className="py-2 text-[10px] font-bold text-cf-gold">{r.ticker}</td>
                  <td className="py-2 text-[10px] text-right text-cf-secondary">{r.nCycles}</td>
                  <td className="py-2 text-[10px] text-cf-primary">{r.best.label}</td>
                  <td className={`py-2 text-[10px] text-right ${(r.best.mean ?? 0) >= 0 ? "text-cf-positive" : "text-cf-negative"}`}>{fmtPct2(r.best.mean)}</td>
                  <td className="py-2 text-[10px] text-right text-cf-secondary">{r.best.winRate !== undefined ? Math.round(r.best.winRate * 100) + "%" : "—"}</td>
                  <td className={`py-2 text-[10px] text-right ${(r.best.annualized ?? 0) >= 0 ? "text-cf-positive" : "text-cf-negative"}`}>{fmtPct2(r.best.annualized)}</td>
                  <td className="py-2 text-[10px] text-right font-bold text-cf-gold">{r.best.score !== undefined ? r.best.score.toFixed(1) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
