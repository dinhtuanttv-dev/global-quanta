# SP3 — Kiểm định SEPA (Minervini) trên dữ liệu VN — TIÊU CHÍ ĐẶT TRƯỚC
Ghi lúc 2026-10-09 (sau merge #67), TRƯỚC khi chạy. Không sửa sau khi có số liệu (nếu sửa, ghi rõ trong báo cáo).

Engine: backend/src/market/strategies/sepa (sepa/SP2, main 26bdab4), tham số mặc định (rủi ro 15% / 5%), runSepaScreen point-in-time.
Dữ liệu: scratchpad/s1/series2.json (SSI, điều chỉnh cộng dồn), 10/2023–10/2026, khung D; VN-Index trong cùng tệp.
BCTC: kho market_fundamentals (CHỈ ĐỌC), vnQuarterly (hết quý + 45 ngày). Ghi chú: kho giữ ≤ 20 quý gần nhất -> các ngày đầu có ít quý hơn (thiên lệch đều).
Tập mã tại ngày d: có nến ngày d, ≥ 260 nến tới d, GTGD TB20 ≥ 5 tỷ và giá ≥ 5.000đ TẠI d (không thiên lệch sống sót).
RS Rating: phân vị tại d trên mọi mã có ≥ 64 nến tới d. Sức khỏe thị trường tại d: VN-Index + tập mã tại d.
Ngày đánh giá: mọi phiên từ khi tập mã ≥ 30 mã tới phiên cuối − 21. Ngoài mẫu (OOS) từ 2026-03-07.
Lợi suất vượt trội: mở cửa T+1 -> đóng cửa T+20, trừ phí 0,6%, trừ trung bình cùng ngày của tập mã (cùng công thức).
KTC 95%: bootstrap theo cụm ngày (bootstrapCi của Gateway). Sự kiện: một sự kiện / mã / 20 phiên.
Không gọi SSI, không ghi DB.

## S1 (chính) — vào danh sách SẴN SÀNG MUA
Mã chuyển vào "SẴN SÀNG MUA" (phiên trước ở danh sách khác / chưa có). ĐẠT: OOS n ≥ 30, TB > 0, cận dưới KTC > 0.
## S2 — phá vỡ đạt chuẩn
SẴN SÀNG MUA và trạng thái BREAKOUT (KL phá vỡ ≥ 1,4× TB50, chưa quá pivot + 5%), lần đầu. Cùng ngưỡng S1.
## S3 — thứ bậc danh sách (mẫu mỗi phiên cuối tuần, mọi mã của tập)
ĐẠT nếu ở OOS: TB(SẴN SÀNG) ≥ TB(CẢNH BÁO) ≥ TB(THEO DÕI) ≥ TB(LOẠI) VÀ cận dưới KTC của SẴN SÀNG > TB(LOẠI).
## S4 — Trend Template 8/8 (mẫu cuối tuần)
ĐẠT nếu OOS: TB vượt trội của mẫu 8/8 > 0 và cận dưới KTC > 0 (đối chứng: < 8/8).
## S5 (mô tả) — cổng thị trường: S1 tách THUẬN LỢI/TRUNG TÍNH vs THẬN TRỌNG/BẤT LỢI.
## S6 (mô tả) — mô phỏng lệnh S1: simulateVnTrade (vào mở cửa T+1, bỏ phiên khóa trần, T+2,5, phí + thuế), dừng lỗ = kế hoạch,
   mục tiêu 3R, tối đa 60 phiên: PF / tỷ lệ thắng / kỳ vọng R, trong mẫu và OOS.
## S7 (mô tả) — mô hình (VCP vs khác) và điểm cơ bản ≥ 50 trong S1.

Quyết định: S1 hoặc S2 ĐẠT -> nhãn VALIDATED cho tín hiệu đó; không ĐẠT -> SEPA giữ EXPERIMENTAL (chỉ hiển thị), ghi số liệu thật.
Kết quả lưu thành hằng số (sepa/validation.js) và hiển thị trong thẻ bằng chứng của tab SEPA.
