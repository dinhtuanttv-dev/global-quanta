# KQ-r1 — Kiểm định đặt trước: SUE lợi nhuận cốt lõi & ước tính LNST cả năm (KQKD theo quý)

Chốt ngày 06/11/2026, **trước khi chạy**. Mã: `kqkdValidate.js`, `scripts/kqkd-validate.mjs`. Không chỉnh tham số sau khi xem kết quả;
OOS chạy **một lần** (script từ chối chạy lại nếu đã có báo cáo OOS).

## Câu hỏi
Hai chỉ số đang hiển thị nhãn MÔ TẢ trong ngăn chi tiết KQKD:
1. **SUE LN cốt lõi** — bất ngờ chuẩn hoá của LN cốt lõi (bước ngẫu nhiên mùa vụ, độ lệch chuẩn 8 quý trước, cần ≥ 6).
2. **Ước tính LNST cả năm** — lũy kế / tỷ trọng lũy kế trung vị ≤ 10 năm (cần ≥ 5 năm đủ 4 quý dương), dải P10–P90.

Có được dùng như tín hiệu (THĂM DÒ) hay không?

## Dữ liệu
- BCTC quý VNDirect finfo (kho K0, nạp 06/11/2026), 284 mã universe hiện tại, 4 mẫu biểu. Bộ tính = **đúng hàm của giao diện** (`kqkdEngine.js`).
- Giá: VNDirect `stock_prices` `adClose` (điều chỉnh), `nmValue`; 2012-06 → 2026-11.
- **Ngày thông tin có sẵn (point-in-time)**: `createdDate` của VNDirect chỉ là ngày công bố từ năm tài chính 2020 (98–100% quý trễ 0–120 ngày);
  trước đó là ngày nhập liệu hàng loạt (trễ hàng năm). Quy tắc chốt: ngày có sẵn = `createdDate` nếu trễ 0–120 ngày so với kết thúc quý,
  ngược lại = kết thúc quý + 45 ngày (hạn nộp BCTC hợp nhất).
- **Ngày vào lệnh** của sự kiện (mã, quý) = max(kết thúc quý + 45 ngày, ngày có sẵn); giá vào = giá đóng cửa phiên đầu tiên **sau** ngày đó.
- Hạn chế đã biết (ghi trong báo cáo, không sửa được): VNDirect ghi đè số khi công ty điều chỉnh (giá trị đã điều chỉnh, có thể lạc quan);
  universe là danh sách hiện tại (thiên lệch sống sót, ảnh hưởng cả hai đầu ngũ phân vị); công ty nộp muộn trước 2020 có thể bị dùng sớm.

## Thiết kế
- Mỗi **lứa** = một quý tài chính (mọi mã cùng quý). Lợi suất vượt 60 phiên = lợi suất mã − bình quân đều mọi mã có giá ở cả hai mốc.
- Lọc thanh khoản: trung vị GTGD khớp lệnh 20 phiên trước ngày vào ≥ 1 tỷ đồng. Lứa cần ≥ 30 mã.
- IC = Spearman(tín hiệu, lợi suất vượt 60 phiên) mỗi lứa. Chênh lệch ngũ phân vị Q5 − Q1 trừ chi phí 1,0% (hai chân, khứ hồi).
- **Trong mẫu (IS)**: quý tài chính 2013Q1–2019Q4. **Ngoài mẫu (OOS)**: 2020Q1–2026Q1 (2026Q2 chưa đủ 60 phiên). Không chọn tham số trên IS.
- Bootstrap khối (khối 4 lứa = 1 năm, 2.000 lần, seed 20261106), p một phía.

## Giả thuyết & tiêu chí ĐẠT (chốt)
| | Giả thuyết | Đạt khi (OOS) |
|---|---|---|
| H1 | SUE LN cốt lõi dự báo lợi suất vượt 60 phiên | IC trung bình > 0, p Holm ≤ 0,05; **và** Q5−Q1 ròng trung bình > 0; **và** IC IS > 0 |
| H2 | SUE cốt lõi tốt hơn SUE LNST | (IC cốt lõi − IC LNST) theo cặp lứa > 0, p Holm ≤ 0,05 |
| H3 | Tăng trưởng ước tính cả năm (sự kiện Q1–Q3) dự báo lợi suất vượt 60 phiên | như H1 |
| H4 | Ước tính cả năm chính xác hơn cách ngây thơ | trung vị sai số tuyệt đối % (so LNST cả năm thực tế) thấp hơn cách ngây thơ (năm trước × lũy kế/lũy kế cùng kỳ), p bootstrap cặp ≤ 0,05; **và** tỷ lệ năm thực tế nằm trong dải P10–P90 trong [70%; 90%] |

Holm trên H1–H3 (α = 0,05). H4 là độ chính xác, kiểm riêng.
Kết quả: ĐẠT -> chỉ số đó đổi nhãn MÔ TẢ -> THĂM DÒ (vẫn không phải khuyến nghị); KHÔNG ĐẠT -> giữ MÔ TẢ, ghi rõ trên giao diện.
Phụ (chỉ báo cáo, không quyết định): kỳ hạn 20 phiên; theo mẫu biểu; theo giai đoạn 2020–2022 / 2023–2026.
