# T2/T3 — Kiểm định Cấu trúc thị trường đa khung — TIÊU CHÍ ĐẶT TRƯỚC (ĐÃ DUYỆT 2026-10-21)
Soạn 2026-10-21, TRƯỚC khi tải dữ liệu kiểm định và trước khi xem bất kỳ lợi suất / số sự kiện nào.
Sau khi commit, các tiêu chí dưới đây không được sửa. Nếu phải sửa, mục "Sửa đổi" ở cuối ghi rõ lý do và ngày, kèm kết quả trước/sau.

Engine: src/lib/quant-core/mtf (MTF_STRUCTURE_VERSION 1.0.0, commit 32e285d) qua gói Gateway backend/src/market/vendor/quantCore.mjs,
dùng tham số mặc định TF_PARAMS. Mọi giá trị tại phiên t được tính trên bars[0..t] (bất biến không nhìn trước có test).

## Dữ liệu (SSI là nguồn chính, không ghi DB, không dùng Supabase/Neon)
- Khung D: danh mục VN100 (SSI IndexComponents ngày tải) + VNINDEX. 2021-10-01 → 2026-10-21.
  Giá điều chỉnh cộng dồn theo đúng cách của /ta-series: SSI DailyOhlc → giá danh nghĩa (SSI DailyStockPrice) → sự kiện quyền
  (Project A /api/cotuc/events) → sửa khoảng cách > 20% chưa giải thích. Ghi priceBasis của từng mã.
- Khung H1: VN30 (tập con), nến phút SSI IntradayOhlc 2023-01-03 → 2026-10-21, gộp 9h/10h/11h/13h/14h (minutesToH1).
  Hệ số điều chỉnh từng phiên = đóng cửa ngày điều chỉnh / đóng cửa danh nghĩa (nếu nến phút là giá danh nghĩa, lệch ≤ 1%),
  ngược lại = đóng cửa ngày điều chỉnh / giá khớp phút cuối.
- Khung W: gộp từ D (toWeekly).
- Thiên lệch sống sót: danh mục lấy theo thành phần HIỆN TẠI — ghi rõ trong báo cáo, không hiệu chỉnh.

## Tập mã, mốc thời gian, lợi suất
- Mã đủ điều kiện tại phiên d: có nến d, ≥ 260 nến ngày tới d, giá ≥ 5.000đ, GTGD TB20 ≥ 5 tỷ (giống P3).
- Trong mẫu (IS): tới 2024-12-31. Ngoài mẫu (OOS): 2025-01-02 → phiên cuối − 21. Khung H1: IS 2023-03-01 → 2024-12-31.
- Lợi suất vượt trội h phiên: mở cửa T+1 → đóng cửa T+h, trừ TB cùng ngày của tập mã đủ điều kiện (cùng công thức).
  Tín hiệu mua trừ thêm phí 0,6% (phí + thuế khứ hồi, như P3). Thanh toán T+2,5: h ≥ 3.
- KTC 95%: bootstrapCi của Gateway (theo cụm ngày, 1000 lần, seed 7). p một phía = tỷ lệ bootstrap trái dấu kỳ vọng.
- Chống lặp: tối đa 1 sự kiện / mã / loại / 20 phiên (H2: / 5 phiên).

## Giả thuyết chính (5) — BH-FDR q = 0,10 trên 5 p-value OOS
H1 — Vào giai đoạn tăng (D): phiên giai đoạn ngày chuyển sang UP. h = 20.
  ĐẠT: OOS n ≥ 30, TB > 0, cận dưới KTC > 0, TB IS > 0, và qua BH-FDR.
H2 — Đồng thuận đa khung (H1 trong D): nến H1 có verdict = "MUA" (ngày đã đóng = UP, H1 = UP, tín hiệu mua Granville ≤ 5 nến).
  Vào giá mở cửa nến H1 kế tiếp, ra đóng cửa ngày thứ 10 sau phiên tín hiệu; chuẩn = TB tập VN30 đủ điều kiện (đóng cửa d → d+10).
  Đối chứng: tín hiệu mua H1 (M1/M2/M3/G3) khi giai đoạn ngày đã đóng KHÔNG thuộc {UP, A} ("ngược khung").
  ĐẠT: OOS n ≥ 30, TB thuận khung > 0 với cận dưới KTC > 0, VÀ chênh lệch (thuận − ngược) > 0 với cận dưới KTC > 0, TB IS > 0.
H3 — Bảng kiểm xếp hạng được (D): mọi mã-ngày đủ điều kiện, điểm buyScore 0–8 (mục khung lớn = giai đoạn tuần đã đóng).
  IC Spearman theo ngày giữa điểm và lợi suất vượt trội 20 phiên, lấy TB các ngày; KTC bootstrap khối 20 ngày.
  ĐẠT: OOS IC TB > 0, cận dưới KTC > 0, IC IS > 0.
H4 — Mẫu đáy đã phá cổ (W / IHS, D): mô phỏng simulateVnTrade, dừng lỗ = cực trị mẫu, mục tiêu = target, tối đa 60 phiên.
  ĐẠT: OOS n ≥ 30, PF ≥ 1,2, kỳ vọng R > 0 với cận dưới KTC > 0, PF IS > 1.
H5 — Cảnh báo giảm (D): phiên giai đoạn ngày chuyển sang D hoặc DOWN từ {UP, B, C}. h = 20, không trừ phí.
  ĐẠT: OOS n ≥ 30, TB < 0, cận trên KTC < 0, TB IS < 0. (VN không bán khống: chỉ dùng để tránh / giảm vị thế.)

## Mô tả (không đổi nhãn)
- Placebo: cùng mã, ngày ngẫu nhiên trong cùng tháng, 200 lần → p thực nghiệm cho H1/H2/H4/H5.
- Bỏ từng thành phần (ablation) cho H2: bỏ điều kiện tín hiệu mua; bỏ điều kiện H1 = UP; thay giai đoạn ngày bằng VNINDEX > MA20.
- Lọc thị trường: H1/H2/H4 tách theo VNINDEX trên/dưới MA20 tại phiên tín hiệu.
- Kỳ hạn phụ 5 / 10 / 40 phiên. Theo nửa năm. Từng giai đoạn: lợi suất TB 20 phiên kế tiếp theo giai đoạn ngày.

## Mô hình xác suất (meta-labeling) — "M"
Sự kiện gốc: hợp của H1, H4 và G3 khung D. Nhãn: lệnh simulateVnTrade dừng lỗ = đóng cửa − 2·ATR, mục tiêu = đóng cửa + 3·ATR,
tối đa 20 phiên; thắng = 1. Đặc trưng (tại t): giai đoạn ngày/tuần (one-hot), tuổi giai đoạn (log), dev, slope, spread, Dow ngày/tuần,
7 mục bảng kiểm, bbwPct, số lần co hẹp, khoảng cách tới hỗ trợ/kháng cự gần nhất (ATR), VNINDEX trên MA20, giai đoạn VNINDEX.
Mô hình: hồi quy logistic L2 (JS thuần). Chọn λ bằng purged k-fold theo thời gian (5 fold, purge 20 phiên, embargo 10) trên IS;
hiệu chỉnh isotonic trên fold IS cuối. ĐẠT (được hiển thị "xác suất đã hiệu chỉnh"): OOS Brier skill > 0 so với tỷ lệ nền IS,
AUC OOS > 0,55 với cận dưới KTC > 0,5, ECE ≤ 0,05. Không ĐẠT → không hiển thị xác suất, chỉ hiển thị tỷ lệ nền lịch sử có ghi chú.

## Nón dự báo (CQR) — "Q"
Mục tiêu: log(đóng cửa T+h / đóng cửa T), h ∈ {5, 10, 20}, khung D, mọi mã-ngày đủ điều kiện (lấy mẫu mỗi 5 phiên).
Hồi quy phân vị tuyến tính (pinball, q = 0,1 / 0,5 / 0,9) trên đặc trưng của M; IS chia 75% huấn luyện / 25% hiệu chỉnh
(theo thời gian), hiệu chỉnh conformal CQR (Romano 2019) cho khoảng 80%.
ĐẠT: OOS độ phủ của [P10, P90] trong [77%, 83%] với mọi h, VÀ độ rộng TB nhỏ hơn ≥ 5% so với nón đối chứng
(phân vị thực nghiệm vô điều kiện theo mã, cùng hiệu chỉnh conformal). Không ĐẠT mức độ rộng → hiển thị nón đối chứng,
ghi "phân phối lịch sử, chưa có lợi thế dự báo". Không ĐẠT độ phủ → không hiển thị nón.
Khi chạy thật (T6): cập nhật hiệu chỉnh trực tuyến Adaptive Conformal Inference (Gibbs & Candès 2021), γ = 0,005, sổ dự báo ghi lại.

## T3 — Xác suất giai đoạn (HSMM xấp xỉ)
Mô hình: HMM Gauss 4 trạng thái ẩn trên (lợi suất, dev, slope, spread) + phân phối thời lượng giai đoạn thực nghiệm (IS)
→ P(chuyển sang giai đoạn tăng / giảm trong 10 phiên tới) và tuổi giai đoạn so với thời lượng điển hình. Nói rõ là xấp xỉ
(HMM + thời lượng thực nghiệm, không phải HSMM đầy đủ).
ĐẠT (hiển thị xác suất): OOS Brier skill > 0 so với tần suất chuyển giai đoạn IS theo giai đoạn hiện tại, ECE ≤ 0,05.
Không ĐẠT → chỉ hiển thị tuổi giai đoạn + thời lượng điển hình (mô tả), không hiển thị xác suất.

## Quyết định
- Thành phần ĐẠT → nhãn "ĐÃ KIỂM ĐỊNH" kèm số liệu OOS; không ĐẠT → "THỰC NGHIỆM — chỉ hiển thị", không dùng để xếp hạng.
- Kết quả lưu thành hằng số backend/src/market/structure/validation.js, hiển thị trong thẻ bằng chứng của T5.
- T7: tín hiệu cấu trúc được đăng ký vào signalRegistry của Elite 10 bất kể kết quả; trọng số do evidence engine tự đo (IC).

## Sửa đổi
- 2026-10-21 (trước khi chạy, không đổi tiêu chí): HPG, SHB, SSI không tải được nến phút sau 3 lượt (SSI hết thời gian chờ) ->
  vẫn có đủ nến ngày, nhưng bị loại khỏi H2 (26/30 mã VN30 có khung 1 giờ; TCX/VPL niêm yết muộn chỉ có phần dữ liệu tương ứng).
- 2026-10-21 (trước khi chạy): một số phiên nến phút SSI đã được điều chỉnh sẵn (~0,95%, VD MWG/SAB 2023) -> quy tắc "danh nghĩa"
  siết từ ±1% xuống ±0,1%; 225 phiên của các tệp đã tải được neo lại để giá đóng cửa tiết cuối = đóng cửa ngày điều chỉnh.
- Mã cần ≥ 300 nến ngày để vào quy trình (97/100 mã), chặt hơn mức 260 của điều kiện tập mã.

## Kết quả (2026-10-21, chạy một lần, xem validation.js)
H1–H5 đều KHÔNG ĐẠT (q ≥ 0,8). H1 vào giai đoạn Tăng: OOS −1,56%/20 phiên, KTC [−2,61; −0,43]. H2 MUA đa khung −0,68%/10 phiên,
chênh lệch so với ngược khung +0,39 (KTC [−1,11; 2,12]). H3 IC OOS −0,032. H4 PF OOS 0,76 (IS 1,69). H5 −0,51% (KTC chứa 0).
M (meta-labeling) KHÔNG ĐẠT: AUC OOS 0,49. Q (nón CQR) KHÔNG ĐẠT ở cả 3 kỳ hạn (độ phủ 70/78/80%, rộng hơn đối chứng 44–59%;
đối chứng phủ 67–71%) -> không hiển thị nón. T3 (HMM + thời lượng) ĐẠT: Brier skill +0,046 (sang Tăng) / +0,007 (sang Giảm),
ECE 0,010 / 0,027 -> hiển thị xác suất chuyển giai đoạn, ghi rõ lợi thế nhỏ.
