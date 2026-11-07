// TO-v1 (07/11/2026) — tab "🧭 Thời điểm tối ưu": thay engine W1–W5 của Project A bằng "Săn cổ tức trước GDKHQ" trên Gateway.
// Radar trực tiếp → tham chiếu theo nhóm lợi suất → sổ theo dõi tiến TO-L1 (TO-r1) → mô phỏng danh mục → W1–W5 tính lại (MÔ TẢ).
import { useToOverview } from "../../../../hooks/useCorpEvents";
import { pct } from "../../../../lib/cotuc/to";
import { ToRadar } from "./ToRadar";
import { ToLedger, ToLegacyWindows, ToReference, ToSimPanel } from "./ToPanels";

export default function TimingCenter({ onSelectTicker }: { onSelectTicker?: (t: string) => void }) {
  const { data, error, isLoading } = useToOverview(true);
  if (isLoading && !data) return <div className="tw-scope p-4 text-[11px] text-slate-500" role="status">Đang tải Săn cổ tức…</div>;
  if (!data) return <div className="tw-scope rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-[11px] text-amber-300">Chưa tải được dữ liệu Săn cổ tức từ Gateway{error ? ` (${error.slice(0, 80)})` : ""}.</div>;
  return (
    <div className="space-y-3" data-testid="timing-center">
      <div className="tw-scope rounded-xl border border-white/[0.06] bg-[#0b0f17] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-[13px] font-bold text-[#F5CE72]">🎯 Săn cổ tức trước GDKHQ</h4>
          <span className="rounded border border-sky-400/40 px-1.5 text-[10px] font-semibold text-sky-300" title="Theo kiểm định đặt trước TO-r1">{data.label}</span>
          <span className="text-[10px] text-slate-500">{data.version}</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
          Quy tắc cố định TO-r1: đợt cổ tức tiền có lợi suất (theo giá trước công bố) ≥ {pct(data.rule.minYield, 0)}, GTGD 20 phiên ≥ 1 tỷ, phiên đầu sau công bố không tăng trần →
          vào cuối phiên đầu tiên sau ngày công bố, bán cuối phiên cuối còn quyền (trước GDKHQ, không nhận cổ tức), nắm ≥ 2 phiên (T+2). Lợi nhuận đo vượt VN-Index, đã trừ phí {pct(data.rule.costBuy + data.rule.costSell, 2)}.
          Đã qua kiểm đối chứng (cùng mã, không có sự kiện) và điều chỉnh beta trong backtest; đang chờ kiểm định tiến — <b className="text-slate-300">chưa phải khuyến nghị</b>.
        </p>
      </div>
      <ToRadar data={data} onSelectTicker={onSelectTicker} />
      <div className="grid gap-3 xl:grid-cols-2"><ToReference data={data} /><ToLedger data={data} /></div>
      <ToSimPanel />
      <ToLegacyWindows defaultTicker={data.radar.rows[0]?.t ?? null} />
    </div>
  );
}
