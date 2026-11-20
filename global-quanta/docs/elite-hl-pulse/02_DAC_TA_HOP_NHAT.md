# 02 — Đặc tả hợp nhất: NHỊP QUYẾT ĐỊNH HÔM NAY

## 1. Mục tiêu

Một panel trả lời bốn câu hỏi (UPGRADE §1) trong một lần nhìn:

1. Bảng này là của phiên nào, và dữ liệu có đủ để tin không?
2. Danh mục hôm nay ở trạng thái nào: vào lệnh được, chỉ xét ra, hay đang đóng băng?
3. So với phiên trước, cái gì đã đổi? Phải tách rõ: danh mục, hàng chờ, vị trí giá.
4. Các con số có bao phủ đủ mẫu số không?

Panel chỉ trình bày lại dữ liệu sẵn có. Không gọi API mới, không tính lại danh mục, không đổi quy tắc chọn, giữ hay thoát mã.

## 2. Kiến trúc

```
/api/elite/decision (đã tải: useEliteDecision)  ─┐
/api/elite/hl-history (đã tải khi lớp trend/cockpit bật) ─┼─► pulseModel(d, hist) ──► <DecisionPulse/>
d.freshness · hl.dataGuard · hl.pz · d.dilution  ─┘        (thuần, không I/O)       (một panel, lớp "pulse")
```

- **`src/lib/elite10/decisionPulse.ts`**: hàm thuần `pulseModel(d, hist | null)` trả `PulseVM`. Hàm này không đọc đồng hồ, không gọi mạng. Mọi số trong VM đều chép **nguyên văn** từ một trường nguồn có ghi tên.
- **`src/components/elite10/center/DecisionPulse.tsx`**: phần hiển thị, không chứa logic quyết định.
- **Lịch sử:** dùng `useHlHistory(enabled)` đã có. SWR khử trùng lặp với lớp xu hướng và buồng lái, nên không phát sinh request mới. Thiếu lịch sử thì các ô delta lấy từ lịch sử ghi "Chưa có phiên đối chiếu", không ghi 0.

### Hợp đồng view-model

```ts
type PulseStatus = "FROZEN" | "STALE" | "NO_BASELINE" | "CHANGED" | "STABLE" | "PARTIAL";
type BaselineKind = "HL_PREV" | "PZ_PREV_SNAPSHOT" | "HISTORY" | "NONE";

interface PulseRow {
  id: "schedule" | "portfolio" | "queue" | "pz" | "turnover" | "dilution";
  group: "DECISION" | "PRICE_POSITION" | "CAPITAL_EVENTS";
  label: string;
  current: { text: string; values: Record<string, number | string | null> };   // nguyên văn nguồn
  delta: { text: string; tickers?: { added?: string[]; removed?: string[]; moved?: { t: string; from: string; to: string }[] } } | null;
  baselineKind: BaselineKind; baselineDate: string | null;
  status: PulseStatus; reason: string | null;
  sourceFields: string[];          // ví dụ ["hl.funnel.held", "hl.rule.slots"]
  coverage?: { shown: number; total: number; note?: string };
}
interface PulseVM {
  overall: PulseStatus; overallWhy: string[];
  session: { date: string; prevDate: string | null; pzDate: string | null; builtAt: string; sessionsBehind: number | null };
  rows: PulseRow[];
}
```

## 3. Bảng ánh xạ trường (mọi số hiện nay của hai khối cũ đều có chỗ)

| Hàng | Hiện tại (nguồn) | So với phiên trước (nguồn, mốc) | Trạng thái hàng |
|---|---|---|---|
| **Lịch xét** | `hl.rebalance`, `hl.week`, `hl.dataGuard.frozen`. Chữ: "Phiên vào lệnh của tuần W47" / "Chỉ xét ra — mua mới ở phiên vào lệnh của tuần kế" / "Đóng băng — không vào, không ra" | — (không có delta) | FROZEN / STABLE |
| **Danh mục** | `hl.funnel.held` / `hl.rule.slots`; `hl.pz.coreNames` chính · `runnerNames` chạy lãi; `hl.invested`, `hl.cash` | `hl.changes.added`, `exits[]` (ticker, tỷ trọng, giữ từ, `reasonVi`), `kept` — mốc `hl.prevDate` (`HL_PREV`). Thêm Δ tiền mặt so với phiên trước trong `hist` (`HISTORY`) nếu có | FROZEN nếu chốt dữ liệu; CHANGED nếu có vào/ra; STABLE; NO_BASELINE nếu `prevDate` null |
| **Hàng chờ** (mới) | `hl.queue.length`, `hl.queueIlliquid.length` | Mã mới vào / rời hàng chờ so với phiên trước trong `hist.sessions[-2].queue` (`HISTORY`) | CHANGED / STABLE / NO_BASELINE |
| **Vị trí giá** | **Đủ 8 trạng thái** `hl.pz.counts` (chữ: `hl.pz.stateVi`), tổng = `coverage.tracked`, đã định giá `coverage.priced`, có nền `coverage.withBase` | (a) `changes.toWatch`, `changes.backToZone` — mốc `PZ_PREV_SNAPSHOT`, ghi "so với ảnh chụp vị trí giá trước" (payload không có ngày). (b) Mã **đang giữ** đổi trạng thái PZ so với `hist` (`HISTORY`), ví dụ "VIC Vùng mua → Trong nền" | PARTIAL nếu `priced < tracked`; CHANGED / STABLE |
| **Xoay vòng & phí** | `hl.changes.turnover` (% NAV), `hl.changes.costEst` (% NAV), giả định `rule.costBuy` / `rule.costSell` | Không tính delta. Phiên dựng đầu tiên (`prevDate` null) ghi "phiên dựng đầu tiên — xoay vòng là tỷ trọng mua ban đầu" | NO_BASELINE / STABLE (0 giao dịch) / CHANGED |
| **Pha loãng** | `d.dilution.byTicker`, tách **chưa giao dịch** (`listed=false`) và **đã giao dịch** (`listed=true`); thêm số mã giao với danh mục ∪ hàng chờ | — (nguồn không có mốc đối chiếu) | STABLE / PARTIAL nếu thiếu `dilution` |

Quy tắc chung:
- Null hiển thị "—" kèm lý do, không bao giờ thành 0. Số 0 chỉ hiện khi nguồn trả đúng 0.
- Đơn vị: `%` cho tỷ trọng, NAV, xoay vòng, phí (1–2 chữ số thập phân, giống hiện nay). Đếm mã là số nguyên.
- Không lấy hai tổng khác định nghĩa trừ cho nhau. Delta "Danh mục" là **danh sách mã**, không phải hiệu hai số đếm.
- PZ và danh mục là **hai miền**. Một mã có thể đổi vùng PZ mà vẫn được giữ; đổi vùng PZ không phải lệnh mua hay bán.

## 4. Trạng thái

**Cấp bảng (`overall`)** lấy theo thứ tự ưu tiên. Mọi trạng thái phụ vẫn được liệt kê trong `overallWhy`, không bị che.

1. **ĐÓNG BĂNG**: `hl.dataGuard.frozen`. Lý do gốc vẫn hiện ở băng `hl-data-guard` sẵn có; panel chỉ ghi "xem lý do ở trên".
2. **DỮ LIỆU CŨ**: `d.freshness.sessionsBehind ≥ 1` và (`overdue` hoặc `≥ 2`). Dùng đúng điều kiện của các băng `hl-stale` hiện nay.
3. **CHƯA CÓ ĐỐI CHIẾU**: `hl.prevDate == null`.
4. **CÓ THAY ĐỔI**: có vào/ra danh mục, hoặc có `toWatch`/`backToZone`. Hàng chờ đổi **không** làm đổi trạng thái tổng; thay đổi đó được ghi ở chính hàng "Hàng chờ" và trong `overallWhy` ("Có thay đổi: Hàng chờ").
5. **ỔN ĐỊNH**: không thuộc các trường hợp trên.

**Cấp hàng:** dùng thêm `PARTIAL` (THIẾU) khi độ bao phủ chưa đủ, hoặc khi nguồn của hàng không tải được.

Ví dụ phiên 20/11 [ĐO]: overall là **ỔN ĐỊNH**. Danh mục: 7/10, 6 chính · 1 chạy lãi, không vào/ra, giữ 7. Hàng chờ: 12 (phiên trước 3), nên hàng này **CÓ THAY ĐỔI**. Vị trí giá: 37/37 đã định giá, toWatch 0, backToZone 0; mã đang giữ không đổi trạng thái so với 19/11. Xoay vòng 0%, phí 0%. Pha loãng: 13 chưa giao dịch, 2 đã giao dịch.

Hệ quả cho đặc tả: overall "ỔN ĐỊNH" không được che việc hàng chờ đổi. Vì vậy thứ tự ở mục 4 áp dụng cho **danh mục**; hàng có thay đổi vẫn tự gắn nhãn của nó.

## 5. UX

- **Vị trí:** đúng chỗ `TodayRibbon` (sau `MissionMeters`, trước lưới `ExitRadar` / `FunnelBars`), chiếm toàn chiều rộng. Lưới bên dưới còn `ExitRadar` + `FunnelBars` (2 cột).
- **Tiêu đề:** `NHỊP QUYẾT ĐỊNH HÔM NAY · so với phiên 19/11` cộng chip trạng thái tổng. Không lặp phiên, giờ khoá hay phiên bản (đã có ở `CommandBar`).
- **Desktop ≥ 1024 px:** bảng 4 cột, gồm Chỉ số 20%, Hiện tại 28%, So với phiên trước 30%, Trạng thái 22%.
  - Số căn phải, dùng chữ số đều (`tabular-nums`).
  - Mã chứng khoán là nút mở Hồ sơ 360° (giống `openBtn` hiện nay).
  - Ba nhóm có hàng tiêu đề phụ: Quyết định danh mục / Vị trí giá / Vốn & sự kiện.
- **Mobile < 768 px:** mỗi hàng thành một khối dọc theo thứ tự nhãn → hiện tại → so với phiên trước → trạng thái. Không cuộn ngang. Danh sách mã quá 6 thì rút gọn, kèm nút "Xem tất cả (N)".
- **Ngôn ngữ:**
  - Không dùng "Mua ngay" hay "Bán ngay".
  - "Vào mới" / "Ra" là thay đổi danh mục theo quy tắc. "Về vùng mua" là trạng thái vị trí giá, **không phải lệnh**.
  - Phí ghi "ước tính theo phí giả định".
  - Nhãn THĂM DÒ giữ như cũ.
- **Trợ năng:**
  - Chip trạng thái luôn có chữ, không dựa vào màu.
  - Bảng có `<caption>` ẩn và `scope` cho tiêu đề cột.
  - Cỡ chữ ≥ 10 px theo token Fluent-Dark.
- **Lớp bật/tắt:** lớp mới `pulse` ("Nhịp quyết định") trong `gq.hl.layers.v1`, mặc định bật theo quy tắc "mọi tính năng hiện mặc định". Tắt lớp thì `TodayRibbon` và `hl-changes` hiện lại đúng như cũ. Lớp này vừa là đường lùi vừa là cách so trước/sau.

## 6. Quan hệ với buồng lái (`CockpitStatusBar`)

Hai đặc tả gốc bỏ sót phần này. Khi lớp `pulse` bật:
- **Không đổi** dòng PHIÊN, giờ khoá, nguồn lệch phiên, và đếm theo trạng thái D1 của buồng lái. Đây là "dấu niêm phong phiên" và bản đồ trạng thái, khác mục đích với panel.
- Dòng "Chuyển trạng thái phiên này" (`cockpit-today`) và chữ lịch xét **trùng** với panel. Đề xuất (quyết định P2): giữ nguyên chữ, thêm liên kết "→ Nhịp quyết định". Chỉ khi anh duyệt mới rút gọn.

## 7. Những điều đặc tả này không làm

- Không đổi `eliteHl.js`, `hlWatch.js`, `decisionService.js` hay bất kỳ route nào. Không thêm `pz.prevDate` vào payload (P5 tách riêng).
- Không đổi `deckModel.deckInvariants`; băng `deck-invariants` giữ nguyên.
- Không xoá `TodayRibbon` khỏi `DeckTop.tsx`: thành phần vẫn còn để lớp tắt hiện lại và để lùi bản.
- Không đưa ExitRadar, Phễu, hàng chờ chi tiết, ngành hay bằng chứng vào panel (SPEC Phụ lục A, giữ nguyên).
