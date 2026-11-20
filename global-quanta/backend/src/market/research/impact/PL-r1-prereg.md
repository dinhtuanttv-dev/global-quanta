# PL-r1 — Doanh nghiệp ngang hàng nước ngoài đi trước ngành VN (đăng ký trước 20/11/2026, CHƯA CHẠY)

Họ riêng gồm 2 thành viên (PL-r1a, PL-r1b), hiệu chỉnh Holm trong họ. **Không** thuộc `IMPACT-FAMILY.md`. Người dùng cho phép đăng ký và kiểm **một lần** ngoài mẫu (quyết định N2, 20/11/2026).

**Cơ sở khám phá** (chỉ trong mẫu 2013–2019; `Ho-so-360-v2/Ket-noi-the-gioi-loi-the/BAO_CAO_PHUONG_PHAP_MOI_B.md`, mã `kham-pha/lab-b.mjs`):
- Bất động sản HK → bất động sản VN, 4 tuần: r 0,297, t 2,9, p dịch vòng 0,007 (n 90).
- CNTT Ấn Độ/Mỹ → CNTT VN, 1 tuần: r 0,109, t 2,1, p 0,055.
- Trong mẫu có 14 phép thử; không phép nào qua Bonferroni 0,0036. Đây là **giả thuyết**, chưa phải bằng chứng.

## Dữ liệu (cố định trước, không đổi)
- **Lợi suất tuần:** log, thứ Sáu → thứ Sáu. Giá tuần = đóng cửa cuối cùng ≤ thứ Sáu tại sàn của chứng khoán đó.
- **Nhóm VN, bình quân đều:** lợi suất tuần của các mã có giá cả hai đầu tuần; bỏ lợi suất tuần có |giá trị| ≥ 50% (lỗi dữ liệu). Giá điều chỉnh VNDirect (`adClose`).
  - Bất động sản: VIC, VHM, NVL, KDH, DXG, NLG, PDR.
  - CNTT: FPT, CMG, ELC.
- **Nhóm nước ngoài, bình quân đều**, giá điều chỉnh Yahoo:
  - Bất động sản: 0688.HK (China Overseas Land), 0016.HK (Sun Hung Kai).
  - CNTT: INFY, WIT, ACN.
- **Vượt thị trường:** nhóm VN − VN-Index; nhóm nước ngoài − EEM.
- **Mẫu ngoài:** tuần kết thúc 2020-01-03 → tuần đầy đủ gần nhất trước ngày chạy.

## Giả thuyết
- **PL-r1a:** tổng lợi suất vượt 4 tuần (t−3..t) của nhóm bất động sản HK dự báo **dương** tổng lợi suất vượt 4 tuần sau (t+1..t+4) của nhóm bất động sản VN.
  - Khối không chồng lấp: mỗi 4 tuần một quan sát, khối đầu bắt đầu ở tuần đầu tiên của mẫu ngoài.
- **PL-r1b:** lợi suất vượt tuần t của nhóm CNTT nước ngoài dự báo **dương** lợi suất vượt tuần t+1 của nhóm CNTT VN. Mỗi tuần một quan sát.

## Thống kê
- Hệ số tương quan Pearson r giữa x và y, và t = r·√((n−2)/(1−r²)).
- **p chính** = p dịch vòng, một phía: dịch vòng chuỗi x một khoảng ngẫu nhiên từ 26 tuần đến n − 26 tuần, 1.000 lần, hạt giống 7. p = (số lần r_placebo ≥ r + 1) / 1.001.

## ĐẠT (mỗi thành viên, cả bốn)
1. r > 0 và t ≥ 2.
2. p dịch vòng ≤ ngưỡng Holm của họ 2 thành viên (α = 0,05 một phía: p nhỏ hơn ≤ 0,025, p lớn hơn ≤ 0,05).
3. Hai nửa mẫu ngoài (chia theo số quan sát) đều có r > 0.
4. Ý nghĩa kinh tế:
   - PL-r1a: lợi suất vượt 4 tuần sau trung bình ở các khối có x ≥ 1 độ lệch chuẩn (của x trong mẫu ngoài) > 0,45%;
   - PL-r1b: chỉ tiêu tương tự cho 1 tuần sau > 0,45%.

## Thiếu mẫu
PL-r1a dưới 40 khối, hoặc PL-r1b dưới 150 tuần: CHƯA ĐỦ MẪU.

## Hệ quả
- ĐẠT: ghi vào sổ bằng chứng (ĐẠT, tầm ngắn). Muốn vào quyết định Elite phải qua INC-r1.
- KHÔNG ĐẠT: ghi KHÔNG ĐẠT và không dùng. Không chạy lại với nhóm hoặc kỳ hạn khác.

## Chạy một lần
- Script `backend/scripts/pl-r1-run.mjs` ghi `backend/src/market/research/impact/PL-r1-report.json` và **từ chối chạy nếu tệp báo cáo đã tồn tại**.
- Tệp này và script được commit **trước** khi tải dữ liệu 2020+ và chạy.
