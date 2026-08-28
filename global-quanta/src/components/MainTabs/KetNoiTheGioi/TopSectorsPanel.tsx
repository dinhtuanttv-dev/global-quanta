import { TrendingUp, TrendingDown } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useSectorPulse, type SectorQuote } from "../../../hooks/useSectorPulse";
import { lookupSectorMapping } from "../../../lib/macro-mapping";
import { SECTOR_ETF_TO_SECTOR_KEY } from "../../../lib/sector-etf-to-sectorkey";

const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  gold: "var(--gold, #f59e0b)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

function SectorRow({ sector, isGainer }: { sector: SectorQuote; isGainer: boolean }) {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const sectorKey = SECTOR_ETF_TO_SECTOR_KEY[sector.etfSymbol];
  const mapping = sectorKey ? lookupSectorMapping(sectorKey) : null;

  return (
    <div style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isGainer ? <TrendingUp className="w-3 h-3" style={{ color: T.positive }} /> : <TrendingDown className="w-3 h-3" style={{ color: T.negative }} />}
          <p className="text-[10px]" style={{ color: "#f1f5f9" }}>{sector.sectorNameVi}</p>
          <span className="text-[8px]" style={{ color: T.textTertiary }}>({sector.etfSymbol})</span>
        </div>
        <p className="text-[10px] font-bold" style={{ color: isGainer ? T.positive : T.negative }}>
          {sector.changePercent >= 0 ? "+" : ""}{sector.changePercent.toFixed(2)}%
        </p>
      </div>
      {mapping ? (
        <div className="flex flex-wrap gap-1 mt-1.5 pl-4">
          {mapping.vnTickers.map((ticker) => (
            <button key={ticker} onClick={() => selectTicker(ticker)}
              className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: T.gold }}>
              {ticker}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[8px] pl-4 mt-1 italic" style={{ color: T.textTertiary }}>Chưa có ánh xạ mã VN cho ngành này</p>
      )}
    </div>
  );
}

export default function TopSectorsPanel() {
  const { topGainers, topLosers, isLoading, error } = useSectorPulse();

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Top Ngành Thị Trường Mỹ (Smart Mapping → VN)</p>
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>HARD_DATA</span>
      </div>

      {isLoading && <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Đang tải...</p>}
      {error && <p className="text-xs" style={{ color: T.negative }}>Không tải được: {String(error)}</p>}

      {!isLoading && !error && topGainers.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: T.positive }}>Tăng mạnh nhất</p>
            <div className="space-y-1.5">
              {topGainers.map((s) => <SectorRow key={s.etfSymbol} sector={s} isGainer />)}
            </div>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: T.negative }}>Giảm mạnh nhất</p>
            <div className="space-y-1.5">
              {topLosers.map((s) => <SectorRow key={s.etfSymbol} sector={s} isGainer={false} />)}
            </div>
          </div>
        </div>
      )}

      <p className="text-[8px] italic mt-2.5" style={{ color: T.textTertiary }}>
        Giai đoạn 1: chỉ thị trường Mỹ (11 Sector ETF SPDR chuẩn). Các thị trường khác sẽ mở rộng sau khi xác nhận nguồn dữ liệu ngành đáng tin cậy.
      </p>
    </div>
  );
}
