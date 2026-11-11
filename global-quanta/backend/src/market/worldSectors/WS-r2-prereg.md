# WS-r2 — Truyền dẫn thế giới tới cổ phiếu: đăng ký trước (H5, H6, H7)

Ghi ngày 2026-11-11, **trước khi** viết mã kiểm định và trước khi xem bất kỳ kết quả nào của H5 trên giai đoạn kiểm tra, của H6 và H7
ở mọi giai đoạn. Không sửa sau khi chạy; đổi định nghĩa / tiêu chí = WS-r3, kết quả r2 giữ nguyên.

Quyết định của người dùng (11/11/2026): làm đủ T0–T3 sau khi rà soát tài liệu "GTA Engine" — tích hợp vào Hồ sơ 360°, chỉ tín hiệu
ĐẠT mới vào Điểm Elite qua bằng chứng E2 + cổng walk-forward.

## Công khai phần đã xem (khám phá, 11/11/2026, 2023-01-03 → 2026-11-11, 22 ngành, chỉ số ngành Gateway)

Điểm ngắn hạn WS-v1 S_{s,d} (đúng H3): IC với lợi suất tương đối ngành phiên d = 0,025 (t 3,16); từ **đóng cửa d** trở đi ≈ 0 ở
mọi kỳ hạn (d+1: 0,003; d+5: 0,000; d+10: 0,000; d+1→d+11: 0,000). "Gap" 3 tháng thế giới − VN ≈ 0.
Tổng 5 phiên ΣS → đóng cửa d → d+10: IC 0,0225, t 1,41, hai nửa +0,016 / +0,030 — **đây là H5; giai đoạn 2023+ đã bị xem nên
KHÔNG dùng để quyết định H5/H6**. H6, H7 chưa từng được tính dưới bất kỳ dạng nào.

## Dữ liệu (chỉ nguồn công khai)

- Nước ngoài: 74 mã trong `catalog.js` (Yahoo, `range=10y` — chỉ kéo dài lịch sử so với WS-v1), hàng hoá dẫn dắt theo ngày của
  `COMMODITY_DRIVERS` (có lịch sử tới đâu dùng tới đó, đúng quy tắc trộn 70/30 của WS-v1).
- Việt Nam: giá VNDirect `stock_prices` (adOpen, adClose, nmValue) từ 2018-06-01 cho vũ trụ Siêu quét hiện hành; VN-Index (Gateway,
  `range=max`); ngành của mã = taxonomy Gateway (l3 nếu thuộc 22 ngành, không thì l2 — đúng `ws_stock`).
- **Hạn chế đã biết:** vũ trụ là các mã còn niêm yết hôm nay (thiên lệch sống sót); chỉ số ngành giai đoạn 2019–2022 phải DỰNG từ
  mã thành phần (chỉ số ngành Gateway chỉ có từ 03/2022).

## Định nghĩa chung

- S_{s,d}: điểm ngắn hạn WS-v1 của ngành s cho phiên VN d (thông tin nước ngoài mới từ sau đóng cửa VN phiên trước) — đúng
  `zShortAt` + `aggregateZ` + trộn hàng hoá 70/30 của `wsValidate.js`.
- Lợi suất cổ phiếu: log giá điều chỉnh. Vũ trụ mỗi phiên: mã có GTGD trung bình 20 phiên ≥ 1 tỷ đồng.
- Chỉ số ngành dựng (H5): lợi suất ngày của ngành = trung bình đều lợi suất log các mã của ngành trong vũ trụ phiên đó (cần ≥ 3 mã).
  Lợi suất tương đối = ngành − VN-Index. Kiểm tra dữ liệu (không phải giả thuyết): tương quan lợi suất ngày của chỉ số dựng với
  chỉ số ngành Gateway trên giai đoạn trùng (03/2022+) được báo cáo.
- IC ngày = Spearman cắt ngang; trung bình + t Newey–West (Bartlett) với độ trễ ghi ở từng giả thuyết; p một phía.

## Giả thuyết

- **H5 (ngành, sóng thế giới 5 phiên):** X_{s,d} = Σ_{k=0..4} S_{s,d−k}; Y = lợi suất tương đối ngành từ đóng cửa d tới đóng cửa
  d+10. ≥ 10 ngành / phiên; NW trễ 10. **Giai đoạn quyết định: 2019-07-01 → 2022-12-31.**
- **H6 (cổ phiếu, truyền dẫn theo độ nhạy):** b_{i,d} = độ dốc OLS của lợi suất ngày (mã − VN-Index) theo S_{s(i)} cùng phiên trên
  250 phiên kết thúc tại d (cần ≥ 150 cặp); X_{i,d} = b_{i,d} · Σ_{k=0..4} S_{s(i),d−k}; Y = lợi suất mã từ đóng cửa d tới đóng
  cửa d+10 trừ trung bình cắt ngang cùng phiên. ≥ 50 mã / phiên; NW trễ 10. **Giai đoạn quyết định: 2019-07-01 → 2022-12-31.**
- **H7 (thời điểm vào lệnh trong phiên):** X_{i,d} = S_{s(i),d} (biết trước ATO); Y = ln(adClose_d / adOpen_d) trừ trung bình cắt
  ngang cùng phiên (mua ATO thay vì đóng cửa ở ngành thuận gió). ≥ 50 mã / phiên; NW trễ 5. **Giai đoạn quyết định: 2019-07-01 →
  2026-11-10** (chưa từng tính). Báo cáo thêm (mô tả): chênh lệch trung bình Y giữa 1/3 mã có X cao nhất và 1/3 thấp nhất.

**ĐẠT** (mỗi giả thuyết): IC trung bình > 0, p một phía qua hiệu chỉnh Holm cho 3 giả thuyết < 0,025, và IC trung bình > 0 ở cả
hai nửa thời gian của giai đoạn quyết định. H5/H6 báo cáo thêm giai đoạn 2023+ (đã bị xem, chỉ mô tả).

## Hệ quả (áp dụng đúng như viết)

- H5 ĐẠT → tín hiệu ngành `ws_wave5` vào sổ E1 (bậc tiên nghiệm C), dựng ngược bằng chứng, xét bậc E2 và chỉ vào Điểm Elite qua cổng
  walk-forward như LS-r1 H4. H6 ĐẠT → tín hiệu cổ phiếu `ws_beta_wave` cùng quy trình.
- H7 ĐẠT → Hồ sơ 360° hiển thị "Thời điểm vào lệnh theo truyền dẫn" (mô tả kèm bằng chứng; KHÔNG đổi sổ Elite 10 — sổ vẫn vào lệnh
  đóng cửa d+1). Không đạt → không hiển thị gợi ý thời điểm.
- Không đạt H5/H6 → không thêm tín hiệu vào Điểm Elite; khối "Truyền dẫn thế giới" trong Hồ sơ chỉ mô tả.
- Độc lập kết quả: α ngành WS-v1 (`ws_sector_alpha`) ghi rõ trong Hồ sơ là "chỉ cho phiên kế tiếp lúc ATO — đã phản ánh khi Elite
  vào lệnh (đóng cửa d+1)" (đúng bằng chứng khám phá ở trên và lý do tiên nghiệm 0 của E3-v3).
