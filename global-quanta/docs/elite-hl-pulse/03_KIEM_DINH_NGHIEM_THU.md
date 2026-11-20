# 03 — Kiểm định, nghiệm thu, bảo toàn mã nguồn và quyết định

## 1. Allowlist cho giai đoạn triển khai (chưa làm, chờ duyệt)

| Loại | Tệp | Điều kiện |
|---|---|---|
| MỚI | `src/lib/elite10/decisionPulse.ts`, `decisionPulse.test.ts` | Hàm thuần |
| MỚI | `src/components/elite10/center/DecisionPulse.tsx`, `DecisionPulse.test.tsx` | Chỉ phần hiển thị |
| MỚI | `src/lib/elite10/__fixtures__/pulse-2026-11-20.json` | Ảnh chụp payload sống `/api/elite/decision` + `hl-history` ngày 20/11 |
| SỬA (chỉ chèn) | `src/hooks/elite10/useHlRowSignals.ts` | Thêm khoá lớp `pulse`. `scripts/guard/additive-diff.mjs` phải xanh |
| SỬA (chèn + bọc điều kiện) | `src/components/elite10/center/EliteHlBoard.tsx` | Chèn `<DecisionPulse/>`. Bọc `TodayRibbon` và panel `hl-changes` bằng `!layers.pulse`. Không dòng nào khác đổi nội dung |
| SỬA (chỉ khi P1 được duyệt) | `src/components/elite10/center/EliteHlBoard.board-fingerprint.test.tsx` | Xem P1 |
| CẤM | `backend/**`, `src/lib/elite10/decisionTypes.ts`, `deckModel.ts`, `cockpit.ts`, `deck/DeckTop.tsx`, `CockpitLayers.tsx`, mọi route, `vercel.json`, `railway.*`, `package*.json`, các tệp vân tay nền `__fingerprints__/*` | Diff phải rỗng |

**Baseline commit:** `origin/main` tại lúc tạo nhánh (hiện là fe188078). PR phải ghi rõ commit này.

## 2. Kiểm định

| Mã | Kiểm định | Cách làm | Đạt khi |
|---|---|---|---|
| KP1 | **Tương đương giá trị** (đối chiếu đầu ra trước/sau) | Với fixture 18/11 và 20/11, trích mọi giá trị hai khối cũ đang hiện (held, slots, core, runner, 4 trạng thái PZ, số pha loãng, turnover, costEst, costBuy, costSell, added, exits[ticker, weight, since, reasonVi], kept, toWatch, backToZone). Kiểm từng giá trị có mặt trong DOM của panel | 100% giá trị có mặt, đúng định dạng |
| KP2 | Đủ mẫu số PZ | Σ 8 trạng thái hiển thị = `coverage.tracked` | 20/11: 37 = 37 |
| KP3 | Null khác 0 | Fixture với `turnover: null`, `prevDate: null`, thiếu `pz`, thiếu `dilution`, `hist` null | Hiện "—" hoặc "Chưa có phiên đối chiếu", không có "0%" giả |
| KP4 | Thứ tự trạng thái | Ma trận frozen × stale × noBaseline × changed | `overall` đúng mục 4 tệp 02; `overallWhy` đủ |
| KP5 | Hai miền tách bạch | Fixture có mã vừa ra danh mục vừa đổi PZ | Không đếm trùng; PZ không xuất hiện ở hàng "Danh mục" |
| KP6 | Không thêm request | E2E trên bản dựng thật: đếm request Gateway và Project A khi mở tab QUYẾT ĐỊNH, lớp `pulse` bật so với tắt | Bằng nhau |
| KP7 | Bố cục | Playwright 1440 và 390 | 0 tràn ngang; cột tiêu đề thẳng với thân bảng (lệch ≤ 1 px); không chữ < 10 px; 0 lỗi trang |
| KP8 | Lớp tắt = giao diện cũ | Render bảng với `pulse: false` | Vân tay toàn bảng trùng tệp nền **không cần sửa test** |
| KP9 | Không đổi quyết định | `git diff <baseline> -- backend/ src/lib/elite10/decisionTypes.ts src/lib/elite10/deckModel.ts` | Rỗng |
| KP10 | Ngôn ngữ | Quét DOM panel | Không có "mua ngay", "bán ngay", "chắc thắng" |

## 3. Tiêu chí nghiệm thu

| Mã | Tiêu chí |
|---|---|
| NT-1 | Lớp `pulse` bật: chỉ còn **một** nơi đọc số danh mục và thay đổi trong phiên (panel). `TodayRibbon` và `hl-changes` không hiện |
| NT-2 | KP1–KP10 đạt, có đầu ra test và ảnh chụp kèm PR |
| NT-3 | Vị trí giá hiện đủ 8 trạng thái hoặc ghi rõ "N chưa phân loại". Không còn khoảng hở kiểu 37 so với 28 |
| NT-4 | Hai mốc đối chiếu được ghi rõ: "so với phiên dd/mm" cho danh mục và hàng chờ; "so với ảnh chụp vị trí giá trước" cho `toWatch` / `backToZone` |
| NT-5 | Pha loãng tách "chưa giao dịch" với "đã giao dịch", số khớp `HlCalendarStrip` |
| NT-6 | Chốt dữ liệu: panel không bao giờ hiện "ỔN ĐỊNH" khi `frozen` |
| NT-7 | Lớp `pulse` tắt: bảng giống hệt trước nâng cấp (KP8) |
| NT-U1 | Bốn câu hỏi ở tệp 02 mục 1 trả lời được từ panel mà không phải cuộn xuống chi tiết. Kiểm bằng bảng đọc 4 câu trên ảnh 1440 và 390, ghi vào PR |
| NT-8 | Diff chỉ gồm các tệp trong allowlist (mục 1); `additive-diff.mjs` xanh cho các tệp "chỉ chèn" |

## 4. Quy trình bảo toàn mã nguồn (áp dụng khi triển khai)

1. **Trước khi sửa:**
   - `git fetch`, tạo nhánh từ `origin/main`, ghi baseline commit.
   - Chụp `git ls-files -s` của các vùng CẤM vào tệp tạm.
   - Lưu đầu ra trước: chạy test vân tay hiện có (xanh) và trích bảng giá trị KP1 từ hai khối cũ trên hai fixture.
2. **Trong khi sửa:** chỉ đụng các tệp trong allowlist. Mọi tệp "chỉ chèn" phải qua `node scripts/guard/additive-diff.mjs --base <baseline> <tệp>`.
3. **Sau khi sửa:**
   - `git diff --name-only <baseline>` ⊆ allowlist.
   - `git ls-files -s` của vùng CẤM trùng lần chụp trước.
   - KP1: bảng giá trị sau trùng bảng giá trị trước.
   - KP8: vân tay khi lớp tắt.
   - Toàn bộ `vitest` và `tsc` xanh, build xanh.
4. **Trên app thật:** chạy E2E ở bản dựng cục bộ trước, sau merge chạy lại trên dinhtuan-ck (KP6, KP7).
5. **Merge:** chỉ khi có câu "cho phép merge #N". Thay đổi này không đụng backend nên không cần `railway up`.

## 5. Quyết định cần anh chốt

| Mã | Câu hỏi | Đề xuất |
|---|---|---|
| **P1** | Test vân tay toàn bảng chỉ cho thêm phần tử. Lớp `pulse` **bật mặc định** sẽ ẩn `TodayRibbon` và `hl-changes`, nên test "lớp mặc định" sẽ đỏ | Sửa đúng một điểm trong test: khi `pulse` bật, vân tay được so sau khi loại `deck-today` và `hl-changes` khỏi **tệp nền**. Bù lại bằng KP1 (chứng minh mọi giá trị hai khối có mặt trong panel) và KP8 (lớp tắt giống hệt). Tệp nền `__fingerprints__` **không đổi** |
| **P2** | Dòng "Chuyển trạng thái phiên này" và chữ lịch xét trong `CockpitStatusBar` trùng với panel | Giữ nguyên chữ, chỉ thêm liên kết "→ Nhịp quyết định" (chèn, mang `data-hl-layer`) |
| **P3** | Có thêm hàng "Hàng chờ" (delta lấy từ `hl-history`) không? | Có. Hôm nay hàng chờ tăng 3 → 12 mà chưa nơi nào nói |
| **P4** | Pha loãng: hiện số toàn vũ trụ (như nay) hay chỉ mã trong danh mục và hàng chờ? | Hiện cả hai: "15 trên toàn thị trường (13 chưa giao dịch) · 1 trong danh mục và hàng chờ: VPI (hàng chờ)". Số này đã đo ngày 20/11 |
| **P5** | Muốn hiện ngày ảnh chụp PZ trước thì phải thêm `pz.prevDate` vào payload (sửa `hlWatch.js`, cần `railway up`) | Để sau. Hiện chữ "so với ảnh chụp vị trí giá trước" |
| **P6** | Chữ lịch xét "phiên đầu tuần" chưa chính xác (thực tế là phiên đầu tiên của tuần ISO chưa bị chốt dữ liệu) | Panel dùng "phiên vào lệnh của tuần W47". Chữ cũ ở ribbon và cockpit giữ nguyên |

## 5b. Quyết định đã chốt và trạng thái triển khai (20/11/2026)

Anh chốt P1–P6 theo đề xuất. Nhánh `feat/decision-pulse`, baseline `origin/main` fe188078.

| Hạng mục | Kết quả |
|---|---|
| Tệp mới | `decisionPulse.ts` + test (8), `DecisionPulse.tsx` + test (6), fixture `pulse-2026-11-20.json` (79 KB: quyết định 20/11 + `hl-history` 10 phiên) |
| Chèn | `useHlRowSignals.ts` (lớp `pulse`), `EliteHlBoard.tsx` (panel, bọc hai khối cũ, liên kết P2 cạnh buồng lái). Guard chỉ-thêm xanh |
| P1 | `EliteHlBoard.board-fingerprint.test.tsx`: test lớp mặc định so với **tệp nền không đổi** trừ đúng hai khối được thay. Test lớp tắt thêm `timing:false, pulse:false` vào danh sách tắt |
| **Lệch allowlist (đã báo)** | Có 2 tệp test ngoài allowlist: `EliteHlBoard.test.tsx` và `deck/CommandDeck.test.tsx`. Mỗi tệp chỉ thêm đúng một dòng đặt lớp `pulse` tắt cho các test đang kiểm hai khối cũ. Mọi phép kiểm giữ nguyên, nên đây chính là KP8 |
| Vùng cấm | `git diff` rỗng ở backend, `decisionTypes`, `deckModel`, `cockpit`, `DeckTop`, `CockpitLayers`, tệp vân tay nền, cấu hình |
| KP1 | Đạt trên 3 đầu vào (18/11 thật, 20/11 thật, 20/11 có vào/ra/đổi vùng): mọi giá trị của hai khối cũ đều có trong panel |
| KP6, KP7 | E2E bản dựng thật ở khổ 1440 và 390: GW 43 = 43, PA 2 = 2 request; 0 tràn ngang; 0 chữ < 10 px; cột lệch 0,0 px; 0 lỗi trang |
| Toàn bộ | vitest 1409 xanh, `tsc` sạch, build xanh |

## 6. Bằng chứng của lượt tài liệu này (20/11/2026)

Kết quả kiểm sau khi viết xong, ở cả hai cây:
- trạng thái tệp: chỉ thêm các tệp `global-quanta/docs/elite-hl-pulse/*`;
- HEAD không đổi;
- mã băm của mọi tệp không phải tài liệu đang sửa dở hoặc chưa theo dõi: trùng lần chụp trước;
- mã băm `git diff`: trùng lần chụp trước;
- hai tệp đặc tả gốc (`ELITE_HL_DECISION_PULSE_SPEC.md`, `…_UPGRADE_SPEC.md`): không bị sửa.

Báo cáo chi tiết nằm trong tin trả lời của lượt này.
