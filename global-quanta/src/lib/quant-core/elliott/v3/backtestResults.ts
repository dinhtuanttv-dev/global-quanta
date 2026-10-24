// EP5 (24/10/2026) — KIỂM ĐỊNH LỊCH SỬ walk-forward của kịch bản Elliott Pro (engine ew-v3.1 + ew-scn-1.0). FILE SINH TỪ SCRIPT ĐO —
// đăng ký trước: scratchpad elliott/EP5-prereg.md. 272 mã (universe Siêu Quét + VNINDEX), 750 phiên, mỗi kịch bản tính một lần, chỉ nến sau ngày ghi.
export const EP5_BACKTEST = {
 "measuredAt": "2026-10-24",
 "tickers": 272,
 "logged": 24481,
 "triggered": 10020,
 "all": {
  "n": 9614,
  "hitRate": 0.7212,
  "expectedRate": 0.664,
  "z": 13.2108,
  "t": 12.0461
 },
 "byTemplate": [
  {
   "template": "wave3",
   "title": "Sóng 3",
   "n": 1914,
   "hitRate": 0.5825,
   "expectedRate": 0.5352,
   "z": 4.5457,
   "t": 4.645
  },
  {
   "template": "wave5",
   "title": "Sóng 5",
   "n": 43,
   "hitRate": 0.7209,
   "expectedRate": 0.7188,
   "z": 0.0333,
   "t": 0.0336
  },
  {
   "template": "waveC",
   "title": "Sóng C",
   "n": 2034,
   "hitRate": 0.7463,
   "expectedRate": 0.6724,
   "z": 7.8012,
   "t": 7.3983
  },
  {
   "template": "triangleThrust",
   "title": "Bật khỏi tam giác",
   "n": 1262,
   "hitRate": 0.6292,
   "expectedRate": 0.5778,
   "z": 4.2258,
   "t": 4.0493
  },
  {
   "template": "afterImpulse",
   "title": "Điều chỉnh sau 5 sóng",
   "n": 655,
   "hitRate": 0.8137,
   "expectedRate": 0.7752,
   "z": 2.4811,
   "t": 2.77
  },
  {
   "template": "afterCorrection",
   "title": "Xu hướng mới sau điều chỉnh",
   "n": 3706,
   "hitRate": 0.7941,
   "expectedRate": 0.7349,
   "z": 8.8027,
   "t": 9.4414
  }
 ],
 "placebo": {
  "realHit": 0.6898,
  "placeboHit": 0.667,
  "realUp": 0.6995,
  "placeboUp": 0.6756,
  "realDn": 0.6806,
  "placeboDn": 0.6587,
  "z": 4.3163,
  "zUp": 3.1719,
  "zDn": 2.9515,
  "clusterT": 3.9554,
  "n": 9573,
  "nPlacebo": 45760
 },
 "verdict": "ĐẠT",
 "label": "Kiểm định lịch sử: lợi thế nhỏ",
 "summary": "Walk-forward 5 năm, 272 mã, 9.614 kịch bản đã kích hoạt & kết thúc: đạt MT1 trước vô hiệu 72,1% so với chuẩn ngẫu nhiên 66,4% (z = 13,2). Hậu kiểm giả dược (cùng hình học, kích hoạt ngẫu nhiên): 69,0% so với 66,7% (+2,3 điểm %, z = 4,32; tăng z = 3,17, giảm z = 2,95; theo cụm mã t = 3,96). Lợi thế NHỎ, CHƯA trừ phí giao dịch (~0,3%/vòng); sổ thời gian thực là phép xác nhận ngoài mẫu."
} as const;
