# Super Chart — SC0: bản nền + hàng rào bảo toàn (tab TA VN-Index)

Anh duyệt phương án + 9 lựa chọn ngày 24/10/2026. Phạm vi: **Phần A — Chart + bảng điều khiển** (nâng cấp); **Phần B — các bộ lọc**
(giữ nguyên cấu trúc). SC0 không đổi giao diện: chỉ dựng ba hàng rào để SC1–SC6 không làm mất tính năng / không đổi kết quả.

## 1. Ba hàng rào

| Hàng rào | Tệp | Bắt lỗi gì |
|---|---|---|
| Bản kê bảo toàn (57 tính năng, 10 nhóm, vị trí hiện tại → đích) | `src/components/MainTabs/TaVnIndex/workspace/parityManifest.ts` | Tính năng bị bỏ quên khi dời chỗ |
| Kiểm tĩnh bản kê | `…/workspace/parityManifest.test.ts` | Selector trỏ tới testid không còn tồn tại; lớp mới không có dòng kiểm |
| E2E bảo toàn (Node 24 chạy TypeScript trực tiếp + Playwright 1.63) | `backend/e2e/ta-parity.ts` | Nút còn nhưng KHÔNG chạy (bật/tắt lớp + đếm pane, vẽ thật bằng chuột, phím tắt, lưu cách đếm Elliott, sự kiện bàn giao từ bộ lọc, đầu dò ghim nến) |
| Vân tay đầu ra engine (SHA-256 JSON chuẩn hoá) | `src/lib/ta-command-center/engineBaseline.test.ts` + `__baseline__/engineBaseline.json` | Đổi bố cục làm đổi công thức / kết quả: analyze, SMC, VSA, Wyckoff, backtest CHoCH, RSI/MACD/ADX, Elliott (MTF, cây v3, kịch bản), scene đầy đủ lớp, Cấu trúc MTF (doc, scene 3 chế độ, marker, thang giá) — FPT & VNINDEX × D & W, dữ liệu SSI thật 800 phiên |

Chạy E2E: `node e2e/ta-parity.ts --base <url> --out <dir> --pw-file <file> [--local-auth http://localhost:8787]` (từ `backend/`).
Mã thoát ≠ 0 khi có tính năng hỏng hoặc lỗi trang → là cổng bắt buộc của mọi PR SC1–SC6 (desktop 1440 · tablet 1024 · di động 390).

## 2. Kết quả bản nền (giao diện hiện tại, 24/10/2026, mã FPT, dữ liệu SSI thật)

| Khung nhìn | Bảo toàn | Mép trên chart | Chart cao | Bộ lọc bắt đầu | Lỗi trang |
|---|---|---|---|---|---|
| Desktop 1440×900 | 57/57 | 294 px | 630 px | 1.476 px | 0 |
| Tablet 1024×768 | 57/57 | 337 px | 538 px | 1.513 px | 0 |
| Di động 390×844 | 57/57 | 458 px | 591 px | 2.017 px | 0 |

Ảnh: `sc0/baseline-{desk,tablet,m390}-top.png`; chi tiết từng tính năng: `sc0/parity-report.json`.
Mục tiêu sau nâng cấp (đã duyệt): mép trên chart ≤ 140 px (desktop), ≤ 170 px (di động); Phần B bắt đầu ngay sau Phần A.

## 3. Phát hiện khi dựng bản nền

1. **Khoanh vùng mẫu hình từ bộ lọc lên chart KHÔNG còn nối dây**: `TaVnIndexTab` chỉ truyền mã (`onSelectTicker`), không truyền
   `highlightPattern` xuống `TaCommandCenterTab → TVChartPanel` (đường này có từ Pattern Scanner cũ của Project A). Đưa vào SC4:
   nối lại bằng một tham số tuỳ chọn (không đổi cấu trúc bộ lọc).
2. Lịch sử cách đếm Elliott chỉ hiện khi đã lưu ≥ 1 phiên bản; nút lưu bị khoá tới khi bản nháp hợp lệ — đúng thiết kế,
   E2E kiểm bằng chu trình thật (đặt điểm trên chart → lưu → thấy lịch sử).
3. Tài liệu kiến trúc có ba điểm đã cũ so với mã (đã điều chỉnh trong bản kê): khung 1m/5m/15m/1H/D/W/M đều chạy; công cụ
   Elliott 6 điểm + gợi ý Zigzag đã thay bằng "Chỉnh tay cách đếm" (EP4); có thêm VP, AVWAP, Order Flow, Khối ngoại,
   Elliott Pro, Pring, Cấu trúc MTF.
4. SC0 chỉ thêm thuộc tính kiểm thử (`data-tool`, `data-testid` cho Smart Note, Oscillator, Fib Ext, Confluence, Xoá hình vẽ;
   `aria-pressed` / `aria-label` cho công cụ vẽ) — không đổi hiển thị hay hành vi.

## 4. Quyết định đã duyệt (áp dụng cho SC1–SC6)
1. Bảng chi tiết bên phải + dock dưới, thu gọn được. 2. Preset: Giá sạch (mặc định) · Giá + KL · Cấu trúc · Động lượng · Elliott ·
Vẽ tay + "Bố cục của tôi" (chỉ đổi lớp / bố cục). 3. Bố cục lưu theo tài khoản; hình vẽ theo mã (không đổi schema cũ).
4. Đổi mã / khung: tự huỷ nét vẽ dở + thông báo. 5. ≥ 1280 desktop · 768–1279 tablet · < 768 di động; zoom 200%; chạm 44 px.
6. Chưa làm H4. 7. Undo/redo 50 bước (tạo / xoá / sửa / xoá tất cả). 8. Bảng chi tiết = tóm tắt; dock = bảng sâu.
9. Bật ngay, giữ nút "Bố cục cổ điển" 2 tuần; gỡ sau khi E2E bảo toàn đạt + anh xác nhận.
