// Cycle Fingerprint v2 (CF3) — KẾT QUẢ kiểm định đặt trước (prereg 2026-10-10), sinh từ cf3-oos-report.json (scripts/cycles-validate.mjs).
// Không sửa tay — chạy lại toàn bộ quy trình (IS -> chốt -> OOS một lần) khi đổi engine.
export const CYCLE_VALIDATION = Object.freeze({
 "version": "cycles/CF3",
 "prereg": "cycles/CF3-prereg-2026-10-10",
 "ranAt": "2026-10-10",
 "configSha256": "d31502966402ab09f10b57617af86fbeea5a92f0c229700b865d845e3b73b5a6",
 "config": {
  "lambda": 0,
  "hMult": 2,
  "W": 30
 },
 "label": "EXPERIMENTAL",
 "verdict": "FAIL",
 "period": {
  "is": [
   "2023-03-07",
   "2025-05-22"
  ],
  "oos": [
   "2025-08-21",
   "2026-09-10"
  ],
  "oosDates": 53,
  "oosTickers": 220,
  "oosRows": 9891
 },
 "rules": "Dự báo lợi suất log vượt VN-Index 20 phiên (từ đóng cửa t+1) bằng 30 giai đoạn tương tự trong thư viện toàn universe theo thời điểm. ĐẠT khi ngoài mẫu: IC hạng > 0 (cận dưới KTC > 0), hơn placebo láng giềng ngẫu nhiên (cận dưới > 0), IC trong mẫu > 0, Brier skill > 0, chênh lệch nhóm 20% cao − thấp sau phí 0,3% > 0, ≥ 40 ngày & ≥ 100 mã.",
 "checks": [
  {
   "id": 1,
   "name": "IC hạng TB > 0, cận dưới KTC > 0",
   "pass": false
  },
  {
   "id": 2,
   "name": "IC engine − IC placebo > 0, cận dưới KTC > 0",
   "pass": false
  },
  {
   "id": 3,
   "name": "IC trong mẫu > 0",
   "pass": true
  },
  {
   "id": 4,
   "name": "Brier skill của P(vượt VN-Index) > 0",
   "pass": true
  },
  {
   "id": 5,
   "name": "Chênh lệch nhóm 20% cao − 20% thấp sau phí 0,3% > 0",
   "pass": false
  },
  {
   "id": 6,
   "name": "Cỡ mẫu ≥ 40 ngày và ≥ 100 mã",
   "pass": true
  }
 ],
 "oos": {
  "ic": {
   "n": 53,
   "mean": 0.0004,
   "lo": -0.0234,
   "hi": 0.028,
   "pOneSided": 0.4815
  },
  "icMinusPlacebo": {
   "n": 53,
   "mean": -0.0142,
   "lo": -0.0437,
   "hi": 0.0161,
   "pOneSided": 0.7965
  },
  "placeboIc": {
   "n": 53,
   "mean": 0.0146,
   "lo": -0.0027,
   "hi": 0.0319,
   "pOneSided": 0.0435
  },
  "brierSkill": 0.0057,
  "quintileSpreadNet": {
   "n": 53,
   "mean": -0.0038,
   "lo": -0.0114,
   "hi": 0.0048,
   "pOneSided": 0.8235
  },
  "coverage80": 0.7289,
  "avgNEff": 14.1541
 },
 "is": {
  "ic": {
   "n": 111,
   "mean": 0.0251,
   "lo": 0.0037,
   "hi": 0.0466,
   "pOneSided": 0.0095
  },
  "brierSkill": -0.0118,
  "coverage80": 0.8
 },
 "coverage": {
  "value": 0.7289,
  "band": [
   0.75,
   0.85
  ],
  "ok": false
 },
 "reason": "Kiểm định đặt trước CF3 KHÔNG ĐẠT: ngoài mẫu IC 0.0004 (KTC -0.0234…0.028) không khác 0 và không hơn chọn láng giềng ngẫu nhiên (-0.0142); nhóm dự báo cao không hơn nhóm thấp sau phí. Khoảng 80% chỉ phủ 73%. Chỉ để quan sát, không phải khuyến nghị."
});
