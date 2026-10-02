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
