import { memo } from 'react';
import { toXY, CORE_RADIUS } from '../../utils/radarMath';
import type { RadarCoreNode as RadarCoreNodeType } from '../../types';

interface Props {
  node: RadarCoreNodeType;
  angle: number;
  onSelect: (ticker: string) => void;
}

const ICON: Record<RadarCoreNodeType['state'], string> = { stable: '🛡', breakout: '⚡', caution: '⚠' };
const HALO: Record<RadarCoreNodeType['state'], string> = {
  stable: 'var(--gold)',
  breakout: 'var(--gold-bright)',
  caution: 'var(--warning)',
};

function RadarCoreNode({ node, angle, onSelect }: Props) {
  const { x, y } = toXY(angle, CORE_RADIUS);
  const haloColor = HALO[node.state];

  return (
    <g
      className={`core-node ${node.state === 'breakout' ? 'breakout' : ''}`}
      onClick={() => onSelect(node.ticker)}
      style={{ cursor: 'pointer' }}
    >
      <circle className="halo" cx={x} cy={y} r={30} fill={haloColor} opacity={0.28} />
      <circle cx={x} cy={y} r={19} fill="#0F1420" stroke={haloColor} strokeWidth={2} />
      <text x={x} y={y + 4} textAnchor="middle" className="core-label">{node.ticker}</text>
      <text x={x} y={y - 27} textAnchor="middle" style={{ fontSize: 11 }}>{ICON[node.state]}</text>
    </g>
  );
}

export default memo(RadarCoreNode);
