# R6 — Kiểm định tín hiệu của chart TA VN-Index — TIÊU CHÍ ĐẶT TRƯỚC (anh duyệt phương án R1–R6 ngày 2026-10-24)
Soạn 2026-10-24, TRƯỚC khi đo bất kỳ lợi suất nào của các tín hiệu dưới đây trên dữ liệu kiểm định. Sau khi commit, tiêu chí
không được sửa; mọi sửa đổi ghi ở mục cuối kèm lý do, ngày và kết quả trước/sau.

**Công khai thiên lệch:** đã biết kết quả MTF v1/v2 trên CÙNG bộ dữ liệu (2026-10-21/24: V1–V5 không đạt; giai đoạn B âm, cờ "Quá đà"
dương OOS) và kết quả backtest CHoCH một mã trong dock (FPT, trong mẫu). Chưa từng đo RSI / MACD / ADX / CVD divergence trên bộ này.
Tham số = MẶC ĐỊNH của chart (RSI 14 Wilder 70/30, MACD 12/26/9, ADX 14 ngưỡng 25, CHoCH quant-core, CVD divergence) — không dò.

## Câu hỏi
Các tín hiệu chart đang vẽ có lợi thế dự báo NGOÀI MẪU, ổn định theo mã và theo khung, sau phí — hay chỉ là mô tả?

## Dữ liệu (giống MTF-v2-prereg.md, không tải lại)
VN100 khung D 2021-10-01 → 2026-10-21, giá điều chỉnh cộng dồn (tải 2026-10-21 bằng scripts/structure-fetch.mjs). Mã đủ điều kiện tại t:
≥ 260 nến, giá ≥ 5.000đ, GTGD TB20 ≥ 5 tỷ. IS ≤ 2024-12-31, OOS ≥ 2025-01-02. Bỏ 21 nến cuối (chưa đủ kỳ hạn).

## Tín hiệu (tính tại ĐÓNG CỬA nến t, chỉ dùng bars[0..t]; đúng mã nguồn chart: technicalOscillators.ts + quant-core)
| Mã | Tín hiệu | Chiều | Kỳ hạn |
|---|---|---|---|
| C1 | RSI 14 cắt LÊN 30 (RSI[t−1] ≤ 30 < RSI[t]) — "hết quá bán" | mua | 10 phiên |
| C2 | RSI 14 cắt XUỐNG 70 (RSI[t−1] ≥ 70 > RSI[t]) — "hết quá mua" | cảnh báo giảm | 10 phiên |
| C3 | MACD 12/26/9 cắt lên Signal (Hist[t−1] ≤ 0 < Hist[t]) | mua | 20 phiên |
| C4 | ADX 14 ≥ 25 và +DI cắt lên −DI tại t | mua | 20 phiên |
| C5 | CHoCH tăng (quant-core, tại nến đóng cửa phá cấu trúc = nến xác nhận) | mua | 10 phiên |
| C6 | CVD divergence tăng (BVC khung ngày — không có tick lịch sử), tại nến XÁC NHẬN đáy thứ hai | mua | 10 phiên |
| W1 | C1 trên nến TUẦN (tín hiệu tại phiên cuối tuần) | mua | 20 phiên |
| W3 | C3 trên nến TUẦN | mua | 20 phiên |
| W4 | C4 trên nến TUẦN | mua | 20 phiên |

Lợi suất: vào giá MỞ CỬA phiên t+1, ra ĐÓNG CỬA phiên t+h; vượt trội = trừ TB cùng ngày của tập mã đủ điều kiện (cùng cách vào/ra).
Tín hiệu mua trừ phí 0,6%; cảnh báo giảm không trừ phí (đo "tránh được giảm"). Chống lặp: 1 sự kiện / mã / loại / 20 phiên.
KTC 95% và p một phía: bootstrap CỤM NGÀY (các mã cùng ngày không độc lập) — giống các kiểm định trước.

## Tiêu chí ĐẠT (mỗi tín hiệu; BH-FDR q = 0,10 trên 9 p OOS)
1. OOS n ≥ 30; 2. TB OOS cùng chiều (mua > 0, cảnh báo < 0) và KTC không chứa 0; 3. TB IS cùng chiều; 4. q ≤ 0,10;
5. Placebo (cùng mã, phiên ngẫu nhiên đủ điều kiện trong cùng tháng, 200 lần): p ≤ 0,10;
6. Ổn định theo mã: trong các mã có ≥ 2 sự kiện OOS, ≥ 50% có TB cùng chiều.
Thiếu mẫu (OOS n < 30) -> "THIẾU MẪU" (không phải đạt).

## Mô tả (không đổi nhãn)
- Theo năm (2022…2026): TB vượt trội từng năm. - D vs W: C1/W1, C3/W3, C4/W4 cùng chiều hay không.
- Kỳ hạn phụ 5 / 20 / 40 phiên. - Tỷ lệ thắng thô (không phải xác suất dự báo).

## Quyết định
- ĐẠT -> tín hiệu đó gắn "ĐÃ KIỂM ĐỊNH (OOS 2025–2026, VN100)" kèm số liệu ở tab Backtest. KHÔNG ĐẠT / THIẾU MẪU -> "THỰC NGHIỆM —
  chỉ mô tả", hiển thị số liệu để người dùng tự đánh giá; chart không dùng chữ MUA / BÁN cho tín hiệu đó.
- Backtest một mã trong dock giữ nguyên nhưng ghi rõ "1 mã · trong mẫu · không phải kiểm định".
- Kết quả sinh tự động vào src/lib/ta-command-center/validation/chartSignalsReport.json (không sửa tay số liệu).

## Sửa đổi
(chưa có)
