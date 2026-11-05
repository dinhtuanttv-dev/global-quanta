import { useState, useMemo } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { CycleFingerprintTab } from "./CfTab";
import SectorRotationPanel from "./timing/SectorRotationPanel";
import { useSectorLadder, useSectorRrg } from "../../../hooks/useSectorRotation";
import { useSectorTimingSignals } from "../../../hooks/useSectorTimingSignals";
import { useCycleSummary } from "../../../hooks/useCycleSummary";
import type { SectorTimingSignalV2 } from "../../../lib/locnganh/types";
import { isMarketGatewayEnabled } from "../../../services/marketDataClient";
import Top20V2Panel from "./Top20V2Panel";
import { useAlphaTop20 } from "../../../hooks/useAlphaTop20";

type SubTab = "rrg" | "fingerprint";

export default function LocNganhTab() {
  const [subTab, setSubTab] = useState<SubTab>("rrg");

  const selectedSectorKey = useAppStore((s) => s.selectedSectorKey);
  const setSelectedSectorKey = useAppStore((s) => s.setSelectedSectorKey);
  const selectTicker = useAppStore((s) => s.selectTicker);

  // L5: ma trận RRG cũ (Yahoo, 1 mã đại diện, 8 ngành) đã gỡ — ngành chọn ở bảng Xoay vòng ngành ICB (mã ICB 4 số)
  const sectorRrg = useSectorRrg();
  const selectedSector = useMemo(() => {
    if (!selectedSectorKey) return null;
    const s = sectorRrg.data?.sectors.find((x) => x.code === selectedSectorKey);
    if (s?.level === 3 && s.parent) {
      const parent = sectorRrg.data?.sectors.find((x) => x.level === 2 && x.code === s.parent);
      return { code: s.parent, name: `${s.name} · lọc theo ICB cấp 2: ${parent?.name ?? s.parent}` };
    }
    return { code: selectedSectorKey, name: s?.name ?? selectedSectorKey };
  }, [selectedSectorKey, sectorRrg.data]);
  const alpha = useAlphaTop20(subTab === "rrg");
  const gateway = isMarketGatewayEnabled();
  // Giai đoạn C: bối cảnh cho từng mã Top 20 (không cộng vào điểm).
  const ladder = useSectorLadder();
  const timing = useSectorTimingSignals({ enabled: gateway && subTab === "rrg" });
  const topTickers = useMemo(() => (subTab === "rrg" ? (alpha.data?.top20 ?? []).map((s) => s.ticker) : []), [alpha.data, subTab]);
  const cycles = useCycleSummary(topTickers);
  const ctx = useMemo(() => ({
    rrgOf: new Map((sectorRrg.data?.sectors ?? []).map((s) => [s.code, s])),
    ladderOf: new Map((ladder.data?.sectors ?? []).map((s) => [s.code, s])),
    timingOf: timing.bySector as ReadonlyMap<string, SectorTimingSignalV2>,
    cycleOf: new Map((cycles.data?.rows ?? []).map((r) => [r.symbol, r])),
    cycleLoading: cycles.isLoading,
  }), [sectorRrg.data, ladder.data, timing.bySector, cycles.data, cycles.isLoading]);
  const focusSector = useAppStore((s) => s.focusSector);
  const openCycle = (ticker: string) => { selectTicker(ticker); setSubTab("fingerprint"); };

  return (
    <div className="loc-nganh-tab">
      {/* Sub-tab: chỉ điều hướng hiển thị, không ảnh hưởng logic xoay vòng ngành / Top 20 */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <button
          onClick={() => setSubTab("rrg")}
          style={{
            fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8, cursor: "pointer",
            background: subTab === "rrg" ? "var(--gold)" : "var(--bg-surface-2)",
            color: subTab === "rrg" ? "#0a0a0a" : "var(--text-secondary)",
            border: "none",
          }}
        >
          Xoay vòng ngành & Top 20
        </button>
        <button
          onClick={() => setSubTab("fingerprint")}
          style={{
            fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8, cursor: "pointer",
            background: subTab === "fingerprint" ? "var(--gold)" : "var(--bg-surface-2)",
            color: subTab === "fingerprint" ? "#0a0a0a" : "var(--text-secondary)",
            border: "none",
          }}
        >
          Cycle Fingerprint
        </button>
      </div>

      {subTab === "rrg" && (
        <>
          {gateway && <SectorRotationPanel selectedSector={selectedSectorKey} onFilterSector={(code) => setSelectedSectorKey(code === selectedSectorKey ? null : code)} />}
          {alpha.data
            ? <Top20V2Panel data={alpha.data} selectedSector={selectedSector} onClearSector={() => setSelectedSectorKey(null)} onSelectTicker={selectTicker}
              onRefresh={() => { void alpha.refresh(); }} refreshing={alpha.isValidating}
              ctx={ctx} onOpenSector={focusSector} onOpenCycle={openCycle} />
            : <div className="t1-state-msg">{alpha.error ? `Không tải được Top 20: ${alpha.error.message}` : "Đang tải Top 20…"}</div>}
        </>
      )}

      {subTab === "fingerprint" && <CycleFingerprintTab />}
    </div>
  );
}
