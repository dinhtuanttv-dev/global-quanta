// OV-1 (27/11/2026) — tab con 2 "Thị trường" của TỔNG QUAN: Trung tâm thị trường → Trạng thái thị trường → VN-Index.
// Các khối giữ nguyên mã và logic; chỉ đổi chỗ. Không phụ thuộc bảng quét đang tải/lỗi (mỗi khối có nguồn riêng).
import { useCallback } from "react";
import { useSieuQuetScanner } from "../../../hooks/useSieuQuetScanner";
import { useResearchUi } from "../../../hooks/useResearchUi";
import { useResearchOverview } from "../../../hooks/useResearch";
import { useTabNavigation } from "../../../lib/TabNavigationContext";
import type { SectorLadderRow } from "../../../lib/locnganh/types";
import { useAppStore } from "../../../store/useAppStore";
import MarketCenterPanel from "./MarketCenterPanel";
import TradingMatrixPanel from "./TradingMatrix/TradingMatrixPanel";
import VnIndexBand from "./VnIndexBand";
import VnIndexAiPanel from "./VnIndexAiPanel";
import ResearchUiToggle from "./ResearchUiToggle";
import { ImpulseFlowPanel, TechnicalTiles } from "./MarketIntel";

/** Khối kỹ thuật + khối Impulse/dòng tiền lấy thêm giá đóng cửa và Market Intelligence từ tổng quan nghiên cứu (SWR dùng chung). */
function TechnicalConnected({ state }: { state: ReturnType<typeof useSieuQuetScanner>["indexState"] }) {
  const { data } = useResearchOverview();
  return <TechnicalTiles state={state} close={data?.index?.current.close ?? null} />;
}
function ImpulseConnected({ score }: { score: number | null }) {
  const { data } = useResearchOverview();
  return <ImpulseFlowPanel score={score} intel={data?.intel} />;
}

const SECTIONS = [
  { id: "ov-market-center", label: "Trung tâm thị trường" },
  { id: "ov-market-state", label: "Trạng thái thị trường" },
  { id: "ov-vnindex", label: "VN-Index" },
] as const;

export default function MarketView({ activeSector, onSector, onIndustry }: {
  activeSector: string | null;
  /** Bấm ngành (bản đồ nhiệt / đảo góc RRG) -> lọc bảng và chuyển sang tab Bảng giao dịch (quyết định 27/11). */
  onSector: (s: SectorLadderRow | null) => void;
  onIndustry: (name: string | null) => void;
}) {
  const { indexState, error } = useSieuQuetScanner();
  const [researchUiOn] = useResearchUi();
  const selectTicker = useAppStore((s) => s.selectTicker);
  const onSelect = useCallback((ticker: string) => selectTicker(ticker), [selectTicker]);
  const navigateTab = useTabNavigation();
  const focusSector = useAppStore((s) => s.focusSector);
  const openSector = useCallback((code: string) => { focusSector(code); navigateTab?.("Loc nganh"); }, [focusSector, navigateTab]);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });

  return (
    <div className="flex flex-col gap-4" data-testid="overview-market">
      <nav className="ov-anchors" aria-label="Các khối của tab Thị trường" data-testid="ov-anchors">
        {SECTIONS.map((s, i) => <button key={s.id} type="button" onClick={() => jump(s.id)}><span aria-hidden>{i + 1}</span>{s.label}</button>)}
      </nav>
      <div id={SECTIONS[0].id} className="ov-block"><MarketCenterPanel /></div>
      <div id={SECTIONS[1].id} className="ov-block">
        <TradingMatrixPanel onSelectTicker={onSelect} activeSector={activeSector} onSector={onSector} onOpenSector={openSector} onIndustry={onIndustry} />
      </div>
      <div id={SECTIONS[2].id} className="ov-block">
        <VnIndexBand
          indexState={indexState}
          error={error ? String((error as Error)?.message ?? error) : null}
          technical={<TechnicalConnected state={indexState} />}
          impulse={<ImpulseConnected score={indexState?.impulseScore ?? null} />}
          aiPanel={researchUiOn ? <VnIndexAiPanel /> : null}
          toggle={<ResearchUiToggle />}
          showMarketCenter={false}
          openKey="gq.vnBandOpen.market"
          defaultOpen
        />
      </div>
    </div>
  );
}
