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

## Sửa đổi E3-v3 (2026-10-18, trước khi có bất kỳ kết quả tiến nào — sổ E3-v2 có 1 bản ghi, chưa chấm)

**Lý do** (lý thuyết danh mục, không dựa trên kết quả): rà soát mã ngày 18/10 cho thấy ba điểm yếu.

- Trọng số tín hiệu ∝ IC bỏ qua tương quan giữa các tín hiệu (Stealth 5 và Stealth 20 cùng đo dòng tiền ẩn): đếm trùng một chủ đề.
  IC tổng `Σ wᵢ·ICᵢ` cũng bỏ qua tương quan nên α không đúng độ lớn.
- Tỷ trọng ∝ 1/σ20 bỏ qua tương quan giữa các mã: với danh mục 16/10, ba mã chứng khoán chiếm 48% rủi ro trên 35% tỷ trọng.
- Danh mục dựng lại hoàn toàn mỗi phiên: vòng quay và chi phí giao dịch thực tế cao không cần thiết.

**Thay đổi** (mọi điều khác của E3-v2 giữ nguyên):

1. **Trọng số tín hiệu theo tương quan** (Grinold–Kahn): C = ma trận tương quan chéo (Pearson) giữa các điểm z theo hạng của các tín
   hiệu bậc A/B trên các mã có đủ giá trị trong phiên; co rút `C̃ = 0,5·C + 0,5·I`. Trọng số thô `v = C̃⁻¹ · IC_hậu_nghiệm`; bỏ phần
   tử âm (về 0), chuẩn hoá tổng = 1. Không đủ ≥ 30 mã có đủ giá trị → giữ trọng số ∝ IC như E3-v2.
2. **IC tổng đúng của điểm kết hợp**: `IC_comb = Σ wᵢ·ICᵢ / √(wᵀ C̃ w)` (tương quan của tổ hợp tuyến tính các z với lợi suất).
3. **Vùng đệm giữ mã** (Novy-Marx & Velikov 2016): mã thuộc danh mục phiên liền trước được giữ nếu vẫn đủ điều kiện và nằm trong
   20 mã đủ điều kiện có Z cao nhất (gấp đôi quy mô danh mục), vẫn tôn trọng trần 3 mã/ngành; phần còn lại lấp theo Z giảm dần.
4. **Tỷ trọng cân bằng đóng góp rủi ro (ERC)** (Maillard, Roncalli & Teïletche 2010) trên hiệp phương sai Ledoit–Wolf (mục tiêu
   tương quan hằng số) của lợi suất ngày 120 phiên gần nhất mà mọi mã được chọn đều có giá (cần ≥ 60 phiên); sau đó áp trần 20%
   như cũ. Không đủ dữ liệu → tỷ trọng ∝ 1/max(σ20, 1%) như E3-v2.

5. **Căn kỳ hạn của α ngành thế giới (WS-v1)**: tín hiệu được kiểm định cho phiên VN ngay sau phiên Mỹ. Bảng E1 dựng lúc 17:00
   phiên d chỉ có phiên Mỹ d−1 — thông tin đó nhắm phiên VN d, đã diễn ra trước khi danh mục có thể vào lệnh (đóng cửa d+1). Vì vậy
   tiên nghiệm IC của `ws_sector_alpha` trong Điểm Elite = **0** (thay cho 0,02 của bậc A); tín hiệu chỉ có trọng số khi E2 đo được
   IC dương theo đúng cách vào lệnh của danh mục. Bậc bằng chứng của nó trong E2 không đổi.

Sổ E3-v2 (1 bản ghi 16/10, chưa chấm) được lưu trữ nguyên vẹn; sổ E3-v3 bắt đầu lại. Tiêu chí thành công không đổi.

## Sửa đổi E3-v4 (2026-11-05) — Cộng hưởng sóng ngành (RRG), quy tắc do người dùng đặt

**Lý do**: người dùng quyết định đưa điều kiện bắt buộc "Cộng hưởng sóng ngành" vào danh mục chính thức (05/11/2026). Đây là
**quy tắc đặt tay**, không dựa trên bằng chứng: góc phần tư RRG đang ở bậc C trong E2 (L3 không đạt), chưa có lịch sử point-in-time
đủ để kiểm định. Người dùng đã được báo trước hệ quả (sổ tiến chạy lại, mốc 60 phiên lùi lại) và vẫn chọn đưa vào chính thức.

**Thay đổi** (mọi điều khác của E3-v3 giữ nguyên):

1. Góc phần tư RRG của ngành ICB cấp 2 lấy từ **bảng tín hiệu E1 của phiên d** (giá trị `rrg_quadrant` ghi lúc dựng, 17:00: Dẫn
   dắt 2, Cải thiện 1, Suy yếu −1, Tụt hậu −2). Không đọc lại về sau.
2. Mã thuộc ngành **Tụt hậu**: điểm quyết định `Z_qđ = Z − 0,3·|Z|` (trừ 30% độ lớn, luôn là phạt kể cả khi Z âm). Ngành Dẫn dắt,
   Cải thiện, Suy yếu hoặc thiếu dữ liệu: `Z_qđ = Z`. Nhờ vậy mã của ngành Dẫn dắt / Cải thiện được ưu tiên tương đối.
3. Xếp hạng, vùng đệm giữ mã (top 20), chọn 10 mã và trần 3 mã/ngành dùng `Z_qđ`. α kỳ vọng và xác suất vượt vẫn tính từ Z của mô
   hình (quy tắc không có IC); cả hai giá trị được lưu.
4. Sổ theo dõi tiến: sổ E3-v3 (10 bản ghi từ 23/10/2026) được lưu trữ nguyên vẹn; sổ E3-v4 bắt đầu từ phiên dựng đầu tiên sau triển
   khai. Tiêu chí thành công không đổi (≥ 60 phiên tiến, IC h5 t ≥ 2 và lợi suất vượt h10 sau phí có cận dưới KTC 95% > 0). IC của
   sổ tiến đo trên `Z_qđ`.
5. Kiểm định hồi cứu E7 không có lịch sử góc phần tư RRG, nên quy tắc không tác động lên E7 (E7 tiếp tục đo phần mô hình).
