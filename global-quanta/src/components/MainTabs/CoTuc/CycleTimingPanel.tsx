import { useCycleStats, type CycleWindowStat } from "../../../hooks/useCycleStats";

function fmtPct2(v: number | undefined | null): string {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
}

function WindowRow({ w, isBest }: { w: CycleWindowStat; isBest: boolean }) {
  if (w.n === 0) {
    return (
      <tr className="border-b border-cf-border/40">
        <td className="py-2 text-[10px] text-cf-secondary" colSpan={6}>{w.label} — chưa đủ dữ liệu lịch sử</td>
      </tr>
    );
  }
  return (
    <tr className={`border-b border-cf-border/40 ${isBest ? "bg-amber-950/20" : ""}`}>
      <td className="py-2 text-[10px] text-cf-primary font-bold">
        {isBest && "⭐ "}{w.label}
        <span className="block text-cf-tertiary font-normal">Giữ {w.holdDays} ngày · {w.n} chu kỳ</span>
      </td>
      <td className={`py-2 text-[10px] text-right ${(w.mean ?? 0) >= 0 ? "text-cf-positive" : "text-cf-negative"}`}>{fmtPct2(w.mean)}</td>
      <td className="py-2 text-[10px] text-right text-cf-secondary">{w.winRate !== undefined ? Math.round(w.winRate * 100) + "%" : "—"}</td>
      <td className="py-2 text-[10px] text-right text-cf-secondary">{w.ci5 !== undefined && w.ci95 !== undefined ? `${fmtPct2(w.ci5)} → ${fmtPct2(w.ci95)}` : "—"}</td>
      <td className={`py-2 text-[10px] text-right ${(w.annualized ?? 0) >= 0 ? "text-cf-positive" : "text-cf-negative"}`}>{fmtPct2(w.annualized)}</td>
      <td className="py-2 text-[10px] text-right font-bold text-cf-gold">{w.score !== undefined ? w.score.toFixed(1) : "—"}</td>
    </tr>
  );
}

export function CycleTimingPanel({ ticker }: { ticker: string }) {
  const { cycleData, isLoading, error } = useCycleStats(ticker);

  if (isLoading) {
    return <div className="text-center py-8 text-[10px] text-cf-tertiary">Đang tải dữ liệu Timing Engine...</div>;
  }
  if (error || !cycleData) {
    return <div className="text-center py-8 text-[10px] text-cf-tertiary">Chưa có dữ liệu Timing Engine cho mã này.</div>;
  }
  if (cycleData.totalEvents === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[10px] text-cf-tertiary">Chưa đủ lịch sử sự kiện cổ tức để phân tích xác suất.</p>
        <p className="text-[9px] text-cf-tertiary mt-1">Dữ liệu được quét dần theo vòng xoay hàng tuần — vui lòng quay lại sau.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-lg p-2.5">
        <p className="text-[9px] text-sky-300">
          Phân tích xác suất từ <b>{cycleData.totalEvents} đợt cổ tức lịch sử</b> của mã này (5 năm gần nhất) — % lợi nhuận đã trừ chi phí giao dịch 0.15%.
          Đây là <b>thống kê lịch sử, không phải khuyến nghị đầu tư</b> — quá khứ không đảm bảo tương lai.
        </p>
      </div>

      {cycleData.bestWindow && cycleData.bestWindow.n > 0 && (
        <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }} className="rounded-lg p-3">
          <p className="text-[9px] text-cf-tertiary font-bold uppercase mb-1">⭐ Cửa sổ tốt nhất (theo lịch sử)</p>
          <p className="text-sm font-black text-cf-gold">{cycleData.bestWindow.label}</p>
          <p className="text-[10px] text-cf-secondary mt-1">
            Lợi nhuận TB {fmtPct2(cycleData.bestWindow.mean)} · Tỷ lệ thắng {Math.round((cycleData.bestWindow.winRate ?? 0) * 100)}% ·
            Xác suất dương {Math.round((cycleData.bestWindow.probMeanPositive ?? 0) * 100)}%
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cf-border text-[9px] text-cf-tertiary uppercase">
              <th className="py-1.5 text-left">Cửa sổ</th>
              <th className="py-1.5 text-right">TB</th>
              <th className="py-1.5 text-right">Thắng</th>
              <th className="py-1.5 text-right">KTC 90%</th>
              <th className="py-1.5 text-right">Quy năm</th>
              <th className="py-1.5 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {cycleData.windowStats.map((w) => (
              <WindowRow key={w.id} w={w} isBest={cycleData.bestWindow?.id === w.id} />
            ))}
          </tbody>
        </table>
      </div>

      <details className="text-[10px]">
        <summary className="cursor-pointer text-cf-secondary font-bold py-1">Lịch sử {cycleData.history.length} đợt cổ tức đã phân tích</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full">
            <thead>
              <tr className="border-b border-cf-border text-[9px] text-cf-tertiary uppercase">
                <th className="py-1 text-left">Ngày GDKHQ</th>
                <th className="py-1 text-left">Loại</th>
                <th className="py-1 text-right">W1</th>
                <th className="py-1 text-right">W2</th>
                <th className="py-1 text-right">W3</th>
                <th className="py-1 text-right">W4</th>
                <th className="py-1 text-right">W5</th>
              </tr>
            </thead>
            <tbody>
              {cycleData.history.map((h) => (
                <tr key={h.exDate} className="border-b border-cf-border/30">
                  <td className="py-1 text-cf-secondary">{h.exDate.split("-").reverse().join("/")}</td>
                  <td className="py-1 text-cf-tertiary">{h.divType}</td>
                  <td className="py-1 text-right text-cf-secondary">{fmtPct2(h.w_m1)}</td>
                  <td className="py-1 text-right text-cf-secondary">{fmtPct2(h.w_pre_agm)}</td>
                  <td className="py-1 text-right text-cf-secondary">{fmtPct2(h.w_pre_ex)}</td>
                  <td className="py-1 text-right text-cf-secondary">{fmtPct2(h.w_post_ex)}</td>
                  <td className="py-1 text-right text-cf-secondary">{fmtPct2(h.w_post_credit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
