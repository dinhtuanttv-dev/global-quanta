# 01 — Quy chuẩn QUANTA UI v2

Lấy từ tab **Tổng quan** (bảng giao dịch, thị trường) và mở rộng thành quy chuẩn cho toàn dự án. Mọi giá trị qua **token** — không viết cứng hex trong thành phần.

## 1. Màu

### 1.1 Bề mặt và chữ (giữ nguyên giá trị của `quanta-ui.css`)

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--q-bg` | `#080b11` | nền trang |
| `--q-surface` | `#0e131f` | thẻ, khung |
| `--q-surface-2` | `#131a29` | thẻ lồng, ô nhập, hàng chọn |
| `--q-surface-3` | `#182033` | rê chuột, ô đang mở |
| `--q-line` / `-2` / `-3` | trắng 6% / 10% / 16% | viền nhạt / viền thẻ / viền nhấn nhẹ |
| `--q-text` | `#f8fafc` | tiêu đề, số chính |
| `--q-text-2` | `#cbd5e1` | nội dung |
| `--q-text-3` | `#94a3b8` | nhãn phụ |
| `--q-text-4` | `#8391a7` | chú thích, nguồn |

Không dùng `bg-slate-800/900/950`, `#161D2E`, `#1E273D`, `#0B0F19` (hệ cũ) trong thành phần mới.

### 1.2 Một màu nhấn — xanh dương

| Token | Giá trị | Vai trò |
|---|---|---|
| `--q-accent` | `#4f8ef7` | vạch tab, viền focus, nút chính, thanh tiến độ |
| `--q-accent-strong` | `#79a8ff` | chữ đang chọn, **mã cổ phiếu bấm được**, liên kết |
| `--q-accent-soft` | xanh 14% | nền nút / chip đang chọn |
| `--q-accent-line` | xanh 50% | viền nút / chip đang chọn |

### 1.3 Màu có nghĩa (không trang trí)

| Ý nghĩa | Token đề xuất | Giá trị | Ghi chú |
|---|---|---|---|
| Tăng / ủng hộ | `--q-up` | emerald-300/400 | chỉ khi có chiều dữ liệu |
| Giảm / bất lợi | `--q-down` | rose-300/400 | |
| Cảnh báo | `--q-warn` | `#fbbf24` (amber-400) | luôn kèm ký hiệu ⚠ / ! và chữ |
| Nghiêm trọng | `--q-critical` | rose-400 + nền rose 10% | |
| Bảng điện VN | `--vn-ceil` tím · `--vn-floor` xanh lơ · `--vn-ref` vàng | quy ước sàn | **chỉ** trong bảng giá / giá |
| Dấu bằng chứng | ĐẠT xanh lá · MỘT PHẦN xanh nhấn · KHÔNG ĐẠT đỏ · còn lại trung tính | | đã áp ở Hồ sơ 360° (LayerMatrix) |

**Vàng / amber chỉ cho cảnh báo và giá tham chiếu.** Vàng Quanta `#E8B84B / #F5CE72` không còn là màu nhấn.

## 2. Chữ

| Vai trò | Phông | Ghi chú |
|---|---|---|
| Nhãn, tiêu đề, nội dung | **Inter** (`--q-font-sans`) | |
| Số liệu, mã, giá, phần trăm | **IBM Plex Mono** (`--q-font-mono`), `tabular-nums` | lớp `font-mono` hoặc `.num` |
| Logo "ĐINH TUẤN" | Space Grotesk | **ngoại lệ duy nhất** (Q3) |

Không dùng `ui-monospace` / `monospace` hệ thống thay cho IBM Plex Mono.

### 2.1 Thang cỡ chữ

| Bậc | Cỡ | Dùng cho |
|---|---|---|
| `q-fs-dense` | **10px** | **chỉ** lưới số dày có khai báo `q-dense`: bảng giá, ma trận, bảng nhiều cột |
| `q-fs-xs` | 11px | chú thích, nguồn, nhãn phụ (tối thiểu ngoài lưới dày) |
| `q-fs-sm` | 11,5–12px | nội dung bảng, chip, nút |
| `q-fs-md` | 12,5–13px | tiêu đề khối |
| `q-fs-lg` | 15px | mã đang xem, tiêu đề trang |
| `q-fs-xl` | 18–20px | số chính (KPI) |

Nhãn **không in hoa, không giãn chữ** (`uppercase`, `tracking-*` bị trung hoà trong `.q-ui`). Đậm tối đa 700.

## 3. Trạng thái tương tác

| Trạng thái | Kiểu chuẩn |
|---|---|
| Tab đang chọn (thanh tab ngang) | chữ `--q-text`, vạch dưới 2px `--q-accent` (`.q-tab`) |
| Nút / chip đang bật (`aria-pressed`) | viền `--q-accent-line`, nền `--q-accent-soft`, chữ `--q-accent-strong` |
| Rê chuột | nền `--q-surface-3` hoặc viền `--q-line-3` |
| Focus bàn phím | viền 2px `--q-accent`, lệch 1px |
| Vô hiệu | độ mờ 0,45, không đổi màu |

## 4. Bề mặt và hình khối

- **Nền phẳng**, không gradient — trừ biểu đồ (vùng miễn trừ).
- Thẻ: `.q-card` (bo 10px, viền `--q-line-2`); thẻ lồng `.q-card-2`.
- Bo góc: 6px (chip, nút), 8px (khối nhỏ), 10px (thẻ). Không dùng `rounded-2xl`, `rounded-full` cho thẻ.
- Đổ bóng: không dùng cho thẻ trong tab; chỉ cho lớp nổi (menu thả, hộp thoại).

## 5. Thành phần chuẩn

| Thành phần | Mẫu ở tab Tổng quan | Ghi chú |
|---|---|---|
| Thanh tab con | `OverviewTab` (Bảng giao dịch / Thị trường) | `role=tablist`, phím ← → |
| Chip lọc | bộ lọc ngành, nút sàn | kiểu `aria-pressed` §3 |
| Bảng số | `ScannerTables.css` | đầu cột Inter 11px, số Plex Mono, hàng xen kẽ `--q-line` |
| Huy hiệu nhãn bằng chứng | EXPERIMENTAL / MÔ TẢ / THĂM DÒ | viền mảnh, chữ 11px, **không nền vàng đặc** |
| KPI | dải chỉ số thị trường | số Plex Mono 18–20px, nhãn 11px `--q-text-3` |
| Biểu tượng | lucide (menu chính) | 14–16px, `currentColor`; không emoji trong nhãn |

## 6. Ngoại lệ được phép (khai báo, không tuỳ tiện)

| Ngoại lệ | Phạm vi | Cách khai báo |
|---|---|---|
| Biểu đồ 2D / 3D | SVG / canvas / WebGL, sơ đồ Evidence Brain, RRG 4D, radar, Kqkd3D, biểu đồ cột / đường | `data-ui-exempt="chart"` trên gốc biểu đồ |
| Lưới số dày | bảng giá, ma trận giao dịch, bảng tín hiệu 7+ cột | lớp `q-dense` (cho phép 10px) |
| Màu bảng điện VN | ô giá trong bảng giá / sổ lệnh | biến `--vn-*` |
| Logo | thanh trên | lớp `brand-logo` |
