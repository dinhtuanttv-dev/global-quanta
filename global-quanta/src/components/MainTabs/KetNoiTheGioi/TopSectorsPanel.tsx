import { TrendingUp, TrendingDown, Flame, Info } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { useSectorPulse, type SectorQuote } from "../../../hooks/useSectorPulse";
import { useSectorPulseRegion } from "../../../hooks/useSectorPulseRegion";
import { useSectorConfidence } from "../../../hooks/useSectorConfidence";
import { lookupSectorMapping } from "../../../lib/macro-mapping";
import { SECTOR_ETF_TO_SECTOR_KEY } from "../../../lib/sector-etf-to-sectorkey";
import { EU_SECTOR_INSTRUMENTS, ASIA_SECTOR_PROXY_BASKETS } from "../../../lib/region-sector-sources";
import { computeSectorConsensus, type MarketSectorEntry } from "../../../lib/sector-consensus";
import ConfidenceBadge from "./ConfidenceBadge";
import { useState } from "react";

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

function SectorRow({ sector, isGainer, resolveSectorKey, confidence }: { sector: SectorQuote; isGainer: boolean; resolveSectorKey: (etf: string) => string | undefined; confidence: ReturnType<typeof useSectorConfidence>["confidenceByKey"] }) {
  const selectTicker = useAppStore((s) => s.selectTicker);
  const sectorKey = resolveSectorKey(sector.etfSymbol);
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
        <div className="flex flex-wrap items-center gap-1 mt-1.5 pl-4">
          {mapping.vnTickers.map((ticker) => (
            <button key={ticker} onClick={() => selectTicker(ticker)}
              className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: T.gold }}>
              {ticker}
            </button>
          ))}
          {sectorKey && <ConfidenceBadge confidence={confidence.get(sectorKey)} />}
        </div>
      ) : (
        <p className="text-[8px] pl-4 mt-1 italic" style={{ color: T.textTertiary }}>Chưa có ánh xạ mã VN cho ngành này</p>
      )}
    </div>
  );
}

function SectorGrid({ gainers, losers, resolveSectorKey, confidence }: { gainers: SectorQuote[]; losers: SectorQuote[]; resolveSectorKey: (etf: string) => string | undefined; confidence: ReturnType<typeof useSectorConfidence>["confidenceByKey"] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: T.positive }}>Tăng mạnh nhất</p>
        <div className="space-y-1.5">
          {gainers.map((s) => <SectorRow key={s.etfSymbol} sector={s} isGainer resolveSectorKey={resolveSectorKey} confidence={confidence} />)}
        </div>
      </div>
      <div>
        <p className="text-[9px] font-bold uppercase mb-1.5" style={{ color: T.negative }}>Giảm mạnh nhất</p>
        <div className="space-y-1.5">
          {losers.map((s) => <SectorRow key={s.etfSymbol} sector={s} isGainer={false} resolveSectorKey={resolveSectorKey} confidence={confidence} />)}
        </div>
      </div>
    </div>
  );
}

// MOI (2026-09-10): hien thi khi backend CHUA co endpoint cho khu vuc nay -
// thay vi bao loi tho hoac gia vo "sap ra mat" mo ho, liet ke chinh xac
// nguon du lieu da nghien cuu (region-sector-sources.ts) de nguoi dung/dev
// biet ro can lam gi tiep theo.
function PendingBackendPanel({ region }: { region: "eu" | "asia" }) {
  const items = region === "eu" ? EU_SECTOR_INSTRUMENTS : ASIA_SECTOR_PROXY_BASKETS;
  const verifiedCount = items.filter((i) => i.verified).length;

  return (
    <div className="py-4 px-1">
      <div className="flex items-start gap-2 mb-3" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
        <div className="p-2.5 rounded-lg w-full flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: T.gold }} />
          <p className="text-[10px]" style={{ color: T.gold }}>
            Backend chưa hỗ trợ khu vực này (endpoint <code>/api/global/sector-pulse?region={region}</code> chưa xử lý tham số region —
            có thể trả về dữ liệu mặc định của Mỹ, đã được lọc bỏ để tránh hiển thị nhầm).
            Danh sách nguồn dữ liệu đã nghiên cứu — {verifiedCount}/{items.length} đã xác minh ticker — hiển thị bên dưới để tham khảo.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        {region === "eu" && EU_SECTOR_INSTRUMENTS.map((i) => (
          <div key={i.sectorKey} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px]" style={{ color: "#f1f5f9" }}>{i.labelVi}</p>
              <p className="text-[8px]" style={{ color: T.textTertiary }}>{i.fundNameVi}</p>
            </div>
            {i.verified ? (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "rgba(2,6,15,0.6)", color: T.positive }}>{i.ticker}</span>
            ) : (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.1)", color: T.textTertiary }}>Cần xác nhận ticker</span>
            )}
          </div>
        ))}
        {region === "asia" && ASIA_SECTOR_PROXY_BASKETS.map((b) => (
          <div key={b.sectorKey} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px]" style={{ color: "#f1f5f9" }}>{b.labelVi}</p>
              {b.verified ? (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(52,211,153,0.1)", color: T.positive }}>Rổ đã xác minh</span>
              ) : (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.1)", color: T.textTertiary }}>Cần xác nhận rổ</span>
              )}
            </div>
            <p className="text-[8px] mt-1" style={{ color: T.textTertiary }}>{b.descriptionVi}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionTabButton({ region, active, onClick }: { region: Region; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="text-[10px] font-bold uppercase px-2.5 py-1.5 rounded-lg transition-colors"
      style={{ background: active ? T.gold : "rgba(148,163,184,0.08)", color: active ? "#0a1020" : T.textTertiary }}>
      {REGION_LABELS[region]}
    </button>
  );
}

function resolveEuSectorKey(ticker: string): string | undefined {
  return EU_SECTOR_INSTRUMENTS.find((i) => i.ticker === ticker)?.sectorKey;
}

function resolveAsiaSectorKey(basketId: string): string | undefined {
  return ASIA_SECTOR_PROXY_BASKETS.find((b) => b.sectorKey === basketId || b.tickers.includes(basketId))?.sectorKey;
}

// FIX (2026-09-10): phat hien bug thuc te - backend co the KHONG kiem tra
// tham so "region" va tra ve nguyen du lieu My mac dinh (200 OK, khong
// loi). Neu chi dua vao "khong loi + co du lieu" (backendReady cu) se hien
// nham du lieu My duoi ten Chau Au/Chau A. Ham nay xac thuc CHEO: chi coi
// la du lieu that cua khu vuc khi it nhat 1 etfSymbol tra ve khop voi
// resolveSectorKey rieng cua khu vuc do (VD: "BNK.PA" cho EU, khong phai
// "XLE" cua My).
function isGenuineRegionData(quotes: SectorQuote[], resolveSectorKey: (etf: string) => string | undefined): boolean {
  return quotes.length > 0 && quotes.some((s) => resolveSectorKey(s.etfSymbol) !== undefined);
}

function pushEntries(
  bySectorKey: Record<string, MarketSectorEntry[]>,
  market: string,
  quotes: SectorQuote[],
  resolveSectorKey: (etf: string) => string | undefined,
) {
  for (const s of quotes) {
    const sectorKey = resolveSectorKey(s.etfSymbol);
    const mapping = sectorKey ? lookupSectorMapping(sectorKey) : null;
    if (!sectorKey || !mapping) continue;
    if (!bySectorKey[sectorKey]) bySectorKey[sectorKey] = [];
    bySectorKey[sectorKey].push({ market, sectorLabelVi: mapping.sectorLabelVi, changePercent: s.changePercent });
  }
}

export default function TopSectorsPanel() {
  const us = useSectorPulse();
  const eu = useSectorPulseRegion("eu");
  const asia = useSectorPulseRegion("asia");
  const { confidenceByKey } = useSectorConfidence();
  const [region, setRegion] = useState<Region>("us");

  const euGenuine = isGenuineRegionData([...eu.topGainers, ...eu.topLosers], resolveEuSectorKey);
  const asiaGenuine = isGenuineRegionData([...asia.topGainers, ...asia.topLosers], resolveAsiaSectorKey);

  const bySectorKey: Record<string, MarketSectorEntry[]> = {};
  pushEntries(bySectorKey, "Mỹ", [...us.topGainers, ...us.topLosers], (etf) => SECTOR_ETF_TO_SECTOR_KEY[etf]);
  if (euGenuine) pushEntries(bySectorKey, "Châu Âu", [...eu.topGainers, ...eu.topLosers], resolveEuSectorKey);
  if (asiaGenuine) pushEntries(bySectorKey, "Châu Á", [...asia.topGainers, ...asia.topLosers], resolveAsiaSectorKey);
  const consensusSignals = computeSectorConsensus(bySectorKey);

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
          {us.isLoading && <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Đang tải...</p>}
          {us.error && <p className="text-xs" style={{ color: T.negative }}>Không tải được: {String(us.error)}</p>}
          {!us.isLoading && !us.error && us.topGainers.length > 0 && (
            <SectorGrid gainers={us.topGainers} losers={us.topLosers} resolveSectorKey={(etf) => SECTOR_ETF_TO_SECTOR_KEY[etf]} confidence={confidenceByKey} />
          )}
          <p className="text-[8px] italic mt-2.5" style={{ color: T.textTertiary }}>
            11 Sector ETF SPDR chuẩn — dữ liệu trực tiếp, cập nhật mỗi 5 phút.
          </p>
        </>
      )}

      {region === "eu" && (
        <>
          {eu.isLoading && <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Đang tải...</p>}
          {!eu.isLoading && euGenuine && (
            <SectorGrid gainers={eu.topGainers} losers={eu.topLosers} resolveSectorKey={resolveEuSectorKey} confidence={confidenceByKey} />
          )}
          {!eu.isLoading && !euGenuine && <PendingBackendPanel region="eu" />}
        </>
      )}

      {region === "asia" && (
        <>
          {asia.isLoading && <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Đang tải...</p>}
          {!asia.isLoading && asiaGenuine && (
            <SectorGrid gainers={asia.topGainers} losers={asia.topLosers} resolveSectorKey={resolveAsiaSectorKey} confidence={confidenceByKey} />
          )}
          {!asia.isLoading && !asiaGenuine && <PendingBackendPanel region="asia" />}
        </>
      )}

      <div className="border-t mt-3.5 pt-3" style={{ borderColor: "rgba(148,163,184,0.15)" }}>
        <div className="flex items-center gap-1.5 mb-2">
          <Flame className="w-3.5 h-3.5" style={{ color: T.gold }} />
          <p className="text-[9px] font-bold uppercase" style={{ color: T.textSecondary }}>Tín hiệu đồng thuận đa thị trường</p>
        </div>

        {consensusSignals.length === 0 ? (
          <p className="text-[9px] italic" style={{ color: T.textTertiary }}>
            Cần ít nhất 2 thị trường có dữ liệu ngành thật để tính đồng thuận — hiện tại mới có Mỹ nên mục này còn để trống.
            Sẽ tự động kích hoạt khi backend Châu Âu / Châu Á sẵn sàng.
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
