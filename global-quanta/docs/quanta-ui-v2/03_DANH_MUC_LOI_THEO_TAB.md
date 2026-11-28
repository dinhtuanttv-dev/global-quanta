# 03 — Danh mục lỗi theo tab và cách sửa

Ký hiệu mức: **A** lệch thấy rõ (màu nhấn sai, phông sai, chữ quá nhỏ) · **B** không đồng nhất (trạng thái, bo góc, nền) · **C** nợ mã (hex cứng, lớp bị `.q-ui` che).
Mọi cách sửa chỉ đổi lớp trình bày; chữ, dữ liệu, `data-testid` giữ nguyên.

## 0. Bảng ánh xạ chung (áp cho mọi tab)

Đếm trên toàn bộ `src/components`:

| Đang dùng | Số chỗ | Thay bằng | Điều kiện |
|---|---|---|---|
| `text-[#F5CE72]` | 87 | `text-q-accent-strong` | mã cổ phiếu, liên kết, tiêu đề nhấn |
| ↳ cùng lớp nhưng là **cảnh báo** | — | `text-[var(--q-warn)]` + ký hiệu ⚠ | khi câu là cảnh báo |
| `border-[#E8B84B]/40–60` + `bg-[#E8B84B]/10–20` (nút / chip bật) | ~45 | `border-q-accent/60 bg-q-accent/15 text-q-accent-strong` | trạng thái `aria-pressed` |
| `bg-[#E8B84B]` đặc (nút chính) | 13 | `bg-q-accent text-white` | |
| `accent-[#E8B84B]` | 5 | bỏ (`.q-ui` đã đặt `accent-color`) | |
| `outline-[#F5CE72]` | 4 | bỏ (focus chuẩn của `.q-ui`) | |
| `ring-[#E8B84B]/70` (ô đánh dấu) | 2 | `ring-q-accent/70` | |
| `var(--gold)` / `var(--gold-bright)` trong CSS / style | 91 | `var(--q-accent)` / `var(--q-accent-strong)` | trừ khi là cảnh báo → `var(--q-warn)` |
| `fontFamily: "var(--font-display)"` | 10 | bỏ (kế thừa Inter); số → `font-mono` | |
| `#0E131F`, `#0B0F19` viết cứng | 51 | `bg-q-surface` / `var(--q-surface)` | |
| `#161D2E`, `#1E273D` | — | `--q-surface-2` / `--q-surface-3` | |
| `bg-slate-900/950` | 77 | `bg-q-surface` / `bg-q-surface-2` | |
| `text-[9px]`, `text-[9.5px]` và `font-size: 6–9.5px` trong CSS | 6 lớp + 36 luật CSS | ≥ 11px; lưới dày 10px với `q-dense` | ngoài vùng miễn trừ |
| `uppercase`, `tracking-wide*`, `letter-spacing` > 0 | 250 + 6 luật CSS | bỏ | |
| `linear-gradient` / `bg-gradient-to-*` trên nút / thẻ | ~70 | nền phẳng token | trừ biểu đồ |
| Emoji trong nhãn (💰 ⏱ 🔎 ◆ ✦…) | 361 | biểu tượng lucide 14px `aria-hidden` | ký hiệu ▲▼✓✗ giữ nguyên (ký hiệu dữ liệu) |

## 1. Khung chung (thanh trên, menu chính, cột phải)

| # | Lỗi | Mức | Vị trí | Sửa |
|---|---|---|---|---|
| K1 | Khung chung nằm ngoài `.q-ui` → chữ 10px, in hoa vẫn hiện | A | `App.tsx` (`.app`), `InsightPanel.tsx` (`.insight`) | thêm `q-ui` vào gốc thanh trên và cột phải |
| K2 | Cột phải: tiêu đề "ELITE COMMAND RADAR / ACTION CENTER / TIN TỨC THÔNG MINH" in hoa, màu **xanh lơ**; huy hiệu "AI" tím; 30/33 phần tử chữ 10px | A | `InsightPanel/*.tsx` (`Card` title), `styles/App.css` | tiêu đề theo **chuẩn nút tab** (`.q-title`: Inter 13px / 600, `--q-text`, chữ thường "Elite Command Radar", "Action Center", "Tin tức thông minh"); huy hiệu "AI" trung tính; chữ ≥ 11px. Thông báo trình duyệt (`browserNotify`) giữ nguyên chuỗi |
| K3 | 34 chỗ vàng + 6 chỗ Space Grotesk trong `App.css`: dải VN-Index (`.vn-hero-name` vàng, in hoa, 10px; `.vhd-note b`; focus `.vn-hero-main` viền vàng), màn đăng nhập (`.login-logo`, nút gradient vàng, `accent-color` vàng), dấu logo gradient | A/C | `styles/App.css` | đổi sang token q-*; giữ tên lớp (không đổi JSX); logo giữ Space Grotesk |
| K4 | Thanh trên: 3 nền gradient, 3 phần tử giãn chữ, 22 phần tử < 11px, 2 chữ vàng (ngoài logo) | B | `TopBar/topbar-pro.css` | nền phẳng; chữ ≥ 11px (số liệu dải vĩ mô dùng `q-dense` nếu cần) |
| K5 | **Menu chính: KHÔNG SỬA** (chỉnh 28/11). Khung Liquid Metal là kim loại bạc, không phải vàng; menu là chuẩn | — | `MainTabs.css` | chỉ chốt giá trị màu hiện tại vào `--q-nav-*` để U1 / U9 không làm đổi menu |
| K6 | Logo "ĐINH TUẤN": Space Grotesk, dấu "ĐT" gradient vàng → nâu | A | `TopBar/topbar-pro.css`, `styles/App.css` (`.logo`) | `.q-brand`: Inter 15px / 700, `--q-text`; dấu "ĐT" khung Liquid Metal như tab đang chọn (lấy từ `MainTabs.css`); chữ giữ nguyên |

## 2. Thế giới (KNTG)

Gần chuẩn (đã nâng ở #396). Còn:

| # | Lỗi | Mức | Tệp | Sửa |
|---|---|---|---|---|
| W1 | 21 chỗ vàng: tiêu đề bản tin AI, nhãn theo dõi thị trường, huy hiệu truyền dẫn | A | `center/AiBriefPanel.tsx`, `center/MarketMonitor.tsx`, `commodity/TransmissionBadge.tsx`, `KetNoiTheGioiTab.tsx`, `WorldSourcePanel.tsx`, `world-gq.css` | ánh xạ §0 |
| W2 | 21 nhãn `uppercase` (bị che trong `.q-ui`) | C | rải rác | bỏ lớp |

## 3. Ngành

| # | Lỗi | Mức | Tệp | Sửa |
|---|---|---|---|---|
| N1 | **57 phần tử chữ vàng** trên trang: tiêu đề khối, nhãn EXPERIMENTAL nền vàng, chip ngành vừa vào | A | `cycle-fingerprint.css` (12), `timing/SectorDeepPanel.tsx` (10), `Top20V2Panel.tsx` (8), `timing/SectorRotationPanel.tsx`, `CfV2Panel.tsx`, `MainChart.tsx`, `timing/SectorLadderGrid.tsx` | §0; nhãn bằng chứng theo `01` §5 |
| N2 | **Mọi số dùng Inter** (0 phần tử Plex Mono) → số không thẳng cột | A | các bảng Top 20, thang kỳ ngành, Cycle Fingerprint | thêm `font-mono` / `.num` cho ô số |
| N3 | 31 màu chữ khác nhau (chuẩn ~16) | B | — | gom về `--q-text-*` + màu có nghĩa |
| N4 | 20 phần tử in hoa còn hiện (CSS riêng `text-transform`) | B | `cycle-fingerprint.css` | bỏ |
| N5 | Chip đang chọn ("Nhìn phẳng", "Góc phần tư") viền trắng thay vì xanh nhấn | B | `timing/SectorRotationPanel.tsx` | kiểu `aria-pressed` chuẩn |
| — | RRG 4D, đường quỹ đạo, ô nhiệt | miễn trừ | | `data-ui-exempt="chart"` |

## 4. Kỹ thuật (TA VN-Index)

Ít lỗi màu nhấn, nhiều nợ mã:

| # | Lỗi | Mức | Tệp | Sửa |
|---|---|---|---|---|
| T1 | 154 chỗ `amber-*` — phần lớn là **nhãn trạng thái mẫu hình** (SEPA, Hợp lưu, Elliott) dùng vàng làm màu trang trí | B | `SepaPanel.tsx`, `SepaDeepPanel.tsx`, `ConvergencePanelV2.tsx`, `ScreenerDeepPanel.tsx` | trạng thái thường → trung tính / xanh nhấn; chỉ giữ vàng cho "cảnh báo" |
| T2 | 51 chỗ `bg-slate-900/950` | C | rải rác | `bg-q-surface(-2)` |
| T3 | 627 chỗ `text-[10px]` — nhiều nhất dự án | C | panel phân tích sâu | ≥ 11px; bảng sàng lọc nhiều cột dùng `q-dense` |
| T4 | 53 `uppercase`, 35 giãn chữ | C | | bỏ |
| T5 | `TVChartPanel.tsx`: 3 chỗ vàng trên thanh công cụ (ngoài khung chart) | A | | §0 |
| — | Khung chart TradingView / Super Chart, lớp chỉ báo | miễn trừ | | giữ màu chuỗi |

## 5. Vĩ mô

| # | Lỗi | Mức | Tệp | Sửa |
|---|---|---|---|---|
| V1 | **Tab con "Chất xúc tác hiện tại": 107 chữ vàng, 78 amber, 951 phần tử 10px, 12 gradient, 1 Space Grotesk** — khối lệch nặng nhất dự án | A | `CatalystChatPanel.tsx` (8), `CatalystChatCards.tsx`, `ImpactBoard.tsx` (6), `DomesticEventsPanel.tsx` (4) | §0; thẻ xúc tác dùng `.q-card`, chữ ≥ 11px |
| V2 | Tab con "Tác động ngành & cổ phiếu": 22 chữ vàng | A | `ImpactBoard.tsx` | §0 |
| V3 | "Phân tích vĩ mô": **33 nền gradient** (thẻ Nhịp vĩ mô, thẻ yếu tố) | B | `macro-center/*`, `macroHub/*` | nền phẳng `q-card` |
| V4 | Vạch tab con đang chọn còn vàng ở 1 trường hợp | B | `ChatXucTacTab.tsx` | `.q-tab` |
| — | Radar 2D Event Radar, biểu đồ chuỗi vĩ mô | miễn trừ | | |

## 6. Cơ bản (Cổ tức · KQKD · Timeline)

| # | Lỗi | Mức | Tệp | Sửa |
|---|---|---|---|---|
| C1 | **106 chỗ vàng** — nhiều nhất sau Quyết định: lịch KQKD, cầu lợi nhuận, ma trận quý, mùa vụ | A | `kqkd/EarningsCalendar.tsx` (27), `kqkd/SeasonNowcast.tsx` (7), `seasonality/SeasonalityView.tsx` (7), `kqkd/QuarterMatrix.tsx` (6), `kqkd/ProfitBridge.tsx` (5), `events/EventViews.tsx` (6), `cotuc-theme.css` (5) | §0 |
| C2 | `cotuc-theme.css` khai báo lại Space Grotesk (2) | A | `cotuc-theme.css` | bỏ |
| C3 | 7 phần tử chữ < 10px ở KQKD | A | `kqkd/*` | ≥ 11px / `q-dense` |
| C4 | 84 emoji: nhãn tab con "💰 Cổ tức", "⏱ Timeline điểm mua", bộ lọc | B | `CotucTab.tsx`, `events/*` | lucide |
| C5 | 77 `uppercase`, 333 `text-[10px]` | C | | bỏ / ≥ 11px |
| — | `Kqkd3D.tsx` (khối 3D), biểu đồ mùa vụ, ô nhiệt | miễn trừ một phần | | Trong `Kqkd3D.tsx`: màu chuỗi `TPL_COLOR`, `goldRamp`, chấm điểm trong cảnh 3D → **giữ**; nút chọn kỳ phía trên khối (`border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]`) → **sửa** theo §0 |
| ⚠ | **Thư mục `CoTuc/timeline` khoá F0** — không chạm mã; chỉ sửa qua CSS bên ngoài nếu cần, và phải được phép riêng | — | | loại khỏi U-phase mặc định |

## 7. Quyết định

| # | Lỗi | Mức | Tệp | Sửa |
|---|---|---|---|---|
| Q-1 | Vạch tab con dùng `--gold-bright` | A | `Elite10Hub.tsx` (style inline) | `.q-tab` |
| Q-2 | **Bảng QĐ: 51 chữ vàng, 14 Space Grotesk, 19 gradient**; 10 nút lớp đang bật không có màu nhấn | A | `center/EliteHlBoard.tsx` (9), `center/CockpitLayers.tsx` (12), `center/HlFocusFrame.tsx` (8), `center/DecisionPulse.tsx` (5), `deck/DeckTop.tsx`, `deck/RuleSpace.tsx`, `center/HlRadarLayers.tsx` (nút lớp) | §0; nút lớp theo `aria-pressed` chuẩn; tiêu đề `deck/parts.tsx` bỏ `--font-display` |
| Q-3 | Mã cổ phiếu bấm được màu vàng (`text-[#F5CE72]` ở nút mở hồ sơ) | A | `EliteHlBoard.tsx`, `ExitTriggers.tsx`, `DeckSide.tsx` | ~~`text-q-accent-strong`~~ **SỬA 28/11: `text-q-text` (trắng) như Tổng quan** — đổi sang xanh là lỗi của bản đặc tả này (U1 làm 38 mã thành xanh) |
| Q-4 | **Phòng họp AI (ngoài sơ đồ):** khối trái "Danh mục chính thức", "Decision timing" in hoa, xanh lơ, chữ 7–9px; nút "Kiểm chứng & tranh luận" gradient vàng; 26 phần tử `ui-monospace` | A | `evidenceRoom/evidenceRoom.css` (34 luật cỡ < 10px, 6 luật in hoa), `PortfolioRail.tsx`, `EliteAiRoom.tsx` | tách selector: vùng sơ đồ giữ nguyên (miễn trừ), vùng rail / thanh đầu theo chuẩn; mono → Plex |
| Q-5 | Bằng chứng: 72 phần tử < 10px, 10 Space Grotesk, 20 gradient | A | `deck/EvidenceWall.tsx`, `deck/parts.tsx`, `EvidenceLedgerTab.tsx` (đường cong là biểu đồ → miễn trừ) | §0 |
| Q-6 | Rủi ro danh mục: 11 chữ vàng, 20 gradient | B | `center/RiskTab.tsx` | §0 |
| Q-7 | 44 nền viết cứng `#0E131F` / `#0B0F19` | C | rải rác | token |
| — | Sơ đồ Evidence Brain, radar Command Radar 2D / 3D, Rule Space, đường cong sổ | miễn trừ | | `data-ui-exempt="chart"` |

## 8. Tổng quan (chuẩn) — việc nhỏ

| # | Lỗi | Mức | Sửa |
|---|---|---|---|
| O1 | 10px của bảng giá / Siêu Quét chưa được khai báo là ngoại lệ | C | thêm `q-dense` vào gốc bảng (không đổi hiển thị) |
| O2 | 54 emoji trong nhãn trạng thái | C | đánh giá riêng; giữ nếu là ký hiệu dữ liệu |
