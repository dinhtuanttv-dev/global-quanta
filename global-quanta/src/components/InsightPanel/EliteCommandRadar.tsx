import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import RadarSvgCanvas from './RadarSvgCanvas';
import RadarCoreNode from './RadarCoreNode';
import RadarRingNode from './RadarRingNode';
import ConvergenceBreakdown from './ConvergenceBreakdown';
import ConcentrationRiskBanner from './ConcentrationRiskBanner';
import DigestNote from './DigestNote';
import * as api from '../../services/api';
import { CONVERGENCE_LABELS } from '../../types';
import type { RadarDigest, ConcentrationRisk, RadarRingNode as RadarRingNodeType } from '../../types';
import { useTAConsensus } from '../../hooks/useTAConsensus';
import { mergeRadarWithConsensus } from '../../utils/radarBooster';

const CORE_ANGLES = [270, 30, 150, 90, 210];
const RING_ANGLES = [220, 255, 300, 340, 15, 60, 95, 130, 185, 20, 75];

export default function EliteCommandRadar() {
  const { radarCore, radarRing, watchlist, loadRadar, selectedTicker, selectTicker, radarDataStatus } = useAppStore();
  const radarUpdatedAt = useAppStore((s) => s.radarUpdatedAt);
  const [digest, setDigest] = useState<RadarDigest | null>(null);
  const [risk, setRisk] = useState<ConcentrationRisk | null>(null);
  const { results: taResults } = useTAConsensus();

  useEffect(() => {
    void loadRadar();
    api.fetchRadarDigest().then(setDigest);
    api.fetchConcentrationRisk().then(setRisk);
    const refreshTimer = window.setInterval(() => { void loadRadar(); }, 5 * 60 * 1000);
    return () => window.clearInterval(refreshTimer);
  }, [loadRadar]);

  const { core: mergedCore, ring: mergedRing } = useMemo(
    () => radarDataStatus.kind === 'live'
      ? { core: radarCore, ring: radarRing }
      : mergeRadarWithConsensus(radarCore, radarRing, watchlist, taResults),
    [radarCore, radarRing, watchlist, taResults, radarDataStatus.kind]
  );

  useEffect(() => {
    // Never persist fallback/demo scores or stale daily scanner output as alert inputs.
    const sourceAge = radarDataStatus.generatedAt ? Date.now() - Date.parse(radarDataStatus.generatedAt) : Infinity;
    if (import.meta.env.VITE_ENABLE_LIVE_RADAR_ALERTS !== 'true' || radarDataStatus.kind !== 'live' || sourceAge > 15 * 60 * 1000) return;
    if (!radarUpdatedAt || (mergedCore.length === 0 && mergedRing.length === 0)) return;
    const snapshots = [
      ...mergedCore.map((node) => ({
        ticker: node.ticker,
        convergenceScore: node.convergence.filter(Boolean).length,
      })),
      ...mergedRing.map((node) => ({ ticker: node.ticker, convergenceScore: node.score })),
    ];
    void api.syncRadarAlertSnapshots(snapshots, radarUpdatedAt).catch(() => {
      // Radar and its local UI remain available if alert snapshot sync is offline.
    });
  }, [mergedCore, mergedRing, radarUpdatedAt, radarDataStatus.kind]);

  const selectedCore = mergedCore.find((n) => n.ticker === selectedTicker);
  const selectedRing = mergedRing.find((n) => n.ticker === selectedTicker);
  const liveDigest: RadarDigest | null = radarDataStatus.kind === 'live' && mergedCore.length > 0
    ? { text: `${mergedCore[0].ticker} dẫn đầu Radar với ${mergedCore[0].stateLabel}. Các điểm hội tụ dựa trên ngưỡng FA, TA, sự kiện, SmartScore, RS và đồng thuận xu hướng.`, date: radarDataStatus.generatedAt?.slice(0, 10) ?? '' }
    : null;
  const sectorCounts = new Map<string, number>();
  mergedCore.forEach((node) => sectorCounts.set(node.sector, (sectorCounts.get(node.sector) ?? 0) + 1));
  const maxSectorCount = Math.max(0, ...sectorCounts.values());
  const liveRisk: ConcentrationRisk | null = radarDataStatus.kind === 'live' && mergedCore.length > 0
    ? { level: maxSectorCount >= 4 ? 'high' : maxSectorCount >= 3 ? 'medium' : 'low', note: `Top ${mergedCore.length} SmartScore hiện có ${maxSectorCount}/${mergedCore.length} mã tập trung nhiều nhất ở một ngành.` }
    : null;
  const newestDataAgeMinutes = radarDataStatus.generatedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(radarDataStatus.generatedAt)) / 60_000))
    : null;
  const handleSelectRing = (node: RadarRingNodeType) => selectTicker(node.ticker);

  return (
    <div className="panel-block radar-block">
      <div className="panel-head">
        <div className="panel-title">⌖ ELITE COMMAND RADAR <span className="ai-chip">{radarDataStatus.kind === 'live' ? 'API' : 'DEMO'}</span></div>
      </div>
      <div className="radar-sub">Nhìn vào trung tâm — điều khiển từ ngoại vi</div>
      <div className="radar-data-status" role="status" aria-live="polite">
        <span className="radar-data-status-dot" /> {radarDataStatus.kind === 'live'
          ? `NGUỒN ${radarDataStatus.provider} · ${radarDataStatus.count} mã mới trong 26 giờ · cập nhật gần nhất ${newestDataAgeMinutes === null ? 'không rõ' : `${newestDataAgeMinutes} phút trước`}`
          : 'DỮ LIỆU TÍN HIỆU MÔ PHỎNG · Chưa dùng cho cảnh báo thật'}
      </div>
      <div className="radar-canvas-wrap">
        <RadarSvgCanvas>
          <g>
            {mergedRing.map((node, i) => (
              <RadarRingNode key={node.ticker} node={node} angle={RING_ANGLES[i % RING_ANGLES.length]} onSelect={handleSelectRing} />
            ))}
          </g>
          <g>
            {mergedCore.map((node, i) => (
              <RadarCoreNode key={node.ticker} node={node} angle={CORE_ANGLES[i % CORE_ANGLES.length]} onSelect={selectTicker} />
            ))}
          </g>
        </RadarSvgCanvas>
      </div>
      <div className="legend-row">
        <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--gold)' }} />{radarDataStatus.kind === 'live' ? 'Top 5 SmartScore' : 'Core'}</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#5B8CD6' }} />{radarDataStatus.kind === 'live' ? 'Hạng 6–16' : 'Ring'}</div>
        <div className="legend-item">🛡 Ổn định</div>
        <div className="legend-item">⚡ Bứt phá</div>
        <div className="legend-item">⚠ Cảnh báo sớm</div>
      </div>
      {selectedCore && (
        <ConvergenceBreakdown
          name={selectedCore.ticker}
          score={selectedCore.convergence.filter(Boolean).length}
          convergence={selectedCore.convergence}
          labels={selectedCore.signalLabels ?? CONVERGENCE_LABELS}
        />
      )}
      {!selectedCore && selectedRing && (
        <ConvergenceBreakdown
          name={selectedRing.ticker}
          score={selectedRing.score}
          convergence={selectedRing.convergence ?? Array.from({ length: 6 }, (_, i) => (i < selectedRing.score ? 1 : 0))}
          labels={selectedRing.signalLabels ?? CONVERGENCE_LABELS}
        />
      )}
      {(liveRisk ?? risk) && <ConcentrationRiskBanner risk={(liveRisk ?? risk)!} />}
      {(liveDigest ?? digest) && <DigestNote digest={(liveDigest ?? digest)!} />}
      <div className="time-slider">
        Lịch sử Core <input type="range" min={0} max={6} defaultValue={6} /> Hôm nay
      </div>
    </div>
  );
}
