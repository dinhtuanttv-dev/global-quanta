# Bàn giao tích hợp: Trung tâm vĩ mô → tab chat "xúc tác"

Đối tượng đọc: AI lập trình (coding agent) sẽ tích hợp vào dự án đang phát triển. Đọc hết mục 1–3 trước khi sửa bất cứ file nào. Tài liệu này KHÔNG dựa trên việc đã đọc mã tab chat của dự án; mục 2 liệt kê những gì phải tự xác minh.

## 0. Tóm tắt

- Gói `macro-center` (TypeScript, đã có 131 test) phân tích tác động của biến vĩ mô lên chỉ số HOSE: ma trận tác động đã kiểm tra tính dừng và hiệu chỉnh kiểm định bội, nhiệt kế vĩ mô, kịch bản "nếu…thì", cảnh báo, lịch công bố, báo cáo tháng.
- Để chat dùng được, gói có sẵn lớp công cụ: `src/macro-chat-tools.ts` (6 tool cho LLM, bộ thực thi gọn và trung thực, system prompt, adapter cho Anthropic/OpenAI).
- Việc của bạn: đưa gói vào repo, nối dữ liệu thật, đăng ký 6 tool vào luồng chat hiện có, hiển thị kết quả hợp lý, kiểm thử bằng các hội thoại mẫu ở mục 8.
- Nguyên tắc cao nhất: **chat không được nói mạnh hơn số liệu cho phép** (mục 7).

## 1. Mục tiêu và định nghĩa hoàn thành

Người dùng trong tab chat hỏi được, bằng tiếng Việt tự nhiên, những câu như: "vĩ mô đang thuận lợi hay bất lợi?", "lạm phát ảnh hưởng gì tới VNSmallcap?", "nếu VND mất giá 3% thì chỉ số nào chịu thiệt?", "sắp có số liệu gì?" và nhận câu trả lời đúng với số liệu từ API vĩ mô, kèm lưu ý trung thực.

Hoàn thành khi TẤT CẢ đúng:
1. 131 test của gói đạt trong repo của dự án; `typecheck` sạch.
2. Chat gọi đúng tool cho các câu hỏi ở mục 6 và 8 (kiểm thử tự động bằng model giả có kịch bản, không cần gọi model thật).
3. Mọi con số trong câu trả lời truy ngược được tới kết quả tool; không có tool call thì không có số liệu vĩ mô.
4. Các quy tắc ở mục 7 được kiểm bằng test (ít nhất các ca G1–G8 ở mục 8).
5. Tab và chức năng hiện có không bị sửa hành vi (chạy lại toàn bộ test hiện có của dự án).
6. Khi dữ liệu là mô phỏng, biểu ngữ `notice` luôn xuất hiện ở đầu câu trả lời.
7. Có `INTEGRATION-NOTES.md` ghi lại những gì đã khảo sát và quyết định (mục 5, Giai đoạn 0).

## 2. Giả định cần xác minh (đừng tin, hãy kiểm tra)

| # | Giả định | Cách xác minh trong repo | Nếu sai |
|---|---|---|---|
| A1 | "Tab chat xúc tác" là giao diện chat để hỏi AI về các yếu tố xúc tác (catalyst) của cổ phiếu/thị trường; backend chat gọi một LLM có hỗ trợ tool/function calling | Tìm `xúc tác`, `xuc tac`, `catalyst`, `chat` trong `src/` và thư mục backend; tìm nơi gọi SDK model | Nếu tab không có LLM hoặc không hỗ trợ tool calling: dùng phương án dự phòng ở mục 4 (định tuyến theo từ khoá tới các tool, gọi `tools.run` trực tiếp, rồi tự định dạng câu trả lời bằng mẫu ở mục 7) |
| A2 | Stack React + Vite + TypeScript; logic thuần nằm trong các file `quant-*.ts`; test bằng Vitest; backend API tách host, đường dẫn dạng `/api/<module>/*` | `package.json`, `vite.config.*`, cấu trúc thư mục | Điều chỉnh vị trí file và cách gọi API; không đổi logic trong gói |
| A3 | Dự án đã có bộ máy quyết định (bộ kết hợp log-odds, chế độ thị trường Risk-On/Off, `DecisionBar`) | Tìm `log-odds`, `market-regime`, `DecisionBar` | Bỏ Giai đoạn 5 |
| A4 | Server chạy Node ≥ 22.5 | `node --version`, `engines` | Dùng `InMemoryVintageStore` nạp từ file khi khởi động, hoặc cài `VintageStore` trên CSDL đang dùng (giao diện ở `macro-data.ts`) |
| A5 | Các tab/tính năng hiện có phải giữ nguyên | Chạy test hiện có trước và sau | Không có ngoại lệ |
| A6 | Chưa có xác thực riêng cho API vĩ mô | Đọc middleware xác thực hiện có | Dùng chung cơ chế xác thực của ứng dụng |

Không suy đoán tên file hay hàm của dự án. Nếu không tìm thấy, ghi vào `INTEGRATION-NOTES.md` và hỏi người dùng một câu cụ thể.

## 3. Những gì được bàn giao

Chép nguyên thư mục `src/` của gói vào repo (gợi ý: `src/macro/` hoặc package riêng `packages/macro-center`), giữ nguyên tên file vì các import là tương đối. Không sửa logic thống kê.

| File | Vai trò | Ghi chú tích hợp |
|---|---|---|
| `quant-macro.ts` | Lõi thống kê | Không phụ thuộc thư viện |
| `macro-data.ts` | Danh mục 18 chuỗi, kho vintage, ETL, kiểm tra chất lượng | `pubLagMonths` mặc định cần đối chiếu từng nguồn |
| `macro-store-sqlite.ts`, `macro-import.ts` | Kho SQLite, nạp CSV | Cần Node ≥ 22.5 |
| `macro-regime.ts`, `macro-scenario.ts`, `macro-backtest.ts`, `macro-report.ts` | Chế độ, kịch bản, backtest, báo cáo | |
| `macro-api.ts`, `macro-http.ts`, `macro-client.ts` | API không phụ thuộc framework | `createMacroApi(...).handle(req)` |
| **`macro-chat-tools.ts`** | **Công cụ cho chat** | Điểm tích hợp chính |
| `macro-filter.ts`, `ui/*` | Thành phần React, CSS | Tuỳ chọn (Giai đoạn 4) |
| `scripts/*` | `serve`, `import`, `report` | Dùng để nạp dữ liệu và thử |
| `python/macro_service.py` | Johansen/VECM | Bản nháp chưa chạy; KHÔNG cần cho tích hợp này |

## 4. Kiến trúc

```
Người dùng ─► Tab chat (UI hiện có)
                 │  POST /api/chat (đã có)
                 ▼
          Backend chat (đã có) ──► LLM + tools = MACRO_TOOL_SPECS + MACRO_CHAT_SYSTEM_PROMPT
                 ▲                      │ tool_use {name, input}
                 │ tool_result          ▼
                 └──────── createMacroChatTools(api).run(name, input)
                                         │ (gọi trong tiến trình, không qua HTTP)
                                         ▼
                              createMacroApi({ store }) ──► VintageStore (SQLite)
```

- Phương án chính (bắt buộc): công cụ chạy trong backend chat, gọi API vĩ mô cùng tiến trình. Không cần mở thêm cổng mạng.
- Phương án phụ (tuỳ chọn): mở `MacroCenterTab` hoặc từng thành phần (`MacroImpactMatrix`, `MacroThermometer`, `ScenarioPanel`) từ tin nhắn chat để xem chi tiết; cần expose `/api/macro/*` qua `createMacroApi(...).handle` (xem `README.md`).
- Phương án dự phòng khi LLM không hỗ trợ tool calling: bảng định tuyến ở mục 6 dùng từ khoá, gọi `tools.run`, định dạng bằng mẫu ở mục 7.

## 5. Kế hoạch thực hiện

### Giai đoạn 0 — Khảo sát (chỉ đọc, chưa sửa gì)
Việc: xác minh A1–A6. Tạo `INTEGRATION-NOTES.md` gồm: đường dẫn component chat và route backend chat; thư viện/SDK model đang dùng và có tool calling hay không; cách đăng ký tab; middleware xác thực; Node version; lệnh chạy test hiện có và kết quả (baseline).
Nghiệm thu: baseline test hiện có đã chạy và ghi lại; mỗi giả định có kết luận "đúng/sai/chưa rõ".

### Giai đoạn 1 — Đưa mã vào repo
Việc: chép `src/` (và `scripts/`, `samples/`), thêm devDependencies cần thiết nếu thiếu (`vitest`, `tsx`, `@types/node`, `@types/react`), thêm script `macro:test`.
Nghiệm thu: `npx vitest run src/macro` (hoặc đường dẫn tương ứng) đạt 131/131; typecheck sạch; test hiện có của dự án vẫn đạt như baseline.

### Giai đoạn 2 — Dữ liệu
Việc:
1. Khởi tạo kho: `new SqliteVintageStore('<đường dẫn>/macro.db')` (hoặc cài `VintageStore` trên CSDL hiện có).
2. Nạp số liệu thật bằng `importCsvInto` hoặc `scripts/import-csv.ts` cho tối thiểu: CPI, IR, M2, EX, IO, FDI và VNINDEX, VN30, VNMIDCAP, VN100, VNSMALLCAP, VNALLSHARE.
3. Đọc `GET /api/macro/series`, xử lý mọi `issues` mức `error`; đối chiếu `pubLagMonths` từng nguồn.
4. Nguồn có số điều chỉnh: thêm dòng mới với `asOf` mới; không sửa dòng cũ.
Nghiệm thu: ma trận `impact` chạy được trên dữ liệu thật; không còn `issues` mức error; ghi lại các dấu khác bài báo 2015 vào `INTEGRATION-NOTES.md` (đây là kết quả khoa học, không phải lỗi).
Không có dữ liệu thật: dùng `makeSyntheticStore()` kèm `notice: SYNTHETIC_NOTICE`, và ghi rõ trong `INTEGRATION-NOTES.md` rằng chức năng đang chạy trên dữ liệu mô phỏng.

### Giai đoạn 3 — Backend chat
Việc:
1. Tạo một lần khi khởi động: `const api = createMacroApi({ store, notice })`, `const macro = createMacroChatTools(api)`.
2. Thêm `toAnthropicTools()` hoặc `toOpenAITools()` vào danh sách tool của model, nối `MACRO_CHAT_SYSTEM_PROMPT` vào system prompt hiện có (không thay thế prompt cũ).
3. Khi model trả `tool_use`/`tool_calls`: gọi `await macro.run(name, input)`, trả lại JSON làm `tool_result`. Giới hạn tối đa 4 vòng tool mỗi lượt hỏi và đặt timeout cho mỗi lần chạy.
4. Khởi động nóng (warm-up): sau khi khởi động và sau mỗi lần nạp dữ liệu, gọi `macro.run('macro_overview', {})` một lần để điền cache (lần đầu có thể mất vài giây trên máy yếu).
5. Ghi log tên tool, tham số, thời gian chạy, `ok`; không ghi nội dung hội thoại của người dùng vào log vĩ mô.

Ví dụ (minh hoạ, chưa chạy với API model thật; chỉnh theo SDK đang dùng):
```ts
const result = await macro.run(block.name, block.input);
messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result), is_error: !result.ok }] });
```
Nghiệm thu: test với model giả có kịch bản (mục 8) đạt; tool lỗi không làm sập luồng chat (trả `is_error` và model nói thật là không lấy được dữ liệu).

### Giai đoạn 4 — Hiển thị trong tab chat (tuỳ chọn nhưng nên làm)
Việc:
1. Nếu tin nhắn có `tool_result` từ `macro_*`, hiển thị thẻ gọn bên dưới câu trả lời: nhiệt kế (`MacroThermometer`), bảng xếp hạng kịch bản (`ScenarioPanel`), hoặc bảng ngắn các cặp tác động. Chỉ dùng dữ liệu của chính `tool_result`, không gọi lại API.
2. Hiển thị `notice` thành biểu ngữ cố định ở đầu thẻ.
3. Thêm liên kết "Mở trung tâm vĩ mô" tới `MacroCenterTab` nếu tab đó được đăng ký.
4. Nhớ `import './macro/ui/macro-center.css'`; CSS đã có phạm vi `.mc`, kiểm tra không ghi đè kiểu của tab chat.
Nghiệm thu: thẻ hiển thị đúng ở 390px và 1200px, không tràn ngang; có thể thao tác bằng bàn phím; thẻ không xuất hiện khi tool trả `ok: false`.

### Giai đoạn 5 — Nối bộ máy quyết định (tuỳ chọn, có điều kiện)
Chỉ làm nếu A3 đúng VÀ dữ liệu thật đã nạp VÀ `usableForDecisions === true` trên dữ liệu thật.
Việc: đưa `thermometer.value` qua `z` (xem `macroScoreSeries`) vào bộ kết hợp log-odds như một tín hiệu mới với trọng số khởi đầu thấp; chỉ bật khi cờ cho phép. Tuyệt đối không bật khi cổng chưa đạt.
Nghiệm thu: test hiện có của bộ máy quyết định vẫn đạt; có test chứng minh khi `usableForDecisions = false` tín hiệu vĩ mô không ảnh hưởng quyết định.

### Giai đoạn 6 — Nghiệm thu và vận hành
Chạy toàn bộ mục 8; điền checklist PR ở phụ lục; cập nhật `INTEGRATION-NOTES.md`.

## 6. Bảng định tuyến ý định → công cụ

| Người dùng hỏi (ví dụ) | Tool | Tham số gợi ý |
|---|---|---|
| "Vĩ mô đang thuận lợi hay bất lợi cho VN-Index?" | `macro_overview` | `target: "VNINDEX"` |
| "Lạm phát ảnh hưởng gì tới Smallcap?" | `macro_impact_lookup` | `factor: "CPI", target: "VNSMALLCAP", onlySignificant: false` |
| "Biến nào tác động mạnh nhất tới VN30?" | `macro_impact_lookup` | `target: "VN30", topN: 5` |
| "Nếu Fed giảm lãi suất thì sao?" | `macro_scenario` | `scenarioId: "fed-cut"` |
| "VND mất giá 3% thì chỉ số nào thiệt?" | `macro_scenario` | `scenarioId: "vnd-weak"` |
| "M2 tăng 4%, lãi suất giảm 1 điểm?" | `macro_scenario` | `shocks: [{factor:"M2",amount:4,unit:"pct"},{factor:"IR",amount:-1,unit:"pp"}]` |
| "Kết luận CPI→VN-Index có đáng tin không?" | `macro_cell_detail` | `factor: "CPI", target: "VNINDEX"` |
| "Sắp có số liệu gì? Có bất thường không?" | `macro_calendar_alerts` | |
| "Cho tôi báo cáo vĩ mô tháng này" | `macro_report` | |

Kịch bản có sẵn: `cpi-up`, `easing`, `tightening`, `vnd-weak`, `credit-squeeze`, `fed-cut`. Chỉ biến có trong dữ liệu mới mô phỏng được (ví dụ `fed-cut` cần `FED` và `DXY`); nếu thiếu, kết quả có `warnings` và model phải nói rõ.

## 7. Quy tắc trình bày (bắt buộc)

Các quy tắc này đã nằm trong `MACRO_CHAT_SYSTEM_PROMPT` và `guidance` của từng kết quả; hãy giữ nguyên và kiểm bằng test.

| Trường kết quả | Được nói | Không được nói |
|---|---|---|
| `status: "stable"` | "có ý nghĩa thống kê và ổn định theo thời gian" | "chắc chắn", "sẽ" |
| `status: "unstable"` | "có ý nghĩa nhưng không ổn định theo thời gian, dùng thận trọng" | nói như tác động chắc chắn |
| `status: "insignificant"` | "chưa đủ bằng chứng" | "không có tác động", "tác động nhỏ" |
| `conclusive: false` (kịch bản) | "chưa kết luận được hướng" | xếp hạng như kết quả chắc chắn |
| `usableForDecisions: false` | "điểm này chưa vượt kiểm định ngoài mẫu" | khuyến nghị mua/bán dựa trên điểm |
| `notice` có giá trị | nêu ngay đầu câu trả lời | bỏ qua |
| Ngày trong lịch | "dự kiến (ước tính)" | nói như ngày chính thức |
| Mọi kết quả | "quan hệ thống kê lịch sử" | "gây ra", "nhờ", hứa hẹn tương lai |

Bắt buộc nêu: hướng, độ trễ (tháng), và đơn vị khi nêu hệ số. Câu trả lời: kết luận trước, 1–3 con số, rồi lưu ý.

Ví dụ tốt (kết quả `stable`, β = −3,5, độ trễ 1): "Lịch sử cho thấy khi CPI tăng thêm 1 điểm, VN-Index thường giảm khoảng 3,5 điểm phần trăm sau 1 tháng (t = −6,7, ổn định theo thời gian). Đây là quan hệ thống kê, không chứng minh nhân quả."
Ví dụ xấu: "Lạm phát tăng sẽ làm VN-Index giảm 3,5% tháng sau." (bỏ lưu ý, nói như chắc chắn.)

## 8. Kiểm thử nghiệm thu

Viết test tự động với model giả có kịch bản (mô phỏng chuỗi: câu hỏi → tool_use → tool_result → câu trả lời) và kiểm các tính chất sau, không phụ thuộc văn phong:

| ID | Kiểm tra |
|---|---|
| G1 | Hỏi tổng quan → có đúng 1 lần gọi `macro_overview`; câu trả lời chứa nhãn nhiệt kế đúng với `tool_result` |
| G2 | `usableForDecisions = false` (tạo bằng dữ liệu nhiễu) → câu trả lời KHÔNG chứa từ khoá khuyến nghị mua/bán và có nêu "chưa vượt kiểm định" |
| G3 | Ô `insignificant` → câu trả lời không chứa "không có tác động"; có "chưa đủ bằng chứng" |
| G4 | Ô `unstable` → câu trả lời có "không ổn định" |
| G5 | Kịch bản có `conclusive: false` → câu trả lời không xếp chỉ số đó như kết quả chắc chắn |
| G6 | Tool lỗi (`ok: false`) → câu trả lời nói không lấy được dữ liệu; không chứa con số vĩ mô nào |
| G7 | `notice` có giá trị → xuất hiện trong 200 ký tự đầu của câu trả lời |
| G8 | Mọi con số trong câu trả lời nằm trong tập số của các `tool_result` (sai khác làm tròn ≤ 0,05) |
| G9 | Tham số sai (mã lạ, `topN: 50`) → tool trả `ok: false` kèm danh sách giá trị hợp lệ; model sửa và gọi lại tối đa 1 lần |
| G10 | Tab và test hiện có của dự án đạt như baseline |

Ngoài ra, chạy thủ công 5 câu hỏi thật ở mục 6 trên dữ liệu thật và lưu lại hội thoại vào `INTEGRATION-NOTES.md` để người dùng duyệt.

## 9. Bảo mật và vận hành

- Đặt `/api/macro/*` (nếu mở ra ngoài) sau xác thực của ứng dụng; gói không có xác thực và không giới hạn tần suất. Với phương án chính (gọi trong tiến trình), không mở route nào.
- Công cụ chỉ đọc; không có tool ghi dữ liệu. Giữ nguyên như vậy.
- Giới hạn tần suất theo người dùng cho các lượt gọi tool; `macro_report` và `macro_cell_detail` tốn nhiều tính toán hơn.
- Cache: trong bộ nhớ, khoá theo phiên bản dữ liệu (đổi dữ liệu tự vô hiệu cache). Nhiều instance cần cache dùng chung; nếu chưa có, chấp nhận mỗi instance tự nóng.
- Truy vấn `asOf` chỉ dùng thông tin đã biết tại ngày đó: dùng cho tái hiện và kiểm toán.
- Không đưa nội dung hội thoại của người dùng vào kho vĩ mô; không ghi thông tin cá nhân vào log công cụ.

## 10. Điều cấm

1. Không sửa logic thống kê trong `quant-macro.ts`, `macro-regime.ts`, `macro-scenario.ts`, `macro-backtest.ts` để làm kết quả "đẹp hơn". Nếu thấy lỗi, báo lại kèm ca tái hiện.
2. Không hạ ngưỡng ý nghĩa, không tắt hiệu chỉnh kiểm định bội, không bỏ cổng `usableForDecisions`.
3. Không để model tự điền số liệu vĩ mô khi không có kết quả tool.
4. Không dùng dữ liệu mô phỏng ở môi trường thật mà không có biểu ngữ.
5. Không sửa hành vi của các tab hiện có; mọi thay đổi ngoài thư mục vĩ mô phải nhỏ, có test, và được nêu trong `INTEGRATION-NOTES.md`.
6. Không bật tín hiệu vĩ mô trong bộ máy quyết định khi cổng chưa đạt trên dữ liệu thật.
7. Không suy đoán đường dẫn hay tên hàm của dự án mà chưa đọc mã.

## 11. Rủi ro đã biết

| Rủi ro | Giảm thiểu |
|---|---|
| Chưa chạy bằng Vitest thật; test được chạy qua lớp shim tối giản | Chạy `vitest run` ở repo của dự án (Giai đoạn 1) và báo lại mọi khác biệt |
| `node:sqlite` còn thử nghiệm, cần Node ≥ 22.5 | Dùng kho bộ nhớ hoặc cài `VintageStore` trên CSDL hiện có |
| Lần gọi đầu mỗi truy vấn nặng có thể mất vài giây | Khởi động nóng (Giai đoạn 3, bước 4); hiển thị trạng thái "đang tính" trên UI |
| Ngày công bố và độ trễ mặc định là ước tính | Đối chiếu từng nguồn ở Giai đoạn 2; giữ nhãn "ước tính" |
| Kết quả trên dữ liệu thật có thể khác bài báo 2015 | Ghi nhận như phát hiện, không chỉnh để khớp |
| Model diễn đạt mạnh hơn số liệu | System prompt + `guidance` + test G2–G5, G8 |
| Chưa gắn RRG/độ nhạy theo ngành, nowcasting, event study | Ngoài phạm vi bàn giao này |

## Phụ lục A — Ví dụ tool call và kết quả

Yêu cầu: `macro_impact_lookup { "factor": "CPI", "target": "VNINDEX" }`

Kết quả (rút gọn, dữ liệu mô phỏng):
```json
{
  "ok": true,
  "notice": "DỮ LIỆU MÔ PHỎNG — không phải số liệu thực của GSO/NHNN/HOSE.",
  "data": {
    "matched": 1, "significant": 1, "shown": 1,
    "rows": [{ "factor": "CPI", "target": "VNINDEX", "direction": "giảm", "beta": -3.48, "t": -6.7, "q": "<0.001", "lagMonths": 1, "status": "stable" }]
  },
  "guidance": ["Hệ số là điểm phần trăm lợi suất tháng của chỉ số trên mỗi đơn vị thay đổi của biến…", "status \"insignificant\" = chưa đủ bằng chứng…"]
}
```

## Phụ lục B — Checklist PR

- [ ] `INTEGRATION-NOTES.md` đã ghi khảo sát, quyết định, dữ liệu đang dùng (thật hay mô phỏng)
- [ ] 131/131 test vĩ mô và toàn bộ test hiện có đạt; typecheck sạch
- [ ] Chat gọi tool đúng cho các câu mục 6; G1–G10 tự động đạt
- [ ] Biểu ngữ `notice` hiển thị khi cần; không có số liệu vĩ mô nào không truy ngược được tới tool
- [ ] Không sửa logic thống kê; không sửa hành vi tab cũ
- [ ] Giới hạn tần suất và xử lý lỗi/timeout cho tool đã có
- [ ] Giai đoạn 5 chỉ bật khi cổng đạt trên dữ liệu thật (hoặc đã bỏ qua và ghi lý do)
