import { useAppStore } from '../../store/useAppStore';
import RadarSvgCanvas from './RadarSvgCanvas';
import RadarCoreNode from './RadarCoreNode';
import RadarRingNode from './RadarRingNode';
import ConvergenceBreakdown from './ConvergenceBreakdown';
import ConcentrationRiskBanner from './ConcentrationRiskBanner';
import DigestNote from './DigestNote';
import type { RadarRingNode as RadarRingNodeType } from '../../types';
import { useRadarModel } from '../../hooks/useRadarModel';
import { useWatchlists } from '../../hooks/useWatchlists';
import { CORE_MIN } from '../../lib/radarModel';

const CORE_ANGLES = [270, 30, 150, 90, 210];
/** Ring: chia đều quanh vòng theo số mã (tránh nhãn chồng nhau). */
const ringAngle = (i: number, n: number) => (200 + (i * 360) / Math.max(1, n)) % 360;

/**
 * ELITE COMMAND RADAR — các mã của ★ Danh mục được chọn (mặc định "Danh mục của tôi"), chấm hội tụ 6 tiêu chí
 * bằng dữ liệu thật của 6 tab. Thêm / bớt mã ở danh mục (☆ trong Bảng Siêu Quét hoặc ô tìm mã) là Radar đổi theo.
 */
export default function EliteCommandRadar() {
  const { selectedTicker, selectTicker } = useAppStore();
  const { lists, setRadarList } = useWatchlists();
  const model = useRadarModel();
  const { core, ring, scored, hidden, risk, digest, missingSources, listName, listId, tickers } = model;

  const selected = scored.find((x) => x.ticker === selectedTicker) ?? null;
  const handleSelectRing = (node: RadarRingNodeType) => selectTicker(node.ticker);

  return (
    <div className="panel-block radar-block">
      <div className="panel-head" style={{ alignItems: 'center' }}>
        <div className="panel-title">⌖ ELITE COMMAND RADAR <span className="ai-chip">AI</span></div>
        <select
          value={listId}
          onChange={(e) => setRadarList(e.target.value)}
          aria-label="Danh mục hiển thị trên Radar"
          title="Danh mục hiển thị trên Radar"
          style={{ marginLeft: 'auto', maxWidth: 150, fontSize: 10, background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 4px' }}
        >
          {lists.map((l) => <option key={l.id} value={l.id}>★ {l.name} ({l.tickers.length})</option>)}
        </select>
      </div>
      <div className="radar-sub">
        {tickers.length
          ? `★ ${listName}: ${tickers.length} mã · Core ≥ ${CORE_MIN}/6 tiêu chí${hidden ? ` · ${hidden} mã điểm thấp không hiện trên vòng` : ''}`
          : `★ ${listName} đang trống — bấm ☆ cạnh mã trong Bảng Siêu Quét hoặc tìm mã ở thanh trên để thêm.`}
      </div>
      <div className="radar-canvas-wrap">
        <RadarSvgCanvas>
          <g>
            {ring.map((node, i) => (
              <RadarRingNode key={node.ticker} node={node} angle={ringAngle(i, ring.length)} onSelect={handleSelectRing} />
            ))}
          </g>
          <g>
            {core.map((node, i) => (
              <RadarCoreNode key={node.ticker} node={node} angle={CORE_ANGLES[i % CORE_ANGLES.length]} onSelect={selectTicker} />
            ))}
          </g>
        </RadarSvgCanvas>
      </div>
      <div className="legend-row">
        <div className="legend-item"><span className="legend-dot" style={{ background: 'var(--gold)' }} />Core (≥{CORE_MIN}/6)</div>
        <div className="legend-item"><span className="legend-dot" style={{ background: '#5B8CD6' }} />Ring (0–{CORE_MIN - 1}/6)</div>
        <div className="legend-item">🛡 Ổn định</div>
        <div className="legend-item">⚡ Bứt phá</div>
        <div className="legend-item">⚠ Cảnh báo sớm</div>
      </div>
      {selected && (
        <ConvergenceBreakdown name={selected.ticker} score={selected.score} convergence={selected.convergence} />
      )}
      {selectedTicker && !selected && tickers.length > 0 && (
        <div className="digest-note">☆ {selectedTicker} chưa có trong ★ {listName} — thêm vào danh mục để Radar chấm hội tụ.</div>
      )}
      {risk && <ConcentrationRiskBanner risk={risk} />}
      {digest && <DigestNote digest={digest} />}
      {missingSources.length > 0 && (
        <div className="digest-note" style={{ opacity: 0.75 }}>Đang chờ dữ liệu: {missingSources.join(', ')} (chưa tính là "không đạt").</div>
      )}
    </div>
  );
}
