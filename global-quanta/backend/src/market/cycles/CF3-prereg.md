# Cycle Fingerprint v2 — kiểm định đặt trước CF3

Người dùng duyệt ngày 2026-10-10, trước khi chạy. Mã nguồn: `validate.js` (`CF3_PREREG`), `engine.js`, `library.js`, `core.js`. Lệnh chạy: `scripts/cycles-validate.mjs`.

## Dữ liệu
- Chuỗi giá **ADJUSTED_CUMULATIVE** của Gateway (`/api/market/ta-series`), lấy cho universe scanner (280 mã) cộng VN-Index, giai đoạn 10/2021 → nay. Chỉ đọc.
- Mã nào chỉ có chuỗi `SSI_LATEST_EVENT_ADJUSTED` thì **loại khỏi** kiểm định (quy tắc dữ liệu, chốt trước khi chạy).
- Ngành: ICB cấp 2 của VNDirect, lấy từ `/api/market/sectors/taxonomy`.
- Thanh khoản tính theo thời điểm: GTGD TB60 ≥ 5 tỷ đồng, tại điểm cuối cửa sổ của từng phần tử thư viện và tại ngày truy vấn.

## Engine (chốt trước, trừ λ và hMult)
- **Cửa sổ và lọc thô:** W = 30 phiên, log-giá chuẩn hóa z. Lọc thô bằng PAA 10 đoạn, giữ 400 ứng viên cộng 100 ứng viên cùng ngành.
- **Khoảng cách:** DTW dải Sakoe-Chiba ±10% kết hợp khoảng cách bối cảnh:
  - đặc trưng: σ20/σ250, khoảng cách tới đỉnh 52 tuần, GTGD 20/250, VN-Index/MA200, lợi suất 60 phiên so trung vị ngành;
  - σ bối cảnh hiệu chỉnh trong mẫu;
  - d = √(d_shape² + λ·d_ctx²), mã cùng ngành nhân (1 − 0,1).
- **Thư viện theo thời điểm:** một cửa sổ chỉ được dùng khi phiên e+1+60 của nó **trước** ngày dự báo.
- **Láng giềng:** K = 30, cùng mã cách nhau ≥ 60 phiên, tối đa 3 láng giềng mỗi tháng lịch.
- **Trọng số:** w = exp(−½(d/h)²), với h = hMult × phân vị 5% của d giữa các cặp ngẫu nhiên trong mẫu.
- **Số mẫu hiệu dụng:** n_eff = min(Kish, Kish theo cụm tháng).
- **Dự báo:** μ0 + n_eff/(n_eff+10)·(TB có trọng số − μ0), với μ0 là trung bình của tiền tố thư viện. P(vượt VN-Index) co tương tự về p0.
- **Kết quả đo:** lợi suất log **vượt VN-Index** từ đóng cửa phiên t+1 tới t+1+h, h chính = 20.
- **Khoảng dự báo conformal 80%:** phần dư trong mẫu, phân vị 10%/90%, Mondrian theo 3 nhóm biến động (tam phân σ20/σ250).

## Thiết kế
- **Ngày truy vấn:** mỗi 5 phiên, bắt đầu khi thư viện có ≥ 3.000 cửa sổ.
- **Chia mẫu:** 70% số ngày đầu là trong mẫu (IS), trong đó bỏ 12 ngày cuối làm khoảng đệm 60 phiên; 30% số ngày cuối là ngoài mẫu (OOS).
- **Hiệu chỉnh trong mẫu:**
  - chọn {λ ∈ {0; 0,25; 1}} × {hMult ∈ {0,5; 1; 2}} theo IC trung bình trong mẫu; nếu hòa thì chọn λ nhỏ hơn, rồi hMult gần 1 hơn;
  - tính phần dư conformal và p0;
  - chốt toàn bộ cấu hình kèm **SHA-256**.
- **Ngoài mẫu:** chạy **một lần**. Script từ chối chạy lại khi đã có báo cáo, và từ chối hiệu chỉnh lại khi đã có OOS.
- **Thống kê:** IC = Spearman cắt ngang theo ngày, cần ≥ 20 mã mỗi ngày. KTC 95% bằng bootstrap khối liên tiếp, mỗi khối 4 ngày truy vấn (≈ 20 phiên, khớp với độ chồng lấn của kỳ hạn), 2.000 vòng.

## ĐẠT khi thỏa cả 6 điều kiện (ngoài mẫu, h = 20, vượt VN-Index)
1. IC TB > 0 và cận dưới KTC > 0.
2. IC engine − IC placebo B1 > 0 và cận dưới KTC > 0. B1 = 30 phần tử ngẫu nhiên của tiền tố, cùng ràng buộc, mang bộ trọng số của engine đã hoán vị.
3. IC trong mẫu > 0.
4. Brier skill của P(vượt VN-Index) so với p0 trong mẫu > 0.
5. Chênh lệch TB giữa nhóm 20% dự báo cao nhất và 20% thấp nhất, trừ phí 0,3%, > 0.
6. Ngoài mẫu có ≥ 40 ngày và ≥ 100 mã.

Khoảng conformal chỉ được hiển thị là "khoảng dự báo" khi độ phủ ngoài mẫu nằm trong [75%, 85%].

## Mô tả thêm (Holm, không đổi kết luận)
- Kỳ hạn 10/40/60 phiên; cửa sổ 20/60 phiên.
- Thư viện chỉ cùng ngành.
- Theo trạng thái VN-Index trên/dưới MA200.
- IC từng phần sau khi trừ momentum 20/60 và đảo chiều 5 phiên.
- IC của các placebo B2: momentum 20/60, đảo chiều 5 phiên.

**Không đạt:** giữ nhãn EXPERIMENTAL, chỉ để quan sát. Xác suất và khoảng hiển thị là mô tả lịch sử.

**Hạn chế:** thiên lệch sống sót, vì universe là danh sách hiện tại.

## Kết quả (chạy 2026-10-10)
- **Thời điểm chốt:** mã nguồn và quy tắc commit b3081e7 trước khi chạy. Cấu hình chốt sau pha trong mẫu là commit c67fe62, SHA-256 `d31502966402…`; λ = 0 (chỉ hình dạng), hMult = 2.
- **Trong mẫu** (2023-03-07 → 2025-05-22, 111 ngày, 219 mã): IC +0,025 [+0,004; +0,047].
- **Ngoài mẫu** (2025-08-21 → 2026-09-10, 53 ngày, 220 mã, 9.891 dự báo, chạy một lần): **KHÔNG ĐẠT → EXPERIMENTAL**.
  - IC +0,0004 [−0,023; +0,028] → không đạt.
  - IC − placebo −0,014 [−0,044; +0,016] → không đạt.
  - IC trong mẫu > 0 → đạt.
  - Brier skill +0,006 → đạt.
  - Chênh lệch 20% cao − thấp sau phí −0,38% → không đạt.
  - Cỡ mẫu → đạt.
  - Độ phủ khoảng 80% là 73%, ngoài dải [75%, 85%] → không hiển thị là khoảng dự báo.
- **Mô tả thêm (Holm):** không giả thuyết nào bị bác bỏ.
- **Đính chính báo cáo:** dòng "VN-Index dưới MA200" chỉ có 4 ngày, khiến bootstrap suy biến (p = 0 giả). Dòng này được đánh dấu thiếu mẫu, không chạy lại OOS, 6 điều kiện chính không đổi.
- Báo cáo đầy đủ: `cf3-is-report.json`, `cf3-oos-report.json`; tóm tắt cho API ở `validation.js`.
