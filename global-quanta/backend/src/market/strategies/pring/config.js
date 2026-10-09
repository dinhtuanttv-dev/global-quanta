// Pattern Scanner v2 — ngưỡng theo "Martin Pring On Price Pattern" (bản dịch tiếng Việt, ch.1–17). [chN] = chương.
// Nguyên tắc chung (ch6, ch17): mô hình đảo chiều phải có xu hướng trước đó; biên chạm/tiếp cận ≥ 2 lần (càng nhiều càng
// mạnh); càng dài, càng sâu càng quan trọng; mục tiêu đo bằng chiều cao trên THANG LOG, thường đạt 1×/2×/3×; phá vỡ phải
// DỨT KHOÁT và giữ ≥ 2 thanh; khối lượng co khi hình thành, mở rộng khi phá vỡ lên; thất bại khi quay lại > 50% mô hình
// hoặc thủng đáy/đỉnh gần nhất; R:R ≥ 3:1. Các ngưỡng "dứt khoát"/"chạm" chỉnh theo ATR vì mỗi mã biến động khác (ch6, ch17).
// Mọi ngưỡng ở đây ĐẶT TRƯỚC kiểm định (P3) — không dò trên dữ liệu.

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };

export const PRING = deepFreeze({
  atrPeriod: 14,
  /** Hai bậc pivot: nhỏ (mô hình ngắn/cờ) và trung (mô hình kinh điển). Ngưỡng đảo chiều = max(%, k×ATR%). */
  degrees: { minor: { minPct: 0.03, atrMult: 1.5 }, intermediate: { minPct: 0.06, atrMult: 3 } },
  /** "Chạm hoặc tiếp cận" một đường (ch6): trong max(1,2%, 0,6×ATR). */
  touchTolPct: 0.012, touchTolAtr: 0.6,
  /** Phá vỡ dứt khoát (ch6 quy tắc 3% — chỉnh theo biến động, ch17): đóng cửa vượt đường ≥ max(1%, 0,5×ATR). */
  penMinPct: 0.01, penAtr: 0.5,
  /** Phải giữ ngoài mô hình ≥ 2 thanh (ch17). */
  holdBars: 2,
  /** Khối lượng "nặng" so với 20–30 thanh gần nhất (ch6) -> TB 25 thanh. */
  volAvg: 25, breakoutVolRatio: 1.5,
  /** Mô hình giá cần ≥ 15 thanh (ch13); cửa sổ tìm phá vỡ sau điểm cuối mô hình; hết hạn sau phá vỡ. */
  minBars: 15, breakoutSearchBars: 40, maxAgeAfterBreakout: 60,
  /** Thất bại: quay lại ≥ 50% mô hình (ch6, ch8, ch10). Pullback: về trong 1 ATR của điểm phá vỡ. */
  failRetrace: 0.5, pullbackAtr: 1.0,
  /** Xu hướng trước mô hình đảo chiều: dịch chuyển ≥ max(15%, 1,5× chiều cao) trong 120 thanh. */
  priorLookback: 120, priorMinMove: 0.15, priorHeightMult: 1.5,
  /** Đỉnh/đáy đôi (ch8, Edwards & Magee): cách nhau ≥ 20 thanh; hai đỉnh lệch ≤ 3%; rãnh ≥ 15% (≥ 10% nếu cách ≥ 40 thanh). */
  double: { minSep: 20, peakTol: 0.03, depthShort: 0.15, depthLong: 0.1, longSep: 40 },
  /** Đỉnh/đáy ba (ch8): 3 đỉnh trong ±3% trung bình, đỉnh giữa không cao hơn hẳn (khác vai-đầu-vai). */
  triple: { peakTol: 0.03 },
  /** Vai-đầu-vai (ch7): đầu vượt vai ≥ 3%; vai cao trên viền cổ ≥ 30% chiều cao đầu; tỷ lệ thời gian hai bên 1/3…3. */
  hs: { headOver: 0.03, shoulderMinFrac: 0.3, timeRatio: 3 },
  /** Hình chữ nhật (ch6): đỉnh/đáy nằm trong dải ≤ 25% chiều cao; chiều cao 4–40%. */
  rect: { bandFrac: 0.25, minHeight: 0.04, maxHeight: 0.4 },
  /** Đường "ngang" (tam giác vuông, mở rộng góc vuông): độ dốc ≤ 15% chiều cao trên toàn độ rộng. */
  flatFrac: 0.15,
  /** Tam giác (ch9): phá vỡ mạnh nhất ở ½–⅔ khoảng cách từ đầu mô hình tới đỉnh tam giác. */
  triangleSweet: [0.5, 2 / 3],
  /** Nêm (ch11–12): nhỏ 10–40 thanh (2–8 tuần), lớn ≥ 80 thanh (4–6 tháng). */
  wedge: { smallMax: 40, largeMin: 80 },
  /** Cờ/cờ đuôi nheo (ch12): cột cờ ≥ max(15%, 6×ATR%) trong ≤ 15 thanh; thân cờ 5–20 thanh (≤ 4 tuần), ≤ 50% cột. */
  flag: { poleMinPct: 0.15, poleAtr: 6, poleMaxBars: 15, minBars: 5, maxBars: 20, maxRetrace: 0.5 },
  /** Đáy/đỉnh tròn (ch11): 30–150 thanh, khớp parabol trên log giá R² ≥ 0,7, đáy ở 1/3 giữa, sâu ≥ 10%. */
  rounding: { minBars: 30, maxBars: 150, minR2: 0.7, minDepth: 0.1 },
  /** Cốc tay cầm (ch11, O'Neil): cốc 35–325 thanh sâu 12–40%, miệng phải 90–105% miệng trái, tay cầm 5–25 thanh ≤ 15%, nửa trên. */
  cup: { minBars: 35, maxBars: 325, minDepth: 0.12, maxDepth: 0.4, rimLo: 0.9, rimHi: 1.05, handleMin: 5, handleMax: 25, handleDepth: 0.15 },
  /** Khoảng trống (ch12): KL ngày gap ≥ 1,5× TB; đảo chiều dạng đảo: hai khoảng trống ngược chiều cách ≤ 10 thanh. */
  gap: { volRatio: 1.5, islandMaxBars: 10 },
  /** Thanh nến (ch13–16): "rộng" ≥ 1,3×ATR; thanh cạn kiệt ≥ 2×ATR; xu hướng trước 5 thanh. */
  bars: { wide: 1.3, exhaust: 2.0, trendBars: 5 },
  /** R:R tối thiểu (ch6). */
  minRewardRisk: 3,
});
