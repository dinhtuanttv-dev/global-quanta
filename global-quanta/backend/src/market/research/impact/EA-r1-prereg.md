# EA-r1 — Trôi sau ngày công bố KQKD thật (đăng ký trước 19/11/2026, CHƯA CHẠY)

Thuộc họ `IMPACT-FAMILY.md`.

## Giả thuyết
H1: Sau ngày công bố KQKD **thật** (S8), các mã có SUE LN cốt lõi cao có lợi suất vượt **phiên 2..20** cao hơn các mã SUE thấp. Phiên 0–1 bị bỏ để tránh mua đuổi phản ứng tức thời.

## Dữ liệu
- Ngày công bố thật từ S8 (cổng khớp CafeF 98%). Chỉ dùng các sự kiện có ngày thật; sự kiện không có ngày thật thì bỏ và đếm.
- SUE theo `kqkdEngine.js` (độ lệch chuẩn 8 quý trước, cần ≥ 6 quý).
- Vũ trụ = `universeAt(ngày công bố)`.

## Mẫu
Mọi sự kiện có ngày thật từ 2020-01-01 (ngoài mẫu). Trước 2020 S8 hầu như không có ngày thật, nên không có phần trong mẫu.

## Nhãn
- Lợi suất vượt cộng dồn phiên 2..20 sau ngày công bố, so với ngành ICB cấp 2.
- Phiên 0 = phiên đầu tiên **≥** ngày công bố. Nếu công bố sau giờ đóng cửa, phiên 0 là phiên kế tiếp. Không có giờ công bố thì dùng quy tắc thận trọng: phiên 0 = phiên kế tiếp sau ngày công bố.

## Thống kê chính
- Mỗi tuần (theo ngày công bố) một nhóm.
- Trong tuần: chênh trung bình nhãn giữa tam phân vị SUE cao và SUE thấp (tam phân vị lấy trong tuần, cần ≥ 9 sự kiện/tuần, không thì gộp với tuần sau).
- p chính = p một phía của trung bình chênh qua các tuần (t Newey–West, độ trễ 2).

## Placebo
600 lần xáo SUE giữa các sự kiện trong cùng tuần.

## ĐẠT (cả bốn)
1. Chênh trung bình ≥ 1,0 điểm %, p ≤ 0,05.
2. p placebo ≤ 0,05.
3. Hai nửa cùng dấu dương.
4. Chênh > 0,45% (chi phí khứ hồi).

## Thiếu mẫu
Dưới 40 tuần đủ điều kiện: CHƯA ĐỦ MẪU.
