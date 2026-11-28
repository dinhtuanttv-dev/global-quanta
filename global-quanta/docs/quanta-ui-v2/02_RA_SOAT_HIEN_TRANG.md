# 02 — Rà soát hiện trạng (có số đo)

Hai cách đo, cùng ngày 28/11/2026 trên `main` 46b7356a:

- **Mã nguồn:** quét `.tsx` / `.css` (bỏ tệp kiểm thử) theo thư mục của từng tab.
- **Trang thật:** dinhtuan-ck.vercel.app, màn 1440px. Đọc **giá trị CSS tính toán** của mọi phần tử có chữ, **bỏ qua phần tử nằm trong SVG / canvas** (biểu đồ 2D/3D giữ nguyên). Mỗi tab đo trang mặc định và tối đa 5 tab con.

## 1. Mã nguồn

| Nhóm | Tệp | Dòng | Vàng cũ | Amber | Nền viết cứng | `bg-slate-8/9xx` | Chữ < 10px | `text-[10px]` | In hoa | Giãn chữ | Space Grotesk | Gradient | Hex inline | Emoji | Dùng token q-* |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Tổng quan (chuẩn)** | 32 | 4.727 | **0** | 46 | 6 | 4 | 1 | 160 | 1 | 1 | **0** | 5 | 24 | 54 | 58 |
| Thế giới | 22 | 2.373 | 21 | 7 | 1 | 2 | 0 | 131 | 21 | 0 | 0 | 1 | 16 | 4 | 45 |
| Ngành | 14 | 2.190 | 39 | 0 | 1 | 0 | 0 | 0 | 9 | 0 | 0 | 1 | 16 | 27 | 39 |
| Kỹ thuật | 65 | 9.876 | 4 | 154 | 0 | 51 | 0 | 627 | 53 | 35 | 0 | 8 | 27 | 63 | 60 |
| Vĩ mô | 56 | 5.417 | 31 | 31 | 0 | 12 | 0 | 88 | 12 | 3 | 0 | 13 | 19 | 11 | 26 |
| Cơ bản | 41 | 6.094 | **106** | 109 | 7 | 0 | 1 | 333 | 77 | 14 | 2 | 2 | 1 | 84 | 45 |
| Quyết định | 80 | 10.423 | **118** | 157 | **44** | 8 | 4 | 362 | 77 | 29 | **16** | 23 | 2 | 67 | 59 |
| Khung chung | 37 | 4.045 | 44 | 18 | 0 | 0 | 0 | 61 | 1 | 10 | 6 | **27** | 22 | 51 | 9 |

Cách đọc:
- "Amber" gồm cả cảnh báo hợp lệ; tab Tổng quan có 46 chỗ, đều là cảnh báo hoặc giá tham chiếu. Ở tab khác cần phân loại từng chỗ (`03`).
- "In hoa / giãn chữ / `text-[10px]`" trong vùng tab đã được `.q-ui` trung hoà một phần khi hiển thị, nhưng vẫn là nợ mã. Ở khung chung (ngoài `.q-ui`) thì vẫn hiện ra.

### Tệp lệch nhiều nhất (vàng cũ + nền cứng + < 10px + Space Grotesk)

| Nhóm | Tệp (điểm lệch) |
|---|---|
| Khung chung | `styles/App.css` (40: 34 vàng, 6 Space Grotesk) · `TopBar/topbar-pro.css` (10) |
| Quyết định | `deck/RuleSpace.tsx` (19) · `center/CockpitLayers.tsx` (17) · `deck/DeckTop.tsx` (11) · `center/EliteHlBoard.tsx` (10) · `center/EliteAiRoom.tsx` (9) · `center/HlFocusFrame.tsx` (8) · `center/DecisionPulse.tsx` (7) · `center/EliteScreener.tsx` (7) · `Elite10Hub.tsx` (vạch tab `--gold-bright`) |
| Cơ bản | `kqkd/EarningsCalendar.tsx` (28) · `kqkd/Kqkd3D.tsx` (12 — **3D, miễn trừ phần biểu đồ**) · `events/EventViews.tsx` (9) · `cotuc-theme.css` (7) · `kqkd/SeasonNowcast.tsx`, `seasonality/SeasonalityView.tsx` (7) · `kqkd/ProfitBridge.tsx`, `kqkd/QuarterMatrix.tsx` (6) |
| Ngành | `cycle-fingerprint.css` (13) · `timing/SectorDeepPanel.tsx` (10) · `Top20V2Panel.tsx` (8) · `timing/SectorRotationPanel.tsx` (3) |
| Vĩ mô | `CatalystChatPanel.tsx` (8) · `ImpactBoard.tsx` (6) · `DomesticEventsPanel.tsx` (4) |
| Thế giới | `center/AiBriefPanel.tsx`, `center/MarketMonitor.tsx` (4) · `world-gq.css` (3) |
| Kỹ thuật | `TVChartPanel.tsx` (7) · `SepaPanel.tsx`, `SepaDeepPanel.tsx` (4) |

## 2. Trang thật (phần tử có chữ, ngoài biểu đồ)

| Vùng | Phần tử | Phông (đếm) | < 10px | < 11px | Chữ vàng cũ | Amber | In hoa | Giãn chữ | Nền gradient | Màu chữ khác nhau | Đang chọn: vàng / xanh / khác |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Tổng quan** | 3.331 | Inter 1.441 · Plex 1.890 | 0 | 538¹ | **0** | 14 | 0 | 0 | 0 | 16 | 0 / 1 / 3 |
| Thanh trên | 36 | Inter 22 · Plex 12 · **Space Grotesk 2** | 0 | 22 | 2 | 2 | 0 | 3 | 3 | 8 | — |
| Menu chính | 8 | Inter 8 | 0 | 0 | 0 (viền vàng 1) | 0 | 0 | 0 | 1 | 3 | — |
| **Cột phải** | 33 | Inter 33 | 0 | **30** | 0 | 3 | tiêu đề in hoa | — | 0 | 10 (xanh lơ, tím) | — |
| Thế giới | 184 | Inter 170 · Plex 14 | 0 | 4 | 3 | 1 | 0 | 0 | 0 | 9 | 0 / 1 / 0 |
| **Ngành** | 1.007 | Inter 1.007 (**không Plex cho số**) | 0 | 105 | **57** | 12 | 20 | 1 | 1 | **31** | 0 / 1 / 4 |
| Kỹ thuật | 1.205 | Plex 266 · Inter 939 | 0 | 30 | 1 | 2 | 0 | 0 | 1 | 27 | 0 / 8 / 0 |
| Vĩ mô › Phân tích vĩ mô | 873 | Inter 857 · Plex 16 | 0 | 53 | 1 | 1 | 0 | 0 | **33** | 28 | 1 / 6 / 1 |
| Vĩ mô › Tác động ngành | 244 | Inter | 0 | 0 | **22** | 0 | 0 | 0 | 0 | 8 | 1 / 0 / 0 |
| **Vĩ mô › Chất xúc tác** | 1.487 | Inter · Space Grotesk 1 | 0 | **951** | **107** | **78** | 3 | 0 | 12 | 13 | 1 / 0 / 0 |
| Vĩ mô › Event Radar | 2.943 | Inter · Plex | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 13 | 1 / 1 / 0 |
| Cơ bản › KQKD | 2.873 | Inter · Plex | **7** | 10 | 1 | 0 | 0 | 0 | 0 | 23 | 0 / 1 / 2 |
| Cơ bản › Cổ tức | 2.771 | Inter · Plex | 0 | 3 | 9 | 0 | 0 | 0 | 0 | 26 | 0 / 2 / 0 |
| **Quyết định › Bảng QĐ** | 1.153 | Inter · Plex · **Space Grotesk 14** | 0 | 1 | **51** | 1 | 0 | 0 | 19 | 29 | **2** / 1 / **10** |
| Quyết định › Hồ sơ 360° | 115 | Inter · Plex | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 11 | 1 / 2 / 0 |
| **Quyết định › Phòng họp AI** | 264 | Inter · Plex · **ui-monospace 26** | **163²** | 208 | 1 | 0 | **29** | **32** | 21 | **32** | 1 / 1 / 1 |
| Quyết định › Bằng chứng | 1.466 | Inter · Plex · Space Grotesk 10 | **72** | 72 | 3 | 0 | 0 | 0 | 20 | 15 | 1 / 2 / 1 |
| Quyết định › Rủi ro | 218 | Inter · Plex | 0 | 0 | 11 | 0 | 0 | 0 | 20 | 11 | 1 / 1 / 1 |

¹ Tổng quan: 538 phần tử 10px đều thuộc **bảng giá / bảng Siêu Quét** (lưới số dày) → đúng ngoại lệ `q-dense` (`01` §6).
² Phòng họp AI: phần lớn chữ 7–9,5px nằm trong **sơ đồ Evidence Brain** (đồ thị 2D dựng bằng HTML) → miễn trừ (Q6). Khối trái "Danh mục chính thức", "Decision timing" (in hoa, xanh lơ) **không** miễn trừ.

Ghi chú:
- "Đang chọn: khác" là nút / tab đang bật nhưng không mang màu nhấn chuẩn. Ví dụ ở Bảng QĐ: các nút lớp "Tin & cảm xúc", "Dòng tiền ◆", "Điểm mua ⏱"… chỉ đổi viền xám. "Vàng" là vạch tab con của Quyết định (`--gold-bright`) và chip mã đang chọn.
- Tab Ngành hiển thị **mọi số bằng Inter** (không Plex Mono) — số không thẳng cột.

## 3. Nguyên nhân gốc

1. **Hai hệ token cùng tồn tại.** `tokens.css` + `App.css` (vàng, Space Grotesk, `#161D2E`) nạp toàn cục; `quanta-ui.css` chỉ phủ lên trong `.q-ui`. Thành phần viết từ trước 27/11 dùng trực tiếp hex vàng / Tailwind `amber-*`.
2. **`.q-ui` chỉ chữa triệu chứng.** Nó đổi cỡ chữ 9–11px, bỏ in hoa trong vùng tab; nhưng không đổi màu vàng, không phủ khung chung, không chạm `fontSize` inline, `text-[7px]`, `text-[8px]`.
3. **Chưa có cổng kiểm.** Không có lint hay kiểm thử nào chặn hex vàng, Space Grotesk, chữ < 10px trong PR mới.
