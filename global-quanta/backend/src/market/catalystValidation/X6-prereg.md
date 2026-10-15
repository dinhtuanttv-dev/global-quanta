# X6 — Kiểm định đặt trước: chiều tác động của engine Chất xúc tác + cổng MacroScore

Đăng ký ngày 2026-10-16, **trước khi tính bất kỳ lợi suất nào**. Trước khi viết bản này mới chỉ xem siêu dữ liệu của sổ `catalyst:signal-ledger` (Upstash):
- 88 tín hiệu: 74 benefit, 14 harm;
- nhóm: macro 73, contract 8, regulatory 5, rating 2;
- độ lan tỏa: direct 83, competitor 3, downstream 2;
- thời gian quét: 72 tín hiệu tháng 9/2026, 16 tín hiệu tháng 10/2026;
- 69 mã, 83 nguồn.

Chưa xem giá, cũng chưa xem cột `won`. Không sửa bản này sau khi chạy. Mọi sai lệch so với bản này phải ghi rõ trong phần kết quả.

## A. Chiều tác động (benefit/harm) có đi kèm lợi suất vượt trội đúng dấu không?

**Mẫu.** Toàn bộ bản ghi trong sổ tại lúc chạy. Đây là các tín hiệu do engine **đã triển khai trước X1** sinh ra: gồm cả tin trung lập bị gán nhầm "benefit" và giá lấy từ Yahoo. Vì vậy kiểm định này đánh giá *engine như đã chạy thực tế*, không phải engine sau X1.

**Ngày sự kiện t0.** Phiên giao dịch HOSE đầu tiên có ngày ≥ ngày (giờ Việt Nam) của `scannedAt`. Cron quét chạy khoảng 05:40 giờ VN, trước giờ mở cửa. Vào lệnh theo **giá đóng cửa t0**. Cách này thận trọng: không dùng giá trước khi tín hiệu tồn tại.

**Giá.** Giá đóng cửa điều chỉnh cộng dồn của Gateway `/api/market/ta-series` (range 2y). Chỉ số so sánh là VN-Index lấy cùng nguồn.

**Lợi suất vượt trội.**
- AR(h) = ln(P[t0+h] / P[t0]) − ln(VNI[t0+h] / VNI[t0]), với h đo bằng số phiên.
- Lợi suất có dấu: SAR(h) = d × AR(h), trong đó d = +1 nếu benefit, −1 nếu harm.

**Chỉ tiêu chính.**
- Trung bình SAR(20).
- Khoảng tin cậy 95% bằng bootstrap theo **cụm nguồn** (`sourceId`): 10.000 lần lấy mẫu, seed 20261016.

**ĐẠT** khi thoả cả hai điều kiện:
1. có ít nhất 30 tín hiệu đủ 20 phiên sau t0;
2. cận dưới khoảng tin cậy 95% của trung bình SAR(20) lớn hơn 0.

**Chỉ tiêu phụ (chỉ mô tả, không quyết định nhãn).**
- Trung bình SAR(5) kèm khoảng tin cậy.
- Tỷ lệ SAR(20) > 0, so với 50% bằng kiểm định nhị thức một phía.
- Tách riêng benefit và harm; tách theo nhóm (category).

**Loại khỏi mẫu (ghi số lượng).**
- Mã không có giá trên Gateway.
- Tín hiệu chưa đủ 20 phiên (với AR(20)) hoặc chưa đủ 5 phiên (với AR(5)).
- t0 không xác định được.

**Hệ quả.**
- ĐẠT: nhãn chiều tác động là `VALIDATED_IN_SAMPLE`, kèm cảnh báo về mẫu nhỏ và giai đoạn ngắn.
- KHÔNG ĐẠT hoặc thiếu mẫu: chiều tác động và "tỷ lệ thắng" trên tab Chất xúc tác mang nhãn **`EXPERIMENTAL`**, kèm số liệu kiểm định.
- Engine không bị đổi để "đạt": không chỉnh ngưỡng, không lọc lại mẫu.

**Kiểm định tiến (sổ theo dõi).** Áp dụng nguyên văn giao thức trên cho các tín hiệu ghi **sau khi X1 triển khai** (`scannedAt` ≥ 2026-10-17), tức engine đã sửa chiều trung lập và dùng đầu vào Gateway. Lần chấm đầu tiên làm khi có ít nhất 30 tín hiệu đủ 20 phiên. Chạy lại bằng script, không đổi tham số.

## B. Cổng MacroScore (Trung tâm vĩ mô)

Gateway đang ở chế độ **mô phỏng**: chưa có biến vĩ mô thật nào đủ 60 tháng. Vì vậy **không chạy** kiểm định cổng: trên dữ liệu mô phỏng, cổng "đạt" là vô nghĩa (hiệu ứng được cài sẵn).

Đăng ký trước cho khi đã có số liệu thật (chế độ `real`):
- Dùng `backtestMacroScore` của gói (lag 1, minTrain 60, B = 199) cho VNINDEX. Danh sách 6 biến của bài báo gốc được cố định trước.
- MacroScore chỉ được nâng từ `REFERENCE_ONLY` lên tín hiệu tham khảo có điều kiện khi thoả **cả hai**:
  1. cổng của gói đạt (`gate.pass`);
  2. IC ngoài mẫu > 0 với p < 0,05 trên ít nhất 36 tháng ngoài mẫu.
- Kể cả khi đạt, MacroScore **không** được đưa vào bộ máy quyết định nếu chưa có một bản đăng ký trước riêng.

## C. Tái lập

```
node backend/scripts/catalyst-event-study.mjs --ledger <ledger.json> --out <result.json>
```

`ledger.json` là bản xuất `HGETALL catalyst:signal-ledger`, chỉ đọc. Kết quả lưu ở `backend/src/market/catalystValidation/X6-result.json`.
