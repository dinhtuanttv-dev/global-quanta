import { memo } from "react";
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useSectorPulse } from "../../../hooks/useSectorPulse";
import { useSectorPulseRegion } from "../../../hooks/useSectorPulseRegion";
import { computeBeneficiaryStocks } from "../../../lib/beneficiary-stocks";
import type { MacroTrendRow, MacroCommodityDeltas } from "../../../hooks/useGlobalStream";

const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  gold: "var(--gold, #f59e0b)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

interface Props {
  macro: MacroTrendRow | null;
  commodityDeltas: MacroCommodityDeltas | null;
}

const MAX_ROWS = 8;

function BeneficiaryStocksPanel({ macro, commodityDeltas }: Props) {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const us = useSectorPulse();
  const eu = useSectorPulseRegion("eu");
  const asia = useSectorPulseRegion("asia");

  const signals = computeBeneficiaryStocks({
    usGainers: us.topGainers,
    usLosers: us.topLosers,
    euGainers: eu.topGainers,
    euLosers: eu.topLosers,
    asiaGainers: asia.topGainers,
    asiaLosers: asia.topLosers,
    macro,
    commodityDeltas,
  });

  const beneficiaries = signals.filter((s) => s.direction === "positive").slice(0, MAX_ROWS);
  const underPressure = signals.filter((s) => s.direction === "negative").slice(0, MAX_ROWS);

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" style={{ color: T.gold }} />
          <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Cổ Phiếu Được Hưởng Lợi / Chịu Áp Lực</p>
        </div>
        <span title="Tính trực tiếp từ dữ liệu ngành + hàng hóa đã fetch sẵn qua bảng ánh xạ cố định - KHÔNG qua AI, không tốn phí, cập nhật liên tục"
          className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>
          HARD_DATA
        </span>
      </div>
      <p className="text-[8px] italic mb-3" style={{ color: T.textTertiary }}>
        Kết hợp Nhịp Đập Thị Trường (ngành Mỹ/Âu/Á) + Nhịp Đập Hàng Hóa (vàng, dầu, cao su, phân bón, cước tàu...) — khác với bảng "Phân Tích AI" (ESTIMATED) bên dưới, bảng này không dùng AI.
      </p>

      {signals.length === 0 ? (
        <p className="text-[9px] italic py-3 text-center" style={{ color: T.textTertiary }}>
          Chưa có tín hiệu đủ mạnh (ngưỡng lọc nhiễu ±0.5%) — chờ dữ liệu thị trường/hàng hóa biến động rõ hơn.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: T.positive }}>Được hưởng lợi</p>
            <div className="space-y-1.5">
              {beneficiaries.length === 0 && <p className="text-[9px] italic" style={{ color: T.textTertiary }}>Không có mã nào</p>}
              {beneficiaries.map((s) => (
                <div key={s.ticker} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" style={{ color: T.positive }} />
                      <button onClick={() => selectTicker(s.ticker)} className="text-[10px] font-black" style={{ color: T.gold }}>{s.ticker}</button>
                      <span className="text-[8px]" style={{ color: T.textTertiary }}>{s.sectorLabelVi}</span>
                    </div>
                  </div>
                  <p className="text-[8px] mt-0.5 pl-4.5 truncate" style={{ color: T.textTertiary }} title={s.sources.join(" · ")}>
                    {s.sources.join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: T.negative }}>Chịu áp lực</p>
            <div className="space-y-1.5">
              {underPressure.length === 0 && <p className="text-[9px] italic" style={{ color: T.textTertiary }}>Không có mã nào</p>}
              {underPressure.map((s) => (
                <div key={s.ticker} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="w-3 h-3" style={{ color: T.negative }} />
                      <button onClick={() => selectTicker(s.ticker)} className="text-[10px] font-black" style={{ color: T.gold }}>{s.ticker}</button>
                      <span className="text-[8px]" style={{ color: T.textTertiary }}>{s.sectorLabelVi}</span>
                    </div>
                  </div>
                  <p className="text-[8px] mt-0.5 pl-4.5 truncate" style={{ color: T.textTertiary }} title={s.sources.join(" · ")}>
                    {s.sources.join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="text-[8px] italic mt-3 pt-2 border-t" style={{ borderColor: "rgba(148,163,184,0.08)", color: T.textTertiary }}>
        %-thay đổi hàng hóa (vàng/dầu/BDI/cà phê) tính so với lần cập nhật SSE liền trước (~5 giây), không phải %/ngày. Thông tin mang tính tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </div>
  );
}

export default memo(BeneficiaryStocksPanel);
