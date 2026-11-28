# 05 — Lộ trình, chỉ số nghiệm thu, cách lùi

## 1. Lộ trình (mỗi bước một PR, chỉ giao diện, không cần railway up)

| Bước | Nội dung | Phạm vi | Phụ thuộc |
|---|---|---|---|
| **U0** | Nền móng: token mới (`--q-up/down/warn`, thang cỡ, bo góc, **chuẩn tiêu đề `.q-title` / `.q-brand` theo nút tab**), **chốt menu chính `--q-nav-*`**, `@theme` mở rộng, `data-ui-exempt` cho biểu đồ dựng bằng HTML, `ui-lint` + ngân sách nợ = hiện trạng, `ui-audit` (ghi / phát lại dữ liệu, so hai bản) + vân tay testid / chữ. **Không đổi hiển thị.** | toàn dự án | — |
| U1 | Phân loại vàng: mọi chỗ `--gold` / `#E8B84B` / `#F5CE72` / `amber-*` mang nghĩa **cảnh báo** đổi sang `--q-warn`. Sau đó `tokens.css` trỏ `--gold*` → xanh nhấn, `--font-display` → Inter (giữ logo) | toàn dự án | U0 |
| U2 | Khung chung: `.q-ui` cho thanh trên + cột phải; tiêu đề cột phải và **logo theo chuẩn nút tab** (`.q-title`, `.q-brand`, dấu "ĐT" Liquid Metal); bỏ cyan / tím; chữ ≥ 11px; `App.css` / `topbar-pro.css` sang token. **Menu chính không đổi** | K1–K4, K6 | U1 |
| U3 | Quyết định: vạch tab, Bảng QĐ (nút lớp, mã bấm được, tiêu đề Deck), Phòng họp AI (khối trái + thanh đầu; sơ đồ miễn trừ), Bằng chứng, Rủi ro | Q-1…Q-7 | U1 |
| U4 | Vĩ mô: Chất xúc tác hiện tại, Tác động ngành, thẻ Nhịp vĩ mô bỏ gradient | V1–V4 | U1 |
| U5 | Cơ bản: KQKD, Cổ tức, sự kiện, bỏ Space Grotesk trong `cotuc-theme.css`, biểu tượng thay emoji (trừ `CoTuc/timeline` khoá F0) | C1–C5 | U1 |
| U6 | Ngành: vàng, số Plex Mono, chip đang chọn | N1–N5 | U1 |
| U7 | Kỹ thuật + Thế giới: nhãn trạng thái mẫu hình, nền slate, vàng ở thanh công cụ chart | T1–T5, W1–W2 | U1 |
| U8 | Dọn nợ: `uppercase` / `tracking` / `text-[10px]` còn lại, hạ ngân sách `ui-lint` về đích, khai báo `q-dense` cho lưới số Tổng quan | toàn dự án | U2–U7 |
| **U9** | **Gỡ hệ cũ** (`04` §6): kiểm kê → đổi tên biến → ngừng dùng 1 tuần → xoá `tokens.css`, luật chết `App.css`, font Space Grotesk | toàn dự án | U8 |

Thứ tự ưu tiên theo mức lệch đo được: Quyết định và Vĩ mô › Chất xúc tác (lệch nặng nhất) → Cơ bản → Ngành → Kỹ thuật / Thế giới.

## 2. Chỉ số nghiệm thu (đo bằng `ui-audit`, ngoài vùng miễn trừ)

| # | Chỉ số | Hiện tại (xấu nhất) | Đích |
|---|---|---|---|
| A1 | Phần tử chữ màu vàng cũ (không phải cảnh báo) | 107 (Vĩ mô › Chất xúc tác), 57 (Ngành), 51 (Bảng QĐ) | **0** ở mọi tab |
| A2 | Phông khác Inter / IBM Plex Mono | Space Grotesk 14 (Bảng QĐ), `ui-monospace` 26 (Phòng họp AI) | **0** (kể cả logo) |
| A11 | Menu chính giống từng điểm ảnh trước / sau mọi bước | — | **giống 100%** |
| A12 | Tham chiếu hệ cũ sau U9 (`tokens.css`, `--gold*`, `--font-display`, Space Grotesk) | 91 + 10 + 1 tệp | **0**, tệp đã xoá |
| A3 | Phần tử < 11px ngoài `q-dense` | 951 (Chất xúc tác), 208 (Phòng họp AI), 30/33 (cột phải) | **0** |
| A4 | Phần tử < 10px | 163 (Phòng họp AI), 72 (Bằng chứng) | **0** |
| A5 | Chữ in hoa / giãn chữ hiển thị | 29 / 32 (Phòng họp AI), 20 (Ngành) | **0** |
| A6 | Nền gradient ngoài biểu đồ | 33 (Phân tích vĩ mô), 21 (Phòng họp AI) | **0** |
| A7 | Nút / tab đang chọn mang màu nhấn chuẩn | Bảng QĐ: 1/13 | **100%** |
| A8 | Số màu chữ khác nhau mỗi tab | 31–32 (Ngành, Phòng họp AI) | ≤ 18 (Tổng quan: 16) |
| A9 | Số trong bảng dùng Plex Mono | Ngành: 0% | **100%** ô số |
| A10 | `ui-lint` | — | 0 vi phạm mới; ngân sách giảm dần về 0 |

## 3. Kiểm thử mỗi PR

1. `ui-lint` không tăng; vân tay `data-testid` và `textContent` từng tab giống từng ký tự (trừ thay emoji đã khai báo).
2. vitest toàn bộ, `node --test` toàn bộ, `tsc --noEmit`, `vite build`.
3. `ui-audit` trên bản build với Gateway thật, 1440 px và 390 px: chỉ số A1–A9 của tab trong PR đạt đích; các tab khác không xấu đi.
4. Ảnh chụp vùng `data-ui-exempt` trước / sau: không khác (biểu đồ giữ nguyên).
5. Đối chiếu ảnh chụp tab với Tổng quan (cùng khung, cùng thang chữ).

## 4. Rủi ro và cách lùi

| Rủi ro | Giảm thiểu | Lùi |
|---|---|---|
| U1 đổi `--gold` đồng loạt làm cảnh báo mất màu vàng | U1 phân loại cảnh báo **trước** khi trỏ biến; `ui-audit` đếm amber trước / sau | revert PR U1 |
| Codemod đổi nhầm nhánh trạng thái (bài học #397) | chỉ đổi nhánh chọn / trung tính; nhánh khác duyệt tay; vân tay chữ + testid | revert PR của tab |
| Biểu đồ bị ảnh hưởng bởi luật CSS chung | selector `:not([data-ui-exempt] *)`; ảnh chụp vùng miễn trừ | revert |
| Người dùng quen màu vàng | màu nhấn đã đổi ở Tổng quan / KNTG từ 27/11 | — |
| Chạm `CoTuc/timeline` (khoá F0) | codemod bỏ qua thư mục; kiểm thử băm F0 chặn | — |

## 5. Ngoài phạm vi

- Thay đổi bố cục, tính năng, dữ liệu, nội dung chữ.
- Màu chuỗi trong biểu đồ 2D / 3D.
- Giao diện sáng (light mode).
