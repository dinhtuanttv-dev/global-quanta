# Trading Matrix — Sổ tay vận hành (M6)

**Ngày:** 22/10/2026 · **Phạm vi:** tab Siêu Quét AI → Trading Matrix (M0–M6) · **Căn cứ:** spec §11 Phase 6

## 1. Thành phần và lịch chạy (giờ Việt Nam)

| Job | Giờ | Việc làm | Lưu ở |
|---|---|---|---|
| `syncMarketDaily` | 15:20 | Dữ liệu ngày toàn thị trường từ SSI | Kho cục bộ `md/<ngày>` |
| `scanUniverse` | 15:40 | Kết quả Siêu Quét | KV `scanner:latest` (cục bộ + bản sao) |
| `scanStructure` | 15:47 | Tóm tắt cấu trúc MTF | Volume `structure/summary` |
| `researchFlow` … | 16:00–16:40 | HMM, dấu chân lệnh, Bayes | Bảng nghiên cứu (cục bộ) |
| **`matrixSnapshot`** | **16:50** | Snapshot 3 phạm vi, sổ tín hiệu (chuyển trạng thái), sổ dự báo, chấm kết quả T+1/3/5/10, kiểm trôi mô hình | Bảng cục bộ `market_matrix_*` (KHÔNG sao Supabase) |
| `pruneLocal` | 03:45 | Xoá dòng lệnh theo phút > 90 ngày | Kho cục bộ |
| `bootstrapLocal` | tự động 60 giây sau khởi động nếu Volume thiếu dữ liệu | Dựng lại 260 phiên + universe + BCTC + quét từ SSI / VCI | Kho cục bộ |

## 2. Endpoint

| Endpoint | Mục đích |
|---|---|
| `GET /api/market/trading-matrix/overview?scope=VNINDEX\|VN30\|UNIVERSE` | Dải 6 ô + kịch bản + cờ rủi ro + dự báo |
| `GET /api/market/trading-matrix/sectors?scope=` / `movers?scope=` | Heatmap ngành / mã biến động đáng chú ý |
| `GET /api/market/trading-matrix/signals?scope=` | Sổ tín hiệu, kết quả thực tế, kiểm định đặt trước |
| `GET /api/market/trading-matrix/history?scope=` | Lịch sử snapshot |
| `GET /api/market/trading-matrix/ops` | Báo cáo vận hành |
| `GET /api/health/db-budget` | Egress Supabase, kho đệm, **kho cục bộ + tiến độ tự dựng lại** |
| `POST /api/market/trading-matrix/admin/model` `{ "id": "B0-breadth" }` | Quay lui / chọn phiên bản mô hình (Bearer `MARKET_ADMIN_TOKEN`) |
| `POST /api/market/trading-matrix/admin/replay` `{ "scope": "VNINDEX", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" }` | Phát lại snapshot sau khi sửa dữ liệu — bảng `market_matrix_replay`, không ghi đè sổ |
| `POST /api/market/admin/jobs/<tên job>` | Chạy tay một job (VD `bootstrapLocal`, `matrixSnapshot`) |

## 3. Cảnh báo tự động (Telegram vận hành — notifyOps)

| Khoá | Khi nào | Xử lý |
|---|---|---|
| `matrix:unavailable` | Nguồn bắt buộc (dữ liệu ngày, VN-Index) không khả dụng 2 snapshot liên tiếp | Xem `/ops` → `dataGaps`, `/db-budget` → `bootstrap`; chạy `bootstrapLocal` |
| `matrix:drift` | Brier 60 phiên thực tế > Brier holdout + 0,03 trong 2 lần kiểm liên tiếp | Cân nhắc `admin/model` về phiên bản trước; ghi nhật ký |
| `egress:*` | Egress Supabase vượt ngưỡng | Đã giảm ≈ 0 nhờ kho cục bộ; kiểm `local.replica` |

## 4. Nút dừng khẩn cấp (vận hành — không phải cờ tính năng)

- `MARKET_LOCAL_STORE=off` → bỏ kho cục bộ, đọc Supabase như trước M0.
- Mô hình: `admin/model` về `B0-breadth` (champion) hoặc `B1-base`.
- Quy tắc kịch bản: revert commit đổi `RULE_VERSION`; sổ tín hiệu giữ nguyên dòng cũ (có `rule_version`).

## 5. Diễn tập sự cố (đã có kiểm thử tự động)

| Sự cố | Hành vi mong đợi | Kiểm thử |
|---|---|---|
| SSI ngắt | Ô trong phiên UNAVAILABLE; ô cuối phiên vẫn hiện; sức khoẻ PARTIAL | `tradingMatrix.test.js` |
| Supabase khoá / chậm | Kho cục bộ phục vụ; cầu dao 15 phút | `localStore.test.js` |
| Gateway mất | Giao diện báo không khả dụng; bảng Siêu Quét vẫn hiện; tự khôi phục từ Volume | `TradingMatrixPanel.test.tsx` |
| Project A / Neon lỗi | RF1 + sự kiện UNAVAILABLE có lý do | `tradingMatrix.test.js` |
| Volume trống | `bootstrapLocal` tự chạy | `localStore.test.js` |
| Luồng giá mất kết nối | REST snapshot tiếp tục; DELAYED / STALE theo tuổi dữ liệu | `tradingMatrix.test.js` |

## 6. Đổi quy tắc / mô hình (không chỉnh ngưỡng âm thầm)

1. Viết prereg mới (`backend/src/market/tradingMatrix/M*-prereg.md`) và commit TRƯỚC khi đo.
2. Tăng `RULE_VERSION` (VD `M3-r2`) hoặc thêm mô hình vào sổ đăng ký (`scripts/matrix-models.mjs --write-registry`).
3. Chạy `scripts/matrix-validate.mjs` / `scripts/matrix-models.mjs` trên dữ liệu SSI (`scripts/structure-fetch.mjs`), ghi kết quả vào prereg.
4. Thêm dòng vào `RULE_CHANGELOG` (`matrixOps.js`).
5. Chỉ kịch bản ĐẠT mới được hiện "Xác nhận"; mô hình chỉ thay champion khi qua cổng thăng hạng.

## 7. Lưu giữ và ngân sách gói miễn phí

- Snapshot, sổ tín hiệu, sổ dự báo, phát lại: bảng cục bộ trên Volume (vài KB / phiên), giữ vĩnh viễn.
- Dòng lệnh theo phút: 90 ngày. Volume 500 MB — theo dõi `local.diskMb` ở `/db-budget`.
- Supabase: chỉ nhận bản sao ghi nền (ingress) + đọc một lần khi thiếu → egress ≈ 0. Neon: không còn phụ thuộc.
