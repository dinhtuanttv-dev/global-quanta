# Super Chart — SC1 → SC5: workspace tab TA VN-Index

Phần A (Chart + bảng điều khiển) được tổ chức lại thành một **workspace**; Phần B (các bộ lọc) giữ nguyên cấu trúc, chỉ bắt đầu
ngay sau Phần A. Không đổi công thức / kết quả engine: vân tay SHA-256 của mọi engine & scene (SC0) vẫn khớp.

## Bố cục

```
┌ Thanh đầu: mã · giá · 1m 5m 15m 1H | D W M · 1T 3T 6T 1N 3N Tất cả · ⓘ nguồn dữ liệu · preset · ☁ · ⌘K · ⛶ ┐
├ Thanh công cụ: bám nến − + vừa khung mới nhất | Trend Zone Fib Fib-time Ext Đếm-sóng | ↶ ↷ 🗑 Đối tượng(n) | Lớp & pane · Confluence · Cấu trúc MTF | PNG · Bảng chi tiết ┤
├ Chart (chú giải OHLC theo crosshair, tiêu đề + ✕ từng pane, "+n nhãn ẩn", chip Elliott Pro / Cấu trúc / mẫu hình) │ Bảng chi tiết ┤
└ Dock: Cấu trúc MTF │ Elliott Pro │ SMC·VSA·Wyckoff │ Dòng tiền │ Chỉ báo │ Backtest │ Nhật ký — kéo đổi cao, thu gọn ┘
```

Bố cục chọn theo **bề rộng của chính workspace** (CSS container queries + ResizeObserver), không theo màn hình — vì thanh Elite bên
phải làm workspace hẹp hơn màn hình: ≥ 1100px bảng chi tiết cố định · 760–1099px ngăn kéo · < 760px thanh hành động dưới (Vẽ · Lớp ·
Phân tích · Đối tượng · Thêm) mở bảng trượt `<dialog>`; dock di động mặc định thu gọn. Cảm ứng: vùng chạm ≥ 44px; `prefers-reduced-motion`.

## Công nghệ

| Thành phần | Kỹ thuật |
|---|---|
| Store bố cục | `useSyncExternalStore` (React 18, không xé khung khi render đồng thời) · localStorage tức thì · `BroadcastChannel` đồng bộ giữa tab · Gateway `/api/market/workspace` theo tài khoản (gom 1,5s, bản mới thắng, schema có phiên bản, làm sạch hai phía) |
| Menu / hộp thoại | HTML **Popover API** gốc (top-layer, light-dismiss; tự rơi về div khi trình duyệt chưa hỗ trợ) · `<dialog>.showModal()` (khoá focus gốc) cho xác nhận, bảng lệnh, phím tắt, bảng trượt |
| Biểu đồ | Lightweight Charts v5: `subscribeCrosshairMove` (chú giải, cập nhật qua requestAnimationFrame) · `takeScreenshot` (PNG gồm lớp phủ) · `IPaneApi` (vị trí / tỷ lệ pane, nhớ tỷ lệ người dùng kéo) · CrosshairMode.MagnetOHLC |
| Hình vẽ | Lịch sử ảnh chụp bất biến (undo/redo 50 bước, ghi một lần mỗi thao tác kéo) · hit-test thuần trong toạ độ của thư viện (dung sai cảm ứng lớn hơn) · Pointer Events pha capture (khoá cuộn biểu đồ TRƯỚC khi thư viện nhận khi kéo hình) · tên / ẩn / khoá lưu cùng hình (máy + đám mây) |
| Bảng lệnh | ⌘/Ctrl + K, tìm mờ không dấu (NFD), ARIA combobox/listbox, ~60 lệnh (lớp, preset, vẽ, khung, khoảng nhìn, dock, bố cục) |
| Kiểm thử | Vitest (mô hình, store, lịch sử, hit-test, tìm lệnh, vân tay engine) · E2E Node 24 chạy TypeScript trực tiếp + Playwright 1.63 với "đường mở" theo bố cục |

## Quyết định đã duyệt → hiện thực
1. Bảng chi tiết phải + dock dưới, thu gọn được. 2. 6 preset + "Bố cục của tôi" (chỉ đổi lớp hiển thị). 3. Bố cục theo tài khoản, hình vẽ
theo mã (schema cũ giữ nguyên, thêm trường tuỳ chọn tên / ẩn / khoá). 4. Đổi mã / khung: tự huỷ nét vẽ dở + thông báo. 5. Ba bố cục theo
bề rộng workspace, chạm 44px. 6. Không làm H4. 7. Undo/redo 50 bước. 8. Bảng chi tiết = tóm tắt, dock = bảng sâu. 9. Bật ngay, nút
"Bố cục cổ điển" (xếp dọc như cũ) giữ 2 tuần — gỡ khi E2E bảo toàn đạt + anh xác nhận.

## Nối lại khoanh vùng mẫu hình (phát hiện SC0)
Pattern Scanner v2 → bảng phụ → "Mở biểu đồ TA" truyền vùng ngày của mẫu đang chọn (tham số tuỳ chọn, không đổi cấu trúc bộ lọc) →
chart khoanh vùng + chip "Mẫu hình …" có nút bỏ khoanh vùng.
