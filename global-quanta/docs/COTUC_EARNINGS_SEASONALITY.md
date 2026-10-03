# Cổ tức — Mùa vụ KQKD (Timing Engine v3, giai đoạn 3)

Giao diện cho lớp "mùa vụ kết quả kinh doanh" của gói `cotuc-timing-engine`. Mọi phép tính nằm ở Project A
(`quant-macro-scanner`, `/api/cotuc/*`); global-quanta chỉ đọc, kiểm tra bằng zod và hiển thị.

## Nguồn dữ liệu
- Giá: SSI FastConnect (giá danh nghĩa qua gateway `/ohlcv/nominal-history`) × hệ số sự kiện quyền (VNDirect finfo) ⇒ chuỗi tổng lợi nhuận.
- Ngày công bố KQKD + LNST/doanh thu: VNDirect finfo `/v4/financial_statements` (`createdDate` trong 1–120 ngày sau quý).
- Ngày 0 = phiên giao dịch đầu tiên vào/sau ngày công bố.

## Điểm hiển thị (mặc định bật, không cờ)
| Vị trí | Thành phần |
|---|---|
| StockModal → tab **📊 Mùa vụ KQKD** | `seasonality/EarningsSeasonalityTab` |
| Cổ tức → **🧭 Thời Điểm Tối Ưu (v3)** | `EarningsSeasonalityTab` (timeline 12 tháng ‖ CAR quý) + `SeasonalOpportunitiesCard` |
| Lịch v3 → **Sắp KQKD** | `useEarningsSignalsBulk()` → `/api/cotuc/earnings-signals` |

## Endpoint đọc
- `GET /api/cotuc/earnings-cycle-stats?ticker&quarter`
- `GET /api/cotuc/earnings-cycle-paths?ticker&quarter`
- `GET /api/cotuc/annual-earnings-calendar?ticker`
- `GET /api/cotuc/earnings-signals` (bulk)
- `GET /api/cotuc/seasonal-opportunities` (Project A PR #3)

## Quy tắc thống kê
- Cửa sổ E1–E4, gating mặc định của gói (`minEvents = 8`, q-value BH, LCB > 0). Chưa đạt ⇒ hiển thị "THEO DÕI · n/8" hoặc "CHƯA ĐỦ MẪU", **không** ra khuyến nghị.
- P(phản ứng dương) là Beta-Binomial co về prior theo ngành × quý × cửa sổ.
- Decision/log-odds, calibration, learnSignalWeights: **chưa bật** (PR 3 chỉ bật DecisionBar 3 trạng thái, learnSignalWeights vẫn OFF).

## Giao diện
Chuẩn Siêu Quét AI: card `rgba(13,17,26,0.75)` + viền `rgba(255,255,255,0.06)`, tiêu đề `text-cyan-400`, số `font-mono tabular-nums`,
màu quý Q1 cyan · Q2 emerald · Q3 amber · Q4 violet. Bọc `.tw-scope` để tránh reset margin/padding toàn cục. Bố cục dùng container query (`@5xl:`).

## Kiểm thử
`npx vitest run` — gồm test hợp đồng với dữ liệu thật FPT (`src/lib/cotuc/__fixtures__/fpt-seasonality.prod.json`).

# Bộ máy quyết định 3 trạng thái + theo dõi tín hiệu (giai đoạn 4)

Server (Project A, cron `timing-signals-scan`) tính MỘT ảnh chụp quyết định cho từng mã từ giá SSI + sự kiện VNDirect +
mùa vụ KQKD và ghi vào sổ theo dõi; trình duyệt chỉ hiển thị đúng ảnh chụp đó (thứ người dùng thấy = thứ được chấm điểm).

| Vị trí | Thành phần | Endpoint |
|---|---|---|
| StockModal → tab Optimal Timing (đầu tab) | `decision/DecisionBar` (`DecisionBarCard`) | `GET /api/cotuc/decision-states` (cả danh mục, SWR dùng chung) |
| Cổ tức → 🧭 Thời Điểm Tối Ưu (v3), trên OptimalTimingTab | `DecisionBarCard` | như trên |
| Cổ tức → 🧭 Thời Điểm Tối Ưu (v3), cuối trang | `decision/SignalTrackingPanel` (`SignalTrackingCard`) | `GET /api/cotuc/signal-tracking` |

- 🟢 Thuận lợi: đang trong vùng mua, xác suất tổng hợp ≥ 60%, mọi điều kiện bắt buộc đạt (thanh khoản không bắt buộc).
- 🟡 Quan sát: còn cơ hội nhưng thiếu điều kiện (ghi rõ thiếu gì). ⚪ Chưa nên: không có ngày/cửa sổ, đã qua vùng mua, hoặc xác suất < 50%.
- Ngày GDKHQ "ước tính" (chưa có thông báo VNDirect) ⇒ tối đa Quan sát.
- learnSignalWeights / calibration **chưa bật**; sổ theo dõi ghi từ 10/2026, cần ≥ 30 kết quả trước khi cân nhắc.
- Hợp đồng zod: `src/lib/cotuc/decision.ts`; test với ảnh chụp thật `src/lib/cotuc/__fixtures__/decision-states.real.json`.

# Danh mục ~300 mã + cập nhật thời gian thực (10/2026)

- Danh mục tab Cổ tức = danh mục Siêu Quét AI (Gateway `/api/market/scanner/universe`, `useCotucUniverse`). 17 mã gốc giữ dữ liệu
  đầy đủ; mã khác dựng từ sự kiện quyền THẬT (`/api/cotuc/events`, VNDirect) bằng `lib/cotuc/universe-stocks.ts` (trường chưa có
  dữ liệu để 0 + `isUniverseOnly`).
- Giá khớp TRỰC TIẾP cho mọi mã qua `useBoardQuotes` (REST + stream SSE, như bảng Siêu Quét); tỷ suất cổ tức = cổ tức tiền 12 tháng
  (VNDirect) / giá hiện tại; cổ tức/CP = đợt tiền mặt gần nhất.
- Tự làm mới: timing-signals + decision-states mỗi 60 giây, sự kiện quyền mỗi 5 phút; dải `live/CotucScanStatusBar` đọc
  `/api/market/cotuc-scan/status` mỗi 20 giây.
- `parseTimingSignals` kiểm từng dòng: dòng sai hợp đồng bị bỏ riêng (không làm hỏng cả bảng ~300 mã); cửa sổ sau GDKHQ (W4/W5) hợp lệ.
- `optimizeDividendTiming`: cửa sổ sau GDKHQ còn hiệu lực tới điểm thoát (đồng bộ với Project A).
