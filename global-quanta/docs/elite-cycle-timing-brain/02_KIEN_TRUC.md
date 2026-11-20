# 02 — Kiến trúc đích

## 1. Nguyên tắc

1. **Nguồn giữ nguyên.** Mọi engine (Timeline W1–W5, TO-v1, decision-states, earnings-cycle, LC-v1, S7, S8, event-study) và mọi endpoint giữ nguyên công thức, tham số và hình dạng phản hồi.
2. **Một bộ chuyển thuần, chỉ đọc.** Thêm hàm TypeScript thuần, không I/O. Đầu vào là các phản hồi hook đã có, đầu ra là một view-model chung. Hàm này không tính số tài chính mới. Nó chỉ gắn nhãn, ghép danh tính và đối soát ngày.
3. **Một sự kiện, một danh tính.** Mỗi sự kiện (mã, loại, kỳ) có một khoá duy nhất. Mọi khối hiển thị cùng một sự kiện phải đọc cùng một bản ghi view-model.
4. **Nguồn hiện rõ.** Mỗi con số mang nguồn, `asOf` và bậc bằng chứng.
5. **Không thay thế ngầm.** Khi hai nguồn có nghĩa khác nhau (W1–W5 và TO), cả hai cùng hiện, có nhãn riêng. Không nguồn nào ghi đè nguồn kia.

## 2. Ba tầng

```
┌─────────────────────────── TẦNG 1 · NGUỒN (giữ nguyên 100%) ────────────────────────────┐
│ Project A: buy-timeline · decision-states · event-study · earnings-cycle-* · annual-cal │
│ Gateway  : elite/buy-timing · corp-events/to · fundamentals/kqkd/{calendar,seasonality, │
│            seasonality-x,season-map,season-ledger,summary,ticker,ledger}                │
│ Hook hiện có: useBuyTimeline · useGatewayBuyTimeline · useEliteTiming · useToOverview   │
│               useDecisionStates · useEventStudy · useKqkd* · useEarningsCycle*          │
└──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                           │ (chỉ đọc)
┌──────────────────────────── TẦNG 2 · BỘ CHUYỂN (MỚI, thuần) ────────────────────────────┐
│ lib/timing-brain/                                                                       │
│   identity.ts   — khoá sự kiện  (ticker|kind|period)                                    │
│   lanes.ts      — tách làn: DIV_W  (W1–W5) · DIV_TO (TO-v1) · EARN (Timeline EARNINGS)  │
│   dates.ts      — đối soát ngày công bố: Timeline · LC-v1 · event-study → 1 ngày + dải │
│   sessions.ts   — chuẩn hoá phiên: toEntry ≥ 0, elapsed ≥ 0 (từ dấu gốc, không tính lại)│
│   evidence.ts   — bậc bằng chứng theo sổ đăng ký (06)                                   │
│   model.ts      — buildTimingBrain(inputs) → TimingBrainVM                              │
└──────────────────────────────────────────┬───────────────────────────────────────────────┘
                                           │
┌──────────────────────────── TẦNG 3 · HIỂN THỊ (khung đã có) ────────────────────────────┐
│ QUYẾT ĐỊNH: HlBuyCalendar · HlCalendarStrip · TimingSimPanel · Radar (tiêu chí 6 + vòng)│
│             TimelineZonesBlock (Hồ sơ 360°) · EliteScreener                             │
│ Cổ tức   : TimelineModes (BuyTimelineTab KHOÁ — chỉ đọc VM ở lớp phủ nếu được duyệt)    │
│ KQKD     : EarningsCalendar · SeasonalityView                                           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Lưu ý: tầng 2 **không** đổi `useEliteTiming` hay `withToRows`. Nó nhận cả phản hồi thô của `useGatewayBuyTimeline` lẫn của `useToOverview`, rồi tự dựng lại các làn có nhãn. Các thành phần cũ vẫn chạy như hiện nay cho tới khi từng khối được chuyển sang đọc view-model ở giai đoạn đã duyệt (tệp 08).

## 3. Hợp đồng view-model (đề xuất)

```ts
type Lane = "DIV_W" | "DIV_TO" | "EARN";
type Tier = "VALIDATED" | "NEAR" | "EXPLORATORY" | "CONTEXT" | "FAILED";
type SourceId = "PA_TIMELINE" | "GW_BUYTIMING" | "GW_TO" | "GW_LC" | "PA_EVENT_STUDY" | "GW_S8";

interface SourceStamp { id: SourceId; asOf: string | null; }

interface DateClaim { source: SourceId; date: string; basis: string /* HISTORICAL_LAG, VNDIRECT_BCTC, LC dự kiến … */; }

interface ReconciledDate {
  primary: string | null;          // theo thứ tự ưu tiên ở 04 mục 4
  band?: { from: string; to: string };
  deadlines?: { standalone?: string; consolidated?: string };
  claims: DateClaim[];             // giữ mọi nguồn, không vứt
  spreadDays: number;              // max − min theo ngày lịch giữa các claim
  agree: boolean;                  // spreadDays === 0
}

interface TimingEvent {
  key: string;                     // `${ticker}|${lane}|${period}`
  ticker: string; lane: Lane; period: string; // "2026Q4" | GDKHQ "2026-12-05"
  status: "UPCOMING" | "IN_WINDOW" | "PASSED";  // nguyên văn từ nguồn
  window: { from: string | null; to: string | null; exit?: string | null };
  sessions: { toEntry: number | null; elapsed: number | null }; // xem 04 mục 3
  tier: Tier;
  eventDate?: ReconciledDate;      // EARN: ngày công bố; DIV_*: GDKHQ
  sources: SourceStamp[];
  notes: string[];                 // nhãn trung thực, VD "TO-L1 đang ghi sổ"
}

interface TimingBrainVM {
  asOf: { timeline: string | null; to: string | null; lc: string | null; decisions: string | null };
  events: TimingEvent[];
  byTicker: Map<string, TimingEvent[]>;
  parity: { timelineRows: number; gatewayRows: number; fieldDiffs: number; sessionSignDiffs: number };
  warnings: string[];              // VD "Ngày KQKD MSH lệch 2 ngày giữa 3 nguồn"
}
```

`buildTimingBrain` là hàm thuần nên có thể kiểm bằng ảnh chụp dữ liệu thật (fixture 20/11), giống `lib/elite10/cockpit`.

## 4. Những điều kiến trúc này KHÔNG làm

- Không thêm endpoint, không đổi endpoint, không thêm cron.
- Không gộp hay xoá engine nào. W1–W5, TO-v1, S7 và S8 cùng tồn tại.
- Không tính lại xác suất, kỳ vọng hay ngưỡng. `DecisionBar` chỉ được đổi nhãn nếu anh duyệt (08, quyết định Q4).
- Không đụng `BuyTimelineTab` hay `lib/cotuc/buy-timeline.ts`.
