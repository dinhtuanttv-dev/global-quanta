import { useMemo } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { useSectorRRG } from "../../../hooks/useSectorRRG";
import { useTop20Radar } from "../../../hooks/useTop20Radar";
import LocNganhPanel from "./LocNganhPanel";
import CycleScreenerPanel from "./CycleScreenerPanel";

export default function LocNganhTab() {
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

  // Loc phia client theo Quadrant + RS Score + Volume Score - khong can goi lai API
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
            selectedSectorKey={selectedSectorKey}
            onSelectSector={(key) => setSelectedSectorKey(key === selectedSectorKey ? null : key)}
            onSelectTicker={selectTicker}
          />
        </>
      )}
      {!isLoading && !error && rrgData && rrgData.points.length === 0 && (
        <div className="t1-state-msg">Khong co du lieu nganh nao kha dung.</div>
      )}
    </div>
  );
}