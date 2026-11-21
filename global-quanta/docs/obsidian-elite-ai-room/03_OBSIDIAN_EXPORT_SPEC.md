# 03 — Ghi chú, Obsidian URI, Canvas và Bộ khởi tạo Vault

Mọi hàm builder là **hàm thuần**: không dùng `window`, mạng hay storage. Thời điểm hiện tại (`now`) và lịch giao dịch được truyền vào làm tham số. Mã nằm ở `src/lib/obsidian/`.

## 1. Hợp đồng

| Hàm | Kết quả |
|---|---|
| `buildDebateNote(input)` | `{ fileName, folder, markdown, meta }` |
| `buildBriefNote(input)` | như trên |
| `buildQaNote(input, { scope: "last" \| "all" })` | như trên |
| `buildJournalNote(input)` | như trên. Chỉ tạo từ một cuộc tranh luận có ít nhất một làn có nội dung |
| `buildDebateCanvas(input, noteFile)` | `{ fileName, json }` theo JSON Canvas 1.0 |
| `buildVaultKit(opts)` | `{ fileName, markdown }`: ghi chú "Bàn điều khiển" kèm 3 mẫu |
| `obsidianNewUri({ vault, file, content \| clipboard })` | chuỗi `obsidian://new?...` |
| `planUriExport(markdown, target, maxLen)` | `{ mode: "content" \| "clipboard", uri }` |
| adapter `openUri / copyText / downloadFile` | `ExportResult` (02 §4) |

## 2. Frontmatter (schema 1)

```yaml
---
schema_version: 1
type: elite10-ai-debate            # | elite10-ai-brief | elite10-ai-qa | elite10-decision-journal
title: "Tranh luận AI — HPG"
date: 2026-11-21                   # ngày xuất, giờ Việt Nam
exported_at: "2026-11-21T14:30:05+07:00"
started_at: "2026-11-21T14:27:40+07:00"   # từ bản vết; không có -> null
finished_at: "2026-11-21T14:29:58+07:00"
data_as_of: 2026-11-20             # data.date mới nhất của elite_decision / elite_ticker; không có -> null
scope: ticker                      # | portfolio | qa
ticker: HPG                        # chỉ khi elite_ticker trả ok cho đúng mã này; ngược lại null
sector_icb: "1750"                 # data.icb (l3 -> l2 -> l1) hoặc sectorIcb; không có -> null
timeframe: "5-10 phiên"            # tranh luận: đúng câu lệnh; bản tin: "phiên mới nhất"; hỏi đáp: null
models: { bull: "…", bear: "…", judge: "…" }   # lane.model; không có -> null (KHÔNG lấy từ nhãn)
fallback: { bull: false, bear: false, judge: false }
host: gateway                      # meta.host trong bản vết; không có -> null
macro_mode: real                   # real | synthetic | insufficient | null
evidence_status: complete          # complete | partial | fallback
untraceable_count: 0
judge_input_clipped: false         # true khi một phe dài hơn 6.000 ký tự
portfolio_kind: ELITE_HL           # elite_decision.data.portfolioKind; không có -> null
in_portfolio: null                 # elite_ticker.data.elite.inPortfolio; không có -> null
tags: [trading, global-quanta/elite10, global-quanta/ai-debate]
source_url: "https://dinhtuan-ck.vercel.app/?tab=quyet-dinh"
created_by: "Global Quanta Terminal"
---
```

**Quy tắc:**
- **Escape YAML.** Mọi chuỗi đặt trong dấu nháy kép, thoát `\` và `"`. Ký tự xuống dòng đổi thành dấu cách; ký tự điều khiển bị bỏ. Không bao giờ chèn văn bản thô vào frontmatter.
- `evidence_status`:
  - `partial` khi có làn `error`, hoặc làn `done` mà `text` rỗng;
  - ngược lại là `fallback` khi có làn `fallback`;
  - ngược lại là `complete`.
- Không suy luận gì từ câu văn của AI. Thiếu nguồn có cấu trúc thì ghi `null`.

**Trường riêng của Nhật ký quyết định:**
```yaml
review_base: 2026-11-20                  # data_as_of, hoặc ngày xuất khi không có
review_5: 2026-11-27                     # phiên thứ 5 SAU review_base, theo lịch giao dịch VN
review_10: 2026-12-04
review_20: 2026-12-18
review_calendar: "vn-rules"              # lịch tự tính (âm lịch + Bộ luật Lao động); chưa gồm ngày nghỉ nối đột xuất
outcome_5: null                          # người dùng tự điền: % hoặc ghi chú
outcome_10: null
outcome_20: null
judge_was_right: null                    # true | false | null — người dùng tự điền
```

## 3. Thân ghi chú

**Tranh luận**
```
# Tranh luận AI — HPG
> Tham khảo định lượng — không phải khuyến nghị đầu tư. AI chỉ giải thích và phản biện số liệu từ công cụ.
## Tóm tắt              phạm vi · kỳ hạn · trạng thái · model · thời gian
## Phe mua · <model>    nguyên văn lane.text · cảnh báo (notices) · dự phòng/lỗi
## Phe bán · <model>    như trên
## Phán quyết trọng tài nguyên văn · hoặc "Không có phán quyết (cả hai phe không trả lời)"
## Bằng chứng công cụ   bảng: làn · công cụ · đầu vào (rút gọn) · kết quả ok/lỗi · tóm tắt theo allowlist (01 §2)
## Giới hạn             số không truy được · cắt 6.000 ký tự · dự phòng · đầu vào công cụ đã rút gọn · đã lược dữ liệu thô
## Liên kết             [[HPG]] · [[ICB 1750 · Kim loại công nghiệp]] · [[DXY]] …
```

**Bản tin:** Tóm tắt · nguyên văn · Bằng chứng · Giới hạn · Liên kết.

**Hỏi đáp:** mỗi lượt gồm `### Lượt n`, câu hỏi (nếu bật), rồi mỗi làn `#### <Claude|Gemini> · <model>` với nguyên văn, cảnh báo và công cụ. Phạm vi `last` (lượt cuối) hoặc `all` (toàn bộ). `macro_mode` chỉ phản ánh lượt cuối, và ghi chú nói rõ điều đó.

**Nhật ký quyết định:**
```
# Nhật ký quyết định — HPG — 2026-11-21
## Luận điểm (trọng tài)                 nguyên văn phán quyết, hoặc ghi chú "chưa có"
## Bối cảnh định lượng lúc quyết định    bảng từ elite_*: hạng HL · tỷ trọng · phân vị LS · RRG ngành · giá đóng cửa · ngày dữ liệu
## Điều kiện làm sai luận điểm           - [ ] (người dùng điền)
## Hậu kiểm
- [ ] Xem lại sau 5 phiên 📅 2026-11-27
- [ ] Xem lại sau 10 phiên 📅 2026-12-04
- [ ] Xem lại sau 20 phiên 📅 2026-12-18
## Liên kết                              [[<ghi chú tranh luận>]] · [[HPG]] · [[ICB …]]
```

**Nguyên văn** nghĩa là chuỗi `lane.text` sau khi chuẩn hoá xuống dòng (`\r\n` thành `\n`), không cắt, không chèn liên kết vào bên trong.

## 4. Wikilinks

| Loại | Nguồn | Dạng |
|---|---|---|
| Mã | `elite_ticker.data.ticker` (ok) · `elite_decision.data.portfolio[].ticker` | `[[HPG]]` |
| Ngành | `data.icb.l3/l2/l1`, `portfolio[].sectorIcb` | `[[ICB 1750]]`; có tên ngành thì `[[ICB 1750 · Kim loại công nghiệp]]` |
| Vĩ mô/thế giới | Có ít nhất một công cụ `macro_*`, `world_*` hoặc `ws_*` được gọi → nút `[[Vĩ mô Việt Nam]]` / `[[Kinh tế thế giới]]` / `[[Ngành thế giới]]` | Danh sách cố định |

- Liên kết chỉ nằm ở mục **Liên kết** và **Bối cảnh định lượng**, **không** chèn vào nguyên văn AI.
- Tên nút được làm sạch: bỏ `[ ] | # ^ \`.

## 5. Tên tệp và thư mục
- `YYYY-MM-DD HHmmss - <MÃ|Elite 10> - <Tranh luận|Bản tin|Hỏi đáp|Nhật ký> - <4 ký tự>.md`. Phần `.canvas` dùng cùng gốc tên.
- 4 ký tự lấy từ `crypto.getRandomValues` ở adapter. Builder nhận chúng làm tham số để test được.
- Thư mục mặc định: `Global Quanta/Elite 10`. Kiểm hợp lệ theo 02 §5. Cấm `..` và các ký tự `\ : * ? " < > |`.

## 6. Obsidian URI (đối chiếu https://obsidian.md/help/uri, 21/11/2026)
- `obsidian://new?vault=<tên|ID>&file=<thư mục/tên không đuôi>&content=<...>`. Thiếu Vault thì bỏ tham số `vault`.
- Mọi giá trị encode bằng `encodeURIComponent`, nên `/` thành `%2F` và dấu cách thành `%20`.
- **Không bao giờ** dùng `append`, `prepend`, `overwrite`, `silent`.
- Độ dài được tính **sau encode**, ngưỡng mặc định `URI_MAX = 2000` (giả định bảo thủ).
  - Vượt ngưỡng: chép Markdown **ngay trong sự kiện click**, sau đó mở `new` với `clipboard`.
  - Chép thất bại: báo lỗi và đề nghị Tải .md.
- **Chưa xác minh** (tài liệu chính thức không nói): hành vi khi trùng tên tệp (vì vậy tên luôn mới), trên di động, khi chưa cài Obsidian, giới hạn URI thực tế.

## 7. Canvas (JSON Canvas 1.0, https://jsoncanvas.org/spec/1.0/)

**Nút** (đều là số nguyên):
- `text` Phe mua (màu `"4"`);
- `text` Phe bán (màu `"1"`);
- `text` Trọng tài (màu `"3"`);
- `text` Bằng chứng (tên công cụ);
- `file` trỏ tới ghi chú `.md`.

**Cạnh:**
- Phe mua → Trọng tài và Phe bán → Trọng tài (`toEnd: "arrow"`).
- Bằng chứng → Trọng tài, nhãn "kiểm chứng".

Mỗi thẻ văn bản chứa tối đa 1.500 ký tự đầu của lời AI cùng câu "Xem nguyên văn trong ghi chú". Nguyên văn đầy đủ nằm trong ghi chú `.md`. Canvas chỉ có đường **tải tệp**.

## 8. Bộ khởi tạo Vault (`Elite 10 · Bàn điều khiển.md`)
- **Hướng dẫn:** bật plugin lõi *Templates*, cài plugin cộng đồng *Dataview*, đặt thư mục `Global Quanta/Elite 10`.
- **Dataview** (`FROM "Global Quanta/Elite 10"`):
  - phán quyết gần nhất;
  - theo mã;
  - theo ngành;
  - tỷ lệ dở dang / dự phòng;
  - **việc hậu kiểm đến hạn** (`review_5/10/20 <= date(today)` và `outcome_* = null`);
  - `judge_was_right` theo tháng.
- **3 mẫu** (khối mã nguồn để chép thành tệp mẫu): Mã · Ngành · Chủ đề vĩ mô. Mỗi mẫu có `LIST FROM [[]]` để gom mọi ghi chú nhắc tới nút đó.

## 9. Cấu hình (một nơi duy nhất, `src/lib/obsidian/types.ts`)
`OBSIDIAN_DEFAULT_FOLDER = "Global Quanta/Elite 10"` · `REVIEW_SESSIONS = [5, 10, 20]` · `URI_MAX = 2000` · `CANVAS_TEXT_MAX = 1500` · `TOOL_INPUT_MAX = 200` · `SOURCE_URL = "https://dinhtuan-ck.vercel.app/?tab=quyet-dinh"`.
