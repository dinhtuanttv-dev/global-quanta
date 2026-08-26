import { useAppStore } from "../../../store/useAppStore";
import { useSectorRRG } from "../../../hooks/useSectorRRG";
import { useTop20Radar } from "../../../hooks/useTop20Radar";
import LocNganhPanel from "./LocNganhPanel";

export default function LocNganhTab() {
  const selectedSectorKey = useAppStore((s) => s.selectedSectorKey);
  const setSelectedSectorKey = useAppStore((s) => s.setSelectedSectorKey);
  const selectTicker = useAppStore((s) => s.selectTicker);

  const { rrgData, error: rrgError, isLoading: rrgLoading } = useSectorRRG();
  const { top20Data, error: top20Error, isLoading: top20Loading } = useTop20Radar(selectedSectorKey);

  const isLoading = rrgLoading || top20Loading;
  const error = rrgError || top20Error;

  return (
    <div className="loc-nganh-tab">
      {isLoading && !rrgData && <div className="t1-state-msg">Dang tai du lieu nganh...</div>}
      {error && <div className="t1-state-msg t1-error">Khong tai duoc: {String(error)}</div>}
      {!error && (
        <LocNganhPanel
          rrgPoints={rrgData?.points ?? []}
          top20={top20Data?.top20 ?? []}
          totalAnalyzed={top20Data?.totalAnalyzed ?? 0}
          selectedSectorKey={selectedSectorKey}
          onSelectSector={(key) => setSelectedSectorKey(key === selectedSectorKey ? null : key)}
          onSelectTicker={selectTicker}
        />
      )}
      {!isLoading && !error && rrgData && rrgData.points.length === 0 && (
        <div className="t1-state-msg">Khong co du lieu nganh nao kha dung.</div>
      )}
    </div>
  );
}