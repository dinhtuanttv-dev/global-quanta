# M5 — Mô hình thích ứng Trading Matrix (champion / challenger) — CỔNG THĂNG HẠNG ĐẶT TRƯỚC (ĐÃ DUYỆT 2026-10-22)
Soạn 2026-10-22, TRƯỚC khi huấn luyện / đo. Căn cứ spec §11 Phase 5, §6.10, §9. Không sửa sau commit (sửa thì ghi "Sửa đổi").

## Mục tiêu dự báo
`y_t = 1` nếu VN-Index đóng cửa t+10 > đóng cửa t (10 phiên giao dịch). Nhãn chồng lấn 10 phiên -> purge 10 + embargo 10.

## Đặc trưng (vector trạng thái M3, chỉ dữ liệu ≤ t; phiên bản `F1`)
`b, db5, ddb, med5, idx5, idx1, rv, rvPct` + one-hot `regime ∈ {UPTREND, DOWNTREND, SIDEWAY}`. Thiếu giá trị -> bỏ phiên.

## Mô hình
- **Champion (baseline, đang chạy)** `B0-breadth`: tần suất y = 1 trên tập huấn luyện theo 3 nhóm độ rộng (b < 40 / 40–60 / ≥ 60).
- **Đối chứng bổ sung** `B1-base`: tỷ lệ nền (hằng số) của tập huấn luyện.
- **Challenger** `C1-logit`: hồi quy logistic L2 trên đặc trưng chuẩn hoá; λ ∈ {0,1; 1; 10; 100} chọn bằng purged k-fold
  theo thời gian (5 fold, purge 10, embargo 10) CHỈ trên giai đoạn huấn luyện; hiệu chỉnh isotonic trên fold huấn luyện cuối.

## Chia dữ liệu
VN100 (97 mã) + VN-Index 2021-10 → 2026-10 (SSI). Huấn luyện + chọn λ: ≤ 2024-12-31. **Holdout chưa dùng: 2025-01-02 → phiên cuối − 10**,
chỉ dùng MỘT lần để chấm cổng.

## Cổng thăng hạng (challenger thay champion khi CẢ BA đúng trên holdout)
1. Brier skill so champion `1 − Brier(C1)/Brier(B0) > 0` và cận dưới KTC 95 % (block bootstrap 10 phiên, 1000 lần) > 0.
2. ECE (10 bin) của C1 ≤ 0,05.
3. AUC của C1 có cận dưới KTC 95 % > 0,5.
Không đạt -> C1 chỉ hiển thị ở mục nghiên cứu ("chưa thăng hạng"), champion B0 giữ nguyên. Không thăng hạng theo accuracy / hit rate đơn lẻ.

## Theo dõi sau thăng hạng (M6)
Brier 60 phiên thực tế của mô hình đang chạy > Brier holdout + 0,03 trong 2 lần kiểm liên tiếp -> cảnh báo suy giảm, đề xuất quay lại
phiên bản trước (rollback). Mọi phiên bản lưu sổ đăng ký: id, đặc trưng, mốc huấn luyện, λ, hiệu chỉnh, chỉ số holdout, trạng thái.

## Hiển thị
Xác suất luôn kèm: kỳ hạn (10 phiên), tỷ lệ nền, cỡ mẫu huấn luyện, kết quả holdout, phiên bản, nhãn ĐÃ KIỂM ĐỊNH chỉ khi qua cổng
(champion B0 là tần suất lịch sử — nhãn "MÔ TẢ").

## Sửa đổi
(chưa có)

## Kết quả (2026-10-22, code cố định ở e2647f4, chạy một lần; xem matrixModels.js)
Huấn luyện 2021-10 → 2024-12; holdout 2025-01-02 → 2026-10-07 (436 phiên, tỷ lệ tăng 57,3 %).
- Champion B0-breadth: Brier 0,2441 · AUC 0,549 · ECE 0,066. Đối chứng B1-base: Brier 0,2478.
- Challenger C1-logit: Brier 0,2833 · **Brier skill −16,1 % (KTC −30,0 %; −2,1 %)** · AUC 0,50 · ECE 0,197 — isotonic trên fold cuối
  gộp mọi dự báo thành một hằng số (không học được tín hiệu vượt nền).
- **Phán quyết: KEEP_CHAMPION** — C1 chỉ ở mục nghiên cứu; champion B0 là tần suất lịch sử (nhãn MÔ TẢ, không phải "ĐÃ KIỂM ĐỊNH").
