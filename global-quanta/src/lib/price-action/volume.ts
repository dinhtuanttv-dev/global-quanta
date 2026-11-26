// pa-book-2 (26/11/2026) — lớp khối lượng theo sách: "volume phải đồng thuận với xu hướng thì xu hướng mới bền vững",
// "breakout thật thường đi kèm volume tăng vọt", nến đuối sức "thường có volume tăng vọt". Chỉ dùng dữ liệu tới phiên i (không nhìn trước).
import type { Bar, VolumeFeature } from "./types.ts";

/** Khối lượng hợp lệ của phiên: số hữu hạn ≥ 0; thiếu -> null (không thay bằng 0). */
export const barVolume = (bar: Bar): number | null => (Number.isFinite(bar.volume) && bar.volume >= 0 ? bar.volume : null);

/**
 * rvol[i] = KL(i) / trung bình KL của `lookback` phiên TRƯỚC i (không gồm i) — cần đủ `lookback` phiên có số liệu và trung bình > 0.
 * upDownRatio[i] = tổng KL phiên đóng cửa tăng / tổng KL phiên đóng cửa giảm trong `lookback` phiên kết thúc ở i (so với giá đóng phiên trước).
 * Không có phiên giảm mà có phiên tăng -> trả `lookback` (trần hữu hạn, để so sánh ngưỡng không bị vô cực).
 */
export function computeVolumeFeatures(bars: readonly Bar[], lookback: number): VolumeFeature[] {
  const vols = bars.map(barVolume);
  return bars.map((bar, i) => {
    let rvol: number | null = null;
    if (i >= lookback) {
      const prior = vols.slice(i - lookback, i);
      if (prior.every((v) => v !== null)) {
        const mean = (prior as number[]).reduce((a, v) => a + v, 0) / lookback;
        const v = vols[i];
        rvol = mean > 0 && v !== null ? v / mean : null;
      }
    }
    let upDownRatio: number | null = null;
    if (i >= lookback) {
      let up = 0, down = 0, ok = true;
      for (let j = i - lookback + 1; j <= i; j++) {
        const v = vols[j];
        if (v === null) { ok = false; break; }
        if (bars[j].close > bars[j - 1].close) up += v;
        else if (bars[j].close < bars[j - 1].close) down += v;
      }
      if (ok) upDownRatio = down > 0 ? up / down : up > 0 ? lookback : null;
    }
    return { index: i, volume: vols[i], rvol, upDownRatio };
  });
}
