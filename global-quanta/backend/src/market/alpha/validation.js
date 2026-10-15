// Top 20 v2 (T3) — KẾT QUẢ kiểm định đặt trước (prereg 2026-10-10), sinh từ t3-oos-report.json. Không sửa tay.
export const ALPHA_VALIDATION = Object.freeze({
 "version": "alpha/T3",
 "prereg": "alpha/T3-prereg-2026-10-10",
 "ranAt": "2026-10-15",
 "configSha256": "5924b93bd87af7d2e2c623883bf4b2af29bc01bd37458e3bebf1a730d31c6ad8",
 "model": "M1",
 "label": "EXPERIMENTAL",
 "verdict": "FAIL",
 "period": {
  "is": [
   "2022-10-25",
   "2025-04-08"
  ],
  "oos": [
   "2025-07-11",
   "2026-09-04"
  ],
  "oosDates": 58,
  "tickers": 221
 },
 "checks": [
  {
   "id": 1,
   "name": "IC hạng M1 > 0, cận dưới KTC > 0",
   "pass": true
  },
  {
   "id": 2,
   "name": "Top 20 − universe thanh khoản, sau phí: TB > 0, cận dưới > 0",
   "pass": false
  },
  {
   "id": 3,
   "name": "Top 20 hơn placebo cùng ràng buộc, cận dưới > 0",
   "pass": false
  },
  {
   "id": 4,
   "name": "Top 20 hơn điểm hội tụ hiện tại VÀ momentum 6-1 (cùng Top 20, cùng phí)",
   "pass": false
  },
  {
   "id": 5,
   "name": "Deflated Sharpe > 0 (SR − SR0 > 0)",
   "pass": false
  },
  {
   "id": 6,
   "name": "IC trong mẫu > 0; OOS ≥ 40 ngày & ≥ 100 mã",
   "pass": true
  }
 ],
 "oos": {
  "ic": {
   "n": 58,
   "mean": 0.037,
   "lo": 0.0015,
   "hi": 0.0757,
   "pOneSided": 0.0215
  },
  "spreadNet5": {
   "n": 58,
   "mean": -0.0014,
   "lo": -0.0043,
   "hi": 0.0016,
   "pOneSided": 0.83
  },
  "vsPlacebo": {
   "n": 58,
   "mean": -0.0013,
   "lo": -0.0041,
   "hi": 0.0017,
   "pOneSided": 0.8165
  },
  "vsConfluence": {
   "n": 58,
   "mean": 0.0023,
   "lo": -0.0037,
   "hi": 0.009,
   "pOneSided": 0.2235
  },
  "vsMomentum": {
   "n": 58,
   "mean": -0.0002,
   "lo": -0.0045,
   "hi": 0.0041,
   "pOneSided": 0.544
  },
  "dsr": {
   "sr": -0.1248,
   "sr0": 0.0678,
   "deflated": -0.1926,
   "prob": 0.0743,
   "T": 58
  },
  "turnover": 0.1784
 },
 "isIc": {
  "M1": 0.0007,
  "M2": -0.0473
 },
 "notes": [
  "IC xếp hạng ngoài mẫu dương có ý nghĩa (+0,037) nhưng danh mục Top 20 không thắng universe sau phí.",
  "Nhóm dòng tiền (khối ngoại, GTGD) có IC âm ngoài mẫu (−0,053) — đi ngược kỳ vọng."
 ],
 "reason": "Kiểm định đặt trước T3 KHÔNG ĐẠT (2/6): IC xếp hạng ngoài mẫu +0.037 (KTC 0.0015…0.0757) nhưng Top 20 − universe sau phí -0.14%/5 phiên, không hơn placebo, momentum 6-1; Deflated Sharpe âm. Chỉ để sàng lọc, không phải khuyến nghị."
});
