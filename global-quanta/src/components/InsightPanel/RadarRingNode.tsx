import { memo } from 'react';
import { toXY, ringRadius } from '../../utils/radarMath';
import type { RadarRingNode as RadarRingNodeType } from '../../types';

interface Props {
  node: RadarRingNodeType;
  angle: number;
  onSelect: (node: RadarRingNodeType) => void;
}

function RadarRingNode({ node, angle, onSelect }: Props) {
  const r = ringRadius(node.score);
  const { x, y } = toXY(angle, r);
  const size = 3 + node.score * 0.9;
  const nearCore = node.score >= 4;

  return (
    <g className="ring-node" onClick={() => onSelect(node)} style={{ cursor: 'pointer' }}>
      <circle cx={x} cy={y} r={size} fill={nearCore ? '#8FB4E8' : '#5B8CD6'} opacity={0.5 + node.score * 0.1} />
      <text x={x} y={y - 9} textAnchor="middle" className="ring-label">{node.ticker}</text>
    </g>
  );
}

export default memo(RadarRingNode);
