# 01 — Rà soát hiện trạng

> Đo trên **dinhtuan-ck.vercel.app** (main 254a0662), 27/11/2026, màn 1440 px, mã **NAF** (hạng 1 Elite HL), dữ liệu Gateway thật.

## 1. Tab QUYẾT ĐỊNH — vai trò từng tab con

| Tab con | Vai trò | Dữ liệu chính | Quan hệ với Hồ sơ 360° |
|---|---|---|---|
| 1. Bảng quyết định hôm nay | Danh mục chính thức Elite HL, phễu, ngưỡng bán, nhịp, lịch vùng mua, khung "Mã đang chọn" (Săn cổ tức TO, mô phỏng thời điểm, tin tức) | `/api/elite/decision`, `hl-history`, `hl/watch` | Bấm mã → mở Hồ sơ. Khung "Mã đang chọn" **trùng một phần** góc Sự kiện (lịch sử TO) |
| **2. Hồ sơ 360°** | Một mã: tín hiệu 7 tab, Hợp lưu, dẫn dắt, tác động, doanh nghiệp, sự kiện; chế độ Bộ lọc Elite | `panel/:ticker`, `decision/:ticker`, `profile-fa`, `leadership`, `impact`, `liquidity`, `dilution` … | — |
| 3. Phòng họp AI | Tranh luận theo mã trên hồ sơ khoá (snapshot) | `/api/elite/ai-room/*`, `/api/elite/evidence` | Thẻ Bộ não AI của mã hiện ở cuối Hồ sơ |
| 4. Bằng chứng & sổ theo dõi | E2 (25 tín hiệu) + EV-4 (SQS, xu hướng, IC chế độ), sổ tiến, E7, R3 | `/api/elite/evidence`, `evidence-evolution` | Nguồn bậc / SQS cho từng dòng tín hiệu của Hồ sơ |
| 5. Rủi ro danh mục | Ledoit–Wolf, VaR, căng thẳng | `/api/elite/risk` | Không trùng |

## 2. Hồ sơ 360° — cấu trúc hiện tại

```
[Chế độ: Hồ sơ <mã> | 🔎 Bộ lọc Elite]  [Đổi mã]  [Mở chart <mã> trong Phân tích kỹ thuật →]
ProfileHeader: mã · phiên · vị thế HL (hạng, tỷ trọng, cách ngưỡng ra) · số cảnh báo FA · [Tổng hợp | Doanh nghiệp | Sự kiện & thời điểm]
── Tổng hợp ──────────────────────────────────────────
SignalProfileCard
  ├ dải điểm: Hạng Z · Z · α 5 phiên · P vượt · thanh khoản · "Trong Elite HL"
  ├ Đóng góp vào Điểm Elite (thác Z)      ├ Vị trí so với Elite HL + Khoảng cách tới Elite HL
  ├ ConfluenceCard (Hợp lưu HL-v1: tầng 1 LS+TA · tầng 2 RRG · tầng 3 phiếu) + sổ HL-v1
  ├ LeadershipCard (LS-v1 5 thành phần, cổng H4, bậc)
  ├ StockImpactCard (Tác động lên cổ phiếu, dấu bằng chứng)
  └ 25 dòng tín hiệu nhóm theo tab (giá trị · thanh phân vị · bậc · t · đóng góp)
AiBrainCard (sổ phán quyết AI của mã)
── Doanh nghiệp ──────────────────────────────────────
CompanyProfileCard: cảnh báo FA · LiquidityProfileBlock (+ PriceActionConfirmation lồng bên trong) · KQKD · chất lượng LN · cổ tức · kiểm dữ liệu
── Sự kiện & thời điểm ───────────────────────────────
EventsProfileCard: lịch KQKD · sự kiện sắp tới · DilutionProfileBlock · TimelineZonesBlock · sự kiện gần đây · lịch sử TO
```

## 3. Số đo trên trang thật

| Góc nhìn | Chiều cao | `data-testid` | SVG | API gọi khi mở | Ghi chú |
|---|---|---|---|---|---|
| Mặc định khi mở tab | — | — | — | — | **Hiện `elite-profile-missing` vì mã mặc định là VNINDEX** |
| Tổng hợp | **2.509 px** | 92 | 0 | confluence/ledger, leadership, impact (+ panel, decision, evidence đã có bộ đệm) | `elite-profile` cao 2.131 px; "Elite HL" xuất hiện 5 lần, "LS-v1" 6 lần |
| Doanh nghiệp | **2.116 px** | 57 | 1 | ta-series, **universe, securities**, liquidity | `lq-profile` 878 px; `pa-confirmation` 344 px nằm trong khối thanh khoản |
| Sự kiện & thời điểm | 1.006 px | 33 | 0 | dilution, px-ledger | Gọn |

Không có lỗi trang ở cả ba góc nhìn.

## 4. Phân tích chuyên sâu (vai trò chuyên gia tài chính)

### 4.1 Trùng lặp và mâu thuẫn hiển thị

| Thông tin | Xuất hiện ở | Vấn đề |
|---|---|---|
| Vị thế Elite HL | (1) thanh đầu "Trong danh mục Elite HL · hạng hợp lưu 1 · tỷ trọng 10,7% · cách ngưỡng ra 38"; (2) dải điểm "Trong Elite HL"; (3) khối "Vị trí so với Elite HL"; (4) Hợp lưu "Hạng hợp lưu 1/269" | 4 lần, 3 cách diễn đạt |
| Hạng | "Hạng 31/269" (Z dòng tiền) cạnh "hạng hợp lưu 1" | **Hai hệ xếp hạng khác nhau cạnh nhau** — người đọc dễ hiểu sai NAF đứng thứ 31 |
| LS-v1 | Hợp lưu tầng 1 "phân vị 98", khối Sức mạnh dẫn dắt "+2,03 z · phân vị 98", dòng tín hiệu `ls_v1` | 3 lần |
| Nowcast KQKD | Góc Doanh nghiệp `pfa-nowcast` + (từ 30/11) tín hiệu E2 `kq_nowcast` | Hai nơi, nhãn góc Doanh nghiệp sai ("quý tới") |
| Lịch sử Săn cổ tức TO | Góc Sự kiện `pfa-to` + tab 1 khung "Mã đang chọn" | Trùng có chủ đích (QĐ-R) nhưng không liên kết |

### 4.2 Lỗ hổng dữ liệu (P0 — ngoài giao diện nhưng làm hỏng hồ sơ)

Bảng tín hiệu E1 theo phiên, tháng 11/2026:

| Phiên | Thiếu `researchFeatures` | Stealth 20 đo được |
|---|---|---|
| 02/11 → 12/11 (9 phiên) | không | 273–283 mã |
| **13, 16, 17, 18, 19, 20, 23/11** | **có** | **0** |
| 25/11 | không | 269 |
| **26, 27/11** | **có** | **0** |

- Bảng E1 phiên 27/11 dựng lúc **15:47** (`generatedAt` 08:47Z), job dòng tiền `researchFlow` chạy **16:00** → đọc khi chưa có dữ liệu; mỗi phiên chỉ dựng một lần.
- Hậu quả:
  1. Điểm Elite (E3) mất Stealth 20 và Stealth 5 (bậc A, ~53% trọng số thô sau #406; ~68% trước đó).
  2. **Tầng 3 của Elite HL mất 3 phiếu** (`stealth20`, `stealth5`, `net_intent` trong `confluence.js` VOTE_IDS) — tầng 3 là tiêu chí xếp hạng thứ ba (`hlCompare`).
  3. Hồ sơ hiện ô trống và dòng "Thiếu nguồn: researchFeatures".
- Không ảnh hưởng IC của E2 cho nhóm dòng tiền (đo trực tiếp từ `market_flow_daily`).

### 4.3 Chất lượng phân tích

| Tiêu chí | Hiện trạng | Khoảng trống |
|---|---|---|
| Kết luận một màn hình | Không — phải cuộn 2.500 px | Thiếu thẻ luận điểm: vị thế, lý do, rủi ro, sự kiện kế tiếp |
| Bằng chứng theo lớp | Có ở StockImpactCard (dấu), ER-v1 ở tab 4 | Chưa có một bảng "lớp × trạng thái × dấu bằng chứng" cho cả mã |
| Giá & vị trí giá | Không có biểu đồ (chart ở tab Kỹ thuật) | Không thấy giá đang ở đâu so với pivot / vùng mua / ngưỡng bán |
| Rủi ro mã | Cảnh báo FA, thanh khoản | Thiếu biến động, đóng góp rủi ro Euler (có ở tab 1/5), ngưỡng bán |
| So sánh ngang hàng | Phân vị trong ~269 mã | Chưa so trong ngành (ICB) |
| Độ tươi dữ liệu | Rải rác | Không có dòng nguồn + giờ cập nhật cho từng lớp |

### 4.4 Điểm tốt cần giữ

- Mọi khối có nhãn bằng chứng và câu "không phải khuyến nghị".
- Thiếu dữ liệu → ghi rõ, không điền 0.
- Khoảng cách tới Elite HL (`hlGap`) dùng đúng hàm của Gateway.
- StockImpactCard tô màu theo **bằng chứng**, không theo hướng — mẫu tốt cho toàn hồ sơ.
- Góc Sự kiện gọn, đọc nguyên văn nguồn Timeline (F0 khoá).
