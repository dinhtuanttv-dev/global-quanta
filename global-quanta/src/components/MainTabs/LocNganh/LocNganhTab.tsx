import { useState, useMemo } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { useSectorRRG } from "../../../hooks/useSectorRRG";
import { useTop20Radar } from "../../../hooks/useTop20Radar";
import LocNganhPanel from "./LocNganhPanel";
import CycleScreenerPanel from "./CycleScreenerPanel";
import { CycleFingerprintTab } from "./CfTab";

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

  const { rrgData, error: rrgError, isLoading: rrgLoading } = useSectorRRG();
  const { top20Data, error: top20Error, isLoading: top20Loading } = useTop20Radar(selectedSectorKey);

  const isLoading = rrgLoading || top20Loading;
  const error = rrgError || top20Error;

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
      {/* Sub-tab switcher - CHI dieu huong hien thi, KHONG anh huong logic RRG/Top20 */}
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
          RRG & Radar
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
          {isLoading && !rrgData && <div className="t1-state-msg">Dang tai du lieu nganh...</div>}
          {error && <div className="t1-state-msg t1-error">Khong tai duoc: {String(error)}</div>}
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
                rrgPoints={rrgData?.points ?? []}
                top20={filteredTop20}
                totalAnalyzed={top20Data?.totalAnalyzed ?? 0}
                riskOnScore={top20Data?.riskOnScore ?? null}
                selectedSectorKey={selectedSectorKey}
                onSelectSector={(key) => setSelectedSectorKey(key === selectedSectorKey ? null : key)}
                onSelectTicker={selectTicker}
              />
            </>
          )}
          {!isLoading && !error && rrgData && rrgData.points.length === 0 && (
            <div className="t1-state-msg">Khong co du lieu nganh nao kha dung.</div>
          )}
        </>
      )}

      {subTab === "fingerprint" && <CycleFingerprintTab />}
    </div>
  );
}