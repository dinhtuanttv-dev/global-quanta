import { useState } from "react";
import { TrendingUp, TrendingDown, Lock, Flame } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useSectorPulse, type SectorQuote } from "../../../hooks/useSectorPulse";
import { lookupSectorMapping } from "../../../lib/macro-mapping";
import { SECTOR_ETF_TO_SECTOR_KEY } from "../../../lib/sector-etf-to-sectorkey";
import { computeSectorConsensus, type MarketSectorEntry } from "../../../lib/sector-consensus";

const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  gold: "var(--gold, #f59e0b)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

type Region = "us" | "eu" | "asia";

const REGION_ORDER: Region[] = ["us", "eu", "asia"];
const REGION_LABELS: Record<Region, string> = { us: "Mỹ", eu: "Châu Âu", asia: "Châu Á" };

// MOI (2026-09-10): giai thich vi sao Chau Au / Chau A dang khoa - dung
// nguyen tinh than dong da co san o footer cu ("cac thi truong khac se mo
// rong sau khi xac nhan nguon du lieu nganh dang tin cay"), khong hien thi
// nhu da san sang khi du lieu that chua ton tai.
const REGION_LOCKED_NOTE: Record<"eu" | "asia", string> = {
  eu: "Đang xác nhận nguồn dữ liệu ngành đáng tin cậy (dự kiến dùng chỉ số ngành STOXX Europe 600) trước khi bật Smart Mapping sang mã CP VN.",
  asia: "Đang xác nhận nguồn dữ liệu ngành đáng tin cậy (dự kiến dùng chỉ số ngành MSCI Asia hoặc nhóm ngành Nikkei/Hang Seng) trước khi bật Smart Mapping sang mã CP VN.",
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
      {mapping && mapping.vnTickers.length > 0 ? (
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

function RegionTabButton({ region, active, onClick }: { region: Region; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
      style={{ background: active ? T.gold : "rgba(148,163,184,0.08)", color: active ? "#0a1020" : T.textTertiary }}>
      {REGION_LABELS[region]}
      {region !== "us" && (
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.15)", color: T.textSecondary }}>
          Sắp ra mắt
        </span>
      )}
    </button>
  );
}

function LockedRegionPanel({ region }: { region: "eu" | "asia" }) {
  return (
    <div className="py-7 px-3 text-center">
      <Lock className="w-5 h-5 mx-auto mb-2" style={{ color: T.textTertiary }} />
      <p className="text-xs mb-1" style={{ color: T.textSecondary }}>{REGION_LABELS[region]} — sắp ra mắt</p>
      <p className="text-[9px] max-w-sm mx-auto" style={{ color: T.textTertiary }}>{REGION_LOCKED_NOTE[region]}</p>
    </div>
  );
}

// PHASE 1: chi thi truong My (useSectorPulse) co du lieu nganh that. Khi bo
// sung Chau Au / Chau A, chi can push them entry "market: 'Chau Au'" vao ham
// nay - computeSectorConsensus() se tu dong tinh dong thuan dung, khong can
// sua logic hien thi.
function buildConsensusInput(topGainers: SectorQuote[], topLosers: SectorQuote[]) {
  const bySectorKey: Record<string, MarketSectorEntry[]> = {};
  for (const s of [...topGainers, ...topLosers]) {
    const sectorKey = SECTOR_ETF_TO_SECTOR_KEY[s.etfSymbol];
    const mapping = sectorKey ? lookupSectorMapping(sectorKey) : null;
    if (!sectorKey || !mapping) continue;
    if (!bySectorKey[sectorKey]) bySectorKey[sectorKey] = [];
    bySectorKey[sectorKey].push({ market: "Mỹ", sectorLabelVi: mapping.sectorLabelVi, changePercent: s.changePercent });
  }
  return bySectorKey;
}

export default function TopSectorsPanel() {
  const { topGainers, topLosers, isLoading, error } = useSectorPulse();
  const [region, setRegion] = useState<Region>("us");

  const consensusSignals = computeSectorConsensus(buildConsensusInput(topGainers, topLosers));

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Top Ngành Thị Trường (Smart Mapping → VN)</p>
        <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>HARD_DATA</span>
      </div>

      <div className="flex gap-2 border-b pb-2.5 mb-3" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
        {REGION_ORDER.map((r) => (
          <RegionTabButton key={r} region={r} active={region === r} onClick={() => setRegion(r)} />
        ))}
      </div>

      {region === "us" && (
        <>
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
            Giai đoạn 1: chỉ thị trường Mỹ (11 Sector ETF SPDR chuẩn). Châu Âu và Châu Á sẽ mở khi xác nhận nguồn dữ liệu ngành đáng tin cậy.
          </p>
        </>
      )}

      {region !== "us" && <LockedRegionPanel region={region} />}

      <div className="border-t mt-3.5 pt-3" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Flame className="w-3.5 h-3.5" style={{ color: T.gold }} />
          <p className="text-[9px] font-bold uppercase" style={{ color: T.textSecondary }}>Tín hiệu đồng thuận đa thị trường</p>
        </div>

        {consensusSignals.length === 0 ? (
          <p className="text-[9px] italic" style={{ color: T.textTertiary }}>
            Cần ít nhất 2 thị trường có dữ liệu ngành thật để tính đồng thuận — hiện tại mới có Mỹ nên mục này còn để trống.
            Sẽ tự động kích hoạt khi Châu Âu / Châu Á mở khóa.
          </p>
        ) : (
          <div className="space-y-2">
            {consensusSignals.map((sig) => (
              <div key={sig.sectorKey} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {sig.direction === "positive" ? <TrendingUp className="w-3 h-3" style={{ color: T.positive }} /> : <TrendingDown className="w-3 h-3" style={{ color: T.negative }} />}
                    <p className="text-[10px]" style={{ color: "#f1f5f9" }}>{sig.sectorLabelVi}</p>
                  </div>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: sig.direction === "positive" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
                      color: sig.direction === "positive" ? T.positive : T.negative,
                    }}>
                    Đồng thuận {sig.marketsAgreeing.length}/{sig.totalMarketsWithData} thị trường
                  </span>
                </div>
                <p className="text-[8px] mt-1 pl-4" style={{ color: T.textTertiary }}>
                  {sig.detailByMarket.map((d) => `${d.market} ${d.changePercent >= 0 ? "+" : ""}${d.changePercent.toFixed(2)}%`).join(" · ")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
