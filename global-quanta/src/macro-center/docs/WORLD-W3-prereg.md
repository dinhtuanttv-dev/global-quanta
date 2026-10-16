# W3 — Đăng ký trước: cổng xác nhận Kết nối thế giới (12 cặp giả thuyết kinh tế)

Ngày đăng ký: 2026-10-16, commit này được đẩy TRƯỚC khi nối nguồn TARIFF (FRED EPUTRADE) và PMI_US
(Philly Fed, proxy) và trước khi chạy bài kiểm định xác nhận dưới đây.

**Công khai trung thực:** ma trận thăm dò (13 yếu tố × 10 ngành, chọn trễ tốt nhất 0–6) đã được xem trước. Ngày 16/10, sau W2,
nó cho 0 liên kết bậc A và 2 liên kết bậc B: STEEL→S_SEC và STEEL→S_RE. Trước W2 là 1 bậc B: VIX→S_OIL. Không cặp nào trong số
này được đưa vào tập dưới đây vì kết quả đó. Tập cặp chỉ dựa trên cơ chế kinh tế có trước.

## Tập giả thuyết (cố định, 12 cặp — họ kiểm định bội = 12)

| # | Yếu tố (biến đổi dừng của engine) | Ngành | Chiều kỳ vọng | Cơ chế |
|---|---|---|---|---|
| 1 | OIL (Brent) | S_OIL | + | doanh thu / giá bán dầu khí |
| 2 | STEEL (HRC) | S_STEEL | + | giá bán thép |
| 3 | FED (lãi suất Fed) | S_RE | − | chi phí vốn, dòng vốn |
| 4 | FED | S_BANK | − | dòng vốn ngoại, áp lực tỷ giá / lãi suất VN |
| 5 | DXY | S_SEC | − | USD mạnh → khối ngoại rút, thanh khoản giảm |
| 6 | VIX | S_SEC | − | ngại rủi ro toàn cầu → thanh khoản / môi giới |
| 7 | SEMI (^SOX) | S_TECH | + | chu kỳ công nghệ / bán dẫn |
| 8 | CNY (USD/CNY) | S_STEEL | − | CNY yếu → thép Trung Quốc rẻ hơn, cạnh tranh nhập khẩu |
| 9 | TARIFF (EPU thương mại) | S_TEXTILE | − | rủi ro thuế quan với hàng xuất khẩu |
| 10 | TARIFF | S_SEAFOOD | − | như trên |
| 11 | PMI_US (proxy Philly Fed) | S_TEXTILE | + | cầu nhập khẩu Mỹ |
| 12 | PMI_US (proxy Philly Fed) | S_PORT | + | sản lượng hàng hoá / logistics |

## Phương pháp (cố định)

- Dữ liệu: cùng chuỗi tháng thật của engine (`prepareStationary`, trễ công bố theo catalog), tháng đã đóng đến `asOf`.
- Mô hình mỗi cặp: y_t = a + β·x_{t−1} + Σ φ_i y_{t−i} + e. **Trễ cố định = 1 tháng** (không chọn trễ). Bậc AR 0–2 chọn theo BIC.
  Sai số HAC (mặc định của engine).
- p một phía theo chiều kỳ vọng. Hiệu chỉnh BY trên đúng 12 cặp. Cặp thiếu dữ liệu (< 60 tháng) tính p = 1 và vẫn nằm trong họ.
- Ổn định: beta cuộn cửa sổ 48 tháng (`summarizeStability` của engine): cùng dấu ≥ 80% và có ý nghĩa ≥ 30% số cửa sổ.
- Ngoài mẫu: `backtestMacroScore` trễ 1, B = 499, seed 3, minTrain 60. ĐẠT khi IC ≥ 0,05, p ≤ 0,10, thắng mô hình ngây thơ
  và tỷ lệ đúng hướng > 50%.
- **Bậc xác nhận A** = q < 0,05 ∧ dấu β đúng chiều kỳ vọng ∧ ổn định ∧ ngoài mẫu ĐẠT. Mọi trường hợp khác = "chưa xác nhận".

## Hệ quả

- Chỉ cặp đạt bậc xác nhận A mới được đưa vào tín hiệu ngành (`/api/world/sector-signals` → Lọc ngành), thay cho bậc A của ma trận
  thăm dò. Ma trận thăm dò vẫn hiển thị, ghi rõ là "thăm dò".
- Không có cặp nào đạt → không ngành nào có trọng số. Đó là kết quả hợp lệ.
- Tập cặp và phương pháp không được sửa sau khi xem kết quả. Thay đổi nào cũng phải là một bản đăng ký mới (W3-v2), và kết quả
  của bản này vẫn phải giữ nguyên.
- Theo dõi tiến (forward): mỗi tháng đóng mới sau 2026-10 được ghi lại. Đây là kiểm tra ngoài mẫu thật sự duy nhất.
