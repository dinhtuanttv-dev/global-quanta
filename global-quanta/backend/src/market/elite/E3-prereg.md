# E3 — Engine quyết định và danh mục Elite 10: đăng ký trước

Ghi ngày 2026-10-17, **trước khi** viết mã và trước khi xem bất kỳ điểm số, danh mục hay kết quả nào. Không sửa sau khi chạy. Đổi
công thức hay tiêu chí = phiên bản mới (E3-v2) kèm lý do; sổ theo dõi của phiên bản cũ được giữ nguyên và công khai.

## Điểm Elite (mỗi phiên d, sau khi có bảng tín hiệu E1 và bằng chứng E2)

1. **Tín hiệu được dùng**: chỉ tín hiệu bậc **A hoặc B** trong `/api/elite/evidence` tại thời điểm dựng. Bậc C không có trọng số.
2. **Chuẩn hoá chéo**: với mỗi tín hiệu, điểm chuẩn theo hạng `z = Φ⁻¹((hạng − 0,5) / n)` trên các mã có giá trị (hạng trung bình
   cho giá trị trùng). Mã thiếu giá trị nhận z = 0 (trung tính).
3. **IC hậu nghiệm** của tín hiệu i: `IC_i = (n_i · IC_đo_i + 60 · IC_tiên_nghiệm_i) / (n_i + 60)`, trong đó IC_đo và n_i là IC
   trung bình và số ngày ở **kỳ hạn chính** của E2 (h = 1 cho α ngành WS-v1, h = 5 cho tín hiệu theo mã). Tiên nghiệm: 0,02 cho
   bậc A, 0,01 cho bậc B.
4. **Trọng số** `w_i = max(0, IC_i) / Σ max(0, IC_j)`. Điểm tổng `S = Σ w_i · z_i`, chuẩn hoá lại chéo thành `Z` (trung bình 0, độ
   lệch chuẩn 1).
5. **IC của điểm tổng** (bảo thủ): `IC_comb = Σ w_i · IC_i`.
6. **Lợi suất vượt kỳ vọng 5 phiên** (Grinold–Kahn): `α = IC_comb · σ5 · Z`, với σ5 là trung vị (theo ngày, 60 phiên gần nhất) của
   độ lệch chuẩn chéo lợi suất 5 phiên trên vũ trụ đủ điều kiện. **Xác suất vượt trung vị vũ trụ** ≈ `Φ(IC_comb · Z / √(1 − IC_comb²))`.

## Điều kiện đủ (vũ trụ danh mục)

- Có trong bảng tín hiệu E1 phiên d, có ≥ 60 phiên `close_adj`.
- Giá trị giao dịch trung bình 20 phiên ≥ 10 tỷ đồng; giá đóng cửa điều chỉnh ≥ 5.000 đồng. Không gồm chỉ số.

## Danh mục Elite 10

- Xếp các mã đủ điều kiện theo Z giảm dần; chọn lần lượt, **tối đa 3 mã cho mỗi ngành ICB cấp 2** (thiếu ICB thì theo ngành Siêu
  quét), tới khi đủ 10 mã.
- **Tỷ trọng** tỷ lệ nghịch với độ lệch chuẩn lợi suất ngày 20 phiên (σ20), trần 20% mỗi mã, chuẩn hoá về 100%.
- **Quy tắc rủi ro** (mô tả, chưa tối ưu): cắt lỗ = giá × (1 − 2·σ20·√5), mục tiêu = giá × (1 + 3·σ20·√5), kỳ nắm giữ 10 phiên.
- Danh mục được **khoá** tại lúc dựng (sau 17:00 phiên d) và ghi vào sổ theo dõi tiến; không sửa về sau.

## Sổ theo dõi tiến

- Vào lệnh giá đóng cửa d+1, ra giá đóng cửa d+1+h, h ∈ {5, 10}.
- Chi phí giả định mỗi vòng: 0,15% mua + 0,15% bán + 0,1% thuế bán = **0,40%**.
- So sánh: (a) rổ đều tỷ trọng của toàn bộ vũ trụ đủ điều kiện, cùng chi phí; (b) VN-Index (mô tả, không chi phí).
- Đồng thời ghi IC hạng của Z với lợi suất 5 phiên trên vũ trụ đủ điều kiện, cùng định nghĩa E2.

## Tiêu chí thành công (đánh giá ở E7, khi có ≥ 60 phiên tiến)

1. IC hạng trung bình của Z ở h = 5 > 0 với t Newey–West (độ trễ 5) ≥ 2.
2. Lợi suất vượt của Elite 10 so với rổ đều vũ trụ, sau chi phí, ở h = 10: trung bình > 0 và cận dưới KTC 95% (bootstrap khối theo
   ngày, khối 10 phiên) > 0.
3. So với VN-Index: chỉ báo cáo mô tả.

Chưa đạt cả 1 và 2 thì Điểm Elite và danh mục giữ nhãn **THĂM DÒ**, không trình bày như khuyến nghị.

## Giới hạn

- Hầu hết tín hiệu bậc A/B mới có dữ liệu tiến từ 16/10/2026; trọng số ban đầu dựa chủ yếu vào tiên nghiệm và Stealth 20.
- Không mô hình hoá trượt giá, trần/sàn, thanh khoản trong phiên.
- Không có tín hiệu định thời thị trường đạt kiểm định: danh mục luôn đầy đủ 100%, không đề xuất tỷ lệ tiền mặt.

## Sửa đổi E3-v2 (2026-10-17, trước khi có bất kỳ kết quả tiến nào)

**Lý do**: lần dựng đầu tiên (phiên 16/10/2026) cho thấy một trường hợp suy biến chưa lường trước. NAF đứng giá 47.900–48.000
suốt 25 phiên (giá bị neo, dấu hiệu chào mua công khai / sáp nhập), σ20 = 0,09%/ngày. Quy tắc tỷ trọng ∝ 1/σ20 vì vậy dồn trần
20% vào một mã gần như không thể tăng giá. Đây là lỗi của quy tắc, không phải của dữ liệu. Sửa trước khi sổ theo dõi có kết quả:
bản ghi duy nhất của E3-v1 (16/10, chưa chấm) được lưu trữ riêng, không xoá; sổ E3-v2 bắt đầu lại.

**Thay đổi** (mọi điều khác giữ nguyên):

1. Thêm điều kiện đủ: σ20 ≥ 0,5%/ngày (loại mã có giá bị neo).
2. Tỷ trọng ∝ 1 / max(σ20, 1%) thay cho 1/σ20, rồi áp trần 20% như cũ.
3. Dải cắt lỗ / mục tiêu dùng cùng max(σ20, 1%).
