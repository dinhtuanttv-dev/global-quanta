# 03 — Luồng dữ liệu (aa346295)

## 1. Bản đồ hook → endpoint → nơi dùng [MÃ]

| Hook | Endpoint | Làm mới | Nơi dùng |
|---|---|---|---|
| `useBuyTimeline` | PA `/api/cotuc/buy-timeline` | 10 phút | `CotucTab`, `BuyTimelineTab` (KHOÁ) |
| `useGatewayBuyTimeline` | GW `/api/elite/buy-timing` (GATEWAY_STORE, last-good, tính lại phiên theo hôm nay) | — | `TimingSimPanel`, `useRadarModel` (tiêu chí 6) |
| `useEliteTiming` | = `useGatewayBuyTimeline` + `useToOverview` qua `withToRows` (bỏ DIVIDEND W1–W5, thêm dòng TO, tier EXPLORATORY) | — | `EliteScreener`, `EvidenceRestored`, `HlBuyCalendar`, `HlCalendarStrip`, `TimelineZonesBlock`, vòng `EliteCommandRadar` |
| `useDecisionStates` / `useDecisionState` | PA `/api/cotuc/decision-states`, `/signal-tracking` | 60 s | `DecisionRanking`, `BuyTimelineTab`, `DecisionBar` |
| `useToOverview` | GW `/api/corp-events/to` | — | `ToTickerCard`, `CotucTab`, `AnnouncementTimeline`, `TimingCenter` |
| `useEventStudy` | PA `/api/cotuc/event-study` | — | `TimingSimPanel` |
| `useEarningsCycleStats` / `Paths` / `AnnualEarningsCalendar` | PA `/api/cotuc/earnings-cycle-*`, `/annual-earnings-calendar` | — | `EarningsSeasonalityTab` |
| `useKqkd*` | GW `/api/fundamentals/kqkd/{summary, calendar, seasonality/:t, season-map, season-ledger, seasonality-x/:t, season-x/status, ledger, ticker/:t}` | — | `KqkdCenter`, `EarningsCalendar`, `SeasonalityView` |
| (corp-events) | GW `/api/corp-events/{ticker/:t, habits, ex-study, plan-news, fm-ledger, to, to/sim}` | — | Cổ tức: bộ lọc, lịch, thời điểm |

PA là Project A, GW là Gateway.

## 2. Song song Timeline: Project A và Gateway [ĐO 20/11]

| Hạng mục | Project A | Gateway | Kết luận |
|---|---|---|---|
| Số dòng | 165 | 165 | trùng |
| `asOf` decisions | 2026-11-20T08:11:36Z | 2026-11-20T08:11:36Z | trùng |
| `asOf` seasonality | 2026-11-19T22:46:35Z | 2026-11-19T22:46:35Z | trùng |
| Đếm validated / near / inWindow / upcoming | 2 / 163 / 1 / 155 | 2 / 163 / 1 / 155 | trùng |
| Trường khác | — | — | 10, đều là `sessionsToEntry` ở dòng IN_WINDOW/PASSED (PA âm, GW 0) |
| Độ trễ | 3,1 s | 0,6 s | GW nhanh gấp khoảng 5 lần |

Với dữ liệu hiện tại, Gateway có thể làm **nguồn đọc chính** cho Timeline phía Elite. Điều kiện là giữ được thông tin "đã qua N phiên" mà Project A đang mang trong dấu âm. Tầng 2 lấy thông tin đó bằng cách đọc dòng Project A cùng khoá, khi có. Nó không tự tính lại.

## 3. Đường đi của một mã trong khung "Mã đang chọn" (hiện tại)

```
mã X ──► TimingSimPanel ──► useGatewayBuyTimeline (W1–W5 thô) + useEventStudy (ngày PA)
     ──► HlBuyCalendar  ──► useEliteTiming       (W1–W5 bỏ DIV, + TO)
     ──► ToTickerCard   ──► useToOverview        (TO)
     ──► DecisionBar    ──► useDecisionState     (PA, 60 s)
```

Ba khối nằm cạnh nhau, đọc **ba cách nhìn khác nhau** về cùng một sự kiện, và không có nhãn nào nói điều đó (01 mục 5, M2/M4).

## 4. Đường đi đích

```
mọi hook hiện có ──► buildTimingBrain() ──► TimingBrainVM.byTicker.get(X)
                                              ├─► TimingSimPanel     (chỉ phần nhãn và ngày)
                                              ├─► HlBuyCalendar      (làn DIV_W và DIV_TO tách riêng)
                                              ├─► Radar tiêu chí 6 + vòng (cùng một làn)
                                              └─► Hồ sơ 360° TimelineZonesBlock
```

SWR đã khử trùng lặp theo khoá, nên khi các hook được gọi lại ở tầng 2, không phát sinh yêu cầu mạng mới. Điều này cần kiểm bằng đếm request trong E2E (07, NT-P3).

## 5. Ngân sách tài nguyên

- Không thêm lời gọi Project A, vì Vercel CPU đang được theo dõi tới khoảng 07/11 và gói Pro phải hạ trước 28/11.
- Không thêm đọc Neon hay Supabase.
- Tầng 2 chạy trong trình duyệt: O(n) trên khoảng 165 + 300 dòng, dưới 5 ms.
