# TA VN-INDEX · QUANT CORE ENGINE — Bộ tài liệu nâng cấp toàn diện

> **Phiên bản:** v1.0 · 2026-10-03 · **Trạng thái:** Đề xuất kiến trúc (chưa triển khai)
> **Phạm vi:** Tab **TA VN-Index**. Đây là module tính toán định lượng trung tâm của Global Quanta: mọi tab khác (Siêu Quét AI, ELITE COMMAND RADAR, Cổ tức · Timeline, Elite 10) dùng chung engine của tab này.
> **Chuẩn thiết kế bắt buộc:** Tab **Siêu Quét AI** (Dark Terminal, IBM Plex Mono / Space Grotesk / Inter).

---

## 0. Nguyên tắc nền tảng (Engineering Charter)

| # | Nguyên tắc | Định nghĩa vận hành | Lỗi hiện tại được xử lý (đánh số theo bản rà soát 03/10) |
|---|---|---|---|
| C1 | **Single Source of Computation** | Một engine định lượng duy nhất (`@gq/quant-core`, TypeScript thuần, không phụ thuộc DOM) chạy được trên cả **Gateway (Node)** và **trình duyệt (Web Worker)**. Không còn 3 bản code TA song song. | #18 |
| C2 | **Point-in-Time / No Look-Ahead** | Mỗi tín hiệu gắn **thời điểm xác nhận** (`confirmedAt`), không phải thời điểm hình thành. Pivot `R` nến bên phải chỉ được dùng từ nến `i+R`. Kiểm thử tự động chống look-ahead là bắt buộc. | #4 |
| C3 | **Data Provenance Contract** | Mọi con số hiển thị mang 1 trong 4 nhãn: `HARD` (dữ liệu sàn), `DERIVED` (công thức tất định từ HARD), `INFERRED` (suy luận, ví dụ phân loại lệnh chủ động), `MODEL` (xác suất từ mô hình đã hiệu chỉnh). Không gắn `HARD` cho điểm heuristic. | #9, #11 |
| C4 | **Evidence-Gated Signals** | Một tín hiệu chỉ được gắn huy hiệu **VALIDATED** khi vượt qua bộ kiểm định ở §3.1 (Deflated Sharpe, PBO, FDR). Tín hiệu chưa qua kiểm định vẫn hiển thị nhưng mang nhãn **EXPERIMENTAL**. | #4, #10, #16 |
| C5 | **Deterministic & Versioned** | Mỗi phép tính mang `engineVersion` + `paramsHash`. Ảnh chụp lịch sử (Radar snapshot) lưu kèm phiên bản, nên đổi tham số không làm sai lịch sử. | — |
| C6 | **Render ≠ Compute** | Main thread chỉ render. Mọi phép tính > 1 ms chạy trong Worker hoặc trên Gateway. | #14, #20 |
| C7 | **Graceful Degradation** | Mất SSI stream, AI provider hoặc Project A → hiển thị trạng thái suy giảm rõ ràng (banner Amber), không bao giờ thay bằng dữ liệu giả. | #2, #3 |

---

# PHẦN 1 · KIẾN TRÚC & HẠ TẦNG DỮ LIỆU

## 1.1 Kiến trúc tổng thể: Hybrid Edge-Compute

Mô hình **"Server-authoritative cross-section, Client-incremental focus"**:

| Lớp tính toán | Chạy ở đâu | Lý do |
|---|---|---|
| Cross-sectional (sàng lọc 281 mã, xếp hạng, backtest, kiểm định, hồ sơ khối lượng nhiều phiên) | **Gateway** (Railway, Node 22, worker_threads) | Cần toàn bộ universe và lịch sử; tính một lần, phục vụ mọi người dùng. |
| Mã đang xem (chỉ báo realtime, cấu trúc SMC cập nhật theo tick, developing POC, CVD) | **Trình duyệt** (Web Worker pool) | Cập nhật tăng dần O(1) mỗi tick, không chờ round-trip mạng. |
| Đối chiếu nhất quán | Cả hai, cùng `@gq/quant-core` | Worker tính lại từ snapshot Gateway → kết quả hai bên phải trùng nhau (kiểm tra bằng `checksum` theo nến). |

```
┌──────────────────────────── BROWSER (dinhtuan-ck / global-quanta) ─────────────────────────────┐
│  Main Thread (React 18)                         Worker Pool (navigator.hardwareConcurrency-1, ≤4)│
│  ┌──────────────────────────────┐   postMessage  ┌──────────────────────────────────────────┐   │
│  │ Chart Renderer (LWC v5)      │◄──────────────►│ quant-core: IncrementalEngine            │   │
│  │  · Series Primitives (canvas)│  Transferable  │  · RingBuffer<Float64Array> OHLCV         │   │
│  │ Console Grid (virtualized)   │  ArrayBuffer   │  · Online EMA/Wilder/Welford              │   │
│  │ Panels (Flow/Profile/Struct.)│                │  · StructureTracker (pivot confirm @i+R) │   │
│  └──────────────▲───────────────┘                │  · ProfileAccumulator (tick-aligned bins)│   │
│                 │ rAF batch (≤ 4 Hz UI, 60 fps   │  · DeltaTracker (CVD, imbalance)         │   │
│                 │ chart)                         └───────────────▲──────────────────────────┘   │
└─────────────────┼────────────────────────────────────────────────┼──────────────────────────────┘
                  │ REST snapshot (ETag)                            │ SSE delta (seq-numbered)
┌─────────────────┴────────────────────────────────────────────────┴──────────────────────────────┐
│ MARKET GATEWAY (Railway) — đã có: StreamHub, tickFlow, scanner, research, radar, calendar        │
│  Ingestion → Normalizer → Event Bus → Bar Builder → Feature Store → Engines → Delivery           │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 1.2 Các tầng phía Gateway

| Tầng | Thành phần | Hiện trạng | Nâng cấp |
|---|---|---|---|
| **L0 Ingestion** | SSI FastConnect Data v2 (SignalR `X:<symbol>`, `MI:<index>`), REST `DailyOhlc`, `IntradayOhlc`, `DailyIndex`, `DailyStockPrice`; VNDirect fundamentals | Có `X`, `MI`; giới hạn **200 mã** đăng ký đồng thời | Bổ sung kênh `R` (room khối ngoại) và `B` (nến phút từ sàn) nếu gói tài khoản cho phép; xoay vòng đăng ký theo mức ưu tiên (§1.5). |
| **L1 Normalizer** | `normalizer.js` | Có | Chuẩn hoá thêm `tradeSeq`, `matchedAt` (ms), phiên `ATO/LO/ATC/PT`, cờ `isOddLot`. |
| **L2 Event Bus** | `StreamHub` (in-process) | Có | Giữ in-process. Chỉ khi chạy > 1 replica mới chuyển sang Redis Streams (`XADD market.ticks`, consumer group theo engine). |
| **L3 Bar Builder** | Mới | Chưa có | Dựng nến 1m từ tick (đúng lịch phiên); gộp 5m/15m/1H/D/W/M. Nến ATO và ATC tách riêng (cờ `auction`). |
| **L4 Feature Store** | Supabase Postgres | Có `market_daily`, `market_tick_flow`, lịch sử điều chỉnh | Thêm bảng `market_bars_1m`, `market_tick_profile` (giá × buy/sell/unknown), `ta_features_daily`, `ta_signal_events`, `ta_validation_runs` (§1.6). |
| **L5 Engines** | scanner, research, radar, IFE | Rời rạc | Hợp nhất qua `@gq/quant-core`: Structure, Wyckoff, VSA, Profile, Flow, Screener, Validation. |
| **L6 Delivery** | REST + SSE `/api/market/stream` | Có | Thêm API TA (§1.7); SSE có `seq` + `snapshotVersion` để client phát hiện mất gói và tự đồng bộ lại. |

## 1.3 Tính toán phía trình duyệt không gây giật

| Kỹ thuật | Tham số | Mục đích |
|---|---|---|
| **Web Worker pool** (Comlink RPC) | `min(4, hardwareConcurrency − 1)` worker; một worker riêng cho mã đang xem | Main thread không bao giờ chạy phép tính > 1 ms. |
| **Columnar Transferable Buffers** | `Float64Array` theo cột (t, o, h, l, c, v, buy, sell); chuyển quyền sở hữu (zero-copy) | Không tốn thời gian sao chép 10.000+ nến. |
| **Ring buffer** | Dung lượng = số nến hiển thị + 500 nến khởi động | Cập nhật O(1); không cấp phát lại bộ nhớ. |
| **Online algorithms** | EMA, RMA (Wilder), Welford (phương sai), Monotonic Deque (cửa sổ max/min) | Mỗi tick O(1) thay vì O(n) như hiện tại. |
| **Render pipeline** | Gom cập nhật theo `requestAnimationFrame`; dữ liệu bảng ≤ 4 Hz; nhấp nháy ô 600 ms | Không nhấp nháy dồn dập, không giật. |
| **LWC v5 Series Primitives** | Vẽ OB/FVG/Profile/Liquidity bằng canvas trong khung giá (bỏ lớp SVG phủ ngoài) | Overlay bị cắt đúng trong vùng giá, tự theo zoom/pan, không tràn sang trục. |
| **WASM (tuỳ chọn)** | Rust → `wasm32`, chỉ dùng cho footprint/profile nhiều phiên nếu profiling cho thấy > 8 ms/khung hình | Chỉ dùng khi đo được nhu cầu. |
| **SharedArrayBuffer** | **Không mặc định.** Cần header COOP/COEP, sẽ chặn nhúng bên thứ ba (TradingView widget, iframe tin tức) | Transferable đủ nhanh cho quy mô hiện tại. |

**Ngân sách độ trễ (p95, giờ giao dịch):**

| Chặng | Mục tiêu |
|---|---|
| SSI khớp lệnh → Gateway nhận | ≤ 300 ms (phụ thuộc SSI) |
| Gateway → trình duyệt (SSE) | ≤ 150 ms |
| Worker cập nhật engine / 1 tick | ≤ 2 ms |
| Render khung hình | ≤ 16 ms (60 fps) |
| **Tổng tick → pixel** | **≤ 1 s** |

## 1.4 Toàn vẹn dữ liệu (Data Integrity Layer)

| Kiểm soát | Quy tắc | Ghi chú |
|---|---|---|
| **Corporate Actions** | Hai chuỗi song song: `nominal` (giá thực khớp, dùng cho bảng giá, trần/sàn) và `adjusted` (điều chỉnh cổ tức/chia tách, dùng cho mọi chỉ báo và backtest). Trường `adjusted` trong API phải phản ánh đúng chuỗi được trả về. | Sửa #11: hiện `adjusted:false` nhưng giá có số lẻ (đã điều chỉnh). |
| **Index OHLC** | VNINDEX/VN30/HNX lấy từ `DailyIndex` (đủ O/H/L/C). Bác bỏ nến dẹt (`O=H=L=C` và KL > 0) → bù từ nguồn chỉ số. | Sửa #1: 166/249 nến VNINDEX đang dẹt. |
| **Gap & Session Audit** | Đối chiếu với `/trading-calendar`. Thiếu phiên → đánh dấu `gap`, không nội suy. | Đã có lịch tự tính. |
| **Price-limit awareness** | Biên độ: HOSE ±7%, HNX ±10%, UPCoM ±15% (ngày đầu niêm yết ±20/30/40%). Nến chạm trần/sàn gắn cờ `limitLocked`. | FVG/OB tạo ra do khoá trần/sàn không phải mất cân bằng tự nhiên → loại khỏi tín hiệu. |
| **Tick size** | HOSE: < 10.000đ → 10đ; 10.000–49.950đ → 50đ; ≥ 50.000đ → 100đ. HNX/UPCoM: 100đ. | Dùng để chia bin Volume Profile và đặt dung sai EQH/EQL. |
| **Auction prints** | Khớp ATO/ATC gắn cờ `auction`, loại khỏi phân loại lệnh chủ động. | Khớp định kỳ không có bên chủ động. |
| **Staleness** | Mỗi giá trị kèm `asOf`. UI chuyển Amber khi > 30 s, Crimson khi > 120 s trong giờ giao dịch. | Hiển thị trực quan. |

## 1.5 Quản lý giới hạn 200 kênh realtime

Universe 281 mã nhưng SSI chỉ cho tối đa 200 mã đăng ký đồng thời. **Priority Subscription Scheduler:**

1. **Tier A (luôn đăng ký):** mã đang được người dùng xem, mã trong ★ Danh mục và Radar của người dùng đang trực tuyến, VN30.
2. **Tier B:** top thanh khoản theo ADV20 đến khi đủ 200 kênh.
3. **Tier C (còn lại):** cập nhật bằng REST `DailyStockPrice` theo chu kỳ 60 s (chỉ giá và khối lượng tổng, không có tape). Gắn nhãn `POLLED`.
4. Mỗi 5 phút xếp hạng lại; thay kênh theo kiểu hysteresis (giữ ≥ 10 phút) để tránh đăng ký/huỷ dồn dập.

## 1.6 Sơ đồ luồng dữ liệu SSI

```
                    ┌──────────────────────────── SSI FastConnect Data v2 ────────────────────────────┐
                    │ SignalR: X:<SYM> (quote+trade+3 bước giá) · MI:<IDX> · R:<SYM>* · B:<SYM>*       │
                    │ REST: DailyOhlc · IntradayOhlc · DailyIndex · DailyStockPrice · Securities      │
                    └───────────────┬──────────────────────────────────────────────┬──────────────────┘
                                    │ stream (≤200 kênh)                           │ REST (lịch/backfill)
                                    ▼                                              ▼
                    ┌───────────────────────────────┐              ┌───────────────────────────────┐
                    │ signalrConnection → StreamHub │              │ marketDataService / jobs      │
                    │ normalizer (Quote, Trade)     │              │ adjustedHistory · calendar    │
                    └───────┬───────────────┬───────┘              └───────────────┬───────────────┘
                            │               │                                      │
             ┌──────────────▼───┐   ┌───────▼────────────────┐          ┌──────────▼─────────────┐
             │ Aggressor        │   │ Bar Builder 1m         │          │ Daily bars (nominal +  │
             │ Classifier       │   │ (session-aware,        │          │ adjusted) + Index OHLC │
             │ Quote→Tick rule  │   │  ATO/ATC flagged)      │          └──────────┬─────────────┘
             │ (+BVC fallback)  │   └───────┬────────────────┘                     │
             └───────┬──────────┘           │                                      │
                     ▼                      ▼                                      ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────────┐
   │ FEATURE STORE (Supabase)                                                                   │
   │ market_tick_flow (phút) · market_tick_profile (giá×side)* · market_bars_1m* · market_daily │
   │ ta_features_daily* · ta_signal_events* · ta_validation_runs*      (* = bảng mới)           │
   └───────────────────────┬────────────────────────────────────────────────────────────────────┘
                           ▼
   ┌────────────────────────────────────────────────────────────────────────────────────────────┐
   │ @gq/quant-core ENGINES (Gateway worker_threads)                                            │
   │ Structure(SMC) · Wyckoff FSM · VSA · Volume Profile · Order Flow/VPIN · Regime(HMM)       │
   │ Screener Suite F1–F10 · Validation (Purged CV, DSR, PBO, FDR) · Meta-labeling              │
   └───────┬───────────────────────────────┬───────────────────────────────┬────────────────────┘
           │ REST snapshot (ETag)          │ SSE delta (seq)               │ Radar / Siêu Quét /
           ▼                               ▼                               ▼ Cổ tức (cùng engine)
   ┌─────────────────────────────────────────────────────────┐
   │ BROWSER: Worker (incremental) → Main (LWC v5 + Grid)     │
   └─────────────────────────────────────────────────────────┘
```

## 1.7 Hợp đồng API mới (Gateway)

| Endpoint | Mô tả | Cache |
|---|---|---|
| `GET /api/ta/:symbol/snapshot?tf=D&bars=750` | Nến (adjusted + nominal), cấu trúc SMC, Wyckoff, VSA, profile phiên gần nhất, `engineVersion`, `checksum` | ETag; 15 s trong phiên, 1 h ngoài phiên |
| `GET /api/ta/:symbol/profile?anchor=<iso>|session|composite&days=N` | Volume Profile (bins, POC, VAH, VAL, HVN/LVN) | 30 s |
| `GET /api/ta/:symbol/flow?from&to&res=1m` | Delta, CVD, khối ngoại, VPIN, sự kiện absorption/large print | 15 s |
| `GET /api/ta/:symbol/evidence?signal=CHOCH_BULL` | Thẻ bằng chứng (§3.1): n, hit rate so với base rate, mean R, t-stat, q-value, DSR, PBO | 24 h |
| `GET /api/ta/screen?preset=F2&universe=ALL` | Kết quả bộ lọc + xác suất đã hiệu chỉnh + huy hiệu kiểm định | 5 phút trong phiên |
| `SSE /api/ta/stream?symbols=…` | `{seq, symbol, kind: tick|bar|signal|flow, payload}` | Realtime |

Mọi payload bắt buộc có: `asOf`, `provenance`, `engineVersion`, `paramsHash`.

---

# PHẦN 2 · THIẾT KẾ CHI TIẾT CÁC MODULE

## 2.1 Institutional Interactive Chart Module

### 2.1.1 Nền tảng biểu đồ

| Hạng mục | Đặc tả |
|---|---|
| Thư viện | **TradingView Lightweight Charts v5** (nâng từ 4.2.3): multi-pane native, `ISeriesPrimitive` để vẽ overlay bằng canvas. |
| Khung thời gian | `1m · 5m · 15m · 1H · D · W · M`. Intraday từ `market_bars_1m`; độ sâu lịch sử = từ ngày bắt đầu ghi (hiển thị rõ "Intraday history từ dd/mm"). D lấy 750 phiên (3 năm); W/M gộp từ D của 10 năm. |
| Đối tượng | **VNINDEX (mặc định)**, VN30, HNX-Index, VN30F1M (khi có nguồn), toàn bộ 281 mã. Ô chọn mã cho phép nhập mọi mã hoặc chỉ số. |
| Panes | P1 giá + overlay · P2 khối lượng (tách Buy/Sell nếu có tape) · P3 CVD / Delta · P4 dao động (RSI/MACD/ADX, chọn được). |
| MTF Overlay | Hiển thị cấu trúc HTF (W/D) trên khung LTF dạng đường mảnh, nhãn `HTF`. |
| Crosshair Sync | Đồng bộ thời gian giữa các pane và giữa chart với Console Grid (hover một dòng → chart nhảy tới mã đó). |
| Tương tác | Pointer Events (chuột + cảm ứng + bút). Vẽ trên mobile bằng chạm–giữ 300 ms rồi kéo. |
| Lưu trạng thái | Hình vẽ, layout, layer, khung thời gian lưu theo tài khoản (`market_user_chart_state`, cơ chế giống ★ Danh mục). |
| Ngân sách nhãn | Tối đa 12 nhãn overlay trong vùng nhìn thấy. Xếp chồng theo thuật toán tránh va chạm greedy (ưu tiên: CHoCH > Sweep > OB chưa test > FVG chưa lấp > BOS > nhãn khác). |

### 2.1.2 Market Structure Engine (SMC) — đặc tả thuật toán

**Ký hiệu:** `ATR = ATR_Wilder(14)`, `tick` = bước giá theo §1.4, mọi giá dùng chuỗi `adjusted`.

**(a) Swing Pivot (không look-ahead)**

| Tham số | D/W | Intraday | Ý nghĩa |
|---|---|---|---|
| `L` (trái) | 5 | 3 | Số nến bên trái |
| `R` (phải) | 5 | 3 | Số nến bên phải; pivot chỉ **tồn tại từ nến `i+R`** (`confirmedAt`) |
| `minSwingATR` | 1.0 | 0.75 | Biên độ tối thiểu giữa hai pivot liên tiếp (lọc nhiễu) |
| Hai cấp | Internal (L=R=3) và Swing (L=R=10) | | Cấu trúc nội bộ cho entry, cấu trúc swing cho bối cảnh |

**(b) BOS / CHoCH (Structural Shift)**

- `BOS↑`: `close_t > lastConfirmedSwingHigh` và xu hướng hiện tại = bullish.
- `CHoCH↑`: `close_t > lastConfirmedSwingHigh` khi xu hướng hiện tại = bearish → đổi xu hướng.
- **Displacement filter** (bắt buộc cho CHoCH được gắn `VALIDATED`): thân nến phá ≥ `1.0×ATR` **hoặc** chuỗi ≤ 3 nến cùng chiều có tổng biên độ ≥ `1.5×ATR`.
- **Volume confirmation:** `z(log V, 20) ≥ 1.0`.
- Mỗi sự kiện lưu `{brokenLevel, displacementATR, volZ, confirmedAt}`.

**(c) Order Block**

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| Định nghĩa | Nến ngược màu **cuối cùng** trước chân displacement tạo ra BOS/CHoCH | Gắn với cấu trúc, không phải mọi nến giảm |
| Biên vùng | `body` (mặc định) hoặc `wick` | Tuỳ chọn |
| Mitigation | Giá xuyên ≥ **50% (Mean Threshold)** vùng | Thay cho "chạm là mitigated" |
| Breaker Block | Đóng cửa xuyên qua toàn bộ OB → đảo vai trò (OB tăng → kháng cự) | Mới |
| Hiệu lực | Tối đa 120 phiên (D) / 2 phiên (1m) | Hết hạn → ẩn |
| Chất lượng | `Q = 0.4·displacementATR_norm + 0.3·volZ_norm + 0.3·(1 − tests/3)` | Hiển thị bằng độ đậm, không gắn nhãn % |

**(d) Fair Value Gap (Imbalance)**

| Tham số | Giá trị |
|---|---|
| Phát hiện | `low[i+1] > high[i−1]` (bullish) / `high[i+1] < low[i−1]` (bearish) |
| Ngưỡng | `gap ≥ max(0.25×ATR, 2 tick)` |
| Loại trừ | Gap do nến `limitLocked`, gap nằm qua ngày không hưởng quyền |
| Trạng thái | `OPEN` → `PARTIAL(x%)` → `CE` (chạm 50%: Consequent Encroachment) → `FILLED` → `INVERTED` (IFVG: đóng cửa xuyên qua và dùng như vùng đối nghịch) |
| Hiển thị | Độ mờ theo % đã lấp; vạch CE nét đứt |

**(e) Liquidity Pools & Liquidity Sweep**

| Tham số | Giá trị |
|---|---|
| EQH/EQL | ≥ 2 pivot đã xác nhận cách nhau ≥ 5 nến, chênh lệch ≤ `max(0.1×ATR, 2 tick)` |
| Liquidity Sweep | Râu nến vượt pool ≥ 1 tick, **đóng cửa quay lại** bên trong pool trong ≤ 3 nến, `volZ ≥ 1.2` |
| Trạng thái pool | `RESTING` → `SWEPT` (ghi ngày) → `RECLAIMED`/`RUN` |
| Nhãn | `SSL Sweep` (sell-side, dưới đáy) / `BSL Sweep` (buy-side, trên đỉnh) |

**(f) Dealing Range · Premium/Discount · OTE**

- Dealing range = cặp swing high/low **đã xác nhận** của chân cấu trúc hiện tại (không phải max/min 50 nến).
- Equilibrium = 50%; vùng cân bằng = ±5% **biên độ range**.
- OTE theo hướng: chân tăng → vùng hồi 61.8–78.6% tính từ đỉnh xuống; chân giảm → ngược lại. Mốc 70.5% làm vạch tham chiếu.

### 2.1.3 Wyckoff Phase Engine (FSM + xác suất hiệu chỉnh)

Thay heuristic hiện tại (lỗi #6) bằng **máy trạng thái hữu hạn** có ràng buộc thứ tự, đầu ra là **xác suất đã hiệu chỉnh**:

**(a) Trading Range Detection**

| Tham số | Giá trị |
|---|---|
| Nén biến động | `BBWidth(20, 2σ)` percentile ≤ 25 trên cửa sổ 250 phiên **và** `(HH−LL)/ATR(14) ≤ 8` |
| Thời lượng tối thiểu | 20 phiên (D) |
| Biên range | Pivot đã xác nhận đầu tiên sau Selling/Buying Climax (AR định biên) |
| Mở rộng | Range được nối dài khi giá vẫn đóng cửa trong `[LL − 0.5ATR, HH + 0.5ATR]` |

**(b) Event Detectors (point-in-time)** — volume chuẩn hoá `zV = z(log V, 50)` tính **tại thời điểm sự kiện**, không lấy theo cuối chuỗi:

| Sự kiện | Điều kiện |
|---|---|
| SC (Selling Climax) | Xu hướng giảm trước đó (giá < MA50, MA50 dốc xuống); `zV ≥ 2.0`; biên độ ≥ 1.5×ATR; CLV ≥ 0.5 (đóng cửa trên nửa nến) |
| AR (Automatic Rally) | Pivot high đầu tiên sau SC; hồi ≥ 1.5×ATR |
| ST (Secondary Test) | Quay lại ±1×ATR quanh đáy SC, `zV < zV(SC) − 1` |
| Spring | Thủng LL của range ≤ 1.5×ATR rồi **đóng cửa trở lại trong range** ≤ 3 nến; Spring loại 3: `zV ≤ 0` |
| Test | Sau Spring, quay về vùng Spring với `zV < 0`, biên độ < 0.8×ATR |
| SOS | Đóng cửa > HH của range + 0.25×ATR, `zV ≥ 1.0` — **xét cả sau khi range kết thúc** |
| LPS | Hồi về HH cũ hoặc nửa trên range, `zV < 0`, giữ trên `HH − 0.5ATR` |
| BC / UTAD / SOW / LPSY | Đối xứng nhánh phân phối |

**(c) Phase Machine:** `A (dừng xu hướng: PS/SC/AR/ST) → B (xây cause) → C (Spring/UTAD) → D (SOS/SOW, LPS/LPSY) → E (Markup/Markdown)`. Chỉ chuyển trạng thái khi sự kiện đúng thứ tự; sự kiện sai thứ tự gắn `violation`.

**(d) Xác suất:** đặc trưng `[eventsPresent, orderScore, rangeDuration, zV_SC, springDepthATR, effortResult]` → hồi quy logistic, huấn luyện trên toàn universe 10 năm. Nhãn = triple-barrier sau sự kiện cuối (§3.1). Hiệu chỉnh bằng **Isotonic Regression**; báo cáo **Brier score** và **reliability diagram**. Hiển thị: `P(Accumulation→Markup) = 0.62 · MODEL · Brier 0.21`.

### 2.1.4 VSA Engine (Effort vs Result)

Chuẩn hoá: `zV = z(log V, 30)`, `zS = z(spread, 30)`, `CLV = (C−L)/(H−L)`, bối cảnh = độ dốc `EMA(20)` trong 5 phiên.

| Tín hiệu | Hướng | Điều kiện |
|---|---|---|
| **No Supply** | ▲ | Nến giảm, `zS ≤ −0.5`, `V < min(V[−1], V[−2])`, bối cảnh tăng hoặc vừa test vùng cầu |
| **No Demand** | ▼ | Nến tăng, `zS ≤ −0.5`, `V < min(V[−1], V[−2])`, bối cảnh giảm hoặc chạm vùng cung |
| **Stopping Volume** | ▲ | Bối cảnh giảm, `zV ≥ 1.5`, `CLV ≥ 0.6`, `zS ≥ 0` |
| **Selling Climax** | ▲ | Bối cảnh giảm, `zV ≥ 2.0`, `zS ≥ 1.5`, `CLV ≥ 0.4` |
| **Buying Climax** | ▼ | Bối cảnh tăng, `zV ≥ 2.0`, `zS ≥ 1.5`, `CLV ≤ 0.6` |
| **Upthrust** | ▼ | High > swing high gần nhất, đóng cửa < swing high, `CLV ≤ 0.35`, `zV ≥ 1.0` |
| **Shakeout** | ▲ | Low < swing low gần nhất, đóng cửa > swing low, `CLV ≥ 0.65`, `zV ≥ 1.0` |
| **Effort ≠ Result** | ± | `zV ≥ 1.5` nhưng `|ret| ≤ 0.3×ATR` → hấp thụ (Absorption) |

Mỗi tín hiệu có **thẻ bằng chứng riêng** (§3.1). Tín hiệu có `q-value > 0.10` hiển thị mờ kèm nhãn `NO EDGE`.

## 2.2 Matrix Volume Profile & Order Flow Module

### 2.2.1 Nguồn dữ liệu theo cấp chính xác

| Cấp | Nguồn | Độ chính xác | Nhãn |
|---|---|---|---|
| **T1 Tick-level** | `X:<SYM>` → `market_tick_profile` (giá × buy/sell/unknown) | Chính xác theo mức giá | `HARD` (khối lượng) / `INFERRED` (bên chủ động) |
| **T2 Minute-bar** | `market_bars_1m` | Phân phối khối lượng nến 1m đều theo các tick giá trong `[L, H]` | `DERIVED` |
| **T3 Daily** | `market_daily` | Phân phối tam giác quanh `(H+L+C)/3` | `DERIVED (approx)` — chỉ cho composite dài hạn |

### 2.2.2 Volume Profile Engine

| Thành phần | Thuật toán / tham số |
|---|---|
| **Bin** | Theo bước giá thật (§1.4). Nếu số bin > 120 → gộp bội số tick sao cho `binSize ≥ ATR(14)/24` |
| **POC** | `argmax(volume[bin])`; hoà → chọn bin gần VWAP nhất |
| **Value Area (70%)** | Chuẩn Market Profile (Steidlmayer/CME): xuất phát từ POC, mỗi bước so tổng **2 bin** phía trên với 2 bin phía dưới, nhận cặp lớn hơn đến khi ≥ 70% tổng KL → **VAH / VAL** |
| **HVN / LVN** | Làm mượt Gaussian (σ = 2 bin); HVN = cực đại cục bộ có prominence ≥ 15% của POC; LVN = cực tiểu cục bộ ≤ 35% của POC |
| **Naked POC (nPOC)** | POC phiên trước chưa bị chạm lại → giữ vạch Amber kéo dài đến khi bị chạm |
| **Developing POC/VA** | Cập nhật tăng dần trong Worker: O(1) mỗi lệnh khớp (+1 bin), tính lại VA O(bins) ≤ 1 lần / 500 ms |
| **Profile Delta** | Mỗi bin tách `buy − sell` (T1) → tô hai màu (Bull/Bear) trong cùng thanh |
| **Tách phiên (SVP)** | Phiên sáng 09:15–11:30, phiên chiều 13:00–14:30, ATO/ATC thành bin riêng có nhãn `AUCTION` (không trộn vào profile khớp liên tục) |
| **Anchored (AVP)** | Neo tại: click người dùng · pivot swing · SC/BC Wyckoff · ngày công bố KQKD · ngày GDKHQ · ngày phá cấu trúc (CHoCH). Kèm **Anchored VWAP** + dải ±1σ/±2σ/±3σ (phương sai có trọng số khối lượng) |
| **Composite** | 5 / 20 / 60 phiên; hiển thị dạng histogram ngang bên phải chart (primitive canvas) |

**Tín hiệu từ profile:** `VA Rejection` (mở cửa ngoài VA, quay lại VA → 80% rule: kỳ vọng đi hết VA — **phải kiểm định trên HOSE trước khi hiển thị mức %**), `LVN Acceptance` (đóng cửa 2 nến 15m qua LVN), `POC Migration` (dịch POC theo hướng xu hướng ≥ 3 phiên liên tiếp).

### 2.2.3 Tape Reading & Order Flow Engine

**(a) Aggressor Classification (nâng cấp bộ Lee–Ready hiện có trong `streamHub`)**

1. **Quote Rule:** so giá khớp với best bid/ask **trước** lệnh (snapshot quote có `matchedAt` < `tradeAt`). `P ≥ Ask` → mua chủ động; `P ≤ Bid` → bán chủ động.
2. **Midpoint Rule:** bid < P < ask → so với mid.
3. **Tick Rule:** fallback theo giá khớp trước đó (uptick/downtick, zero-tick kế thừa).
4. **BVC (Bulk Volume Classification, Easley–López de Prado–O'Hara 2012):** cho nến không có quote: `V_buy = V · Φ(ΔP / σ_ΔP)` với σ ước lượng EWMA. Dùng cho dữ liệu `POLLED` và lịch sử trước ngày ghi tick.
5. Loại trừ ATO/ATC/thoả thuận (`PT`) và lô lẻ.
6. **Độ phủ phân loại** = `(buy+sell)/total` hiển thị kèm. Nếu < 80% thì gắn cảnh báo `LOW COVERAGE`.

**(b) Chỉ số Order Flow**

| Chỉ số | Công thức / tham số | Hiển thị |
|---|---|---|
| **Delta** | `V_buy − V_sell` theo nến | Histogram Bull/Bear pane P3 |
| **CVD** | `Σ Delta` reset theo phiên (hoặc neo) | Đường CVD; **CVD Divergence**: giá HH nhưng CVD LH (≥ 3 pivot) |
| **Imbalance (Footprint)** | Theo đường chéo: `AskVol[p] / BidVol[p−tick] ≥ 3.0` | **Stacked Imbalance** ≥ 3 mức liên tiếp → vùng hỗ trợ/kháng cự order-flow |
| **Absorption** | `zV(1m) ≥ 2.0` và `|ΔP| ≤ 1 tick` trong ≥ 2 phút liên tiếp tại cùng mức | Marker ◆ Ultraviolet |
| **Large Print ("tay to")** | Giá trị lệnh ≥ percentile 99 của mã trong 20 phiên (đã có trong `marketIntel`) | Tape: dòng nổi bật; đếm net large print theo phút |
| **Iceberg (heuristic)** | Cùng mức giá best bid/ask được nạp lại ≥ 3 lần trong 60 s sau khi bị khớp cạn | `INFERRED` — dùng 3 bước giá của kênh `X` |
| **VPIN** | Bucket khối lượng = ADV20/50; cửa sổ 50 bucket; `VPIN = Σ|V_buy − V_sell| / (n·V_bucket)` | Gauge độc tính dòng lệnh; percentile ≥ 90 → cảnh báo biến động |
| **Kyle's λ** | Hồi quy `ΔP_5m ~ λ · SignedVolume_5m` trên 30 phiên | Độ sâu thanh khoản / tác động giá |
| **Amihud ILLIQ** | `mean(|r_d| / Value_d)` 20 phiên | Bộ lọc thanh khoản cho screener |

**(c) Dòng tiền Khối ngoại & Tự doanh**

| Dòng tiền | Nguồn | Độ trễ | Xử lý |
|---|---|---|---|
| **Khối ngoại** | `foreignBuyVolume/SellVolume` luỹ kế trong `X` (đã chuẩn hoá) + kênh `R` (room) | **Realtime** | Chênh lệch theo phút → `ForeignDelta`, `ForeignCVD`; ngày: `NetValue`, `z(Net,20)`, chuỗi phiên mua/bán ròng liên tiếp, **Room còn lại %** (cảnh báo < 5%) |
| **Tự doanh CTCK** | HOSE công bố sau phiên (thường tối T+0), nguồn tổng hợp bên thứ ba | **EOD (không có realtime)** | Job 19:00 hằng ngày; nhãn `EOD`; **không hiển thị như realtime** |
| **Lệnh lớn / tổ chức (suy luận)** | Large print + Absorption + CVD | Realtime | Nhãn `INFERRED`, không gọi là "dòng tiền tổ chức thật" |

> **Giới hạn trung thực:** HOSE **không** công bố bên chủ động của từng lệnh khớp, nên mọi số liệu Mua/Bán chủ động là **ước lượng** (sai số điển hình 10–15% với Lee–Ready). Tự doanh chỉ có cuối ngày. Tài liệu UI bắt buộc thể hiện hai điều này.

---

# PHẦN 3 · BỘ LỌC CỔ PHIẾU QUANTITATIVE

## 3.0 Universe & lịch chạy

| Hạng mục | Quy tắc |
|---|---|
| Universe | 281 mã hiện tại + chỉ số. Điều kiện vào: ADV20 giá trị ≥ 10 tỷ đ, giá ≥ 5.000đ, ≥ 120 phiên niêm yết, không thuộc diện kiểm soát/đình chỉ/cảnh báo. Lưu **point-in-time** (universe theo từng ngày lịch sử để tránh survivorship bias). |
| Lịch | Toàn bộ sau ATC (15:05) + làm mới intraday 5 phút cho bộ lọc dùng order flow. |
| Engine | Chạy duy nhất trên Gateway (`@gq/quant-core`), thay `/api/pattern-scan`, `/api/convergence-scan`, `/api/golden-filter` của Project A (đang chỉ quét 61 mã dự phòng). |

## 3.1 Validation Framework (chuẩn institutional)

Mọi bộ lọc và tín hiệu đi qua cùng một quy trình. Kết quả hiển thị trên **Evidence Card**.

| Bước | Phương pháp | Tham số |
|---|---|---|
| **Labeling** | **Triple-Barrier** (López de Prado) | TP = `2.0×ATR`, SL = `1.0×ATR`, vertical = 10 phiên. Vào lệnh = **giá mở cửa phiên T+1** (không phải đóng cửa phiên tín hiệu). Thoát sớm nhất **chiều T+2** (quy tắc thanh toán T+2.5) |
| **Chi phí** | Phí 0.15%/chiều + thuế bán 0.1% + trượt giá = ½ spread + `λ·size` | Cấu hình được theo CTCK |
| **Base rate** | So với tỷ lệ TP-first **vô điều kiện** của cùng mã/ngành trong cùng giai đoạn | Lợi thế = hit rate − base rate |
| **Thống kê** | Mean R, Information Coefficient (Spearman), t-stat **Newey–West** (lag = 10 do chồng lấn nhãn) | |
| **Cross-validation** | **Purged K-Fold** (K = 5) + **Embargo** 10 phiên; **Walk-forward** train 2 năm / test 3 tháng, cuộn | Chống rò rỉ nhãn chồng lấn |
| **Overfitting** | **Deflated Sharpe Ratio** (Bailey & López de Prado 2014) với số lần thử thật; **PBO** qua CSCV (S = 16 phân đoạn) | |
| **Đa kiểm định** | **Benjamini–Hochberg FDR** trên toàn bộ họ tín hiệu | q ≤ 0.10 |
| **Ổn định** | Hit rate theo từng năm và từng regime (HMM); không năm nào lệch > 2σ | |

**Gate `VALIDATED`:** `n ≥ 100` **và** `q ≤ 0.10` **và** `DSR ≥ 0.95` **và** `PBO ≤ 0.30` **và** lợi thế > 0 sau chi phí. Kiểm định chạy lại mỗi tuần; mất điều kiện → tự hạ về `EXPERIMENTAL` và ghi sự kiện.

## 3.2 Nâng cấp các bộ lọc hiện có

| Bộ lọc hiện tại | Vấn đề | Thiết kế mới |
|---|---|---|
| **Pattern Scanner** | 61 mã, 7 mã đạt lọc, độ tin cậy không kiểm định | Zigzag theo ATR (ngưỡng 2×ATR); 8 mẫu hình (Inverse H&S, Ascending/Symmetric Triangle, Cup & Handle, Flat Base, Double Bottom, Bull Flag, VCP). Xác nhận breakout: đóng cửa > neckline + 0.25×ATR **và** `zV ≥ 1.0`. Đầu ra: **Measured-move target**, invalidation level, `P(TP-first)` đã hiệu chỉnh, Evidence Card theo từng mẫu. |
| **Bộ lọc Hợp lưu** (Wyckoff 30% + SMC 30% + FVG 20% + Vol 20%) | Trọng số cố định, không kiểm định | Thay bằng mô hình **Gradient Boosting (LightGBM, monotone constraints)** trên đặc trưng SMC/Wyckoff/VSA/Flow; đầu ra là xác suất hiệu chỉnh Isotonic; **SHAP** giải thích từng mã ("vì sao mã này lọt"). Mô hình chạy offline (Gateway job), xuất cây quyết định dạng JSON để suy luận trong Node. |
| **Golden Filter × Top 20 / TA Consensus** | Top 20 theo độ tin cậy pattern; cộng thưởng +15 tuỳ ý | **Meta-labeling:** tín hiệu sơ cấp (pattern/CHoCH) quyết định *hướng*; mô hình thứ cấp quyết định *có hành động không* và **bet size** = `f(P) = 2P − 1` giới hạn bởi Kelly ¼. Bỏ hằng số cộng thưởng. |

## 3.3 Bộ lọc mới (Quant Screener Suite F1–F10)

| ID | Tên | Logic & tham số | Loại lợi thế |
|---|---|---|---|
| **F1** | **Stealth Accumulation Footprint** | `|ret20| ≤ 1σ_20` (giá đi ngang) **và** độ dốc CVD 20 phiên > 0 (t ≥ 2) **và** ≥ 3 sự kiện Absorption ở nửa dưới range **và** `z(ForeignNet,20) ≥ 1` hoặc Large-print net > 0 **và** `P(Wyckoff Phase C/D) ≥ 0.5` | Order flow + Wyckoff |
| **F2** | **Liquidity Sweep Reversal** | SSL Sweep của EQL → CHoCH↑ (displacement) trong ≤ 5 nến → entry khi hồi về CE của FVG do displacement tạo ra; SL dưới đáy sweep − 0.25×ATR | SMC |
| **F3** | **Volatility Contraction → Expansion** | `BBWidth(20)` percentile ≤ 10 (250 phiên) **và** `ATR(5)/ATR(50) ≤ 0.6` **và** ≥ 3 lần co hẹp có biên độ giảm dần (VCP) → breakout `zV ≥ 1.5` | Biến động |
| **F4** | **Residual Momentum** (Blitz–Huij–Martens 2011) | Hồi quy lợi suất ngày của mã theo `VNINDEX` + chỉ số ngành (cửa sổ 250 phiên); momentum = tổng residual 12-1 tháng / độ lệch chuẩn residual; xếp hạng **trung lập ngành**, decile top | Cross-sectional |
| **F5** | **Trend Quality (Kalman + Hurst)** | Kalman local-linear-trend trên log giá: `SNR = slope / σ_obs ≥ 0.15`; Hurst (DFA, 100 phiên) ≥ 0.55; ADX(14) ≥ 20 | Time-series momentum |
| **F6** | **RS Leadership** | Đường RS Mansfield so với VNINDEX (MA 52 tuần) > 0 **và** RS line tạo đỉnh mới **trước** giá ≥ 3 phiên | Sức mạnh tương đối |
| **F7** | **Regime-Gated Mean Reversion (Long-only)** | HMM regime = Bull/Neutral; `z(Close − AVWAP_anchor, 20) ≤ −2`; RSI(2) ≤ 10; nắm giữ 3–5 phiên (tuân thủ T+2.5) | Hồi quy trung bình |
| **F8** | **Post-Earnings Drift (SUE)** | `SUE = (EPS_q − EPS_{q−4}) / σ(ΔEPS, 8 quý)` từ dữ liệu VNDirect đã có; top quintile + gap tăng ngày công bố với `zV ≥ 1.5`; giữ 20–40 phiên | Sự kiện cơ bản |
| **F9** | **Dividend Window Edge** | Kết nối Timeline Cổ tức hiện có: chỉ những cửa sổ mua đạt kiểm định | Lịch sự kiện |
| **F10** | **Toxic Flow Avoidance** (bộ lọc loại trừ) | VPIN percentile ≥ 90 hoặc Amihud ILLIQ top decile hoặc Room ngoại < 2% → loại / hạ tỷ trọng | Quản trị rủi ro |

## 3.4 Tổng hợp: Quant Composite Score

```
P_i      = Isotonic( Σ_k w_k · P_k,i )            # ensemble các bộ lọc đã VALIDATED (stacking, w học bằng purged CV)
Gate     = RegimeHMM(VNINDEX, breadth) ∈ {RISK-ON: 1.0, NEUTRAL: 0.6, RISK-OFF: 0.25}
EV_i     = P_i · TP_R − (1 − P_i) · SL_R − cost_R    # kỳ vọng theo R-multiple, sau chi phí
Size_i   = min( Kelly/4 , σ_target / σ_i , 5% · ADV20_value / NAV )
Rank     = EV_i · Gate  (chỉ mã có EV_i > 0 và không bị F10 loại)
```

---

# PHẦN 4 · CYBERPUNK CONSOLE UI GRID

## 4.1 Design Tokens (mở rộng chuẩn Siêu Quét)

> Màu cho **Bullish/Dòng tiền Mua** bị thiếu trong yêu cầu. Đề xuất **Neon Mint `#00F5A0`**, cần anh xác nhận. Để giữ một chuẩn duy nhất, token mới áp dụng đồng thời cho Siêu Quét (thay `emerald/rose` hiện tại) khi triển khai.

```css
:root {
  /* Surface */
  --gq-bg-base:      #0A0E17;  /* giữ nguyên */
  --gq-bg-surface:   #0F1420;
  --gq-bg-panel:     rgba(13,17,26,0.75);
  --gq-grid-line:    rgba(148,163,184,0.06);
  --gq-border:       rgba(255,255,255,0.07);

  /* Semantic — Flow */
  --gq-bull:         #00F5A0;  /* Neon Mint: Mua chủ động / Bullish / Accumulation (đề xuất) */
  --gq-bull-dim:     rgba(0,245,160,0.14);
  --gq-bear:         #FF0055;  /* Crimson Neon: Phân phối / Bearish / Distribution */
  --gq-bear-dim:     rgba(255,0,85,0.14);

  /* Semantic — System & Zones */
  --gq-uv:           #A855F7;  /* Ultraviolet: AI/MODEL, Absorption, Wyckoff */
  --gq-amber:        #FFB020;  /* Amber: POC/VAH/VAL, OTE, cảnh báo dữ liệu cũ, giới hạn */
  --gq-cyan:         #22D3EE;  /* Tiêu đề panel, thông tin trung tính (giữ cyan-400 của Siêu Quét) */

  /* Bảng giá VN (giữ quy ước sàn) */
  --gq-ceil:         #E879F9;  /* Trần */
  --gq-floor:        #38BDF8;  /* Sàn */
  --gq-ref:          #FACC15;  /* Tham chiếu */

  /* Text */
  --gq-text-1:       #F2F4F8;
  --gq-text-2:       #8A93A8;
  --gq-text-3:       #586178;

  /* Glow (chỉ dùng cho trạng thái kích hoạt, không dùng nền) */
  --gq-glow-bull:    0 0 8px rgba(0,245,160,0.45);
  --gq-glow-bear:    0 0 8px rgba(255,0,85,0.45);
}
```

**Quy tắc màu:**

1. Màu luôn đi kèm ký hiệu (▲/▼/◆/●) để người mù màu vẫn đọc được.
2. Độ tương phản chữ ≥ 4.5:1 trên `--gq-bg-base` (WCAG AA). Chữ Crimson `#FF0055` dùng từ cỡ ≥ 10px font-semibold.
3. Glow chỉ cho phần tử đang nhấp nháy hoặc vừa kích hoạt (≤ 600 ms).

## 4.2 Typography Scale

| Token | Font | Cỡ (Desktop / Mobile) | Weight | Dùng cho |
|---|---|---|---|---|
| `display` | IBM Plex Mono, tabular-nums | 17px / 17px | 700 | Giá trị hero (VNINDEX, POC, P(model)) |
| `title` | Space Grotesk, uppercase, tracking 0.04em | 14px / 14px | 700 | Tiêu đề module (cyan) |
| `section` | Space Grotesk | 11px / 12px | 600 | Tiêu đề nhóm, tab con |
| `data` | IBM Plex Mono, tabular-nums | 10px / 11px | 500 | Số liệu bảng, tape |
| `body` | Inter | 10px / 12px | 400 | Diễn giải, Evidence Card |
| `meta` | Inter | 9px / 10px | 400 | Nguồn, `asOf`, nhãn provenance |
| `micro` | IBM Plex Mono | 8.5px / 10px | 600 | Huy hiệu (`HARD`, `MODEL`, `VALIDATED`) — **không nhỏ hơn 8.5px** (bỏ 8px hiện có) |

## 4.3 Bố cục Workspace

```
DESKTOP ≥ 1280px (12 cột)
┌──────────────────────────────────────────────────────────────┬─────────────────────────────┐
│ COMMAND BAR: [VNINDEX ▾] [1m 5m 15m 1H D W M] [Layers ▾] [Preset ▾] ⌘K   ● LIVE 0.4s    │
├──────────────────────────────────────────────────────────────┬─────────────────────────────┤
│ P1 PRICE + SMC/WYCKOFF/VSA OVERLAY  (8 cột, 58vh)            │ STRUCTURE HUD               │
│                                              ┃ VP histogram ┃ │  Bias · Dealing range · OTE │
│                                                              │  Last CHoCH/BOS · Sweep     │
├──────────────────────────────────────────────────────────────┤ WYCKOFF  Phase C · P=0.62   │
│ P2 VOLUME (Buy/Sell)                                         │ ORDER FLOW                  │
│ P3 DELTA / CVD                                               │  Δ · CVD · VPIN gauge       │
│ P4 OSC (RSI/MACD/ADX)                                        │  Foreign Δ · Room %         │
├──────────────────────────────────────────────────────────────┤ TAPE (Time & Sales)         │
│ QUANT CONSOLE GRID (screener F1–F10, virtualized, 30 cột)    │  large prints highlighted   │
└──────────────────────────────────────────────────────────────┴─────────────────────────────┘

MOBILE 390px: Command bar → Chart (P1 + P3, 52vh) → Segmented [Structure | Flow | Tape | Screener]
              → Grid dạng thẻ (mỗi dòng thành 1 thẻ 3 dòng, vuốt ngang để xem nhóm cột)
```

## 4.4 Đặc tả Quant Console Grid

| Hạng mục | Đặc tả |
|---|---|
| Engine | **TanStack Table + TanStack Virtual**: ảo hoá hàng và cột; 281 hàng × 30 cột ở 60 fps |
| Cột ghim | `Symbol` + `Signal` ghim trái; `Score/EV` ghim phải |
| Nhóm cột | Price · Structure · Wyckoff/VSA · Profile · Flow · Quant · Evidence (thu/mở theo nhóm) |
| Cập nhật | Gom delta theo rAF; nhấp nháy ô 600 ms (`--gq-bull-dim`/`--gq-bear-dim`); không re-render cả hàng |
| Cell renderers | Sparkline canvas (30 phiên), mini-bar Delta, heat cell (z-score → độ đậm), badge provenance, đồng hồ VPIN dạng vòng |
| Bàn phím | `J/K` di chuyển · `Enter` mở chart · `/` tìm mã · `1–9` chọn preset F1–F9 · `Space` ghim · `Shift+S` thêm ★ Danh mục |
| Lọc & sắp xếp | Sắp xếp đa cột; filter chips; preset lưu theo tài khoản |
| Mật độ | Compact (22px/hàng) · Standard (28px) · Touch (40px, mặc định mobile) |
| Độ tươi | Chấm trạng thái mỗi hàng: Mint (< 5 s) · Amber (> 30 s) · Crimson (> 120 s) · Xám (`POLLED`) |
| Truy cập | `role="grid"`, `aria-rowcount`, focus ring cyan 1px; `aria-live="polite"` chỉ cho cảnh báo |

**Danh mục cột chuẩn**

| Nhóm | Cột | Định nghĩa | Provenance |
|---|---|---|---|
| Price | Last · %Δ · Trần/Sàn/TC | Giá nominal | HARD |
| Structure | Bias | Xu hướng swing hiện tại (▲/▼) | DERIVED |
| | Last Shift | CHoCH/BOS gần nhất + số phiên trước | DERIVED |
| | Sweep | SSL/BSL sweep gần nhất ≤ 10 phiên | DERIVED |
| | Zone | Premium / EQ / Discount / OTE | DERIVED |
| Wyckoff/VSA | Phase | A–E + `P(model)` | MODEL |
| | VSA | Tín hiệu gần nhất + hướng | DERIVED |
| Profile | POC Dist | `(Close − POC)/ATR` | DERIVED |
| | VA Pos | Trên VAH / Trong VA / Dưới VAL | DERIVED |
| Flow | Δ Today | Delta phiên (% KL) | INFERRED |
| | CVD Slope 20 | t-stat độ dốc CVD | INFERRED |
| | Foreign Net | Giá trị ròng hôm nay + `z20` | HARD |
| | VPIN pct | Percentile VPIN 250 phiên | INFERRED |
| Quant | ResMom | Decile residual momentum | DERIVED |
| | Trend SNR · Hurst | Kalman SNR, Hurst DFA | DERIVED |
| | P(TP) | Xác suất hiệu chỉnh của ensemble | MODEL |
| | EV (R) | Kỳ vọng sau chi phí | MODEL |
| Evidence | Badge | `VALIDATED` / `EXPERIMENTAL` / `NO EDGE` + n, q | MODEL |

## 4.5 Evidence Card (bắt buộc cho mọi tín hiệu)

```
┌ CHoCH ▲ · VNM · D · confirmed 2026-10-02 ──────────────── VALIDATED ┐
│ n = 412   Hit 58.3% vs base 49.1%  (+9.2 pp)   Mean +0.31R           │
│ t(NW) 3.4   q 0.012   DSR 0.97   PBO 0.18   Walk-forward 11/12 ✓     │
│ Entry T+1 open · TP 2.0 ATR · SL 1.0 ATR · 10 phiên · sau phí/thuế   │
│ Regime: Bull 61% │ Neutral 54% │ Bear 44%   · engine 2.0.0 #a91f     │
└──────────────────────────────────────────────────────────────────────┘
```
*(Số trong khung chỉ minh hoạ bố cục, không phải kết quả thật.)*

## 4.6 Chuẩn ngôn ngữ

| Không dùng | Dùng |
|---|---|
| "Mua vào", "Nên mua" | **Long bias** · Entry zone · Invalidation |
| "Đỉnh/đáy" | **Swing High/Low (confirmed)** |
| "Phá vỡ" | **BOS** (continuation) / **CHoCH — Structural Shift** (reversal) |
| "Quét stop" | **Liquidity Sweep (SSL/BSL)** |
| "Vùng mua tốt" | **Discount · OTE 61.8–78.6%** |
| "Tiền lớn vào" | **Absorption · Large-print net · CVD divergence** (`INFERRED`) |
| "Khối lượng lớn" | **Effort (zV = 2.3)** |
| "AI xác nhận 85%" | **P(TP-first) = 0.58 · MODEL · Brier 0.21** |
| "Độ tin cậy cao" | **VALIDATED (q 0.01, DSR 0.97)** |

Văn bản tiếng Việt **có dấu đầy đủ** (sửa #19). Thuật ngữ gốc tiếng Anh giữ nguyên. Mỗi nhãn kèm số đo định lượng.

---

# PHẦN 5 · LỘ TRÌNH TRIỂN KHAI, CHỈ TIÊU & GIỚI HẠN

## 5.1 Lộ trình (mỗi phase = 1 PR, duyệt riêng)

| Phase | Nội dung | Phụ thuộc | Kết quả nghiệm thu |
|---|---|---|---|
| **P0 Hotfix** | Nhãn Wyckoff, số OB/FVG thật, nhãn provenance, chữ có dấu | — | Ô Wyckoff có tên pha; không còn `HARD` cho điểm heuristic |
| **P1 Data Integrity** | Index OHLC thật (VNINDEX/VN30), cờ `adjusted` đúng, `limitLocked`, `auction`, chọn được VNINDEX làm mặc định | Gateway | 0 nến dẹt; test đối chiếu với `DailyIndex` |
| **P2 quant-core** | Tách `@gq/quant-core` (TS), SMC/VSA/Wyckoff mới, test chống look-ahead (property test: kết quả tại t không đổi khi thêm dữ liệu sau t) | P1 | ≥ 90% coverage engine; 0 vi phạm look-ahead |
| **P3 Chart v5** | LWC v5, primitives canvas, multi-pane, Worker, pointer events, lưu hình vẽ theo tài khoản | P2 | 60 fps với 750 nến + overlay; vẽ được trên 390px |
| **P4 Bar Builder & Profile** | `market_bars_1m`, `market_tick_profile`, SVP/AVP/Composite, intraday TF | P1 | POC/VA khớp tính tay trên 20 phiên mẫu |
| **P5 Order Flow** | Classifier nâng cấp + BVC, CVD, Absorption, VPIN, Foreign Δ, tape | P4 | Độ phủ phân loại ≥ 80% trong giờ khớp liên tục |
| **P6 Validation** | Triple-barrier, Purged CV, DSR, PBO, FDR, Evidence Card, bảng `ta_validation_runs` | P2 | Mọi tín hiệu có Evidence Card |
| **P7 Screener Suite** | F1–F10 trên Gateway, thay endpoint Project A, meta-labeling, Composite | P5, P6 | 281 mã; chỉ tín hiệu đạt gate mới có `VALIDATED` |
| **P8 Console Grid** | TanStack grid, tokens mới (áp cho Siêu Quét), bàn phím, mobile cards | P7 | 281×30 ở 60 fps; Lighthouse a11y ≥ 90 |
| **P9 AI Layer** | Khôi phục Smart Note / Chart Vision qua Gateway (khoá API phía server), chỉ tóm tắt số liệu đã tính, mô hình mới nhất | Anh quyết định nơi đặt khoá | Không còn lỗi thiếu khoá; AI không tự đưa ra con số mới |

## 5.2 KPI vận hành

| KPI | Mục tiêu |
|---|---|
| Tick → pixel p95 | ≤ 1 s |
| Main-thread long tasks (> 50 ms) | 0 trong giờ giao dịch |
| Độ khớp Worker ↔ Gateway (checksum theo nến) | 100% |
| Tỷ lệ tín hiệu có Evidence Card | 100% |
| Độ phủ realtime (mã có tape / universe) | ≥ 200/281 trong giờ khớp |
| Thời gian tính screener toàn universe | ≤ 60 s sau ATC |

## 5.3 Giới hạn & rủi ro (phải hiển thị trung thực)

| Giới hạn | Tác động | Giảm thiểu |
|---|---|---|
| SSI chỉ cho tối đa 200 kênh realtime | 81 mã không có tape realtime | Priority Scheduler (§1.5), nhãn `POLLED` |
| Không có bên chủ động chính thức | Delta/CVD là ước lượng | Nhãn `INFERRED`, hiển thị độ phủ |
| Tự doanh chỉ có cuối ngày | Không có "tự doanh realtime" | Nhãn `EOD`, job 19:00 |
| Lịch sử tick chỉ có từ ngày bắt đầu ghi | Profile/Flow lịch sử ngắn; backtest flow chưa đủ mẫu | Bật recorder nền cho top thanh khoản ngay từ P4; BVC cho lịch sử |
| Không bán khống được cổ phiếu cơ sở | Tín hiệu Bearish chỉ dùng để thoát vị thế / tránh mua | Mọi bộ lọc vào lệnh là long-only |
| Chi phí hạ tầng (Railway CPU, Supabase dung lượng tick) | `market_tick_profile` có thể ~vài triệu dòng/tháng | Partition theo tháng; nén sau 90 ngày; chỉ giữ profile 1 năm |
| Overfitting khi thêm nhiều bộ lọc | Lợi thế ảo | DSR + PBO + FDR với **số lần thử thật** được ghi log |

---

*Tài liệu này là đặc tả thiết kế, chưa có phần nào được triển khai. Các ngưỡng tham số là giá trị khởi điểm và sẽ được kiểm định lại trong P6 trước khi khoá cho production.*
