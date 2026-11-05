# CG-r1 — Cổng tiền mặt linh hoạt (Dynamic Cash Gate) cho Elite 10: đăng ký trước

Ghi ngày 2026-11-05, **trước khi** chạy bất kỳ quy tắc nào trên giai đoạn kiểm định. Không sửa sau khi chạy. Đổi quy tắc, tham số
hay tiêu chí = phiên bản mới (CG-r2) kèm lý do, kiểm định trên dữ liệu chưa dùng.

## Bối cảnh và dữ liệu đã nhìn

- Elite 10 (E3-v3) luôn giữ 100% cổ phiếu. Đề xuất của người dùng (05/11/2026): khi VN-Index ở trạng thái DOWNTREND và VIX > 25,
  hạ tỷ lệ cổ phiếu xuống 50% hoặc 30%, phần còn lại giữ tiền mặt. Người dùng chọn 30% làm quy tắc chính (duyệt bản đăng ký này ngày 05/11/2026).
- **Đã nhìn** (khám phá, không dùng để kiểm định): lợi suất VN-Index 01/2022–11/2026 dưới quy tắc này và vài biến thể; phân bố
  VolSlope VIX/VIX3M và quan hệ với VN-Index phiên sau trên 11/2021–11/2026. Trên 2014–2021 chỉ đếm tần suất kích hoạt, không xem
  lợi suất.
- **Không được kiểm định** ở đây vì được chọn sau khi đã thấy kết quả khám phá: quy tắc "chỉ VIX > 25" (trông tốt nhất trên
  2022–2026). Đưa vào sẽ là lọc dữ liệu.

## Giai đoạn kiểm định (holdout)

- **Chuỗi chính:** quỹ ETF E1VFVN30 (VNDirect `/v4/stock_prices`, giá điều chỉnh `adClose`, gồm phân phối), 06/10/2014 → **31/10/2021**.
  Đây là tài sản giao dịch được thật. 60 phiên đầu chỉ để khởi động chỉ báo, không tính.
- **Chuỗi kiểm tra độ bền:** VN-Index (VNDirect `/v4/vnmarket_prices`, giá đóng cửa, chưa gồm cổ tức), 24/08/2017 → 31/10/2021.
- Kết thúc 31/10/2021 để không chồng lên cửa sổ khám phá (VolSlope từ 11/2021, Cash Gate từ 01/2022).
- VIX và VIX3M: Yahoo `^VIX`, `^VIX3M`. Giá trị dùng tại phiên VN ngày d = phiên Mỹ gần nhất **trước** ngày d (không nhìn trước).

## Các quy tắc (4 giả thuyết, cố định)

Trạng thái thị trường tính trên **chính chuỗi được giao dịch**, đúng hàm `classifyRegime` của `research/regime.js`: DOWNTREND khi
giá < MA50, MA20 < MA50 và MA50 dốc xuống so với 10 phiên trước.

| Mã | Quy tắc | Tỷ lệ cổ phiếu khi kích hoạt |
|---|---|---|
| **H1 (chính)** | DOWNTREND ∧ VIX > 25 | 30% |
| H1b | DOWNTREND ∧ VIX > 25 | 50% |
| H2 | Nhắm mục tiêu biến động: σ̂ = EWMA (λ = 0,94) độ lệch chuẩn lợi suất log ngày; σ* = trung vị σ̂ của 504 phiên gần nhất (chỉ dữ liệu ≤ d); w = min(1, max(0,3; σ*/σ̂)); chỉ đổi khi \|w − w hiện tại\| ≥ 0,10 (Moreira & Muir 2017) | liên tục 30–100% |
| H3 | VolSlope = VIX/VIX3M − 1 > −0,05 (phẳng hoặc backwardation) | 50% |

Ngoài lúc kích hoạt: 100%.

## Cách tính

- Tín hiệu dùng dữ liệu tới đóng cửa phiên d; **giao dịch ở giá đóng cửa phiên d+1**; tỷ lệ mới áp cho lợi suất từ d+1 tới d+2.
- Chi phí: 0,20% mỗi chiều × |thay đổi tỷ lệ| (cùng mức 0,40%/vòng của E3).
- Tiền mặt: lãi 4%/năm, cộng theo ngày cho phần (1 − w).
- Mốc so sánh B: luôn 100% cùng chuỗi, không chi phí.

## Tiêu chí đạt (mỗi quy tắc so với B, trên chuỗi chính)

1. **C1 · Sharpe:** ΔSharpe = Sharpe_quy tắc − Sharpe_B > 0. p một phía từ bootstrap khối dừng (stationary bootstrap, khối trung
   bình 20 phiên, 10.000 lần, hạt giống cố định 20261105) trên cặp lợi suất ngày; hiệu chỉnh **Holm** trên 4 quy tắc; p sau
   hiệu chỉnh ≤ 0,05.
2. **C2 · Sụt giảm:** sụt giảm tối đa nông hơn B ít nhất **5 điểm phần trăm**.
3. **C3 · Lợi suất:** lợi suất kép năm không thấp hơn B quá **1 điểm phần trăm**.
4. **C4 · Độ bền:** trên chuỗi VN-Index, ΔSharpe > 0 (chỉ cần cùng dấu).

**ĐẠT** khi đủ cả C1–C4. Báo cáo thêm (mô tả, không là tiêu chí): Calmar, % thời gian giảm tỷ trọng, số lần đổi, các đợt kích
hoạt, kết quả từng năm, độ nhạy khi tiền mặt lãi 0%.

## Diễn giải đã cam kết trước

- **Không quy tắc nào đạt:** công khai; tỷ lệ cổ phiếu của Elite 10 giữ 100%. Thẻ trên Bảng quyết định chỉ hiển thị trạng thái
  cổng ở dạng MÔ TẢ, không có gợi ý tỷ lệ.
- **H1 hoặc H1b đạt:** thẻ "Gợi ý tỷ lệ cổ phiếu · THĂM DÒ" hiển thị gợi ý của quy tắc đạt. Đưa vào danh mục chính thức là một
  phiên bản E3 mới (E3-v4), chỉ khi người dùng quyết định.
- **Chỉ H2 hoặc H3 đạt:** như trên với quy tắc đạt; ghi rõ đó không phải quy tắc người dùng đề xuất.
- Không điều chỉnh tham số để "cứu" kết quả.

## Sổ tiến bóng

Từ phiên 06/11/2026, mỗi phiên ghi trạng thái và tỷ lệ của cả 4 quy tắc (dữ liệu tới đóng cửa d, không sửa về sau), áp vào lợi suất
của rổ Elite 10 và VN-Index. Cổng kích hoạt hiếm, nên sổ tiến chỉ có giá trị sau nhiều năm; nó dùng để theo dõi, không thay kiểm
định này.

## Giới hạn đã biết

- Holdout có ít đợt kích hoạt cho H1/H1b (VIX > 25 trùng DOWNTREND chủ yếu ở 08/2015, 2018, 03/2020). Sức mạnh kiểm định thấp;
  không đạt không có nghĩa là quy tắc vô ích, chỉ là chưa đủ bằng chứng.
- E1VFVN30 theo VN30, không phải VN-Index; những tháng đầu thanh khoản thấp. Trạng thái DOWNTREND tính trên chính quỹ.
- Kiểm định trên chỉ số/quỹ, không trên rổ Elite 10 (rổ chỉ có lịch sử từ 12/2025, nằm trong cửa sổ khám phá).
