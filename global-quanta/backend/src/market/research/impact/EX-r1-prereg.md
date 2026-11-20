# EX-r1 — Thời điểm khớp lệnh MUA của Elite HL: mở cửa (ATO) hay đóng cửa (ATC), theo chiều phiên trước (đăng ký trước 20/11/2026, CHƯA CHẠY)

Kiểm định **thực thi**: không chọn mã, không đổi danh mục. Người dùng cho phép (quyết định N4, 20/11/2026). Chạy **một lần**.

**Cơ sở khám phá** (trong mẫu 2013–2019; `Ket-noi-the-gioi-loi-the/BAO_CAO_PHUONG_PHAP_MOI_B.md` mục 4):
- Rổ 30 mã lớn đi ngược phiên VN-Index hôm trước **trong phiên** hôm nay.
- Hệ số −0,18 đến −0,22, t ≈ −6, có ở cả 2013–2016 và 2017–2019.
- Nếu đúng với lệnh mua của Elite HL thì:
  - sau phiên VN-Index **giảm**, giá thường tăng trong phiên → mua lúc mở cửa (ATO) rẻ hơn mua lúc đóng cửa (ATC);
  - sau phiên **tăng** thì ngược lại → quy tắc hiện tại (ATC, đóng cửa d+1) đã là tốt nhất.

## Lệnh mua được xét
- Lệnh MUA MỚI của quy tắc Elite HL (phương án B = G2r) trong mô phỏng của hạ tầng HL-r2:
  - script `backend/scripts/ex-r1-run.mjs` chép đúng khung `hl-r2-backtest.mjs` (nhánh `research/hl-r2-pz-r1`);
  - chỉ thêm phần ghi lại từng lệnh mua;
  - dùng mã nguồn quy tắc của `main` tại ngày chạy.
- **Dữ liệu:** `gq-research/pit-ohlc` (bảng tín hiệu dựng lại theo thời điểm; OHLC điều chỉnh; VN-Index đã sửa lỗi nhân 100 ngày 14/11/2026).
- **Phiên vào lệnh d1** = phiên mô phỏng khớp lệnh (đóng cửa d+1 của quy tắc). **Phiên trước** = phiên giao dịch liền trước d1.

## Đo
- Mỗi lệnh mua: x = ln(đóng cửa d1 / mở cửa d1), là phần giá đi trong phiên vào lệnh. x > 0 nghĩa là mua lúc mở cửa rẻ hơn mua lúc đóng cửa.
- **Bỏ** lệnh có giá mở cửa ≥ giá trần (không mua được lúc mở) và lệnh thiếu giá mở cửa.
- Gộp theo phiên: mỗi phiên d1 một quan sát = trung bình x các lệnh trong phiên đó. t tính trên các phiên.
- Phiên trước "giảm" khi lợi suất VN-Index phiên trước < 0, "tăng" khi > 0.

## Giả thuyết
- **H1 (chính):** sau phiên VN-Index giảm, trung bình x của lệnh mua Elite HL > 0.
- **H2 (phụ, không quyết định):** sau phiên VN-Index tăng, trung bình x < 0 (xác nhận ATC hiện tại là tốt).

## Mẫu
- **Ngoài mẫu (quyết định):** 2020-01-02 → 2026-11-12 (kỳ REPORT của HL-r2).
- **Trong mẫu** 2014-03-03 → 2019-12-31: chỉ báo cáo để tham khảo.

## ĐẠT (H1, cả ba)
1. Trung bình x ≥ +0,15% và t ≥ 2 (một phía).
2. Hai nửa mẫu ngoài (chia theo số phiên) đều có trung bình x > 0.
3. Có ít nhất 60 phiên vào lệnh sau phiên giảm. Dưới mức này: CHƯA ĐỦ MẪU.

## Hệ quả
- **ĐẠT:** đề xuất (cần anh quyết riêng) quy tắc thực thi "phiên trước VN-Index giảm → đặt mua ATO; còn lại giữ ATC". Hiển thị trong Hồ sơ 360° như **gợi ý thời điểm khớp lệnh** (MÔ TẢ có bằng chứng). Không đổi việc chọn mã.
- **KHÔNG ĐẠT:** giữ ATC. Ghi KHÔNG ĐẠT vào sổ bằng chứng.

## Chạy một lần
Script ghi `backend/src/market/research/impact/EX-r1-report.json` và từ chối chạy nếu tệp đã tồn tại. Tệp này được commit trước khi chạy.
