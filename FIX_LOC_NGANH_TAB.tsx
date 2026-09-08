/**
 * FIX: Enhanced LocNganhTab.tsx
 * Add debug panel, refresh button, and fix conditional rendering
 */
import { useState, useEffect, useMemo } from "react";
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

  const { rrgData, error: rrgError, usingFallback: rrgFallback, isLoading: rrgLoading, refresh: rrgRefresh } = useSectorRRG();
  const { top20Data, error: top20Error, usingFallback: top20Fallback, isLoading: top20Loading, refresh: top20Refresh } = useTop20Radar(selectedSectorKey);

  const isLoading = rrgLoading || top20Loading;
  const error = rrgError || top20Error;
  const usingFallback = rrgFallback || top20Fallback;
  const [showDebug, setShowDebug] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => { if (rrgData?.generatedAt) setLastUpdated(new Date(rrgData.generatedAt)); }, [rrgData]);

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
      <button onClick={() => setShowDebug(!showDebug)} style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999, background: '#333', color: '#fff', padding: '4px 8px', fontSize: 10, borderRadius: 4 }}>
        Debug
      </button>

      {showDebug && (
        <div style={{ background: '#1a1a2e', padding: 12, fontSize: 11, color: '#fff', borderRadius: 8, marginBottom: 12 }}>
          <div><strong>DEBUG:</strong> isLoading={String(isLoading)}, error={String(error)}, usingFallback={String(usingFallback)}</div>
          <div>rrgData.points.length={rrgData?.points?.length ?? 'N/A'}, top20Data.top20.length={top20Data?.top20?.length ?? 'N/A'}</div>
          <div>lastUpdated={lastUpdated?.toLocaleTimeString() ?? 'N/A'}</div>
        </div>
      )}

      {isLoading && !rrgData && !top20Data && <div className="t1-state-msg">Đang tải dữ liệu ngành...</div>}
      {error && !usingFallback && <div className="t1-state-msg t1-error">Không tải được: {String(error)} <button onClick={() => { rrgRefresh(); top20Refresh(); }}>Thử lại</button></div>}
      {usingFallback && !isLoading && <div className="t1-state-msg" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", color: "var(--gold)" }}>⚠️ API backend không khả dụng - Đang dùng dữ liệu mẫu.</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 8 }}>
        <span>Cập nhật: {lastUpdated?.toLocaleString() ?? 'Đang tải...'}</span>
        <button onClick={() => { rrgRefresh(); top20Refresh(); }} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 10 }}>↻ Làm mới</button>
      </div>

      <CycleScreenerPanel selectedQuadrant={selectedQuadrant} onSelectQuadrant={setSelectedQuadrant} minRsScore={minRsScore} onChangeMinRs={setMinRsScore} minVolumeScore={minVolumeScore} onChangeMinVolume={setMinVolumeScore} onReset={resetSectorFilters} />

      <LocNganhPanel rrgPoints={rrgData?.points ?? []} top20={filteredTop20} totalAnalyzed={top20Data?.totalAnalyzed ?? 0} selectedSectorKey={selectedSectorKey} onSelectSector={(key) => setSelectedSectorKey(key === selectedSectorKey ? null : key)} onSelectTicker={selectTicker} />

      {!isLoading && rrgData && rrgData.points.length === 0 && <div className="t1-state-msg">Không có dữ liệu ngành nào khả dụng.</div>}
    </div>
  );
}
