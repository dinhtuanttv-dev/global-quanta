import { useState } from "react";
import CatalystCardRow from "./CatalystCardRow";
import DeepAnalysisDrawer from "./DeepAnalysisDrawer";
import { sectorLabelVi } from "../../../utils/sectorLabelVi";
import CascadeGroupList from "./CascadeGroupList";
import type { CatalystCard, CatalystSector } from "../../../types/catalyst";

export default function SectorCard({ sector }: { sector: CatalystSector }) {
  const netPositive = sector.netScore >= 0;
  const [drawerCard, setDrawerCard] = useState<CatalystCard | null>(null);
  return (
    <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{sectorLabelVi(sector.sector)}</span>
        {sector.isNew && <span style={{ fontSize: 9, color: "var(--gold-bright)", fontWeight: 700 }}>MỚI</span>}
        <span style={{ marginLeft: "auto", fontSize: 11, color: netPositive ? "var(--positive)" : "var(--negative)", fontWeight: 700 }}>
          Net {netPositive ? "+" : ""}{(sector.netScore * 100).toFixed(2)}%
        </span>
        <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{sector.tickerCount} mã</span>
      </div>
      {sector.primaryCards.map((c) => <CatalystCardRow key={c.sourceId + c.ticker} card={c} onOpenAnalysis={setDrawerCard} />)}
      <CascadeGroupList cards={sector.cascadeCards} />
      {/* X5: bấm mã / "Phân tích sâu" mở ngăn kéo với dữ liệu thật (BCTC VNDirect, lợi suất danh mục ★) */}
      {drawerCard && <DeepAnalysisDrawer card={drawerCard} onClose={() => setDrawerCard(null)} />}
    </div>
  );
}
