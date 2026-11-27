# Rà soát ảnh hưởng của PR #405 (EV-4) lên tab con 1 và tab con 3

> **Ngày:** 27/11/2026 · **PR:** #405 (nhánh `feat/tab4-evolution`, commit `a040e8b5`, tách từ main `3f7cddac`)
> **Phạm vi:** tab QUYẾT ĐỊNH › **1. Bảng quyết định hôm nay** và **3. Phòng họp AI**, sau khi merge #405 và chạy `railway up`.
> **Kết luận ngắn:** Tab 1 chỉ thêm **một dòng tóm tắt** và **một lượt gọi API**; mọi số liệu, quy tắc và bố cục khác giữ nguyên. Tab 3 **không đổi** (mã giao diện, dữ liệu đầu vào và kết quả đo giống hệt main). Không có rủi ro nào chặn merge.

---

## 1. PR #405 thay đổi gì

| Tệp | Thay đổi | Tab 1 có dùng? | Tab 3 có dùng? |
|---|---|---|---|
| `backend/src/market/elite/evidenceEvolution.js` (mới) | Tính SQS, nhãn xu hướng, IC theo chế độ thị trường, đề xuất cần duyệt. Chỉ đọc. | Gián tiếp (qua API mới) | Không |
| `backend/src/routes/elite.js` | Thêm `GET /api/elite/evidence-evolution`, `POST /api/elite/admin/evidence-evolution`. Route cũ không đổi. | Có (route mới) | Không |
| `backend/src/server.js` | Khởi tạo dịch vụ tiến hoá theo yêu cầu (chưa ai gọi thì chưa tạo). Không thêm vòng chạy nền hay hẹn giờ. | — | — |
| `backend/src/market/elite/evidenceEngine.js` | Giữ chuỗi IC LS-v1 trong bộ nhớ sau mỗi lần dựng; thêm `icDocument()`; `coverage()` hết báo 0 ngày cho `ls_v1`. **Hàm `evaluate()` và tài liệu `/api/elite/evidence` không đổi.** | Không | Có (đọc `/api/elite/evidence` — không đổi) |
| `src/components/elite10/center/HlRulesLedger.tsx` | Thẻ `HlEvidenceLink` thêm một dòng tóm tắt (`data-hl-layer="evidence"`), chỉ hiện khi API mới trả dữ liệu. | **Có** | Không |
| `EvidenceLedgerTab.tsx`, `EvidenceEvolution.tsx`, hook, kiểu | Tab 4 bốn tầng | Không | Không |

---

## 2. Tab con 1 — Bảng quyết định hôm nay

### 2.1 Những gì thay đổi

1. **Một dòng mới** trong thẻ "Bằng chứng · sổ theo dõi · quy tắc" (cuối bảng), ví dụ với số liệu thật 27/11:
   > Tab 4: thị trường xu hướng giảm · SQS TB 50/100 · 1 tín hiệu đã chứng minh, 2 ngược chiều · **6 đề xuất cần duyệt**
   - Chữ "đề xuất cần duyệt" tô vàng khi có đề xuất mức Cao.
   - Dòng này **chỉ mô tả**: không đổi danh mục, tỷ trọng, ngưỡng bán, phễu hay lệnh.
2. **Một lượt gọi API thêm** khi mở Tab 1: `GET /api/elite/evidence-evolution`.
   - Dùng chung bộ đệm với Tab 4 (khoá SWR `elite-evidence-evolution`): mở Tab 4 sau đó không gọi lại.
   - Làm mới 30 phút một lần, không gọi lại khi đổi cửa sổ.
3. Nút **"Xem Bằng chứng · Trọng số · Quy tắc chi tiết →"** vẫn chuyển sang Tab 4 như cũ. Khối đầu tiên mở ra giờ là **Tầng 1 – Bảng điểm & đề xuất** (trước đây là thẻ Bộ não AI; thẻ này chuyển xuống Tầng 4).

### 2.2 Những gì giữ nguyên (đã đo)

| Kiểm tra | Main (trang thật) | PR #405, Gateway chưa có API | PR #405, có API |
|---|---|---|---|
| Số phần tử có `data-testid` trong bảng Elite HL | 538 | **538** | 539 (+1 dòng mới) |
| `data-testid` trùng lặp | 0 | 0 | 0 |
| Số biểu đồ SVG trong bảng | 92 | 92 | 92 |
| Lỗi trang | 0 | 0 | 0 |
| Các API `/api/elite/*` được gọi | 18 | 18 + `evidence-evolution` | 18 + `evidence-evolution` |

- **Kiểm thử vân tay bảng** (`EliteHlBoard.board-fingerprint.test.tsx`): đạt. Dòng mới mang `data-hl-layer`, nên khi gỡ lớp, bảng giống tệp nền từng ký tự.
- Quy tắc Elite HL, phễu, bảng "Ngưỡng bán · 4 điều kiện", radar, lịch vùng mua, buồng lái, nhịp quyết định: **không có dòng mã nào bị sửa**.

### 2.3 Rủi ro và cách xử lý

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Vercel triển khai giao diện ngay khi merge, nhưng Gateway chưa `railway up` → API mới trả 404 | Thấp | Đã thử: dòng mới **tự ẩn**, không lỗi trang, không báo lỗi trên Tab 1 (bảng giống main 538/538). Sau `railway up`, dòng hiện ở lần tải lại trang. |
| Lần gọi đầu sau khi Gateway khởi động phải dựng tài liệu (đọc `elite:ic`, 1.500 nến VN-Index, sổ HL, sổ AI) | Thấp | Chỉ dựng khi có người mở; nhớ 10 phút; có khoá chống dựng trùng; lỗi thì trả bản đã lưu trong KV. Dòng trên Tab 1 hiện chậm hơn phần còn lại một chút; bảng chính không phải chờ. |
| Người dùng hiểu "6 đề xuất cần duyệt" là việc phải làm ngay | Thấp | Ở Tab 4, mỗi đề xuất ghi rõ "không tự áp dụng — cần đăng ký trước". Nếu muốn, có thể bỏ màu vàng ở Tab 1 (sửa 1 dòng). |

---

## 3. Tab con 3 — Phòng họp AI

### 3.1 Nguồn dữ liệu của Tab 3 — không đổi

| Nguồn | Tab 3 dùng ở đâu | PR #405 có đổi? |
|---|---|---|
| `GET /api/elite/evidence` (bằng chứng E2) | `src/lib/evidenceBrain/snapshot.ts` (hồ sơ khoá của phòng họp), công cụ AI phía Gateway (`server.js`, công cụ `evidence`) | **Không.** `evaluate()` giữ nguyên; tài liệu trả ra giống hệt. |
| `GET /api/elite/decision`, `/ledger`, `/risk`, `/liquidity` | Hồ sơ khoá + khung phòng họp | Không |
| Sổ phán quyết AI ARL-v1 (`local:ai-room:ledger:v1`) | Thẻ Bộ não AI, vòng chấm nền | Không ghi. API mới chỉ **đọc** 1 lần qua `read({ limit: 1 })` khi dựng; không chạy chung chuỗi ghi của sổ. |
| `AiBrainCard` | Tab 3 (`EvidenceBrainWorkspace`) và Tab 4 | Không sửa component; ở Tab 4 chỉ đổi vị trí. |

- Mã giao diện Tab 3 (`EliteAiRoom`, `EvidenceBrainWorkspace`, `evidenceRoom/*`, `lib/evidenceBrain/*`): **không có tệp nào bị sửa** trong #405.
- Vòng nền Phòng họp AI (Gemini / GPT / Claude, nhịp 30 giây / 2 phút) và hợp đồng `claims-1.1`: không đổi.

### 3.2 Đã đo

| Kiểm tra Tab 3 | Main | PR #405 (không có / có API mới) |
|---|---|---|
| Phần tử có `data-testid` | 33 | 33 / 33 |
| SVG | 11 | 11 / 11 |
| Canvas | 0 | 0 / 0 |
| Thẻ Bộ não AI hiện | Có | Có / Có |
| Lỗi trang | 0 | 0 / 0 |

### 3.3 Tab 3 chưa được nối (cố ý)

Blueprint §5 muốn đưa SQS, nhãn xu hướng và độ tin cậy vai AI vào `SnapshotManifest` của `brain/manifest.js`. **Phần này không làm trong #405**, vì:

- `brain/manifest.js`, `brain/service.js`, `BrainV3`, `BrainLedger` **không có trên main**. Chúng chỉ là tệp chưa commit trong thư mục `_phong-hop-ai-publish` của phiên khác, chậm 33 commit.
- Đưa nhãn "ứng viên mới nổi" vào lời dẫn của AI trước khi qua kiểm định có nguy cơ khiến AI coi đó là bằng chứng.

Vì vậy sau #405, AI ở Tab 3 vẫn đọc đúng bằng chứng E2 như trước, **chưa** thấy SQS hay nhãn mới.

---

## 4. Ảnh hưởng lên Gateway (Railway)

| Hạng mục | Ước tính | Ghi chú |
|---|---|---|
| Bộ nhớ thêm | ≈ 0,5–1 MB | Chuỗi IC LS-v1 (~1.366 ngày × 4 kỳ hạn) giữ lại sau mỗi lần dựng E2 (trước đây bị giải phóng). Heap hiện ~437 MB RSS / trần 640 MB. |
| Tài liệu API | ≈ 20 KB JSON | Đo trên số liệu thật 27/11 (25 tín hiệu, 6 đề xuất). |
| Ghi KV | 1 khoá `elite:evidence:evolution`, ≤ 1 lần / 10 phút **khi có người xem** | Không ghi vào `elite:ic`, `elite:evidence` hay sổ nào. |
| Vòng chạy nền mới | Không | Không thêm hẹn giờ, không thêm việc vào khung 17:00. |
| Gọi nguồn ngoài | 1 lượt nến VN-Index 1.500 phiên mỗi lần dựng | Qua `getOhlcv` sẵn có (kho cục bộ trước). |

**Route mới (đã thử trong tiến trình):**
- `GET /api/elite/evidence-evolution` → 200, `Cache-Control: public, max-age=600`; không có dịch vụ → 404 kèm thông báo.
- `POST /api/elite/admin/evidence-evolution` → 401 nếu thiếu `MARKET_ADMIN_TOKEN`; 200 nếu có.

---

## 5. Kiểm chứng

- `node --test backend/test/*.test.js`: **1.105/1.105 đạt** (gồm 7 bài mới cho SQS, nhãn, độ phủ, IC theo chế độ, đề xuất, dịch vụ).
- `vitest`: **277 tệp / 1.603 bài đạt**, gồm vân tay bảng Elite HL, buồng lái, ngưỡng bán, Phòng họp AI và các bài tab 4 mới. `tsc --noEmit` sạch; `vite build` thành công.
- E2E bản build với Gateway thật (1440 px), so cạnh trang thật đang chạy main: số liệu ở mục 2.2 và 3.2.

---

## 6. Thứ tự triển khai đề xuất và cách lùi

1. `merge #405` → Vercel tự triển khai giao diện. Tab 1 vẫn như cũ (dòng mới ẩn); Tab 4 hiện 4 tầng, Tầng 1 báo "chưa tải được bảng điểm".
2. `railway up` từ `origin/main` → kiểm `GET /api/elite/evidence-evolution` trả 200 và `railway deployment list` báo SUCCESS.
3. Tải lại Tab 1: dòng "Tab 4: …" hiện. Mở Tab 4: 4 KPI và các đề xuất hiện.

**Lùi:** revert commit merge của #405 rồi `railway up` lại. Khoá KV `elite:evidence:evolution` để lại không ảnh hưởng gì (không ai đọc). Không có dữ liệu sổ nào cần khôi phục.

---

## 7. Việc mở sau #405 (cần chủ dự án quyết)

1. Nối SQS / nhãn sang Phòng họp AI (Tab 3) — chỉ sau khi cụm `brain/` được đưa lên main, và chỉ dùng nhãn đã qua kiểm định.
2. Thêm trường xác suất vào sổ ARL-v1 (đăng ký trước) để đo được BSS và độ tin cậy từng vai AI.
3. Bản đăng ký trước cho hai Challenger (CHL-SQS-FILTER, CHL-REGIME-ADAPT) trước khi dựng sổ bóng.
4. Tín hiệu mới bậc C "tỷ lệ mua ròng khối ngoại / GTGD TB20" thay cờ 0/1 (giữ tín hiệu cũ).
