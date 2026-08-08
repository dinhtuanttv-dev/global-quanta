import { useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import RadarSvgCanvas from './RadarSvgCanvas';
import RadarCoreNode from './RadarCoreNode';
import RadarRingNode from './RadarRingNode';
import ConvergenceBreakdown from './ConvergenceBreakdown';
import ConcentrationRiskBanner from './ConcentrationRiskBanner';
import DigestNote from './DigestNote';
import * as api from '../../services/api';
import type { RadarDigest, ConcentrationRisk, RadarRingNode as RadarRingNodeType } from '../../types';

// Góc cố định cho tối đa 5 vị trí Core, chia đều hình tròn — xem mục 3.3 trong Design Spec
const CORE_ANGLES = [270, 30, 150, 90, 210];
// Ring: rải góc còn lại tránh trùng với Core
const RING_ANGLES = [220, 255, 300, 340, 15, 60, 95, 130, 185, 20, 75];

export default function EliteCommandRadar() {
  const { radarCore, radarRing, loadRadar, selectedTicker, selectTicker } = useAppStore();
  const [digest, setDigest] = useState<RadarDigest | null>(null);
  const [risk, setRisk] = useState<ConcentrationRisk | null>(null);

  useEffect(() => {
    loadRadar();
    api.fetchRadarDigest().then(setDigest);
    api.fetchConcentrationRisk().then(setRisk);
  }, [loadRadar]);

  const selectedCore = radarCore.find((n) => n.ticker === selectedTicker);
  const selectedRing = radarRing.find((n) => n.ticker === selectedTicker);

  const handleSelectRing = (node: RadarRingNodeType) => selectTicker(node.ticker);

  return (
    <div className="panel-block radar-block">
      <div className="panel-head">
        <div className="panel-title">⌖ ELITE COMMAND RADAR <span className="ai-chip">AI</span></div>
      </div>
      <div className="radar-sub">Nhìn vào trung tâm — điều khiển từ ngoại vi</div>

      <div className="radar-canvas-wrap">
        <RadarSvgCanvas>
          <g>
            {radarRing.map((node, i) => (
              <RadarRingNode key={node.ticker} node={node} angle={RING_ANGLES[i % RING_ANGLES.length]} onSelect={handleSelectRing} />
            ))}
          </g>
          <g>
            {radarCore.map((node, i) => (
              <RadarCoreNode key={node.ticker} node={node} angle={CORE_ANGLES[i % CORE_ANGLES.length]} onSelect={selectTicker} />
            ))}
          </g>
        </RadarSvgCanvas>
      </div>

      <div className="legend-row">
        <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--gold)' }} />Core (6/6)</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#5B8CD6' }} />Ring (2-5/6)</div>
        <div className="legend-item">🛡 Ổn định</div>
        <div className="legend-item">⚡ Bứt phá</div>
        <div className="legend-item">⚠ Cảnh báo sớm</div>
      </div>

      {selectedCore && (
        <ConvergenceBreakdown
          name={selectedCore.ticker}
          score={selectedCore.convergence.filter(Boolean).length}
          convergence={selectedCore.convergence}
        />
      )}
      {!selectedCore && selectedRing && (
        <ConvergenceBreakdown
          name={selectedRing.ticker}
          score={selectedRing.score}
          convergence={Array.from({ length: 6 }, (_, i) => (i < selectedRing.score ? 1 : 0))}
        />
      )}

      {risk && <ConcentrationRiskBanner risk={risk} />}
      {digest && <DigestNote digest={digest} />}

      <div className="time-slider">
        Lịch sử Core <input type="range" min={0} max={6} defaultValue={6} /> Hôm nay
      </div>
    </div>
  );
}
