// Bố cục ELITE COMMAND RADAR (hàm thuần, xác định — cùng đầu vào cho cùng kết quả):
//   - GÓC = nhóm ngành: vòng tròn chia lát theo nhóm ngành, độ rộng lát tỉ lệ số mã (tối thiểu 22°)
//   - BÁN KÍNH = điểm hội tụ 0–6: càng gần tâm càng mạnh; vùng lõi Core = điểm ≥ CORE_MIN
//   - KÍCH THƯỚC chấm = Smart Score; mã Core là vòng tròn lớn có nhãn bên trong
//   - Chống chồng lấn: lặp đẩy các cặp chấm quá gần ra xa, rồi kéo về đúng lát ngành và đúng vòng điểm.

export const VIEW_W = 400;
export const VIEW_H = 380;
export const CX = 200;
export const CY = 190;
export const R_MAX = 168;

/** Bán kính mục tiêu theo điểm hội tụ (6 → gần tâm, 0 → vòng ngoài). */
export const radiusForScore = (score: number) => 30 + (6 - Math.max(0, Math.min(6, score))) * 22;

export interface LayoutInput { ticker: string; score: number; group: string; smart: number | null; core: boolean }
export interface LayoutNode extends LayoutInput { x: number; y: number; angle: number; dot: number; showLabel: boolean }
export interface Slice { group: string; a0: number; a1: number; count: number }

const toXY = (angleDeg: number, r: number) => {
  const a = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) };
};

export function buildSlices(groups: string[]): Slice[] {
  const counts = new Map<string, number>();
  for (const g of groups) counts.set(g, (counts.get(g) ?? 0) + 1);
  const entries = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"));
  const total = groups.length || 1;
  const MIN = 22;
  const raw = entries.map(([, c]) => Math.max(MIN, (c / total) * 360));
  const scale = 360 / raw.reduce((a, b) => a + b, 0);
  let a = -90; // bắt đầu ở đỉnh, đi theo chiều kim đồng hồ
  return entries.map(([group, count], i) => {
    const span = raw[i] * scale;
    const s = { group, a0: a, a1: a + span, count };
    a += span;
    return s;
  });
}

/**
 * @param maxLabels số nhãn tối đa (Core + các mã điểm cao nhất); mã còn lại chỉ có chấm (xem bằng di chuột / bàn phím).
 */
export function layoutRadar(inputs: LayoutInput[], { iterations = 240, maxLabels = 26 } = {}): { nodes: LayoutNode[]; slices: Slice[] } {
  const slices = buildSlices(inputs.map((n) => n.group));
  const sliceOf = new Map(slices.map((s) => [s.group, s]));
  const ranked = [...inputs].sort((a, b) => b.score - a.score || (b.smart ?? -1) - (a.smart ?? -1) || a.ticker.localeCompare(b.ticker));
  const labeled = new Set(ranked.slice(0, maxLabels).map((n) => n.ticker));

  // Vị trí ban đầu: rải đều trong lát ngành, thứ tự theo mã (ổn định giữa các lần vẽ).
  const byGroup = new Map<string, LayoutInput[]>();
  for (const n of [...inputs].sort((a, b) => a.ticker.localeCompare(b.ticker))) {
    if (!byGroup.has(n.group)) byGroup.set(n.group, []);
    byGroup.get(n.group)!.push(n);
  }
  const nodes: LayoutNode[] = [];
  for (const [group, list] of byGroup) {
    const sl = sliceOf.get(group)!;
    list.forEach((n, i) => {
      const angle = sl.a0 + ((i + 0.5) / list.length) * (sl.a1 - sl.a0);
      const dot = n.core ? 15 : 3.5 + Math.max(0, Math.min(100, n.smart ?? 40)) / 100 * 5;
      const { x, y } = toXY(angle, radiusForScore(n.score));
      nodes.push({ ...n, x, y, angle, dot, showLabel: n.core || labeled.has(n.ticker) });
    });
  }

  // Vòng điểm quá đông trong một lát ngành -> nới bán kính ra ngoài vừa đủ chỗ (cung đủ dài cho các chấm).
  const extra = new Map<string, number>();
  const bandKey = (n: LayoutInput) => `${n.group}|${n.score}`;
  const need = new Map<string, number>();
  for (const n of nodes) need.set(bandKey(n), (need.get(bandKey(n)) ?? 0) + 2 * n.dot + (n.showLabel ? 12 : 4));
  for (const [key, len] of need) {
    const [group, score] = key.split("|");
    const sl = sliceOf.get(group)!;
    const span = ((sl.a1 - sl.a0) * Math.PI) / 180;
    const r0 = radiusForScore(Number(score));
    extra.set(key, Math.max(0, len / span - r0));
  }

  // Chống chồng lấn: khoảng cách tối thiểu = 2 bán kính chấm + chỗ cho nhãn.
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const need = a.dot + b.dot + (a.showLabel || b.showLabel ? 12 : 4);
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= need) continue;
        if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1; }
        // Đẩy hơi quá (×0.6 mỗi bên) để thắng bước kéo về ràng buộc ngay sau đó.
        const push = (need - d) * 0.6;
        const ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
      }
    }
    // Kéo về ràng buộc: đúng lát ngành (chừa lề 3°) và vòng điểm ±10px; không vượt khỏi radar.
    for (const n of nodes) {
      const sl = sliceOf.get(n.group)!;
      const r0 = radiusForScore(n.score);
      let ang = (Math.atan2(n.y - CY, n.x - CX) * 180) / Math.PI;
      while (ang < sl.a0 - 180) ang += 360;
      while (ang > sl.a0 + 180) ang -= 360;
      // Chỉ một nhóm ngành (lát phủ cả vòng): không kẹp góc, tránh chấm nhảy qua "đường nối" -90°.
      if (sl.a1 - sl.a0 < 359) {
        const pad = Math.min(3, (sl.a1 - sl.a0) / 4);
        ang = Math.max(sl.a0 + pad, Math.min(sl.a1 - pad, ang));
      }
      const rHi = Math.min(R_MAX - n.dot, r0 + 10 + (extra.get(bandKey(n)) ?? 0));
      const r = Math.max(Math.max(0, r0 - 10), Math.min(rHi, Math.hypot(n.x - CX, n.y - CY)));
      const p = toXY(ang, r);
      n.x = p.x; n.y = p.y; n.angle = ang;
    }
  }
  return { nodes, slices };
}

/** Đường cung (SVG path) của một lát ngành ở bán kính r — dùng để vẽ vạch chia và nhãn nhóm ngành. */
export function arcPath(a0: number, a1: number, r: number): string {
  const p0 = toXY(a0, r), p1 = toXY(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
}

export const polar = toXY;
