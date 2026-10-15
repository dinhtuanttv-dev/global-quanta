# Top 20 v2: kiểm định đặt trước T3

Người dùng duyệt quy tắc ngày 2026-10-10, trước khi chạy.
- **Mã nguồn:** `factors.js` (T1), `gbrank.js` (M2), `validate.js` (`T3_PREREG`).
- **Lệnh chạy:** `scripts/alpha-validate.mjs`.

## Dữ liệu (chỉ đọc)
- **Giá:** OHLC ADJUSTED_CUMULATIVE của Gateway `/api/market/ta-series`, universe scanner. Mã chỉ có `SSI_LATEST_EVENT_ADJUSTED` bị loại, giống quy tắc CF3.
- **BCTC quý VNDirect finfo** (21001 doanh thu, 23000 LNST công ty mẹ, 13000 nợ, 14000 vốn chủ sở hữu):
  - một quý chỉ được dùng khi `createdDate` sớm nhất của quý đó **nhỏ hơn hẳn** ngày dự báo;
  - thiếu `createdDate` thì lấy hết quý + 45 ngày (Q4: + 90 ngày).
- **Khối ngoại theo ngày** (VNDirect `/v4/foreigns`) và **vốn hóa theo ngày** (VNDirect `ratios MARKETCAP`).
- **Ngành:** ICB cấp 2 (Gateway taxonomy). RRG tuần của ngành chỉ dùng cho benchmark "điểm hội tụ hiện tại", lấy tuần đã đóng trước ngày dự báo.

## Yếu tố (T1, 18 yếu tố, chốt)
- **Giá:** momentum 12-1; momentum 6-1; RS phần dư 63 phiên (OLS 252 phiên trên thị trường và ngành, ngành không tính chính mã); gần đỉnh 52 tuần; Trend Template 0–6; −σ60.
- **Dòng tiền:** khối ngoại ròng 20 phiên / (GTGD TB60 × 20); khối ngoại ròng 60 phiên / (GTGD TB60 × 60), cần ≥ 75% số ngày có dữ liệu; log(GTGD TB20 / TB250); CMF-20 theo GTGD; −lợi suất 5 phiên.
- **Cơ bản:** LNST quý so cùng kỳ; doanh thu quý so cùng kỳ; gia tốc LNST (so cùng kỳ của quý mới nhất trừ quý trước đó); ROE (LNST 4 quý / VCSH bình quân); E/P (LNST 4 quý / vốn hóa ngày); tăng trưởng LNST 4 quý. Tăng trưởng được cắt ở ±500%.
- **Ngành:** lợi suất log 63 phiên trung bình của ngành − lợi suất VN-Index.
- **Chuẩn hóa mỗi ngày:**
  1. cắt biên 1%/99%;
  2. Gaussian rank, giá trị thiếu = 0;
  3. trung hòa theo ngành (ngành có ≥ 3 mã), rồi chuẩn hóa lại độ lệch chuẩn.
- **Lọc mã:** GTGD TB60 ≥ 5 tỷ và ≥ 252 phiên lịch sử.

## Mô hình (T2)
- **M1:**
  - IC hạng của từng yếu tố trên các ngày j có ce_j + 21 < ce (kết quả đã kết thúc) và trong 756 phiên trước đó;
  - w = 0,5·IC/Σ|IC| + 0,5·(1/18);
  - có dưới 20 ngày lịch sử thì dùng trọng số đều.
- **M2 (LambdaMART):**
  - 100 cây, độ sâu 3, lr 0,1, tối thiểu 50 mẫu mỗi lá, 32 bins, reg 1, NDCG@20;
  - nhãn = ngũ phân vị của lợi suất vượt trội 20 phiên trong ngày;
  - huấn luyện lại mỗi 12 ngày đánh giá, trên các ngày có ce_j + 21 + 20 ≤ ce (purge 20 + embargo 20) trong 756 phiên trước đó;
  - có dưới 30 ngày huấn luyện thì dùng điểm trọng số đều (ghi rõ trong báo cáo).
- **Chọn mô hình:** M2 chỉ được chọn khi IC trong mẫu của M2 > IC trong mẫu của M1.

## Danh mục và kết quả đo
- **Ngày đánh giá:** mỗi 5 phiên, bắt đầu từ ngày đầu tiên có ≥ 100 mã đủ điều kiện.
- **Danh mục:** Top 20 theo điểm, tối đa 4 mã mỗi ngành, tỷ trọng đều.
- **Lợi suất:** vượt VN-Index 5 phiên, vào lệnh ở đóng cửa t+1, giữ tới lần cân bằng kế tiếp.
- **Phí:** 0,3% × tỷ lệ mã thay mới.
- **Chuẩn so sánh:** trung bình cả universe thanh khoản.
- **IC:** Spearman cắt ngang giữa điểm và lợi suất vượt VN-Index 20 phiên (vào lệnh đóng cửa t+1).
- **Placebo:** 100 đường; mỗi lần cân bằng thay ngẫu nhiên **đúng số mã** chiến lược thay, cùng trần ngành, cùng phí.
- **Benchmark (điều kiện 4), cùng cách dựng Top 20 và cùng phí:**
  - điểm hội tụ hiện tại, với trọng số Risk-On trung lập 50 vì không có lịch sử DXY/VIX/US10Y;
  - momentum 6-1 thô.

## Chia mẫu và thống kê
- **Chia mẫu:** 70% số ngày đầu là IS (bỏ 12 ngày cuối làm khoảng đệm ≈ 60 phiên); 30% cuối là OOS.
- **Chạy một lần:** OOS chạy đúng một lần với cấu hình chốt (SHA-256). Script từ chối chạy lại hoặc hiệu chỉnh lại khi đã có báo cáo OOS.
- **Bootstrap:** khối liên tiếp 4 ngày, 2.000 vòng; KTC 95%, p một phía. Dưới 12 ngày thì ghi "thiếu mẫu".
- **Deflated Sharpe (Bailey & López de Prado 2014):**
  - SR tính trên chuỗi chênh lệch 5 phiên ngoài mẫu;
  - SR0 = √V·[(1−γ)Φ⁻¹(1−1/N) + γΦ⁻¹(1−1/(N·e))], với N = 2 thử nghiệm (M1, M2) và V = phương sai SR trong mẫu của hai mô hình;
  - "Deflated Sharpe > 0" nghĩa là SR − SR0 > 0.

## ĐẠT khi cả 6 điều kiện (ngoài mẫu)
1. IC hạng của mô hình được chọn: TB > 0, cận dưới KTC > 0.
2. Top 20 − universe, sau phí: TB > 0, cận dưới > 0.
3. Top 20 − placebo: TB > 0, cận dưới > 0.
4. Top 20 hơn điểm hội tụ hiện tại **và** hơn momentum 6-1 (TB chênh lệch > 0).
5. Deflated Sharpe > 0.
6. IC trong mẫu > 0; OOS có ≥ 40 ngày và ≥ 100 mã.

**Mô tả thêm (Holm, không đổi kết luận):** IC theo nhóm yếu tố, kỳ hạn 10/40/60, VN-Index trên/dưới MA200, IC của mô hình không chọn; vòng quay danh mục, sụt giảm tối đa.

**Không đạt:** giữ EXPERIMENTAL; Top 20 v2 chỉ để sàng lọc.

**Hạn chế:**
- thiên lệch sống sót;
- số liệu BCTC là bản điều chỉnh mới nhất;
- benchmark hội tụ dùng Risk-On trung lập;
- Lee–Ready chưa kiểm định được (chỉ đưa vào sổ theo dõi T5).

## Kết quả (chạy 2026-10-15)
- **Thời điểm chốt:** mã nguồn và quy tắc commit 70e31c9 trước khi chạy. Cấu hình chốt sau pha trong mẫu là commit ea515eb (SHA-256 `5924b93b…`).
- **Trong mẫu** (2022-10-25 → 2025-04-08, 123 ngày):
  - M1: IC +0,0007 [−0,039; +0,035];
  - M2: IC −0,047 [−0,093; −0,006];
  - chọn **M1**.
- **Ngoài mẫu** (2025-07-11 → 2026-09-04, 58 ngày, 221 mã, chạy một lần): **KHÔNG ĐẠT (2/6) → EXPERIMENTAL**.
  1. IC +0,037 [+0,002; +0,076] → ĐẠT.
  2. Top 20 − universe sau phí −0,14%/5 phiên [−0,43; +0,16] → không đạt.
  3. Top 20 − placebo −0,13% → không đạt.
  4. Hơn điểm hội tụ hiện tại +0,23% nhưng kém momentum 6-1 −0,02% → không đạt.
  5. Deflated Sharpe: SR −0,125 < SR0 0,068 → không đạt.
  6. Điều kiện cỡ mẫu và IC trong mẫu → ĐẠT.
- **Mô tả thêm:**
  - Không giả thuyết nào bị Holm bác bỏ. Gần nhất là IC kỳ hạn 40 phiên, p 0,0135.
  - Nhóm dòng tiền có IC −0,053 [−0,093; −0,014], ngược kỳ vọng.
  - Vòng quay TB 18%/lần; sụt giảm tối đa của chuỗi chênh lệch −12%.
