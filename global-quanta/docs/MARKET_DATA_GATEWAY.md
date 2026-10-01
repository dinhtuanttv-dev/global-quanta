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

## Vận hành

- `GET /api/market/status`: phiên, trạng thái provider và breaker, shard stream, lịch và kết quả job, sự kiện chuyển nguồn gần nhất.
- `POST /api/market/admin/jobs/<syncSecurities|syncPriceLimits|syncEod|reconcile|backfill>` với header `Authorization: Bearer $MARKET_ADMIN_TOKEN`.
- Cảnh báo Telegram (dùng `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` có sẵn) khi breaker SSI mở/đóng, stream mất kết nối trong phiên, EOD lỗi trên 50%, hoặc phát hiện lệch giá khi đối soát. Tắt bằng `MARKET_ALERTS_ENABLED=false`.
- Ngày nghỉ lễ: `MARKET_HOLIDAYS=2026-01-01,...` để không bị báo STALE oan.

## Kiểm thử

- Backend: `cd backend && npm test` (node:test, gồm sharding, freshness, fallback, hysteresis, tự lành, và các điểm lạ của SSI).
- Frontend: `npm test` (vitest, client và nhãn trạng thái nguồn).
