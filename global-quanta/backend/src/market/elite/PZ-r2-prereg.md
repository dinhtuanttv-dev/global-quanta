# PZ-r2 — đăng ký trước: "chỉ mua ở Vùng mua" có giảm sụt giảm của Elite HL với cái giá chấp nhận được không

**Ngày đăng ký:** 14/11/2026 · **Người quyết định:** chủ dự án (chọn phương án P2 của PZ-r1 để kiểm định riêng, cùng ngày).
**Trạng thái:** viết và commit TRƯỚC khi dựng bảng tín hiệu và trước khi chạy bất kỳ mô phỏng nào trên giai đoạn kiểm định.

## 1. Mục tiêu và câu hỏi

Mục tiêu của chủ dự án là **giảm sụt giảm** của danh mục chính, không phải tăng lợi suất. Câu hỏi duy nhất:

> Cổng "chỉ mua mới mã ở Vùng mua" (P2) có làm sụt giảm lớn nhất nhỏ hơn rõ rệt so với G2r (P0), trong khi lợi suất và lợi suất điều chỉnh rủi ro không kém đi quá mức chấp nhận, trên dữ liệu chưa dùng cho phương án này không?

## 2. Bằng chứng đã biết trước khi đăng ký (không dùng để quyết định)

| Giai đoạn (PZ-r1) | P0 lợi suất / sụt giảm / Sharpe | P2 lợi suất / sụt giảm / Sharpe | P2 tiền mặt TB |
|---|---|---|---|
| 03/2014 → 12/2019 | 16,1% / −30,3% / 1,01 | 15,1% / −20,9% / 1,44 | 52% |
| 01/2020 → 05/2023 | 0,8% / −52,7% / 0,15 | 7,2% / −26,9% / 0,67 | 47% |

Các ngưỡng ở mục 5 được đặt khi đã biết hai dòng trên; vì vậy giai đoạn kiểm định phải là dữ liệu P2 chưa từng chạy.

## 3. Dữ liệu và khung

- **Giai đoạn KIỂM ĐỊNH (duy nhất dùng để quyết định):** 19/05/2023 → 12/11/2026. Bảng tín hiệu của đoạn này chưa được dựng lại tại thời điểm đăng ký.
- Bảng dựng lại bằng `hl-panel-replay.mjs` ở commit `3b73223` (cùng phiên bản đã dựng 2014 → 05/2023), dữ liệu giá VNDirect đã tải ngày 12/11/2026, VN-Index đã sửa (HL-r2 S2).
- Khung mô phỏng giống PZ-r1 mục 2 (vũ trụ 300 mã, phí 0,20% / 0,25%, khớp đóng cửa D+1, trần / sàn). Engine `buildHlPortfolio` + `pzStep` của production tại commit đăng ký này.
- **Lưu ý về độc lập:** tham số G2r được chọn ở K0 trên 2020–2026, nên P0 không ngoài mẫu trên đoạn này. Câu hỏi là CHÊNH LỆCH P2 − P0 cùng engine, và P2 chưa từng chạy trên đoạn này.

## 4. Phương án

| Mã | Phương án |
|---|---|
| P0 | G2r hiện hành (đối chứng) |
| P2 | P0 + chỉ mua mới mã ở trạng thái Vùng mua của PZ-v2; nền = hộp giá HG-v1 (không có lịch sử SEPA theo phiên) |

Một phương án thách đấu, một bộ ngưỡng (`PZ_RULES` tại commit này). Không thêm phương án, không đổi ngưỡng sau khi chạy.

## 5. Tiêu chí bật cổng — P2 phải đạt CẢ NĂM

1. **Sụt giảm:** sụt giảm lớn nhất của P2 nhỏ hơn P0 ít nhất 5 điểm %.
2. **Cái giá lợi suất:** lợi suất năm của P2 không thấp hơn P0 quá 3 điểm %.
3. **Hiệu quả trên rủi ro:** Sharpe của P2 ≥ Sharpe của P0.
4. **Không kém có ý nghĩa:** chênh lệch P2 − P0 trên chuỗi 20 phiên không chồng lấn (20 pha) có t trung vị > −2.
5. **Bền theo thời gian:** chia giai đoạn kiểm định làm hai nửa bằng số phiên; trong MỖI nửa, sụt giảm lớn nhất của P2 không sâu hơn P0.

Ràng buộc kèm: tiền mặt bình quân của P2 ≤ 60% (đặt khi đã biết P2 giữ 47–52% ở hai giai đoạn trước). Vượt ràng buộc này = không đạt.

## 6. Quyết định

- Đạt cả năm tiêu chí và ràng buộc -> đề xuất bật cổng `PZ_GATE = true` (phiên bản E4-HL v2, lưu trữ sổ cũ), **chủ dự án duyệt lần cuối** sau khi đọc báo cáo; sau khi bật, theo dõi 60 phiên trên sổ tiến, quay lui bằng `PZ_GATE = false`.
- Không đạt -> cổng giữ tắt; công bố đầy đủ.
- Production dùng nền SEPA trước hộp giá, khác mô phỏng; báo cáo phải nêu khác biệt này.

## 7. Điều KHÔNG được làm

- Không đổi `PZ_RULES`, phương án, giai đoạn hay tiêu chí sau khi đăng ký.
- Không chạy lại vì "sửa lỗi" mà không ghi vào mục sửa đổi trước.

## 8. Sửa đổi

(chưa có)
