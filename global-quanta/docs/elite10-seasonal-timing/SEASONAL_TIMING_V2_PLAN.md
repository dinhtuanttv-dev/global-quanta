# Chu kỳ & Thời điểm v2 — rà soát tài liệu bàn giao, phương án nâng cấp và kế hoạch code

**Ngày:** 25/10/2026 · **Dựa trên:** `ELITE10_SEASONAL_TIMING_HANDOVER.md` v1.0 + kiểm tra code và API production hôm nay.
**Vị trí sản phẩm:** tab **Lọc ngành**, tab con thứ ba **"⏱ Chu kỳ & thời điểm"** (ngang hàng *Xoay vòng ngành & Top 20* và *Cycle Fingerprint*); Elite 10 (CycleEnginePanel) dùng lại cùng bộ dữ liệu.
**Ràng buộc giữ nguyên:** không sửa tab Cổ tức (chỉ đọc API v3 của nó); lớp chart mặc định TẮT và gắn vào nến; gói miễn phí (Supabase/Neon); đăng ký kiểm định trước khi đo; nhãn bằng chứng trung thực.

---

## 1. Rà soát tài liệu v1.0 — đúng, sai, thiếu

### 1.1 Điểm v1.0 đúng và giữ nguyên
- Ba câu hỏi tách riêng: mùa vụ tháng (bối cảnh) · cửa sổ sự kiện (bằng chứng lịch sử/OOS) · xác suất hiện tại (mô hình). **Không cộng/nhân thành một "xác suất tổng".**
- n ≈ 5 mỗi ô tháng, nên phải hiện n/5, khoảng bất định và cảnh báo đa phép thử (12 tháng).
- DecisionBar chưa hiệu chuẩn, nên phải gắn nhãn THĂM DÒ / CHƯA HIỆU CHUẨN.
- Không dựng posterior từ tỷ lệ đã làm tròn.
- Mọi số liệu phải kèm nguồn, as-of và phiên bản.

### 1.2 Sai so với hiện trạng thật (đã kiểm tra 25/10)
| # | v1.0 ghi | Thực tế |
|---|---|---|
| R1 | "Elite 10 là alias của TaVnIndexTab" | `MainTabs → Elite10Hub → TaVnIndexTab (bản cũ) → TaVnIndexPanel → CycleEnginePanel`. Tab TA VN-Index hiện là Super Chart mới, **không có** CycleEnginePanel. |
| R2 | "Không thấy route backend /api/elite10/cycle" | Route nằm ở **Project A** (`app/api/elite10/cycle`), đọc Neon (`DividendCycleWindow` + `AgmCycleWindow`) và **đang trả 500**. Panel chỉ render khi có dữ liệu, nên hiện đang **ẩn với mọi người**. `/api/cotuc/cycle-stats` (luồng cũ) cũng 500. |
| R3 | Seasonal "5 năm" chưa rõ nguồn | `DividendCycleWindow` do cron cũ `dividend-cycle-scan` dựng: sự kiện từ VCI (đã hỏng) + giá Yahoo 5 năm, 5 cửa sổ cố định, **không** có FDR/OOS. Đây là thế hệ đã bị v3 thay thế. |
| R4 | v3 thiếu wins/losses | v3 có `nEvents`, `nEff`, `winRate` (số thực chưa làm tròn, nên `wins = winRate·nEvents` chính xác), `meanCarRaw/Shrunk`, `netExpectancy`, `netExpectancyLcb`, `oosHitRate`, `oosMeanNet`, `fdrQValue`, `holdsThroughEx`, `adjustedPriceBasis`, `benchmark`. Vẫn nên **trả thẳng `wins`/`losses` số nguyên** (khỏi suy diễn). |
| R5 | "Posterior Beta-Binomial chỉ có cho KQKD" | Cron `timing-signals-scan` **đã có prior Beta riêng cho cổ tức**: leave-one-ticker-out theo từng cửa sổ, cần ≥ 5 mã khác có ≥ 3 đợt (`estimatePriorFromRates`). Có thể dùng, nhưng phải công bố. |
| R6 | DecisionBar "50/60% là gate" | Thực tế khi 0 tín hiệu được dùng, xác suất tổng hiện **"50% (từ 0 tín hiệu)"**, tức con số prior trình bày như xác suất. Phải hiện "không có tín hiệu" thay vì 50%. |
| R7 | (không nhắc) hạ tầng | Neon khoá, nên Cổ tức đã chuyển sang kho Gateway (B0–B4, 24/10). Sổ theo dõi tín hiệu cổ tức hiện 0 bản ghi (lịch sử còn trong Neon, chờ migrate). Supabase 402. |

### 1.3 Thiếu trong v1.0 (bổ sung ở v2)
1. **Kiểm định đăng ký trước cho mùa vụ** (như CF3/T3/L3/EP5 của dự án): walk-forward theo năm, ngưỡng chốt trước, nhãn ĐẠT/THĂM DÒ. v1.0 chỉ khuyên "ghi khám phá".
2. **Kiểm tra "mùa vụ có thật không" theo từng mã**: hoán vị nhãn tháng trong từng năm + FDR toàn universe (v1.0 chỉ nêu FDR chung chung).
3. **Co rút theo ngành (empirical Bayes)** để n = 5 không tạo cực trị giả.
4. **Sổ theo dõi tiến cho dự báo tháng** (ghi bất biến đầu tháng, chấm cuối tháng), làm nền hiệu chuẩn (Brier, độ tin cậy).
5. **Mùa vụ cấp ngành (ICB cấp 2)**, phù hợp vị trí tab Lọc ngành. Gộp mã không tạo thêm năm độc lập (cụm theo năm).
6. **Một view thống nhất kiểu "⏱ Timeline điểm mua"**: dòng thời gian từ hôm nay gộp mùa vụ tháng + cửa sổ cổ tức + KQKD, mỗi dòng có bằng chứng riêng.
7. **Lỗi dữ liệu P0** chặn độ phủ (mục 6).

---

## 2. Phương pháp v2 (đóng băng theo phiên bản `SEAS-v1`)

### 2.1 Dữ liệu
- Chuỗi giá: `loadAdjustedUniverse` của Gateway (đang dùng cho Cycle Fingerprint và Top 20). Giá **điều chỉnh cộng dồn** (`ADJUSTED_CUMULATIVE`), 1.826 ngày, đọc từ kho, **không gọi SSI**. Benchmark: VN-Index và chỉ số ngành ICB cấp 2 (bình quân đều các mã cùng ngành, **bỏ chính mã đó**).
- MV0 phải xác minh `ADJUSTED_CUMULATIVE` có điều chỉnh cổ tức tiền mặt hay không. Nếu có, ghi "xấp xỉ tổng lợi suất trước thuế"; nếu không, ghi "lợi suất giá". Không tự gọi là total return.

### 2.2 Mùa vụ tháng — "5 năm gần nhất"
- **Kỳ mẫu:** 5 năm dương lịch đã hoàn tất (hôm nay là **2021–2025**), hiện rõ ngày đầu/cuối thật. Các tháng đã đóng của năm nay hiện **cột riêng "2026"**, không trộn vào mẫu. Tháng đang chạy hiện **"đang diễn ra (MTD)"** tách riêng.
- **Quan sát:** r(y,m) = đóng cửa phiên cuối tháng m / đóng cửa phiên cuối tháng m−1 − 1. Thiếu dữ liệu thì để null, không bao giờ thành 0. Ghi coverage theo năm.
- **Mỗi ô:** n/5 · trung bình · **trung vị** · tháng dương x/n (khoảng Wilson 90%) · vượt VN-Index (TB, x/n) · vượt ngành · min/max · cờ mẫu thấp (n < 4).
- **Độ mạnh mùa vụ của mã:** thống kê S = phương sai của 12 trung bình excess. p-value bằng **hoán vị nhãn tháng trong từng năm** (giữ cấu trúc năm, 2.000 lần, seed cố định). Sau đó **BH-FDR** trên toàn universe, ra nhãn *Mùa vụ rõ / Yếu / Không phân biệt được với nhiễu*.
- **Co rút:** ước lượng excess từng ô = trung bình có trọng số giữa (ô của mã) ↔ (cùng tháng của ngành) ↔ 0, trọng số theo n và phương sai (empirical Bayes, tính theo thời điểm). Hiển thị cả **số thô và số đã co**.
- **Chế độ dài hạn (10 năm)** chỉ bật sau khi MV0 sửa xong kho lịch sử 10 năm; khi bật, nhãn ghi rõ "10 năm, gồm chế độ thị trường cũ".

### 2.3 Xác suất — một mục tiêu, nhiều nguồn tách biệt
- **Mục tiêu chuẩn (đề xuất DEC-1):** *lợi suất vượt VN-Index sau phí 0,40%/vòng > 0 trong khung nắm giữ của dòng đó.*
  - Mùa vụ: khung = tháng dương lịch.
  - Cổ tức/KQKD: khung = entry → exit của cửa sổ v3.
- **Xác suất lịch sử có co rút:** Beta(α0 + thắng, β0 + thua) với prior **cùng miền** (mùa vụ: prior theo ngành × tháng, leave-one-ticker-out; cổ tức: prior sẵn có của cron v3). Trả thẳng số thắng/thua và khoảng tin cậy 90%.
- **Trạng thái hiệu chuẩn** lấy từ sổ theo dõi tiến:
  - CHƯA HIỆU CHUẨN: dưới N kết quả (đăng ký trước, đề xuất N = 300 dự báo tháng trên universe ≈ 1 tháng toàn universe).
  - ĐANG KIỂM: ≥ N, Brier chưa tốt hơn chuẩn gốc.
  - ĐẠT: Brier tốt hơn chuẩn gốc và độ dốc hiệu chuẩn có khoảng 90% chứa 1.
- **Không gộp:** dòng mùa vụ, dòng cổ tức, dòng KQKD và DecisionBar mỗi thứ một xác suất, có nhãn riêng. Chỉ hiện **"đồng thuận x/3 nguồn"** (đếm, không phải xác suất).

### 2.4 Kiểm định đăng ký trước `SEAS-prereg` (chốt TRƯỚC khi chạy, SHA-256 cấu hình)
- **Walk-forward theo năm 2019–2025:**
  - Với mỗi năm Y, dùng 5 năm trước Y để dự báo excess từng tháng (đã co rút).
  - Đo IC Spearman (dự báo ↔ thực tế) theo tháng trên universe.
  - Long-short top/bottom ngũ phân vị sau phí.
- **Tiêu chí ĐẠT (đề xuất, anh chốt ở DEC-4):**
  - IC trung bình OOS > 0 với t ≥ 2 (cụm theo tháng);
  - ≥ 5/7 năm IC > 0;
  - long-short sau phí > 0 với cận dưới KTC 90% > 0;
  - placebo (dịch nhãn tháng ngẫu nhiên) không cho kết quả tương đương.
- Kết quả **không đạt** → toàn bộ mùa vụ mang nhãn **THĂM DÒ / mô tả**, dòng mùa vụ trong Timeline chỉ ở bậc **BỐI CẢNH** (không bao giờ "đạt kiểm định"). Kết quả đạt hay không đều công bố.

### 2.5 Bậc hiển thị trong Timeline (không trộn)
| Bậc | Mùa vụ tháng | Cổ tức / KQKD (v3) |
|---|---|---|
| **ĐẠT KIỂM ĐỊNH** | Prereg ĐẠT **và** mã có mùa vụ rõ (FDR q ≤ 0,10) **và** xác suất co rút cận dưới > 50% | Cửa sổ `selected` của v3 (≥ 8 đợt, FDR, LCB > 0, OOS) — giữ nguyên |
| **GẦN ĐẠT** | Prereg ĐẠT, mã chưa qua FDR nhưng q ≤ 0,2 và cùng chiều ngành | `bestNearWindow` của v3 — giữ nguyên |
| **BỐI CẢNH** | Mọi trường hợp khác (gồm toàn bộ nếu prereg FAIL) — ẩn mặc định, bật bằng bộ lọc | — |

---

## 3. Thiết kế giao diện

### 3.1 Lọc ngành → tab con "⏱ Chu kỳ & thời điểm" (3 chế độ, giống bố cục Timeline điểm mua)
1. **⏱ Lịch thời điểm (mặc định)** — danh sách liên tục theo ngày, từ hôm nay:
   - Thứ tự: nhóm "đang trong khung" lên đầu → các ngày sắp tới; ẩn dòng đã qua (có công tắc).
   - Mỗi dòng: mã · ngành · loại (**MÙA VỤ THÁNG / CỔ TỨC / KQKD**) · khung (từ–đến, còn N phiên) · bậc · x/n · trung vị · vượt VN-Index · **xác suất co rút [KTC 90%]** · chip hiệu chuẩn · lý do còn thiếu (với GẦN ĐẠT).
   - Bộ lọc: loại · bậc · ngành ICB · ★ danh mục.
   - Chân trang: nguồn / as-of riêng từng miền, phương pháp, không phải khuyến nghị.
2. **Mùa vụ ngành:** bảng nhiệt ICB cấp 2 × 12 tháng.
   - Ô hiện trung vị excess + n.
   - Ô qua FDR có ký hiệu ◆ (không chỉ dùng màu).
   - Bấm ô → danh sách mã của ngành trong tháng đó.
3. **Hồ sơ mã** (ngăn kéo khi bấm mã):
   - Bố cục: 12 tháng (2021–2025) + cột 2026 + MTD → cửa sổ cổ tức v3 → KQKD v3 → DecisionBar (dùng lại component, chỉ đọc) → bằng chứng (prereg, FDR, sổ theo dõi, as-of).
   - Trên 390 px chuyển thành một cột.

### 3.2 Elite 10 — CycleEnginePanel v2
- Bỏ phụ thuộc `/api/elite10/cycle` (Neon). Dùng **cùng view-model** với hồ sơ mã ở trên để hai nơi luôn ra cùng con số.
- Time Verdict bỏ nhãn hành động (MUA TÍCH LŨY/CHỜ), chuyển thành **"Bối cảnh chu kỳ"** (thuận/nghịch lịch sử + lý do + nguồn).
- ĐHCĐ: ẩn cho tới khi có nguồn ngày ĐHCĐ đáng tin (VNDirect); ghi "chưa có dữ liệu".

### 3.3 Chart (Super Chart, lớp "Chu kỳ", mặc định TẮT, gắn nến)
- Vẽ khung tháng hiện tại và các cửa sổ cổ tức/KQKD sắp tới (đường chấm cho ngày ước tính), kèm chú giải và mô tả cho trình đọc màn hình.

---

## 4. Kiến trúc

```
Gateway (Railway)                                         Frontend
 market/seasonality/
   monthly.js    — lợi suất tháng, thống kê ô (thuần)       Lọc ngành › ⏱ Chu kỳ & thời điểm
   strength.js   — hoán vị + BH-FDR (thuần, seed)             ├ Lịch thời điểm  ← /api/seasonality/timeline
   shrink.js     — co rút ngành × tháng (thuần)              ├ Mùa vụ ngành    ← /api/seasonality/sectors
   service.js    — job sau 15:45, KV local:season:v1:*       └ Hồ sơ mã        ← /api/seasonality/ticker
   ledger.js     — dự báo đầu tháng / chấm cuối tháng      Elite 10 › CycleEnginePanel v2 (cùng view-model)
   timeline.js   — gộp dòng mùa vụ + Timeline điểm mua     Super Chart › lớp "Chu kỳ" (mặc định tắt)
                   (buyTimelineCore đã có trên Gateway)
 routes/seasonality.js — /ticker /sectors /timeline /status /health
 scripts/seasonality-validate.mjs + SEAS-prereg.md + seas-config.json (SHA)
 Python oracle (như SEPA/MTF) đối chiếu lợi suất tháng + hoán vị
```
Project A chỉ cung cấp v3 cổ tức/KQKD (đã chạy trên kho Gateway). Không thêm bảng Neon/Supabase mới.

---

## 5. Kế hoạch code — MV0 → MV7

| Bước | Nội dung | Kiểm thử / nghiệm thu |
|---|---|---|
| **MV0 · Dữ liệu P0** | (a) Sửa kho lịch sử 10 năm của Gateway (`adjustedHistory`): hiện **mọi yêu cầu 10 năm đều tải đầy đủ lại** (VNM vừa tải xong vẫn đòi tải lại), đốt hết 40 lượt/giờ dùng chung, nên 84 mã Cổ tức chưa có quyết định. Lưu mốc "đã hỏi tới ngày X, nguồn không có sớm hơn" và tìm nơi đang đốt lượt. (b) Xác minh `ADJUSTED_CUMULATIVE` có gồm cổ tức tiền mặt. (c) Trả `wins`/`losses` nguyên trong v3 (Project A, đổi định dạng, không đổi công thức). | Gọi 2 lần liên tiếp → lần 2 là CACHE; độ phủ Cổ tức ≥ 200/285 mã có lịch sử cổ tức; test đơn vị. |
| **MV1 · Engine mùa vụ** | `monthly.js`, `strength.js`, `shrink.js` thuần + Python oracle. | Oracle khớp 100% lợi suất tháng/ô; fixture n = 0/1/5, tháng thiếu, MTD, năm nay tách riêng (checklist S-01…S-06). |
| **MV2 · Kiểm định đăng ký trước** | Viết `SEAS-prereg.md` + cấu hình SHA **trước**, rồi chạy walk-forward 2019–2025 + placebo. | Báo cáo IS/OOS công bố nguyên trạng; nhãn ĐẠT/THĂM DÒ tự động từ báo cáo. |
| **MV3 · Dịch vụ + API + sổ theo dõi** | Job sau phiên, KV `local:`, `/api/seasonality/*`, sổ dự báo tháng bất biến + chấm điểm + trạng thái hiệu chuẩn. | Khởi động lại vẫn còn; bộ nhớ heap đo dưới tải; sổ ghi trước kết quả (P-07). |
| **MV4 · Timeline thống nhất** | Gộp dòng mùa vụ + Timeline điểm mua (Gateway) theo một hợp đồng; xác suất co rút từng nguồn; "đồng thuận x/3"; quy tắc độ mới/cũ như B4. | Không có phép nhân/cộng xác suất (P-09); mỗi dòng đủ target/khung/nguồn/as-of (P-01). |
| **MV5 · Giao diện Lọc ngành** | Tab con thứ 3: Lịch thời điểm, Mùa vụ ngành, Hồ sơ mã; trạng thái tải/rỗng/cũ/lỗi riêng từng khối. | RTL test; E2E 2 site × desktop + 390 px; không cuộn ngang; a11y (không chỉ dùng màu). |
| **MV6 · Elite 10 + chart** | CycleEnginePanel v2 trên cùng view-model; Time Verdict thành bối cảnh; lớp chart "Chu kỳ" (mặc định tắt). | Số liệu Elite = Lọc ngành (test đối chiếu); parity chart không đổi khi lớp tắt. |
| **MV7 · Vận hành** | `/api/seasonality/health` + dòng trong bảng sức khoẻ kho; tài liệu; kiểm tra sổ theo dõi ngày 01/12 (lần chấm đầu cho tháng 11). | E2E production 2 site; hiệu năng trong SLO. |

Thứ tự phát hành: MV0 → MV1 → MV2 (kết quả quyết định nhãn) → MV3 → MV4 → MV5 → MV6 → MV7.
Mỗi bước một PR; Gateway deploy trước khi merge.

---

## 6. Quyết định cần anh chốt (mặc định an toàn đề xuất)

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| DEC-1 | Mục tiêu xác suất | Vượt VN-Index sau phí 0,40%/vòng > 0 trong khung nắm giữ của dòng |
| DEC-2 | "5 năm gần nhất" | 5 năm dương lịch hoàn tất (2021–2025) + cột 2026 riêng + MTD riêng |
| DEC-3 | Benchmark | VN-Index (chính) + ngành ICB cấp 2 bình quân đều, bỏ chính mã (phụ) |
| DEC-4 | Ngưỡng prereg | Như mục 2.4; FAIL thì mùa vụ chỉ là BỐI CẢNH |
| DEC-5 | Time Verdict Elite 10 | Bỏ nhãn hành động, chuyển thành "Bối cảnh chu kỳ" |
| DEC-6 | ĐHCĐ | Ẩn tới khi có nguồn ngày ĐHCĐ đáng tin |
| DEC-7 | Chế độ 10 năm | Chỉ bật sau MV0, nhãn rõ "gồm chế độ thị trường cũ" |
| DEC-8 | DecisionBar 0 tín hiệu | Hiện "không có tín hiệu" thay "50%" trong view mới (không sửa tab Cổ tức) |

---

## 7. Phụ lục (25/10) — rà soát `locnganh-timing/L2` và phần chu kỳ ngành

### 7.1 Hiện trạng đã kiểm tra trên production
- `/api/locnganh/sector-timing-signals` (L2): 34 ngành ICB, dữ liệu tới 23/10. Sự kiện = ngành **vào góc Cải thiện** của RRG tuần (Gateway `sector-rrg/L5`; chỉ số ngành = rổ mã universe, trọng số GTGD 60 phiên, trần 25%, giá điều chỉnh).
  - Hiện **34/34 ngành = AVOID/NO_SIGNAL**.
  - Mỗi ngành chỉ ~7 sự kiện, kỳ vọng ròng ≈ 0 hoặc âm, q-value FDR ~0,9.
- Kiểm định L3 (đăng ký trước): **KHÔNG ĐẠT**. OOS −2,02% [−3,67; −0,30], n 57, placebo p 0,71. Nhãn EXPERIMENTAL đang hiện đúng.
- **Lỗi trung thực:**
  - `/api/locnganh/signal-tracking` nuốt mọi lỗi CSDL thành "0 tín hiệu". Neon khoá nhưng giao diện trông như mô hình chưa phát tín hiệu nào.
  - Cron `sector-timing-scan` ghi `SectorSignalTrack` trên Neon, nên **mọi lượt ghi đều lỗi**: sổ theo dõi ngành không chạy.
- DecisionBar ngành cũng hiện "50% (từ 0 tín hiệu)" như Cổ tức (DEC-8).

### 7.2 Đã sửa trong MV0
- Sổ theo dõi tín hiệu ngành chuyển sang kho Gateway (bảng `sectortrack`).
- Route trả **503 + mã lỗi** khi kho không đọc được (không còn "0 tín hiệu" giả).
- Script migrate nhập lại lịch sử khi Neon mở.

### 7.3 Chu kỳ & thời điểm của NGÀNH (bổ sung vào MV1–MV5)
- **Mùa vụ ngành 12 tháng (5 năm gần nhất):**
  - Tính trên **chính chỉ số ngành ngày** của Gateway (`buildSectorIndex`, cùng định nghĩa với RRG/L2), không tự dựng định nghĩa khác.
  - Excess so với VN-Index.
  - Kiểm định độ mạnh mùa vụ bằng hoán vị + FDR trên 34 ngành.
  - Thuộc cùng prereg `SEAS` (một bộ tiêu chí cho cả mã và ngành, chốt trước).
- **Dòng NGÀNH trong "⏱ Lịch thời điểm":**
  - Loại *MÙA VỤ NGÀNH* (tháng sắp tới có excess lịch sử của ngành).
  - Loại *XOAY VÒNG* (cửa sổ sau khi ngành vào Cải thiện, lấy từ L2): luôn ở bậc BỐI CẢNH vì L3 không đạt.
  - Bấm vào ngành mở ngăn kéo ngành: bảng 12 tháng + RRG/flow + cửa sổ L2 + sổ theo dõi.
- **Bảng nhiệt "Mùa vụ ngành"** (ICB × 12 tháng) là chế độ thứ hai của tab con. Bấm một ô sẽ liệt kê các mã của ngành kèm mùa vụ của từng mã trong tháng đó.
