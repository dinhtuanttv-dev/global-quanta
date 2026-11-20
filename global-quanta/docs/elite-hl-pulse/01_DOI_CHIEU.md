# 01 — Đối chiếu nhận định với mã nguồn (fe188078) và dữ liệu sống (20/11/2026)

Quy ước:
- **[MÃ]**: đọc trong mã nguồn.
- **[ĐO]**: đo trên payload sống.
- **KHỚP / MÂU THUẪN / KHỚP MỘT PHẦN / ĐÃ XÁC MINH / CHƯA XÁC MINH**: kết luận cho từng nhận định.

## 1. Bản đồ các nơi đang đọc "hôm nay" trên Bảng quyết định

Hai bản đặc tả chỉ nói tới hai khối. Thực tế có bốn khối, cộng thêm các băng cảnh báo.

| Thứ tự trên trang | Khối | Tệp | Nội dung về "hôm nay" |
|---|---|---|---|
| 1 | `CommandBar` (`deck-command`) | `deck/DeckTop.tsx:14` | Phiên `d.date`, phiên bản, giờ khoá `builtAt`, "Phiên mới nhất / Chậm N phiên", nhãn sổ |
| 2 | `CockpitStatusBar` (`cockpit-status`, lớp `cockpit`) | `center/CockpitLayers.tsx:60` | PHIÊN, giờ khoá, phiên bản, chế độ PZ, THĂM DÒ, **lịch xét** ("phiên vào lệnh (đầu tuần)" / "không phải phiên vào lệnh"), **chốt dữ liệu**, nguồn lệch phiên, **đếm theo trạng thái** (Danh mục, Hàng chờ…), **"Chuyển trạng thái phiên này (N)"** |
| 3 | Băng `hl-refresh-error` / `hl-stale` / `hl-pending` | `EliteHlBoard.tsx:177–193` | Độ mới so với phiên giao dịch mới nhất |
| 4 | `hl-data-guard` / `hl-data-ok` | `EliteHlBoard.tsx:196–202` | Chốt dữ liệu, kèm `reasonsVi` |
| 5 | `TodayRibbon` (`deck-today`) | `deck/DeckTop.tsx:79` | Lịch xét, `held/slots`, vào/ra/giữ, chính/chạy lãi, 4 trạng thái PZ, pha loãng, xoay vòng, phí |
| 6 | `deck-invariants` | `EliteHlBoard.tsx:206` + `deckModel.ts:52` | Cảnh báo nhất quán. Chỉ hiển thị, không chặn |
| 7 | Panel `hl-changes` (lưới cùng `ExitRadar`, `FunnelBars`) | `EliteHlBoard.tsx:211` | "so với phiên `prevDate`" hoặc "phiên dựng đầu tiên", vào mới, ra (lý do, tỷ trọng, giữ từ), giữ N, chuyển sang theo dõi, về vùng mua |

Hệ quả: lịch xét xuất hiện **3 lần** (cockpit, ribbon, và ngầm trong hàng chờ). Chốt dữ liệu xuất hiện **3 lần** (cockpit, băng `hl-data-guard`, ribbon). Số mã đang giữ xuất hiện **4 lần** (cockpit, ribbon, `hl-changes`, tiêu đề danh mục). Thay đổi trong phiên được nói ở **2 nơi** với hai cách đếm khác nhau: cockpit đếm theo nhật ký và lịch sử, `hl-changes` đếm theo `changes`.

## 2. SPEC — đối chiếu từng nhận định

| # | Nhận định (SPEC) | Kết luận | Bằng chứng |
|---|---|---|---|
| S1 | `TodayRibbon` hiện lịch xét, số mã, chính/chạy lãi, phân bố vị trí giá, pha loãng, xoay vòng, phí | **KHỚP** | [MÃ] `DeckTop.tsx:86–92` |
| S2 | Panel "Thay đổi hôm nay" nằm trong lưới cùng `ExitRadar` và `FunnelBars` | **KHỚP** | [MÃ] `EliteHlBoard.tsx:208–223`, lưới 1/2/3 cột |
| S3 | Hợp đồng `EliteHlMeta` có `date, prevDate, dataGuard, funnel, changes, pz.counts` | **KHỚP** | [MÃ] `decisionTypes.ts:92–105` |
| S4 | `eliteHl.js` tạo thay đổi, xoay vòng, phí; `hlWatch.js` thêm chuyển trạng thái và phân bố PZ | **KHỚP**, bổ sung một ý | [MÃ] `eliteHl.js:193`, `hlWatch.js:147–158`. Riêng `hl.prevDate` do `decisionService.js:168` gắn, không phải `eliteHl.js` |
| S5 | Bất biến của `deckModel` chỉ cảnh báo, không chặn | **KHỚP** | [MÃ] `deckModel.ts:52–61`, hiển thị `role="status"` |
| S6 | Hai khối cùng một snapshot và cùng ngữ cảnh `hl`; có thể chuẩn về một mốc phiên | **MÂU THUẪN MỘT PHẦN** | [MÃ] `toWatch`/`backToZone` so với **ảnh chụp PZ trước** (`hlWatch.js:86`, `snap.prevDate`). Thay đổi danh mục so với `hl.prevDate` (sổ HL). `hl.pz` **không công bố** `prevDate` (`hlWatch.js:160`). Không thể khẳng định một mốc chung nếu không đổi API |
| S7 | `7/10`, `6 chính · 1 chạy lãi`, `kept = 7` hợp lý | **ĐÃ XÁC MINH** | [ĐO] `held 7`, `slots 10`, `coreNames 6`, `runnerNames 1` (VCP COOLING → RUNNER), `kept 7`, `added []`, `exits []` |
| S8 | "Hôm nay" có `prevDate`/freshness ở vùng đầu bảng | **MÂU THUẪN** | [MÃ] `TodayRibbon` không hiện `prevDate` hay freshness. `prevDate` chỉ nằm ở tiêu đề `hl-changes`; freshness nằm ở `CommandBar` và các băng cảnh báo |
| S9 | Xoay vòng 0 và phí 0% hợp lý khi không mua bán; mức phí là giả định | **KHỚP**, nay đã xác minh thêm | [MÃ] `turnover = (Σ tỷ trọng mua + Σ tỷ trọng bán)/2`, `costEst = Σmua·costBuy + Σbán·costSell`. Tỷ trọng là phần của toàn danh mục (NAV, gồm tiền mặt), nên **cả hai là % NAV**. [ĐO] 0 / 0; costBuy 0,20%, costSell 0,25% |
| S10 | Số mã đang giữ lặp ở ribbon và panel | **KHỚP, nhưng thiếu** | Thực tế lặp 4 nơi (mục 1) |
| S11 | Phải tách "đến kỳ xét" với "có thay đổi hay không" | **KHỚP**, bổ sung định nghĩa | [MÃ] `decisionService.js:159`: phiên cân bằng là **phiên đầu tiên của tuần ISO chưa có phiên cân bằng nào**. Phiên đầu tuần bị chốt dữ liệu thì dời sang phiên kế. Chữ "phiên đầu tuần" ở ribbon và cockpit vì vậy chưa chính xác hoàn toàn. Hàm `isRebalanceSession` (`eliteHl.js:73`) không còn ai gọi |
| S12 | Khi chốt dữ liệu, ribbon báo "Giữ nguyên"; panel cũng báo "giữ nguyên" như bình thường | **KHỚP (rủi ro có thật)** | [MÃ] Ribbon đã ưu tiên chốt dữ liệu (`DeckTop.tsx:86`). `hl-changes` thì không: vẫn in "Danh mục giữ nguyên N mã. Tỷ trọng … không bị cân lại", không nhắc chốt dữ liệu. Backend lúc chốt: `rebalance = false`, không xét ra (`eliteHl.js:125,134`) |
| S13 | 37 mã nhưng 4 nhóm cộng ra 28; chưa rõ 9 mã còn lại | **ĐÃ XÁC MINH** | [ĐO] counts: BUY_ZONE 16, IN_BASE 5, **NO_SETUP 8**, UNKNOWN 0, EXTENDED 2, COOLING 5, REBASING 0, **FAILED 1**. Tổng 37 = `coverage.tracked`; đã định giá 37, có nền 35 (SEPA 28, BOX 7, NONE 2). Phạm vi = mã đang giữ ∪ mã đạt tầng 1 ∪ mã còn ở trạng thái theo dõi phiên trước (`hlWatch.js:55`). Tooltip ribbon ghi "tầng 1 cộng mã đang giữ", **thiếu phần mã theo dõi chuyển từ phiên trước** |
| S14 | Chưa rõ `dilution.byTicker` là toàn vũ trụ hay chỉ đợt còn hiệu lực | **ĐÃ XÁC MINH** | [ĐO] 15 mã trên **toàn vũ trụ**, gồm 2 mã đã giao dịch cổ phiếu mới (`listed: true`: PVS 16/11, HDB 20/11). Ribbon đếm cả 15 là "đang theo dõi". `HlCalendarStrip` thì bỏ mã đã giao dịch (`hlCalendar.ts`, `if (!p || p.listed) continue`). Cùng nguồn, hai cách đếm |
| S15 | Chưa rõ múi giờ của `date`, `prevDate`, `builtAt`, `latestSession` | **KHỚP MỘT PHẦN** | [MÃ] `date`/`prevDate` là ngày phiên (chuỗi `YYYY-MM-DD`). `builtAt` là ISO UTC, hiển thị bằng `toLocaleString("vi-VN")` theo giờ máy người xem. `latestSession` lấy từ lịch phiên Gateway. **Chưa xác minh:** khi máy người xem không đặt giờ Việt Nam, giờ khoá có lệch hay không |
| S16 | Chưa rõ làm tròn và quy ước null; null không được thành 0 | **KHỚP MỘT PHẦN** | [MÃ] `pct()` của ribbon trả "—" khi null (`DeckTop.tsx:12`). Nhưng backend **luôn** trả số cho `changes.turnover/costEst` (r4, 4 chữ số thập phân). Riêng phiên dựng đầu tiên không có danh mục trước: `changes.turnover` vẫn có số (Σ mua / 2), còn `construction.turnover` thì null (`decisionService.js:166`). **Hai trường cùng tên, khác quy ước** |
| S17 | Đặt panel sau MissionMeters, trước ExitRadar và FunnelBars | **KHẢ THI** | [MÃ] Đúng chỗ `TodayRibbon` hiện nay (`EliteHlBoard.tsx:205`) |
| S18 | Giữ `data-testid` tương đương trong giai đoạn chuyển tiếp | **KHỚP, nhưng thiếu điều kiện** | [MÃ] 9 testid của hai khối đang được 1–2 tệp test dùng mỗi cái. **Test vân tay toàn bảng** (`EliteHlBoard.board-fingerprint.test.tsx`) chỉ cho phép thêm phần tử `data-hl-layer`. Gỡ hai khối sẽ làm test đỏ, nên cần quyết định P1 (tệp 03) |
| S19 | Phụ lục A: các khối khác giữ riêng | **KHỚP**, thiếu cockpit | `CockpitStatusBar` và `todayTransitions` thuộc nhóm "quyết định cấp danh mục" và trùng trực tiếp với panel mới (mục 1). Phải xử lý trong đặc tả hợp nhất |

## 3. UPGRADE — đối chiếu phần khác SPEC

| # | Nhận định (UPGRADE) | Kết luận |
|---|---|---|
| U1 | Bốn câu hỏi sản phẩm (phiên nào, trạng thái danh mục, mã nào đổi, số có bao phủ không) | **Giữ nguyên.** Đây là thước đo nghiệm thu UX (tệp 03, NT-U1) |
| U2 | Một panel thay `TodayRibbon` + `hl-changes`; CommandBar và các khối khác giữ | **KHỚP MỘT PHẦN.** Thiếu `CockpitStatusBar` (mục 1). Đặc tả hợp nhất xử lý ở tệp 02 mục 6 |
| U3 | View-model mỗi hàng có `id, group, label, currentValue, deltaValue, unit, baselineDate, asOf, quality, status, reason, sourceField, tickers, coverage` | **Giữ**, thêm `baselineKind`. Lý do: hai miền dùng hai mốc đối chiếu (S6) |
| U4 | `deltaValue` chỉ có khi có hai snapshot cùng định nghĩa | **Giữ.** Đã tìm được nguồn baseline sẵn có: `hl-history` (`/api/elite/hl-history`), đang được tải khi lớp `trend` hoặc `cockpit` bật. Nguồn này cho `held`, `cash`, `queue`, `ill` và PZ của từng mã đang giữ theo từng phiên. [ĐO] 18–20/11: held 7/7/7, cash 0,2765, hàng chờ **3 → 12**, VIC BUY_ZONE → IN_BASE, AAS IN_BASE → NO_SETUP |
| U5 | Thứ tự trạng thái ĐÓNG BĂNG > DỮ LIỆU CŨ > CHƯA CÓ ĐỐI CHIẾU > THAY ĐỔI > ỔN ĐỊNH > THIẾU | **Giữ.** "THIẾU" là trạng thái cấp hàng, không phải cấp bảng (tệp 02 mục 4) |
| U6 | Lộ trình G0–G4 | **Giữ**, chi tiết hoá ở tệp 03 với allowlist cụ thể |
| U7 | "Không thể chứng minh an toàn 100% bằng lời" | **Đồng ý.** Bảo toàn được chứng minh bằng allowlist, diff và đối chiếu đầu ra (tệp 03 mục 4) |

## 4. Trùng lặp cần loại bỏ khi hợp nhất

| Mã | Thông tin | Đang ở | Sau hợp nhất |
|---|---|---|---|
| D1 | Lịch xét | cockpit, ribbon | Panel (một hàng) + cockpit giữ một chữ ngắn có liên kết (quyết định P2) |
| D2 | Chốt dữ liệu | cockpit, `hl-data-guard`, ribbon | `hl-data-guard` giữ nguyên (băng cảnh báo `role="alert"`); panel gắn trạng thái ĐÓNG BĂNG ở đầu, không chép lại lý do |
| D3 | Số mã giữ / vào / ra | cockpit, ribbon, `hl-changes`, tiêu đề danh mục | Panel là nơi đọc chính; tiêu đề danh mục giữ (đó là tiêu đề bảng chi tiết) |
| D4 | Thay đổi trong phiên | cockpit "Chuyển trạng thái phiên này", `hl-changes` | Panel là nơi đọc chính; cockpit giữ dòng gọn kèm liên kết (P2) |
| D5 | Phiên / giờ khoá | CommandBar, cockpit | CommandBar là nguồn duy nhất; panel chỉ ghi mốc đối chiếu |

## 5. Dữ liệu chưa xác minh (còn lại sau lượt này)

1. Ngày của ảnh chụp PZ dùng để tính `toWatch` / `backToZone`. Payload không có trường này. Cách xử lý không cần đổi API: ghi "so với ảnh chụp vị trí giá trước". Muốn hiện ngày thì phải sửa backend, việc đó cần phê duyệt riêng (P5).
2. Giờ khoá hiển thị khi máy người xem không ở giờ Việt Nam (S15).
3. `hl-history` có giữ đủ phiên khi một phiên bị chốt dữ liệu hay không. Chưa gặp phiên chốt nào trong 3 phiên đã đo.
4. Cách đếm của cockpit (`todayTransitions`: nhật ký PZ + lịch sử 20 phiên) và của `changes` có khớp nhau trong một phiên có mã vào/ra hay không. Hôm nay cả hai đều rỗng nên chưa đối chiếu được.
5. `hl.queue` tăng 3 → 12 trong một phiên (19 → 20/11). Chưa rõ nguyên nhân (nhiều mã vào vùng mua hay thay đổi quy tắc). Đây chỉ là dữ kiện để kiểm thử hàng "Hàng chờ", không suy diễn.
