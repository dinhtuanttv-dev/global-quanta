# QUANTA UI v2 — Bộ đặc tả đồng nhất giao diện toàn dự án

> **Mã tài liệu:** `GQ-SPEC-QUANTA-UI-V2` · **Ngày:** 28/11/2026 · **Trạng thái:** ĐÃ DUYỆT Q1–Q8 ngày 28/11/2026, kèm chỉnh sửa của chủ dự án (§ Chỉnh sửa 28/11)
> **Nền mã:** `main` 46b7356a · **Chuẩn gốc:** tab **Tổng quan** (#393–#395) và `src/styles/quanta-ui.css` (#396–#397)
> **Nguyên tắc bất biến:** mã nguồn bảo toàn 100% — chỉ đổi lớp trình bày (className, CSS, token). Không đổi logic, dữ liệu, API, `data-testid`, nội dung chữ. Biểu đồ 2D / 3D giữ nguyên thiết kế.

## Bộ tài liệu

| Tệp | Nội dung |
|---|---|
| `00_TONG_QUAN.md` | Mục tiêu, kết luận, quyết định cần duyệt (tệp này) |
| `01_QUY_CHUAN.md` | Quy chuẩn QUANTA UI v2: màu, chữ, cỡ chữ, trạng thái, bề mặt, thành phần, ngoại lệ |
| `02_RA_SOAT_HIEN_TRANG.md` | Số đo trên mã nguồn và trên trang thật, theo từng tab và khung chung |
| `03_DANH_MUC_LOI_THEO_TAB.md` | Lỗi cụ thể từng tab / khối, tệp cần sửa, cách sửa |
| `04_KIEN_TRUC_KY_THUAT.md` | Hợp nhất token, ánh xạ lớp, vùng miễn trừ, công cụ kiểm (lint + đo trang), cách bảo toàn mã |
| `05_LO_TRINH_NGHIEM_THU.md` | Lộ trình U0 → U8, chỉ số nghiệm thu, kiểm thử, cách lùi |

## Kết luận rà soát

Tab Tổng quan đã đạt chuẩn. **Sáu tab còn lại và khung chung (thanh trên, cột phải) vẫn trộn hai hệ thiết kế**:

| Hệ | Nguồn | Màu nhấn | Phông | Bề mặt |
|---|---|---|---|---|
| **QUANTA UI** (chuẩn) | `quanta-ui.css`, `tailwind.css @theme` | xanh `#4f8ef7` | Inter + IBM Plex Mono | `#0e131f / #131a29 / #182033` |
| Fluent-dark (cũ) | `tokens.css`, `App.css`, mã viết cứng | vàng `#E8B84B / #F5CE72` | Space Grotesk + Inter + IBM Plex Mono | `#0E131F / #161D2E / #1E273D` |

Sáu nhóm lỗi chính (số đo ở `02`):

1. **Vàng Quanta còn làm màu nhấn.** 373 chỗ trong mã nguồn. Trên trang thật: 57 phần tử chữ vàng ở tab Ngành, 107 ở Vĩ mô › Chất xúc tác, 51 ở Quyết định › Bảng quyết định. Vạch tab con của Quyết định vẫn vàng.
2. **Phông thứ ba, Space Grotesk.** Còn ở thanh trên, Bảng quyết định (14 phần tử), Bằng chứng (10).
3. **Chữ quá nhỏ ngoài vùng lưới số.** Phòng họp AI có 163 phần tử < 10px (7–9,5px), Bằng chứng 72. Vĩ mô › Chất xúc tác có 951 phần tử ở 10px. Cột phải 30/33 phần tử ở 10px.
4. **Chữ in hoa giãn chữ.** Phòng họp AI có 29 phần tử in hoa và 32 phần tử giãn chữ; cột phải có tiêu đề in hoa màu xanh lơ.
5. **Màu nhấn lạ.** Xanh lơ (cyan) ở Phòng họp AI và cột phải, tím ở huy hiệu "AI". Nút chính phủ gradient vàng.
6. **Trạng thái đang chọn không đồng nhất.** Ở Quyết định, 10 nút đang bật không mang màu nhấn chuẩn và 2 nút còn vàng.

## Quyết định cần chủ dự án duyệt

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Bỏ hẳn vàng Quanta khỏi vai trò màu nhấn; vàng chỉ còn cho **cảnh báo** và **giá tham chiếu bảng điện** | Có |
| Q2 | Mã cổ phiếu bấm được, nút đang chọn, vạch tab: **xanh `--q-accent`** ở mọi tab | Có |
| Q3 | Bỏ Space Grotesk khỏi **toàn bộ** giao diện, kể cả logo — logo theo chuẩn nút tab menu chính | **Duyệt (chỉnh 28/11)** |
| Q4 | Cỡ chữ tối thiểu **11px**; ngoại lệ **10px** chỉ cho lưới số dày (bảng giá, ma trận, bảng tín hiệu nhiều cột), khai báo bằng lớp `q-dense` | Có |
| Q5 | Đổi cyan / tím ở Phòng họp AI và cột phải về xanh nhấn; huy hiệu "AI" dùng kiểu huy hiệu trung tính chuẩn | Có |
| Q6 | Biểu đồ 2D / 3D giữ nguyên, gồm cả **sơ đồ Evidence Brain** (Phòng họp AI), RRG 4D, radar, Kqkd3D, các SVG biểu đồ | Có — đánh dấu `data-ui-exempt` |
| Q7 | Thay emoji trong nhãn tab / nút (💰, ⏱, 🔎…) bằng bộ biểu tượng đang dùng ở menu chính (lucide), chữ giữ nguyên | Có |
| Q8 | Khung chung (thanh trên, cột phải) nhận `.q-ui` như vùng tab | Có |

Tất cả Q1–Q8 **đã duyệt** ngày 28/11/2026.

## Chỉnh sửa của chủ dự án (28/11/2026)

1. **Menu chính giữ nguyên tuyệt đối** — tên tab, biểu tượng, nhóm "Phân tích", khung Liquid Metal, vạch xanh. Không bước nào được đổi hiển thị của menu chính (bỏ mục K5 cũ).
2. **Nút tab menu chính là chuẩn tiêu đề** (`01` §2.2): tiêu đề khối như "ELITE COMMAND RADAR", "ACTION CENTER", "TIN TỨC THÔNG MINH", tiêu đề thẻ của các tab và **logo "ĐINH TUẤN"** dùng cùng phông, cỡ, độ đậm, màu, không in hoa, không giãn chữ; dấu logo "ĐT" dùng khung Liquid Metal của tab đang chọn.
3. **Gỡ hệ cũ sau khi nâng cấp toàn diện** — bước U9 (`04` §6, `05`): gỡ `tokens.css` / luật cũ trong `App.css` / font Space Grotesk theo hai pha (ngừng dùng → xoá), có đo trước / sau để dự án không đổi hành vi và nhẹ hơn.

