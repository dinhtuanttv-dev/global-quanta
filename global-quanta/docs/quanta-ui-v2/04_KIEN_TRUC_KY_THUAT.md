# 04 — Kiến trúc kỹ thuật

Mục tiêu: chuyển cả dự án sang QUANTA UI v2 **mà không đổi logic, dữ liệu, `data-testid` hay nội dung chữ**, và chặn tái phát.

## 1. Hợp nhất token (một nguồn sự thật)

1. `src/styles/quanta-ui.css` là nguồn duy nhất. Thêm token mới:
   - `--q-up`, `--q-down`, `--q-warn`, `--q-critical`;
   - `--vn-ceil`, `--vn-floor`, `--vn-ref`;
   - `--q-fs-dense: 10px`, `--q-fs-xs: 11px`, `--q-fs-sm: 12px`, `--q-fs-md: 13px`, `--q-fs-lg: 15px`, `--q-fs-xl: 20px`;
   - bo góc `--q-r-sm: 6px`, `--q-r-md: 8px`, `--q-r-lg: 10px`.
2. `src/styles/tokens.css` (hệ cũ) **giữ tên biến nhưng trỏ về token mới**, để mọi CSS cũ tự đổi mà không phải sửa từng tệp ngay:
   ```css
   --bg-surface: var(--q-surface);   --bg-surface-2: var(--q-surface-2);   --bg-surface-3: var(--q-surface-3);
   --text-secondary: var(--q-text-3); --text-tertiary: var(--q-text-4);
   --gold: var(--q-accent);           --gold-bright: var(--q-accent-strong); --gold-glow: var(--q-accent-soft);
   --font-display: var(--q-font-sans);
   ```
   Đây là bước có tác động rộng nhất: 91 chỗ `var(--gold*)` và 10 chỗ `--font-display` đổi đồng loạt. Mỗi chỗ `--gold` đang mang nghĩa **cảnh báo** phải được đổi tay sang `--q-warn` **trước** bước này (danh sách ở U1).
3. `tailwind.css @theme` bổ sung `q-up`, `q-down`, `q-warn`, `q-text-2..4`, `q-line-2/3` để dùng lớp tiện ích thay hex.
4. `index.html`: bỏ hẳn Space Grotesk ở U9 (sau khi logo sang Inter) — bớt một họ phông tải về.

## 2. Ánh xạ lớp (codemod có kiểm soát)

- Một script `scripts/quanta-ui-migrate.mjs` đổi **chuỗi lớp trong `className` và luật CSS** theo bảng `03` §0. Nó **không chạm** biểu thức JS, chữ hiển thị, thuộc tính khác.
- Chạy theo từng thư mục (một tab mỗi PR); in danh sách thay đổi; bỏ qua:
  - tệp trong danh sách miễn trừ (§3);
  - thư mục `CoTuc/timeline` (khoá F0);
  - chuỗi có từ khoá cảnh báo đi kèm (`⚠`, `warn`, `cảnh báo`, `stale`, `dataGuard`) → để người sửa tay.
- Bài học #397 (`qstd`): lần quét đầu từng đổi nhầm nhánh trạng thái `stale` / `warn`. Vì vậy chỉ đổi khi lớp đứng trong nhánh **trạng thái chọn** (`aria-pressed`, `selected`, `on`, `active`) hoặc nhánh trung tính. Các nhánh khác liệt kê để duyệt tay.

## 3. Vùng miễn trừ (biểu đồ 2D / 3D)

- Thuộc tính `data-ui-exempt="chart"` đặt trên gốc mỗi biểu đồ: SVG, canvas, WebGL, sơ đồ Evidence Brain, RRG 4D, radar Command Radar, Rule Space, Kqkd3D, đường cong sổ, biểu đồ chuỗi vĩ mô, chart TA.
- `quanta-ui.css`: mọi luật v2 viết dạng `.q-ui :not([data-ui-exempt] *)…` khi có thể ảnh hưởng tới biểu đồ, để không đổi màu chuỗi hay cỡ nhãn trục.
- Danh sách miễn trừ ghi trong `src/styles/ui-exempt.json` (đường dẫn tệp + selector), dùng chung cho codemod và công cụ đo.

## 4. Cổng kiểm (chặn tái phát)

| Công cụ | Kiểm gì | Ở đâu |
|---|---|---|
| `scripts/ui-lint.mjs` | Trong `.tsx` / `.css` ngoài miễn trừ: hex vàng cũ, `--gold*`, `--font-display`, `text-[<10px]`, `font-size < 10px`, `bg-slate-9xx`, `uppercase` / `tracking-*`, gradient, hex nền cứng | `npm run lint:ui`; kiểm thử vitest gọi script để CI fail khi tăng |
| Ngân sách nợ | Mỗi quy tắc có **trần = số hiện tại**, chỉ được giảm (ratchet) — PR không được làm tăng | `ui-lint-budget.json` |
| `scripts/ui-audit.mjs` (Playwright) | Đo trang thật như `02` §2: phông, < 11px, chữ vàng, in hoa, gradient, trạng thái chọn, bỏ qua `data-ui-exempt` | chạy tay trước mỗi merge giao diện; lưu kết quả vào `docs/quanta-ui-v2/audit/` |

## 5a. Chốt menu chính (U0)

Menu chính đang đọc vài biến hệ cũ có giá trị **khác** token mới (`--bg-surface-2` `#161D2E` ≠ `--q-surface-2` `#131a29`; `--text-tertiary` `#748299` ≠ `--q-text-4` `#8391a7`). Nếu U1 trỏ biến cũ về token mới thì menu sẽ đổi màu. Vì vậy U0 chốt giá trị hiện tại vào token riêng `--q-nav-hover-bg`, `--q-nav-muted`, `--q-nav-text`, `--q-nav-text-active` và cho `MainTabs.css` đọc các token này — điểm ảnh của menu không đổi.

## 5. Bảo toàn mã nguồn 100%

| Cam kết | Cách chứng minh |
|---|---|
| Không đổi logic / dữ liệu | diff mỗi PR chỉ chạm `className=`, `style=` (thuộc tính màu / phông / cỡ), `.css`; script kiểm diff từ chối thay đổi khác |
| Không đổi `data-testid` | vân tay testid trước / sau mỗi PR (như `EliteHlBoard.board-fingerprint`) |
| Không đổi chữ | vân tay `textContent` của từng tab trước / sau — phải giống từng ký tự (trừ emoji được thay ở Q7, khai báo riêng) |
| Biểu đồ không đổi | số phần tử SVG / canvas và ảnh chụp vùng `data-ui-exempt` trước / sau |
| Kiểm thử | toàn bộ vitest + `node --test` đạt, `tsc --noEmit` sạch, build OK |

## 6. Gỡ hệ cũ (U9) — phương án tối ưu, không ảnh hưởng dự án

Điều kiện bắt đầu: U1–U8 xong, `ui-lint` báo **0** cho mọi quy tắc hệ cũ, `ui-audit` 7 tab đạt A1–A10.

| Pha | Việc | Vì sao an toàn |
|---|---|---|
| U9a · Kiểm kê | Script liệt kê mọi tham chiếu còn lại tới biến hệ cũ (`--bg-*`, `--text-primary/secondary/tertiary`, `--gold*`, `--font-display`, `--font-body`), lớp CSS toàn cục trong `App.css` (có / không còn được dùng trong JSX), font Space Grotesk | chỉ đọc |
| U9b · Đổi tên biến | Thay `var(--bg-surface)` → `var(--q-surface)`… bằng codemod (giá trị đã trùng nhau sau U1, nên không đổi điểm ảnh); luật nào còn dùng thì chuyển sang `quanta-ui.css` | vân tay + ảnh chụp 7 tab × 2 khổ trước / sau giống nhau |
| U9c · Ngừng dùng | `tokens.css` chỉ còn khối alias, có chú thích "ngừng dùng"; `ui-lint` cấm tên biến cũ (ngân sách 0); để chạy **một tuần** trên trang thật | nếu sót chỗ nào, giá trị vẫn đúng nhờ alias |
| U9d · Xoá | Xoá `tokens.css` (chuyển nền `body`, thanh cuộn sang `quanta-ui.css`), xoá luật chết trong `App.css` (selector không còn khớp JSX), bỏ Space Grotesk khỏi `index.html` | một PR riêng; lùi = revert một commit |

Lợi ích đo được: bớt một họ phông tải về (Space Grotesk 3 trọng số), CSS toàn cục nhỏ hơn, một nguồn token duy nhất, `ui-lint` chặn tái phát vĩnh viễn.
