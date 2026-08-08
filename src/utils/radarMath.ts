export const RADAR_CENTER = { cx: 200, cy: 165 };
export const CORE_RADIUS = 52;

export function ringRadius(score: number): number {
  return 90 + (6 - score) * 12;
}

export function toXY(angleDeg: number, radius: number): { x: number; y: number } {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: RADAR_CENTER.cx + radius * Math.cos(a),
    y: RADAR_CENTER.cy + radius * Math.sin(a),
  };
}
