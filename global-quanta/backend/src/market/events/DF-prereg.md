# DF-r1 — Đăng ký trước: dự báo ngày GDKHQ cổ tức tiền (Lịch sự kiện, LSK2–LSK4)

Ngày đăng ký: 07/11/2026. Viết **trước** khi chạy kiểm định. Không sửa tiêu chí sau khi xem kết quả. Nếu phải sửa mô hình, phải đăng ký lại thành DF-r2.

## Câu hỏi
Từ lịch sử sự kiện VNDirect của chính mã (từ 2015), dự báo được ngày GDKHQ của **lần trả cổ tức tiền kế tiếp chưa công bố** tốt hơn cách ngây thơ hay không.

## Mô hình DF-v1 (cố định trước kiểm định)
- **Mẫu:** chỉ các sự kiện cổ tức tiền có ngày công bố trước thời điểm dự báo t (point-in-time theo `disclosureDate`).
- **Cụm "đợt trả":**
  - Gom ngày GDKHQ trong năm theo **ngày-trong-năm trên vòng tròn 365,25**, bằng KDE von Mises (κ = 25, khoảng ±23 ngày).
  - Trọng số theo năm, giảm nửa sau 3 năm.
  - Đỉnh mật độ = một đợt. Mỗi sự kiện gán về đỉnh gần nhất, đỉnh cách nhau tối thiểu 45 ngày.
- **Mỗi đợt:**
  - Ngày dự kiến = trung bình vòng tròn có trọng số.
  - Độ lệch vòng tròn σ, sàn 5 ngày; dải P10–P90 = trung bình ± 1,2816·σ.
  - Tần suất năm = số năm có trả trong đợt / số năm quan sát, shrink Beta về tần suất chung của toàn danh mục (empirical Bayes, độ mạnh prior 2 năm).
- **Dự báo tại t:** với mỗi đợt, lấy lần xuất hiện kế tiếp ≥ t.
  - Bỏ lần đó nếu đã có GDKHQ thật trong khoảng ±60 ngày quanh ngày dự kiến của kỳ này mà công bố trước t (đợt đã trả).
  - Kết quả: ngày dự kiến, dải P10–P90, xác suất = tần suất năm.

## Thiết kế kiểm định (walk-forward, không nhìn trước)
- **Điểm dự báo:** ngày 1 mỗi tháng, từ 01/2019 tới 06/2026. 284 mã trong danh mục hiện tại; lịch sử VNDirect từ 2015.
- **Chân lý:** GDKHQ cổ tức tiền thật trong (t, t + 120 ngày] mà **chưa công bố tại t**.
- Mỗi chân lý ghép với đợt dự báo có ngày dự kiến gần nhất; ghép được nếu cách không quá 60 ngày.
- **So sánh với đường cơ sở ngây thơ:** "ngày GDKHQ của đợt gần nhất cùng mùa năm trước + 365 ngày".

## Tiêu chí (cả 4 phải đạt → THĂM DÒ; không đạt → chỉ hiển thị "nếp lịch sử" nhãn MÔ TẢ)
- **H1 – sai số ngày:** MAE (ngày) của DF-v1 trên các chân lý ghép được ≤ 0,85 × MAE của đường cơ sở. Khoảng tin cậy 95% bootstrap theo cụm mã của tỷ số phải < 1.
- **H2 – độ phủ dải:** tỷ lệ chân lý rơi trong dải P10–P90 nằm trong [70%, 90%].
- **H3 – xác suất có trả trong 120 ngày:**
  - Brier skill so với tần suất trả chung của danh mục ≥ 0,10.
  - Xác suất của mỗi mã-thời điểm = 1 − ∏(1 − p_đợt) trên các đợt có ngày dự kiến trong (t, t + 120].
- **H4 – ổn định:** H1 đạt riêng ở cả hai nửa thời gian (2019–2022 và 2023–2026).

## Sổ theo dõi tiến (DF-L1)
Từ khi triển khai, mỗi ngày ghi một lần các dự báo của 60 ngày tới (mã, đợt, ngày dự kiến, dải, xác suất). Khi có GDKHQ thật thì chấm, không sửa bản ghi cũ.
