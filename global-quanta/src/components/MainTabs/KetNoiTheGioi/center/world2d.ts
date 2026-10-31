// Trung tâm kinh tế thế giới (31/10/2026) — hàm thuần cho hai bản đồ 2D và cảnh báo tập trung. Chỉ MÔ TẢ số liệu đã có từ Gateway:
// không thêm tín hiệu, không đổi công thức chiến lược.

export interface Weighted { ticker: string; weight: number }

/**
 * Độ tập trung của rổ ngành: số mã hiệu dụng N_eff = 1 / Σw² (Herfindahl nghịch đảo) trên trọng số chuẩn hoá lại.
 * Tín hiệu ngành có N_eff thấp thực chất là tín hiệu của 1–2 mã.
 */
export function basketConcentration(constituents: Weighted[] | null | undefined): { top: Weighted; topShare: number; nEff: number } | null {
  const c = (constituents ?? []).filter((x) => x.weight > 0);
  const sum = c.reduce((a, x) => a + x.weight, 0);
  if (!c.length || sum <= 0) return null;
  const top = c.reduce((a, b) => (b.weight > a.weight ? b : a));
  const hhi = c.reduce((a, x) => a + (x.weight / sum) ** 2, 0);
  return { top, topShare: top.weight / sum, nEff: 1 / hhi };
}

/** Ngưỡng gắn cờ: một mã chiếm từ 50% rổ, hoặc rổ tương đương dưới 2,5 mã. */
export const isConcentrated = (x: { topShare: number; nEff: number } | null) => !!x && (x.topShare >= 0.5 || x.nEff < 2.5);

// ── Bản đồ ngành ─────────────────────────────────────────────────────────
export interface SectorPoint { icb: string; nameVi: string; x: number; y: number; stance: string; concentrated: boolean; alphaBps: number | null; note: string }
interface ShortLike { icb: string; nameVi: string; zx: number | null; stance: string; alphaBps: number | null; constituents: Weighted[] }
interface MediumLike { icb: string; ws?: { score?: number | null } | null; stance?: string }

/** x = z ngắn hạn cắt ngang; y = điểm 3 tháng của ngành thế giới. Ngành thiếu một trong hai trục không được vẽ (không đoán). */
export function sectorPoints(short: ShortLike[], medium: MediumLike[]): SectorPoint[] {
  const m = new Map(medium.map((r) => [r.icb, r]));
  const out: SectorPoint[] = [];
  for (const r of short) {
    const y = m.get(r.icb)?.ws?.score;
    if (r.zx == null || y == null || !Number.isFinite(r.zx) || !Number.isFinite(y)) continue;
    const c = basketConcentration(r.constituents);
    out.push({
      icb: r.icb, nameVi: r.nameVi, x: r.zx, y, stance: r.stance, alphaBps: r.alphaBps, concentrated: isConcentrated(c),
      note: c ? `${c.top.ticker} ${Math.round(c.topShare * 100)}% · ~${c.nEff.toFixed(1).replace(".", ",")} mã hiệu dụng` : "",
    });
  }
  return out;
}

// ── Bản đồ truyền dẫn ────────────────────────────────────────────────────
export interface MatrixCell { factor: string; sector: string; direction: string; beta: number; t: number; lag: number; tier: string; q?: number | null }
export interface MatrixLike {
  factors: { id: string; nameVi: string; channel?: string; channelVi?: string }[];
  sectors: { id: string; nameVi: string }[];
  cells: MatrixCell[];
}
export interface PulseLike { id: string; z: number }
export interface TransEdge { factor: string; sector: string; tier: string; t: number; lag: number; sign: 1 | -1 | 0; pressure: number; beta: number }

/**
 * Áp lực hôm nay của một liên kết = hướng β × z của yếu tố (dấu: yếu tố đang lệch về phía đẩy ngành lên hay xuống), độ lớn = |t| × |z|.
 * Chỉ các cặp |t| ≥ minT; ưu tiên bậc A/B rồi tới áp lực lớn. Đây là mô tả: đa số là bậc C, chưa qua hiệu chỉnh kiểm định bội.
 */
export function transmissionEdges(matrix: MatrixLike, pulse: PulseLike[], minT = 2, limit = 22): TransEdge[] {
  const z = new Map(pulse.map((p) => [p.id, p.z]));
  const rank = (tier: string) => (tier === "A" ? 0 : tier === "B" ? 1 : 2);
  return matrix.cells
    .filter((c) => Number.isFinite(c.t) && Math.abs(c.t) >= minT && z.has(c.factor))
    .map((c) => {
      const zf = z.get(c.factor) as number;
      const s = Math.sign(c.beta) * Math.sign(zf);
      return { factor: c.factor, sector: c.sector, tier: c.tier, t: c.t, lag: c.lag, beta: c.beta, sign: (s > 0 ? 1 : s < 0 ? -1 : 0) as 1 | -1 | 0, pressure: Math.abs(c.t) * Math.abs(zf) };
    })
    .sort((a, b) => rank(a.tier) - rank(b.tier) || b.pressure - a.pressure)
    .slice(0, limit);
}

/** Cân bằng áp lực theo ngành: tổng có dấu của các liên kết đang vẽ. */
export function sectorPressure(edges: TransEdge[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of edges) out.set(e.sector, (out.get(e.sector) ?? 0) + e.sign * e.pressure);
  return out;
}
