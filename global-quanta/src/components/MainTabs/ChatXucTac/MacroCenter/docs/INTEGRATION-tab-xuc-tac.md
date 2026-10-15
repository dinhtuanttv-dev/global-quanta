# Bàn giao tích hợp: Trung tâm vĩ mô → tab chat "xúc tác"

Đối tượng đọc: **AI lập trình** sẽ làm việc trong repo của dự án. Đọc hết tài liệu trước khi viết dòng code nào.
Đi kèm: `README.md` (chạy thử), `docs/HANDOFF-macro-P0-P5.md` (phạm vi, kiểm chứng, giới hạn của gói `macro-center`).

> **Điều tài liệu này KHÔNG biết:** người viết chưa thấy mã nguồn của tab "xúc tác" và cơ chế chat của nó. Mọi chỗ đánh dấu **[XÁC MINH]** là giả định phải được kiểm tra trong repo ở Giai đoạn 0. Nếu thực tế khác, làm theo thực tế và ghi lại sự khác biệt, đừng ép repo theo giả định.

---

## 0. Quy tắc bất biến

1. **Không sửa các tab hiện có.** Tính năng mới đi vào module và tab mới, sau cờ tính năng (`feature flag`).
2. **Không đổi logic thống kê trong `quant-macro.ts`** để "cho ra kết quả đẹp". Nếu cần sửa, phải chạy lại toàn bộ 120 test và thêm test cho hành vi mới. Không nới ngưỡng (`alpha`, cổng backtest) để tăng số ô có ý nghĩa.
3. **Mọi con số hiển thị cho người dùng phải đến từ API.** Chat không được tự suy ra, làm tròn thành kết luận mạnh hơn, hay bịa số.
4. **Ô không vượt hiệu chỉnh kiểm định bội = "chưa đủ bằng chứng"**, không được diễn đạt thành "không có tác động" hay "có tác động".
5. **Không dùng `MacroScore` làm tín hiệu quyết định** khi `usableForDecisions !== true`.
6. **Dữ liệu mô phỏng luôn kèm biểu ngữ** (`notice`). Không bao giờ lược bỏ nó trong giao diện hay câu trả lời chat.
7. **Không commit khoá, đường dẫn máy cá nhân, file `.db` có dữ liệu thật.**

## 1. Bối cảnh dự án (theo thông tin đã biết, **[XÁC MINH]**)

- Stack: React + Vite + TypeScript; logic thuần đặt trong các file `quant-*.ts`; kiểm thử bằng Vitest; backend API chạy ở host riêng (các route `/api/cotuc/*`).
- Dự án đã có các động cơ định lượng (timing cổ tức/KQKD, bộ kết hợp log-odds nhiều tín hiệu, hiệu chỉnh isotonic, chế độ thị trường, tab Lọc ngành/RRG). Mỗi giai đoạn bàn giao kèm `HANDOFF.md` và file `.zip`.
- Có thể đã tồn tại một tín hiệu vĩ mô dạng Risk-On/Off và một điểm Confluence ở phía Lọc ngành. **Rủi ro đếm đôi**: nếu `MacroScore` được thêm vào bộ kết hợp song song với tín hiệu vĩ mô cũ mà không xử lý tương quan, trọng số vĩ mô bị khuếch đại. Phải kiểm tra (Giai đoạn 0, mục 2.5) trước khi nối.
- Gói này tuân theo cùng quy ước: logic thuần trong `src/*.ts`, API không phụ thuộc framework, test Vitest, `HANDOFF.md`.

## 2. Giai đoạn 0 — Khảo sát (bắt buộc, chưa được viết code)

Đọc mã nguồn thật rồi nộp **một báo cáo ngắn** (bảng, không quá 1 trang) trả lời đủ các câu sau. Chỉ sau khi người phụ trách dự án xác nhận mới sang Giai đoạn 1.

| # | Câu hỏi | Cách tìm | Ảnh hưởng đến thiết kế |
|---|---|---|---|
| 2.1 | Tab "xúc tác" thực chất là gì: (A) giao diện chat hội thoại trả lời về các yếu tố xúc tác, hay (B) danh sách/bảng sự kiện xúc tác, hay (C) cả hai? | Đọc component của tab, route, store | Chọn kịch bản tích hợp ở mục 3 |
| 2.2 | Chat gọi mô hình ngôn ngữ ở đâu (frontend hay backend)? Nhà cung cấp nào? Có hỗ trợ gọi công cụ (`tool use`/`function calling`) không? | Tìm client LLM, biến môi trường | Quyết định cách đặt công cụ vĩ mô (mục 4) |
| 2.3 | Tin nhắn hiện được render thế nào (chỉ văn bản, Markdown, hay có thẻ giàu nội dung)? | Component danh sách tin nhắn | Có nhúng được thẻ React vào tin nhắn không (mục 5) |
| 2.4 | Hệ thống kiểu dáng: Tailwind, CSS module, styled-components? Có biến màu/chế độ tối chung không? | `tailwind.config`, thư mục style | Có dùng `macro-center.css` nguyên bản hay phải chuyển đổi |
| 2.5 | Đã có tín hiệu vĩ mô/Risk-On-Off/chế độ thị trường nào chưa? Ở file nào, đầu ra ra sao, có đi vào bộ kết hợp log-odds không? | Tìm `macro`, `regime`, `riskOn`, `confluence` | Chống đếm đôi (mục 7) |
| 2.6 | Có tính năng nào đã làm điều tương tự (xúc tác vĩ mô, lịch số liệu, cảnh báo)? | Tìm `calendar`, `catalyst`, `alert` | Tránh trùng lặp: tái dùng nếu đã có |
| 2.7 | Xác thực và phân quyền backend: middleware nào? Cách gọi API từ frontend (proxy Vite, CORS, token)? | Server, `vite.config` | Gói **không có xác thực**; phải đặt sau lớp này |
| 2.8 | Phiên bản Node ở môi trường chạy backend? | `package.json`, Dockerfile | Kho SQLite cần Node ≥ 22.5; nếu thấp hơn, cài lớp `VintageStore` trên CSDL hiện có |
| 2.9 | Dự án đã có CSDL nào (Postgres/SQLite…)? | Cấu hình backend | Dùng `MACRO_DDL` trên CSDL hiện có thay vì thêm file `.db` |
| 2.10 | Nguồn số liệu vĩ mô thật đã có chưa (GSO/NHNN/HOSE)? Định dạng? | Hỏi người phụ trách | Quyết định ETL; trong lúc chờ dùng dữ liệu mô phỏng |
| 2.11 | Bộ test hiện có chạy thế nào và đang xanh không? | `npm test` | Làm mốc để chứng minh không hồi quy |

Nếu một câu không trả lời được từ mã nguồn, **hỏi người phụ trách** (tối đa một câu hỏi mỗi lần, ưu tiên 2.1, 2.2, 2.10).

## 3. Chọn kịch bản tích hợp theo kết quả 2.1

- **Kịch bản A — chat hội thoại.** Vĩ mô trở thành bộ **công cụ** mà chat gọi, cộng với **thẻ giàu nội dung** hiển thị trong tin nhắn. (Mặc định nếu 2.1 chưa rõ.)
- **Kịch bản B — danh sách xúc tác.** Vĩ mô trở thành **nguồn sự kiện xúc tác**: mỗi số liệu sắp công bố, cảnh báo vượt ngưỡng, chuyển chế độ là một dòng xúc tác (mục 6).
- **Kịch bản C** = A + B, dùng chung lớp adapter (mục 4).

Trong cả ba, thêm `MacroCenterTab` như một tab riêng (đầy đủ ma trận/kịch bản) là việc tuỳ chọn; ưu tiên làm A/B trước.

## 4. Kiến trúc tích hợp

```
Kho dữ liệu (SQLite/CSDL) → createMacroApi → /api/macro/*  ──┬─→ macro-llm.ts (adapter, MỚI) → công cụ cho chat
                                                              ├─→ macro-catalyst.ts (adapter, MỚI) → nguồn sự kiện xúc tác
                                                              └─→ MacroCenterTab / thẻ React (có sẵn)
```

### 4.1 Đặt mã vào repo

- Sao chép `src/*.ts` (trừ `*.test.ts` nếu repo có quy ước test riêng; vẫn nên giữ test) vào thư mục module mới, ví dụ `src/macro/` hoặc theo quy ước `quant-*` của repo. Giữ nguyên tên file và quan hệ import tương đối.
- `src/ui/*` vào thư mục thành phần của repo; import `macro-center.css` một lần ở nơi nạp tab/thẻ.
- `scripts/*` vào thư mục script nếu cần chạy `import`/`report`.
- Không sao chép `python/macro_service.py` cho đến khi có quyết định dùng Johansen/VECM (bản nháp chưa chạy).

### 4.2 Backend

```ts
const store = new SqliteVintageStore(process.env.MACRO_DB ?? 'macro.db'); // hoặc lớp VintageStore trên CSDL hiện có
const api = createMacroApi({ store, notice: process.env.MACRO_DEMO ? SYNTHETIC_NOTICE : undefined });
app.all('/api/macro/*', requireAuth, rateLimit, async (req, res) => {
  const out = await api.handle({ method: req.method, path: req.path, query: req.query as Record<string, string>, body: req.body });
  res.status(out.status).json(out.body);
});
```

- `requireAuth` và `rateLimit` là **bắt buộc**: `createMacroApi` không có cả hai.
- Tính toán nặng chạy đồng bộ trong tiến trình (ma trận tác động ~1–3 giây lần đầu, sau đó cache). Nếu backend dùng chung tiến trình với việc khác, đặt `/api/macro/*` ở worker riêng hoặc làm nóng cache khi khởi động bằng một lần gọi `impact` và `score`.
- Biến môi trường gợi ý: `MACRO_DB`, `MACRO_DEMO=1` (dữ liệu mô phỏng), `VITE_MACRO_API` (frontend).

### 4.3 Adapter cho LLM — `macro-llm.ts` (**file mới, phải viết**)

Không bao giờ đưa JSON thô của API vào ngữ cảnh mô hình (`impact` có hàng trăm ô, hàng chục KB). Adapter nhận payload API và trả về **bản tóm tắt gọn, giữ nguyên các cảnh báo bắt buộc**.

**Quy tắc cho mọi đầu ra của công cụ** (kiểm thử bằng test, xem mục 8):

1. Có `asOf`, `lastPeriod`, `dataVersion`, và `notice` nếu API trả (nguyên văn).
2. Mỗi tác động nêu: biến, chỉ số, hướng, hệ số, `t`, `q`, độ trễ, **trạng thái** (`stable`/`unstable`/`significant`/`insignificant`).
3. Giới hạn kích thước: tối đa 12 ô cho `impact_top`, 6 dòng cho kịch bản, 3 yếu tố đóng góp; đầu ra mỗi công cụ ≲ 1.500 token.
4. Không có `NaN`, `undefined`, số trần không đơn vị. Số dùng dấu phẩy thập phân tiếng Việt (có sẵn `fmtNum` trong `macro-filter.ts`).
5. Câu mô tả ô dùng lại `describeCell` (đã mang sẵn cảnh báo "chưa đủ bằng chứng", "không ổn định").

**Sáu công cụ đề xuất** (tên, tham số, route nguồn):

| Công cụ | Tham số | Nguồn | Đầu ra tóm tắt |
|---|---|---|---|
| `macro_snapshot` | `target?` (mặc định `VNINDEX`), `asOf?` | `score` + `regime` + `alerts` | Nhiệt kế (nhãn, điểm, 3 yếu tố đóng góp), chế độ hiện tại (nhãn, xác suất), số cảnh báo và 3 cảnh báo cao nhất, `usableForDecisions` kèm `gateNote` |
| `macro_impact_top` | `target?`, `factor?`, `direction?`, `onlyStable?`, `limit?` (≤12) | `impact` + `buildMatrixView` | Danh sách ô có ý nghĩa, xếp theo `|t|`, kèm trạng thái và câu mô tả |
| `macro_cell_detail` | `factor`, `target`, `lag?` | `cell` | β, SE, t, p, khoảng bootstrap, tóm tắt độ ổn định (khoảng đầu/cuối của hệ số trượt, không đưa cả chuỗi) |
| `macro_scenario` | `scenarioId` hoặc `shocks[]`, `horizon?` | `scenario` | Bảng thắng/thua có khoảng tin cậy, cờ `significant`, cảnh báo của API |
| `macro_regime_sensitivity` | `factor`, `target` | `regime-impact` | Hệ số theo chế độ và `equalityP`, kèm ghi chú "mang tính mô tả" |
| `macro_calendar` | `asOf?` | `calendar` + `alerts` | 6 số liệu sắp công bố, **ghi rõ "ước tính"**, cảnh báo đang có |

Lược đồ tham số: dùng JSON Schema, `additionalProperties: false`, liệt kê giá trị hợp lệ của `target`/`factor`/`scenarioId` từ `GET /api/macro/series` (đừng viết cứng; nạp một lần khi khởi động). Lỗi API (400/422) phải được chuyển thành thông điệp công cụ **nguyên văn tiếng Việt của API** để chat giải thích cho người dùng, không được nuốt lỗi hay thử lại với tham số bịa.

### 4.4 Chỉ dẫn hệ thống cho chat (đề xuất, chỉnh theo giọng của dự án)

```
Khi trả lời về vĩ mô, chỉ dùng số liệu từ công cụ macro_*. Không tự suy ra số.
- Nêu kỳ dữ liệu (lastPeriod) và, nếu có biểu ngữ notice, nhắc lại nguyên văn.
- Phân biệt rõ: "có ý nghĩa và ổn định", "có ý nghĩa nhưng không ổn định", "chưa đủ bằng chứng".
  Không nói "không có tác động" khi chỉ là "chưa đủ bằng chứng".
- Đây là tương quan thống kê lịch sử, không phải quan hệ nhân quả và không phải khuyến nghị đầu tư.
- Ngày công bố trong lịch là ước tính.
- Nếu usableForDecisions = false, nói rõ điểm vĩ mô chỉ để tham khảo.
- Nếu công cụ trả lỗi hoặc thiếu dữ liệu, giải thích nguyên nhân bằng lời của lỗi; không đoán.
- Kết quả kịch bản có khoảng tin cậy: nếu khoảng chứa 0, nói là chưa kết luận được hướng.
```

## 5. Thẻ giàu nội dung trong chat (kịch bản A, nếu 2.3 cho phép)

Các thành phần trình bày **không tự gọi API**, nhận props nên nhúng được vào tin nhắn:

| Kết quả công cụ | Thành phần | Dữ liệu cần |
|---|---|---|
| `macro_snapshot` | `MacroThermometer` | payload `score` + bảng tên (`names`) từ `series` |
| `macro_impact_top` | `MacroImpactMatrix` | `buildMatrixView(impact, filter)` |
| `macro_cell_detail` | `CellDetail` | payload `cell` + `describeCell(...)` |
| `macro_scenario` | `ScenarioPanel` (chế độ chỉ đọc: truyền `onSelect`/`onHorizon` rỗng) | payload `scenario` |
| `macro_calendar` | `MacroCalendar` | payload `calendar` + `alerts` |

- Bọc trong `<div className="mc mc-inline">` và thêm: `.mc-inline { padding: 0; background: transparent; max-width: none; }`. Toàn bộ biến màu nằm trong `.mc`, nên CSS không rò ra ngoài.
- Thẻ **bổ sung** cho văn bản của chat, không thay thế: câu trả lời văn bản vẫn phải đứng độc lập (đọc được khi thẻ không render, ví dụ trên kênh khác).
- Ma trận trong chat chỉ nên là bản thu nhỏ (≤ 6 hàng × 6 cột); bản đầy đủ ở `MacroCenterTab`.
- Kiểm tra trên màn hình 390px: bảng cuộn ngang bên trong khung của nó, trang không tràn ngang.

## 6. Kịch bản B — nguồn sự kiện xúc tác (`macro-catalyst.ts`, **file mới**)

Chuyển đầu ra API thành sự kiện theo mô hình dữ liệu **hiện có của tab** (**[XÁC MINH]** trường nào bắt buộc). Ánh xạ gợi ý:

| Nguồn | Sự kiện xúc tác | Ghi chú bắt buộc |
|---|---|---|
| `calendar.releases[]` | "Công bố {nameVi} kỳ {period}" tại `expectedDate` | Gắn nhãn **ước tính**; `status: overdue` là xúc tác "chậm công bố" |
| `alerts[]` kiểu `factor-extreme` | "{messageVi}" | Mức `high/warn` giữ nguyên |
| `alerts[]` kiểu `regime-change` | "Chuyển chế độ vĩ mô" | Chỉ phát khi xác suất ≥ 60% (API đã áp) |
| `alerts[]` kiểu `unstable-effect` | "Độ nhạy {factor}→{target} không còn ổn định" | Mức thông tin, không phải tín hiệu mua/bán |

- Khử trùng lặp theo khoá `id` của cảnh báo / `seriesId+period` của lịch; không phát lại sự kiện đã phát.
- Mỗi sự kiện kèm đường dẫn mở thẻ chi tiết ở `MacroCenterTab` (nếu có).
- Sự kiện "dự báo ảnh hưởng" (ví dụ "CPI cao → Smallcap giảm") chỉ được tạo từ ô `stable`, kèm `q`; không tạo từ ô sọc.

## 7. Nối MacroScore vào bộ máy quyết định (chỉ khi được yêu cầu)

1. Điều kiện cần: `usableForDecisions === true` **trên dữ liệu thật**, không phải dữ liệu mô phỏng.
2. Đưa `z` (có trong chuỗi `series` của `score`) vào bộ kết hợp log-odds như **một tín hiệu mới**, với trọng số được học/ước lượng theo cách bộ kết hợp hiện có đang làm; không đặt tay.
3. **Chống đếm đôi** với tín hiệu Risk-On/Off hoặc chế độ thị trường đã có (mục 2.5): đo tương quan giữa hai tín hiệu trên lịch sử; nếu |ρ| lớn, trực giao hoá (hồi quy phần dư) hoặc chỉ giữ một. Ghi quyết định vào `HANDOFF.md`.
4. Phải chạy lại backtest của bộ quyết định **có và không có** tín hiệu vĩ mô; chỉ bật khi cải thiện ngoài mẫu. Nếu không cải thiện, giữ ở dạng tham khảo.
5. Không tự bật mặc định; dùng cờ cấu hình.

## 8. Kế hoạch kiểm thử

**Chạy ngay từ đầu (mốc):** `npm test` của repo (ghi số test, bằng chứng xanh) và `npm test` của gói macro (120 test).

**Test cần thêm:**

| Mảng | Nội dung kiểm tra |
|---|---|
| Adapter LLM | Mỗi công cụ: có `asOf`/`lastPeriod`/`notice`; không `NaN`/`undefined`; giới hạn kích thước (đếm ô/dòng); trạng thái ô khớp `buildMatrixView`; lỗi 400/422 được chuyển nguyên văn |
| Bất biến an toàn | Ô `insignificant` không bao giờ xuất hiện trong danh sách "tác động"; `usableForDecisions=false` luôn kéo theo `gateNote`; lịch luôn mang nhãn "ước tính" |
| Hợp đồng API | Với dữ liệu mô phỏng cố định (`makeSyntheticStore(2024)`): CPI→VN-Index có hướng âm, ý nghĩa, trễ 1; M2→Smallcap dương; 0 dương tính giả trong biến không liên quan (xem test sẵn có làm mẫu) |
| Công cụ | Xác thực lược đồ tham số: từ chối `target`/`factor` ngoài danh mục (400) |
| Chat (đầu-cuối) | Bộ hội thoại mẫu có kiểm tra: (1) hỏi tác động → trả lời nêu `q` và trạng thái; (2) hỏi biến không có ý nghĩa → nói "chưa đủ bằng chứng", không nói "không có tác động"; (3) hỏi kịch bản → nêu khoảng tin cậy; (4) hỏi khi thiếu dữ liệu → giải thích lỗi 422; (5) hỏi dự báo giá cụ thể → từ chối đưa khuyến nghị, chỉ nêu độ nhạy lịch sử |
| Thẻ React | Render phía server như `src/ui/macro-ui.test.tsx`; kiểm tra thuộc tính trợ năng (`role`, `aria-label`) còn nguyên |
| Hồi quy | Toàn bộ test cũ của repo vẫn xanh; ảnh chụp các tab cũ không đổi |
| Hiển thị | Chụp 1200px và 390px (có script `npm run preview`); không tràn ngang |

Kiểm tra bằng trình duyệt thật, API sống, **chưa từng được thực hiện** cho gói này; đó là một phần việc của bạn (mục 10).

## 9. Triển khai và lùi lại

1. Cờ `FEATURE_MACRO_CENTER` (backend và frontend), mặc định tắt.
2. Bước 1: bật với `MACRO_DEMO=1` cho nhóm nội bộ; biểu ngữ mô phỏng phải hiển thị.
3. Bước 2: nạp dữ liệu thật (`npm run import`), kiểm tra `GET /api/macro/series` cột `issues`; **so ma trận với bài báo 2015**, ghi nhận các dấu khác.
4. Bước 3: bật công cụ cho chat; theo dõi `GET /api/macro/health` (tỉ lệ `hits/misses`), thời gian phản hồi, tỉ lệ lỗi 422.
5. Lùi lại: tắt cờ; không cần di trú dữ liệu (kho vintage chỉ thêm, không sửa).

## 10. Việc phải làm theo thứ tự (kèm tiêu chí xong)

| # | Việc | Xong khi |
|---|---|---|
| 1 | Giai đoạn 0: nộp báo cáo khảo sát (mục 2) | Người phụ trách xác nhận kịch bản A/B/C |
| 2 | Đặt mã gói vào repo, chạy test gói và test repo | Cả hai xanh, `tsc` sạch, không đổi tab cũ |
| 3 | Mount API sau xác thực + giới hạn tần suất, bật `MACRO_DEMO` | `GET /api/macro/health` trả 200 qua lớp xác thực; 401 khi chưa đăng nhập |
| 4 | Viết `macro-llm.ts` + test (kịch bản A) hoặc `macro-catalyst.ts` + test (B) | Test mục 8 đạt |
| 5 | Nối công cụ vào chat; thêm chỉ dẫn hệ thống mục 4.4 | Bộ hội thoại mẫu 5/5 đạt |
| 6 | Thẻ React trong tin nhắn (nếu 2.3 cho phép) | Hiển thị đúng ở 1200px và 390px |
| 7 | Chạy thử trình duyệt thật với API sống; sửa lỗi phát sinh | Ghi lại các lỗi đã gặp trong `HANDOFF.md` |
| 8 | Nạp dữ liệu thật; so với bài báo; đối chiếu `pubLagMonths` từng nguồn | Báo cáo so sánh nộp cho người phụ trách |
| 9 | (Tuỳ chọn) Nối `MacroScore` vào bộ quyết định theo mục 7 | Backtest có/không có tín hiệu cho thấy cải thiện ngoài mẫu |
| 10 | Cập nhật `HANDOFF.md` của dự án, đóng gói `.zip` | Có danh sách thay đổi, số test, giới hạn còn lại |

## 11. Cạm bẫy đã gặp khi làm gói này

- **Lưới CSS tràn ngang trên điện thoại** vì ô lưới có `min-width: auto`. Đã sửa bằng `minmax(0, 1fr)`; khi nhúng vào bố cục chat có thể gặp lại nếu thẻ nằm trong một `grid`/`flex` khác. Đặt `min-width: 0` cho khung chứa.
- **`lag` trong ma trận tính từ thời điểm số liệu được công bố**, không phải từ tháng tham chiếu. Giải thích sai điều này sẽ làm người dùng hiểu nhầm thời điểm tác động.
- **`asOf` cắt dữ liệu theo ngày công bố ước tính**: truy vấn ngày gần có thể thiếu kỳ mới nhất của vài chuỗi (kết quả đúng, không phải lỗi).
- **Hiệu chỉnh BY rất bảo thủ** (hàng trăm ô): ít ô vượt ngưỡng là hành vi bình thường, đừng "sửa" bằng cách đổi sang BH hoặc tăng `alpha` mà không có quyết định của người phụ trách.
- **Chế độ vĩ mô (HMM)** được ước lượng trên toàn mẫu; xác suất lọc an toàn cho dùng thời gian thực nhưng độ nhạy theo chế độ chỉ mang tính mô tả.
- **Test chạy bằng shim Vitest** ở môi trường tạo gói; có thể phát hiện khác biệt nhỏ khi chạy Vitest thật. Nếu có, sửa test hoặc mã và ghi lại.
- **Kho SQLite** dựa vào `node:sqlite` (thử nghiệm). Nếu repo dùng Node thấp hơn 22.5 hoặc có CSDL riêng, viết lớp `VintageStore` theo `MACRO_DDL`; giữ nguyên ngữ nghĩa "chỉ thêm, không sửa" và tăng `dataVersion` ở mỗi lần ghi.

## 12. Câu hỏi cần người phụ trách trả lời

1. Tab "xúc tác" là chat hội thoại, danh sách sự kiện, hay cả hai? (mục 2.1)
2. Chat dùng nhà cung cấp mô hình nào và có hỗ trợ gọi công cụ không? (mục 2.2)
3. Nguồn dữ liệu vĩ mô thật lấy từ đâu và ở định dạng nào? (mục 2.10)
4. Có chấp nhận thêm file SQLite cho kho vĩ mô, hay dùng CSDL hiện có? (mục 2.9)
5. Tín hiệu vĩ mô/Risk-On-Off hiện có nằm ở đâu, và có muốn `MacroScore` thay thế, bổ sung, hay chỉ để tham khảo? (mục 7)
