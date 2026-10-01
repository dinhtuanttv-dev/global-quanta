# Market Data Gateway — SSI là nguồn chính, nguồn cũ là dự phòng

## Kiến trúc

```
SSI API v3 (SDK @ssi.developer/ssi-sdk) ─┐
SSI FC Data v2 (REST + SignalR)         ─┼─► SourceRouter ─► Normalizer + provenance ─► Store (memory | Supabase)
Nguồn cũ (Project A + Yahoo phía server)─┘   (breaker,          │                          ▲
                                              hysteresis)        ├─► REST /api/market/*     │ Jobs: securities, price limits,
                                                                 └─► StreamHub ─► SSE       │ EOD, reconcile, backfill
                                                                     (shard ≤50 mã/kết nối) │
```

- Mã nguồn: `backend/src/market/`, route `backend/src/routes/market.js`, client `src/services/marketDataClient.ts`.
- Mọi response có `provenance { source, asOf, isStale, fallbackReason }`. `source` ∈ `SSI_STREAM`, `SSI_V3`, `SSI_FC_V2`, `LEGACY`.
- Thứ tự nguồn mặc định từng dataset nằm trong `backend/src/market/config.js`. Có thể đổi bằng `MARKET_CHAIN_<DATASET>`.

### Quy tắc fallback

| Tình huống | Hành vi |
|---|---|
| Provider chưa cấu hình (VD chưa có `SSI_V3_API_KEY`) | Bỏ qua, không tính là fallback |
| Lỗi mạng, timeout, 5xx, 429, lỗi token | Thử nguồn kế tiếp, ghi vào circuit breaker |
| 3 lỗi trong 60s | Breaker mở 30s (thử lại thất bại thì cooldown tăng gấp đôi, tối đa 10 phút) |
| Quay lại SSI | Cần 3 lần thành công liên tiếp (hysteresis) |
| Tham số sai (400) | **Không** fallback, trả lỗi |
| SSI trả rỗng hợp lệ (`There is no data`, mã ngừng giao dịch) | **Không** fallback |

### Stream

- Trình duyệt mở **một** SSE: `GET /api/market/stream?symbols=FPT,HPG&indices=VNINDEX`.
- Backend chia mã thành các kết nối SignalR, mỗi kết nối tối đa 50 mã (`X:`), cộng một kết nối `MI:` cho chỉ số.
- Trạng thái từng mã: `LIVE` (có tick SSI mới), `FALLBACK` (giá từ nguồn dự phòng), `STALE`, `CLOSED` (ngoài phiên), `PENDING`.
- Trong phiên, nếu shard mất kết nối hoặc im lặng quá `MARKET_STALE_MS`, backend poll nguồn dự phòng mỗi `MARKET_FALLBACK_POLL_MS` và phát giá kèm nhãn nguồn.
- Watchdog: socket không nhận khung nào trong 60s thì bị đóng và nối lại với backoff + jitter.

### Kho dữ liệu, tự lành

- `MARKET_STORE=memory` (mặc định) hoặc `supabase` (migration `supabase/migrations/20261001000000_market_data.sql`).
- Bản ghi SSI không bao giờ bị nguồn dự phòng ghi đè (trigger DB, memory store làm tương tự).
- Job `reconcile` (15:50) lấy lại từ SSI các nến dự phòng trong 60 ngày gần nhất, ghi đè, và cảnh báo nếu lệch > 1%.

## Điểm lạ của SSI FC Data v2 (quan sát 01/10/2026)

| Endpoint | Hiện tượng | Xử lý |
|---|---|---|
| `Securities` | Chỉ trả vài mã; HNX trả `There is no data` | Ghép mã từ `DailyStockPrice` toàn sàn |
| `DailyOhlc` | Không có dữ liệu chỉ số | Chỉ số dùng `DailyIndex` (chỉ có giá đóng cửa), bổ sung O/H/L từ nguồn cũ khi giá đóng cửa khớp < 1% |
| `DailyIndex.Change` | Lệch tỉ lệ so với `RatioChange` | Tính lại từ `RatioChange` khi hai trường mâu thuẫn |
| `DailyStockPrice` toàn sàn | Có bản ghi rác (mã `0.8536:`, trần = 0) | Lọc theo mã hợp lệ và floor ≤ ref ≤ ceiling |
| `IntradayOhlc.Value` | Bằng giá khớp, không phải giá trị | Bỏ trường `value` |

Chưa kiểm chứng: SSI API v3 (chưa có khóa), giới hạn khoảng ngày thực tế của `DailyOhlc` (mặc định chia cửa sổ 30 ngày, đổi bằng `SSI_V2_MAX_RANGE_DAYS`), số kết nối SignalR đồng thời SSI cho phép.

## Bật theo từng bước

1. **Backend (local hoặc host riêng):** `cd backend && npm ci && npm test && npm start`. Không cần thêm cấu hình: dùng khóa FC Data v2 hiện có, kho `memory`.
2. **Frontend local:** `VITE_MARKET_GATEWAY_ENABLED=true`, `VITE_MARKET_API_BASE_URL=` (trống, Vite proxy `/api` sang :4000). Lưu ý `.env` hiện đặt `VITE_API_BASE_URL` trỏ sang Project A; biến đó vẫn dùng cho các API chưa chuyển.
3. **Host Gateway** (cần tiến trình chạy liên tục, không dùng Vercel serverless): `backend/Dockerfile` chạy được trên Railway, Fly.io hoặc VPS. Đặt `FRONTEND_ORIGIN` (cho phép nhiều domain, phân tách bằng dấu phẩy).
4. **Production frontend (Vercel):** đặt `VITE_MARKET_GATEWAY_ENABLED=true` và `VITE_MARKET_API_BASE_URL=https://<gateway>`.
5. **Kho bền vững:** chạy migration trên Supabase, đặt `MARKET_STORE=supabase` và `MARKET_INGESTOR_ENABLED=true`.
6. **Scanner/backtest:** Express đặt `HISTORICAL_DATA_SOURCE=market_service`; Vercel `api/scan.js` đặt `HISTORICAL_DATA_SOURCE=market_gateway` cùng `MARKET_GATEWAY_URL`.
7. **SSI v3 (tùy chọn):** đặt `SSI_V3_API_KEY` và `SSI_V3_API_SECRET`. Kênh v3 tự trở thành nguồn REST đầu tiên trong chuỗi; stream vẫn dùng FC v2 vì stream v3 cần OTP.

## Siêu Quét AI trên Gateway

Engine quét chạy trên Gateway (thay cron `sieu-quet-scan` của Project A), một lượt cho toàn universe.

- **Công thức:** chuyển nguyên văn từ Project A commit `9306bc3` (`backend/src/market/scanner/formulas.js`). Golden test so với bản gốc (`backend/test/fixtures/projectA/`): từng hàm (`scannerParity.test.js`) và cả vòng lặp quét (`scannerEngine.test.js`).
- **Khác bản cũ (đã duyệt):** (a) RS Rating, percentile FA, Breadth tính trên toàn universe thay vì lô ≤100 mã; (b) nến từ SSI (`DailyStockPrice`, giá điều chỉnh); (c) cờ NN mua ròng = top 5 HOSE theo giá trị mua ròng từ SSI; (d) sự kiện đã xác nhận đọc từ Project A `/api/sieu-quet-ai/events`.
- **Universe:** top `SCANNER_UNIVERSE_SIZE` (300) theo GT khớp bình quân 20 phiên trên HOSE/HNX/UPCoM, ngưỡng `SCANNER_MIN_AVG_VALUE` (1 tỷ) + mã ghim (17 mã cổ tức + universe Project A). Đo ngày 01/10/2026: 276 mã đạt ≥ 1 tỷ. Ngành: DIVIDEND_STOCKS > universe Project A > ngành Siêu Quét hiện tại > TradingView (chỉ nhãn ngành) > `Khac`.
- **Dữ liệu ngày toàn thị trường:** `DailyStockPrice` theo sàn (~9 request/phiên cho cả thị trường). Sự kiện quyền: mỗi ngày tải lại phiên trước, nếu giá điều chỉnh đổi thì nhân lại toàn bộ lịch sử của mã đó (`market_apply_adjustment`).
- **Lịch (giờ VN):** `syncMarketDaily` 15:20, `scanUniverse` 15:40 (ngày giao dịch); `refreshFundamentals` Thứ Bảy 09:00; `buildUniverse` Chủ nhật 20:00; `backfillMarketDaily` 02:30 (chạy tiếp được, bỏ qua phiên đã có).
- **API:** `GET /api/market/scanner` (cùng định dạng Project A + `dataAsOf`, `meta`), `GET /api/market/scanner/universe`, `GET /api/market/scanner/:symbol/volume` (dòng phụ phân tích khối lượng).
- **Frontend:** `VITE_SCANNER_SOURCE=gateway`. Nếu Gateway chưa có kết quả, bảng tự dùng Project A và ghi rõ nguồn. Nhấn đúp (hoặc Enter) một dòng để mở dòng phụ, Esc để đóng. Realtime chỉ đăng ký cho các dòng đang hiển thị.
- **Triển khai lần đầu:** chạy migration `20261002000000_market_scanner.sql`, đặt `MARKET_STORE=supabase`, `MARKET_INGESTOR_ENABLED=true`, rồi lần lượt `POST /api/market/admin/jobs/{backfillMarketDaily,buildUniverse,refreshFundamentals,scanUniverse}`.

## Nhịp & xác suất khối lượng trong phiên (dòng phụ)

`GET /api/market/scanner/:symbol/intraday-cycle` — `backend/src/market/scanner/intradayModel.js` (hàm thuần) + `intradayService.js`.

- **Dữ liệu:** nến 1 phút SSI `IntradayOhlc` (SSI lưu ≥ 12 tháng; 1 request = 30 ngày, ~5 trang). 120 phiên lịch sử gom 17 khung: ATO · 9 khung 15' sáng · 6 khung 15' chiều · ATC. Lịch sử lưu đệm tới hết ngày; hôm nay làm mới 60s trong phiên (không mở thêm kết nối stream).
- **Hồ sơ điển hình:** trung vị/p25/p75 KL từng khung trên thang log, tỷ trọng lũy kế -> RVOL theo thời điểm (chia tỷ lệ phút trong khung đang chạy) và dự phóng KL cuối phiên.
- **Xác suất có điều kiện:** trạng thái đầu khung = biến động giá so tham chiếu (5 mức) × vị trí so VWAP × RVOL lũy kế (3 mức). Kết cục khung kế tiếp: bùng nổ (≥2× trung vị khung), cạn (≤0,5×), chiều giá. Ước lượng `p = (k + α·p_nền)/(n + α)`, α = 20, khoảng tin cậy 90% (Beta), `n < 15` = ít mẫu.
- **Kiểm định walk-forward:** dự báo phiên d chỉ bằng các phiên < d; Brier skill so với mức nền của chính khung. Chỉ công nhận khi skill > 0 và có ≥ 20 lần sự kiện xảy ra (tránh skill ảo khi sự kiện quá hiếm — đã có test).
- **Ma trận giá – khối lượng:** 9 ô (chiều giá × mức KL), ma trận chuyển giữa các khung (làm mượt), xác suất chạm "KL cao + tăng/giảm" trong 2 khung tới (trạng thái hấp thụ).
- Đây là **xác suất lịch sử đã hiệu chỉnh**, không phải dự báo chắc chắn; UI luôn hiện n, khoảng tin cậy, mức nền và trạng thái kiểm định.

**Sửa ở dòng phụ phân tích khối lượng:** trong phiên RVOL so với KL cùng thời điểm (không so KL cả ngày); khối ngoại hôm nay hiển thị "chưa có" thay vì 0; nhận định dùng RVOL theo thời điểm.

**VCI:** `iq.vietcap.com.vn` trả 403 nếu thiếu `Origin`/`Referer` của `trading.vietcap.com.vn` (đo 01/10/2026). Job BCTC không lưu bản ghi lỗi (để thử lại lần chạy sau).

## IFE — Intent Footprint Engine (bản đồ ý đồ dòng tiền)

`GET /api/market/scanner/:symbol/intent` — `backend/src/market/scanner/ife.js` (hàm thuần), kiểm chứng `ifeValidation.js` (job `ifeValidate` 15:50, lưu `ife:validation`).

1. **Dòng lệnh có dấu:** Lee–Ready trên tick X của StreamHub (phiên hiện tại, mã đang được theo dõi; KL = ΔTotalVol, chiều so với bid/ask TRƯỚC lệnh, giữa thì tick rule) — dùng khi phủ ≥ 60% KL liên tục; còn lại Bulk Volume Classification trên nến phút `buy% = Φ(Δp/σ)`. ATO/ATC tách riêng (khớp định kỳ).
2. **Nỗ lực – Kết quả – Tác động:** z vững (trung vị/MAD theo khung, 60 phiên) của delta chuẩn hoá và lợi suất khung; λ Kyle (hồi quy qua gốc). Cờ: hấp thụ bán/mua, đẩy mua/đạp bán, cạn kiệt, thủng thanh khoản (ngưỡng công khai trong `bucketFlags`).
3. **Chữ ký thực thi:** tự tương quan delta trong phiên/theo phiên, Hurst R/S, CV tỷ lệ tham gia, lặp kích thước lệnh (chỉ khi có tick), cụm khớp dồn tại một giá (H = L, KL ≥ 5× trung vị phút).
4. **Stealth Score 1/5/20 phiên:** cường độ dòng lệnh "tay to" (phút KL ≥ p95) × độ êm (giá thực so với giá kỳ vọng theo λ ngày) × bền bỉ; **z theo thứ hạng** (vững khi phân phối dồn về 0 — lỗi MAD≈0 đã có test). Phân kỳ tay to – tay nhỏ 20 phiên.
5. **HMM diễn giải được:** 5 trạng thái (gom chủ động / gom thụ động / xả chủ động / xả thụ động / trung tính) với nguyên mẫu CỐ ĐỊNH, lọc tiến; tách **cả phiên** (HMM theo phiên, z trượt) và **khung gần nhất** (HMM theo khung) — không trình bày lẫn.
6. **Kiểm chứng toàn universe:** BVC ngày, trạng thái lọc tiến, ba rào chắn 5 phiên ±1,5 ATR, kiểm định hai tỷ lệ + Benjamini–Hochberg (q = 0,1), cùng chiều hai nửa thời gian, n ≥ 100. Test chứng minh: công nhận khi có quan hệ thật, không công nhận trên dữ liệu ngẫu nhiên.

Giới hạn: không có danh tính tài khoản ở VN — IFE là suy luận xác suất. Tick chỉ giữ trong bộ nhớ của phiên hiện tại cho tới khi bật Supabase.

**Giai đoạn 0 (sửa lỗi trên production):** "đột biến lớn nhất" bỏ ATO/ATC; "So cùng thời điểm" dùng trung vị 20 phiên (thống nhất với Nhịp, UI lấy cùng một nguồn); phân bổ KL theo giá 20 phiên từ bộ đệm nến phút dùng chung; dòng phụ cuộn vào tầm nhìn một lần khi mở.

## Hạ tầng hiện tại (Railway)

- Project `global-quanta-gateway`, service `gateway`, URL `https://gateway-production-1da0.up.railway.app`.
- **Nguồn:** GitHub `dinhtuanttv-dev/global-quanta`, nhánh `main`. Merge vào `main` có thay đổi trong `global-quanta/backend/**` sẽ tự deploy (watch path `/global-quanta/backend/**`).
- **Build:** root directory `global-quanta/backend`, `Dockerfile`. Healthcheck `/health` (timeout 60s), restart `ON_FAILURE` (tối đa 10 lần).
- **Vùng:** Singapore (`asia-southeast1`), 1 replica. Chỉ chạy 1 replica vì mỗi replica tự giữ kết nối SSI và kho `memory` riêng.
- Các thiết lập trên lưu trong cấu hình service (không dùng `railway.json`, định dạng này hết hạn 01/12/2026). Không dùng `railway config apply` (IaC) khi chưa khai báo đủ biến môi trường, vì IaC xoá mọi biến không khai báo.
- `FRONTEND_ORIGIN`: `https://global-quanta.vercel.app`, `https://global-quanta-*-dinhtuanttv-devs-projects.vercel.app`, `https://dinhtuan-ck.vercel.app`, `https://dinhtuan-*-dinhtuanttv-devs-projects.vercel.app`, `http://localhost:5173`.

## Vận hành

- `GET /api/market/status`: phiên, trạng thái provider và breaker, shard stream, lịch và kết quả job, sự kiện chuyển nguồn gần nhất.
- `POST /api/market/admin/jobs/<syncSecurities|syncPriceLimits|syncEod|reconcile|backfill>` với header `Authorization: Bearer $MARKET_ADMIN_TOKEN`.
- Cảnh báo Telegram (dùng `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` có sẵn) khi breaker SSI mở/đóng, stream mất kết nối trong phiên, EOD lỗi trên 50%, hoặc phát hiện lệch giá khi đối soát. Tắt bằng `MARKET_ALERTS_ENABLED=false`.
- Ngày nghỉ lễ: `MARKET_HOLIDAYS=2026-01-01,...` để không bị báo STALE oan.

## Kiểm thử

- Backend: `cd backend && npm test` (node:test, gồm sharding, freshness, fallback, hysteresis, tự lành, và các điểm lạ của SSI).
- Frontend: `npm test` (vitest, client và nhãn trạng thái nguồn).
