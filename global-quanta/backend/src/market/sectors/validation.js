// Lọc ngành (L3) — KẾT QUẢ kiểm định đặt trước (prereg 2026-10-10), sinh bằng scripts/sector-validate.mjs trên dữ liệu Gateway.
// Không sửa tay — chạy lại script khi đổi engine RRG.
export const SECTOR_VALIDATION = Object.freeze({
 "version": "locnganh/L3",
 "prereg": "locnganh/L3-prereg-2026-10-10",
 "ranAt": "2026-10-10",
 "period": {
  "from": "2023-01-13",
  "to": "2026-09-04",
  "sectors": 18
 },
 "oosFrom": "2025-08-01",
 "label": "EXPERIMENTAL",
 "verdict": "FAIL",
 "rules": "Sự kiện = tuần đã đóng ngành ICB cấp 2 chuyển vào Cải thiện (RRG tuần đã lọc nhiễu). Đo lợi suất vượt trội của chỉ số ngành so VN-Index từ đóng cửa phiên đầu tiên sau tuần sự kiện tới +20 phiên, gộp các ngành. OOS = 30% thời gian cuối; KTC 95% bootstrap cụm tuần; ĐẠT khi OOS n ≥ 30, TB > 0, cận dưới > 0 và trong mẫu > 0.",
 "is": {
  "n": 70,
  "weeks": 47,
  "mean": 0.32,
  "ci": [
   -0.89,
   1.49
  ],
  "hit": 42.86
 },
 "oos": {
  "n": 57,
  "weeks": 26,
  "mean": -2.02,
  "ci": [
   -3.67,
   -0.3
  ],
  "hit": 26.32
 },
 "placebo": {
  "all": {
   "observed": -0.73,
   "placeboMean": -0.59,
   "placebo95": [
    -1.75,
    0.6
   ],
   "p": 0.59
  },
  "oos": {
   "observed": -2.02,
   "placeboMean": -1.4,
   "placebo95": [
    -3.39,
    0.69
   ],
   "p": 0.706
  }
 },
 "raw": {
  "is": {
   "n": 86,
   "weeks": 57,
   "mean": 0.14,
   "ci": [
    -0.96,
    1.38
   ],
   "hit": 40.7
  },
  "oos": {
   "n": 67,
   "weeks": 29,
   "mean": -1.74,
   "ci": [
    -3.69,
    0.13
   ],
   "hit": 26.87
  },
  "eventsRaw": 153,
  "eventsFiltered": 127
 },
 "horizons": {
  "10": {
   "is": {
    "n": 70,
    "weeks": 47,
    "mean": 0.07,
    "ci": [
     -0.46,
     0.59
    ],
    "hit": 47.14
   },
   "oos": {
    "n": 57,
    "weeks": 26,
    "mean": 0.14,
    "ci": [
     -1.31,
     1.54
    ],
    "hit": 47.37
   }
  },
  "40": {
   "is": {
    "n": 70,
    "weeks": 47,
    "mean": 0.47,
    "ci": [
     -1.15,
     2.08
    ],
    "hit": 34.29
   },
   "oos": {
    "n": 53,
    "weeks": 24,
    "mean": -0.8,
    "ci": [
     -3.4,
     1.95
    ],
    "hit": 41.51
   }
  },
  "60": {
   "is": {
    "n": 70,
    "weeks": 47,
    "mean": -1.72,
    "ci": [
     -3.54,
     0.2
    ],
    "hit": 34.29
   },
   "oos": {
    "n": 47,
    "weeks": 22,
    "mean": -3.72,
    "ci": [
     -6.61,
     -0.36
    ],
    "hit": 34.04
   }
  }
 },
 "conclusion": "KHÔNG ĐẠT: ngoài mẫu vượt trội 20 phiên TB -2,02% (KTC -3,67; -0,3, n 57) — kém VN-Index có ý nghĩa; trong mẫu +0,32% không có ý nghĩa; không khác chọn tuần ngẫu nhiên (placebo p 0,706). \"Vào Cải thiện\" chưa phải điểm mua — chỉ để quan sát (EXPERIMENTAL)."
});
