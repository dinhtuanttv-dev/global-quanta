import { useState, useMemo } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { useTop20Radar } from "../../../hooks/useTop20Radar";
import LocNganhPanel from "./LocNganhPanel";
import CycleScreenerPanel from "./CycleScreenerPanel";
import { CycleFingerprintTab } from "./CfTab";
import SectorRotationPanel from "./timing/SectorRotationPanel";
import { useSectorTimingSignals } from "../../../hooks/useSectorTimingSignals";
import { useSectorRrg, useSectorTaxonomy } from "../../../hooks/useSectorRotation";
import { isMarketGatewayEnabled } from "../../../services/marketDataClient";

type SubTab = "rrg" | "fingerprint";

export default function LocNganhTab() {
  const [subTab, setSubTab] = useState<SubTab>("rrg");

  const selectedSectorKey = useAppStore((s) => s.selectedSectorKey);
  const setSelectedSectorKey = useAppStore((s) => s.setSelectedSectorKey);
  const selectedQuadrant = useAppStore((s) => s.selectedQuadrant);
  const setSelectedQuadrant = useAppStore((s) => s.setSelectedQuadrant);
  const minRsScore = useAppStore((s) => s.minRsScore);
  const setMinRsScore = useAppStore((s) => s.setMinRsScore);
  const minVolumeScore = useAppStore((s) => s.minVolumeScore);
  const setMinVolumeScore = useAppStore((s) => s.setMinVolumeScore);
  const resetSectorFilters = useAppStore((s) => s.resetSectorFilters);
  const selectTicker = useAppStore((s) => s.selectTicker);

  // L5: ma trận RRG cũ (Yahoo, 1 mã đại diện, 8 ngành) đã gỡ — ngành chọn ở bảng Xoay vòng ngành ICB (mã ICB 4 số)
  const sectorRrg = useSectorRrg();
  const { top20Data, error: top20Error, isLoading: top20Loading } = useTop20Radar(selectedSectorKey);

  // L4: tín hiệu thời điểm của ngành ICB (cấp 2) chứa từng mã trong Top 20
  const gateway = isMarketGatewayEnabled();
  const timing = useSectorTimingSignals({ enabled: gateway && subTab === "rrg" });
  const icb = useSectorTaxonomy();
  const timingOf = useMemo(() => (icb && timing.bySector.size ? (t: string) => timing.bySector.get(icb[t]?.l2 ?? "") ?? null : undefined), [icb, timing.bySector]);

  const isLoading = top20Loading;
  const error = top20Error;
  const selectedSector = useMemo(() => {
    if (!selectedSectorKey) return null;
    const s = sectorRrg.data?.sectors.find((x) => x.code === selectedSectorKey);
    return { code: selectedSectorKey, name: s?.name ?? selectedSectorKey };
  }, [selectedSectorKey, sectorRrg.data]);

  const filteredTop20 = useMemo(() => {
    const raw = top20Data?.top20 ?? [];
    return raw.filter((s) => {
      if (selectedQuadrant && s.sectorQuadrant !== selectedQuadrant) return false;
      if (s.rsScore < minRsScore) return false;
      if (s.volumeScore < minVolumeScore) return false;
      return true;
    });
  }, [top20Data, selectedQuadrant, minRsScore, minVolumeScore]);

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
          {isLoading && !top20Data && <div className="t1-state-msg">Đang tải Top 20…</div>}
          {gateway && <SectorRotationPanel selectedSector={selectedSectorKey} onFilterSector={(code) => setSelectedSectorKey(code === selectedSectorKey ? null : code)} />}
          {error && <div className="t1-state-msg t1-error">Không tải được Top 20: {String(error)}</div>}
          {!error && (
            <>
              <CycleScreenerPanel
                selectedQuadrant={selectedQuadrant}
                onSelectQuadrant={setSelectedQuadrant}
                minRsScore={minRsScore}
                onChangeMinRs={setMinRsScore}
                minVolumeScore={minVolumeScore}
                onChangeMinVolume={setMinVolumeScore}
                onReset={resetSectorFilters}
              />
              <LocNganhPanel
                top20={filteredTop20}
                totalAnalyzed={top20Data?.totalAnalyzed ?? 0}
                riskOnScore={top20Data?.riskOnScore ?? null}
                selectedSector={selectedSector}
                onClearSector={() => setSelectedSectorKey(null)}
                onSelectTicker={selectTicker}
                timingOf={timingOf}
                dataSource={top20Data?.dataSource}
                evidence={top20Data?.evidence}
              />
            </>
          )}
        </>
      )}

      {subTab === "fingerprint" && <CycleFingerprintTab />}
    </div>
  );
}