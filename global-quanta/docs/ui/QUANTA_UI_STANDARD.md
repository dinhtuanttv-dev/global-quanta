# QUANTA UI — chuẩn giao diện toàn dự án

Chốt ngày 27/11/2026. Lấy theo tab TỔNG QUAN (#394, #395). Mã nguồn chuẩn nằm ở `src/styles/quanta-ui.css`.

Để áp dụng cho một tab:
- Thêm class `q-ui` vào phần tử gốc của tab.
- Dùng biến `--q-*` trong CSS thuần hoặc inline style, hoặc dùng tiện ích Tailwind `q-*` (khai báo trong `tailwind.css`, ví dụ `text-q-accent`, `bg-q-surface-2`, `border-q-line`).

## Màu

| Vai trò | Token | Giá trị |
|---|---|---|
| Màu nhấn: đang chọn, liên kết, mã cổ phiếu bấm được, vạch tab, viền focus | `--q-accent` / `--q-accent-strong` | `#4f8ef7` / `#79a8ff` |
| Nền ô đang chọn / viền ô đang chọn | `--q-accent-soft` / `--q-accent-line` | xanh 14% / xanh 50% |
| Nền trang, thẻ, thẻ lồng, hàng đang chọn | `--q-bg`, `--q-surface`, `--q-surface-2`, `--q-surface-3` | `#080b11` → `#182033` |
| Viền (3 mức) | `--q-line`, `--q-line-2`, `--q-line-3` | trắng 6% / 10% / 16% |
| Chữ (4 mức) | `--q-text` … `--q-text-4` | `#f8fafc`, `#cbd5e1`, `#94a3b8`, `#8391a7` |

Màu có nghĩa được giữ nguyên và không dùng làm điểm nhấn trang trí:
- Tăng màu xanh lá, giảm màu đỏ.
- Cảnh báo màu vàng (`--warning`): "chưa kiểm định", dữ liệu cũ, |z| ≥ 2, lỗi tạm thời.
- Bảng điện Việt Nam: trần tím, sàn xanh lơ, tham chiếu vàng.
- Bậc bằng chứng (A/B/C), góc phần tư, màu chuỗi biểu đồ.

## Chữ

- Inter cho nhãn và tiêu đề. IBM Plex Mono (`font-variant-numeric: tabular-nums`) cho số liệu.
- Cỡ chữ nhỏ nhất là 11px. Thang chữ: 11,5 / 12 / 12,5 / 13 / 14–15.
- Không dùng nhãn in hoa giãn chữ; tiêu đề viết thường (sentence case). Dùng độ đậm 500 / 600; tránh 800–900.

## Bề mặt và tương tác

- Nền phẳng: không gradient, không phát sáng. Bo góc 6 / 8 / 10px.
- Trạng thái đang chọn:
  - Tab: gạch chân màu nhấn và chữ trắng.
  - Nút chuyển: nền `--q-accent-soft` và chữ `--q-accent-strong`.
- Viền focus 2px màu nhấn. Tôn trọng `prefers-reduced-motion`.
- Biểu đồ 2D/3D giữ màu thiết kế riêng. Ví dụ ở động cơ Truyền dẫn (`world-gq.css`): biến `--accent` được trả về vàng bên trong `svg` và bảng lan truyền.

## Trạng thái áp dụng

| Tab | Trạng thái |
|---|---|
| TỔNG QUAN | Đã áp dụng (#394, #395) |
| KẾT NỐI THẾ GIỚI | Đã áp dụng (PR chuẩn hoá KNTG) |
| PHÂN TÍCH NGÀNH, PHÂN TÍCH KỸ THUẬT, PHÂN TÍCH VĨ MÔ, PHÂN TÍCH CƠ BẢN, QUYẾT ĐỊNH | Chưa áp dụng |
| Thanh điều hướng chính (pill vàng) | Chưa đổi; cần quyết định riêng |
