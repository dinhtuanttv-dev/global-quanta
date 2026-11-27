# 02 — Kiến trúc mục tiêu

## 1. Bốn góc nhìn

```
Thanh đầu hợp nhất (luôn hiện)
  mã · tên · ngành ICB · phiên · giá đóng cửa ± %  ·  [vị thế Elite HL — NGUỒN DUY NHẤT]  ·  cảnh báo  ·  độ tươi dữ liệu
  [Tổng quan] [Tín hiệu] [Doanh nghiệp] [Sự kiện & thời điểm]      [Chart →] [Phòng họp AI →] [Chu kỳ →]

Tổng quan      — đọc trong 1 màn hình: thẻ Luận điểm + ma trận Lớp × Bằng chứng + Bộ não AI (gọn)
Tín hiệu       — 25 tín hiệu E2 đầy đủ (bậc, SQS, xu hướng, IC chế độ, phân vị, đóng góp) + Điểm Elite đối chứng
Doanh nghiệp   — KQKD, chất lượng lợi nhuận, cổ tức, thanh khoản (không còn phần kỹ thuật)
Sự kiện        — như hiện tại + liên kết khung "Mã đang chọn" của tab 1
```

Chế độ "🔎 Bộ lọc Elite" giữ nguyên, không thuộc phạm vi.

## 2. Bản đồ gộp tính năng thừa

| Hiện tại | Sau nâng cấp | Testid cũ |
|---|---|---|
| Vị thế HL ở thanh đầu + dải điểm + khối "Vị trí" + Hợp lưu | **Một** dòng vị thế ở thanh đầu (`profile-header-position`); khối "Khoảng cách tới Elite HL" chỉ hiện khi **ngoài** danh mục, nằm trong thẻ Luận điểm | `elite-profile-hl-pos` → nội dung chuyển vào `profile-header-position`; `elite-profile-hl-gap`, `hl-gap-*` giữ |
| Dải điểm Z (Hạng Z, Z, α5, P vượt) + thác đóng góp Z ở đầu Tổng hợp | Chuyển sang góc **Tín hiệu**, khối "Điểm Elite — danh mục dòng tiền (đối chứng)", thu gọn mặc định | `elite-profile-score`, `elite-profile-waterfall`, `elite-contrib-*` giữ, đổi vị trí |
| Hợp lưu (tầng 1 LS + TA) + Sức mạnh dẫn dắt (LS-v1) + dòng `ls_v1` | Ma trận lớp có dòng **Dẫn dắt** (LS-v1: phân vị, z, cổng H4) và dòng **Kỹ thuật** (7 mô hình TA); bấm mở chi tiết = nguyên `ConfluenceCard` / `LeadershipCard` | `elite-confluence*`, `elite-leadership*` giữ trong phần mở rộng |
| `PriceActionConfirmation` lồng trong `LiquidityProfileBlock` (góc Doanh nghiệp) | Chuyển vào chi tiết dòng **Kỹ thuật** của ma trận (góc Tổng quan) | `pa-confirmation`, `pa-setup`, `pa-validation` giữ |
| `pfa-nowcast` nhãn "Dự báo LNST quý tới" | Nhãn "**Ước tính LNST cả năm** (nowcast)", kèm chip bậc E2 của `kq_nowcast` + SQS | `pfa-nowcast` giữ |
| `StockImpactCard` | Dòng **Tác động** trong ma trận; mở chi tiết = nguyên khối | `elite-impact`, `impact-layer-*` giữ |
| `AiBrainCard` cuối trang | Dòng **AI** trong ma trận (số bản, đã chấm, nhãn) + khối gọn ở cuối Tổng quan | `ai-brain-profile` giữ |
| 25 dòng tín hiệu cuối Tổng hợp | Góc **Tín hiệu** (bảng đầy đủ, `03`) | `elite-sig-*` giữ |

**Kết quả:** góc Tổng quan dự kiến ≈ 1 màn hình khi thu gọn; không mất số nào; mọi khối cũ còn trong DOM (mở rộng / góc khác).

## 3. Thẻ Luận điểm (mới, đầu góc Tổng quan)

Do **code dựng theo luật cố định** từ số của Gateway — không dùng AI, không có từ "mua / bán / nên". Năm phần:

| Phần | Nội dung | Nguồn |
|---|---|---|
| Vị thế | "Trong Elite HL · hạng hợp lưu 1 · tỷ trọng 10,7% · lõi / chạy lãi / chờ nền · cách ngưỡng bán LS 38 điểm" hoặc "Ngoài danh mục — thiếu: …" (từ `hlGap`) | `decision`, `hlGap` |
| Điểm mạnh có bằng chứng | Tối đa 3 lớp đang **ủng hộ** VÀ có dấu ĐẠT / MỘT PHẦN, xếp theo dấu | ma trận lớp (§4) |
| Rủi ro | Tối đa 3 mục: điều kiện bán sát ngưỡng (`exitTriggers`), cảnh báo FA mức warn, thanh khoản kém, tín hiệu INVERTED đang bất lợi | `exitTriggers`, `profile-fa`, `liquidity`, EV-4 |
| Sự kiện kế tiếp | Mốc gần nhất: hạn công bố KQKD, GDKHQ đã công bố, vùng Timeline mở | `profile-fa` events, Timeline |
| Giá | Biểu đồ nhỏ 90 phiên giá điều chỉnh: pivot / vùng mua PZ, ngưỡng cắt lỗ của sổ, giá hiện tại (Q7) | `ta-series` / `adjusted` |

Mỗi câu có chú thích nguồn khi rê chuột. Thiếu dữ liệu → phần đó ghi "chưa có".

## 4. Ma trận Lớp × Bằng chứng (góc Tổng quan)

Một dòng mỗi lớp; cột: **Lớp · Trạng thái hôm nay (1 câu) · Chiều (ủng hộ / trung tính / bất lợi) · Dấu bằng chứng · Nguồn & giờ**. Bấm dòng → mở khối chi tiết cũ.

| Lớp | Trạng thái hôm nay lấy từ | Dấu bằng chứng lấy từ |
|---|---|---|
| Dẫn dắt (LS-v1) | phân vị, z, cổng H4 | E2 `ls_v1` (bậc + SQS) + LS-r1 |
| Kỹ thuật (7 mô hình TA + CAN SLIM + PA × KL) | số mô hình đạt / 7, trạng thái CAN SLIM, setup PA | ER-v1 "HL" / E2 `camslim_cup`, `sepa_state`… / PA-VOL-r1 |
| Ngành (RRG) | góc phần tư, ủng hộ / phản đối | E2 `rrg_quadrant` |
| Dòng tiền | Stealth 20/5, IFE, khối ngoại | E2 `stealth20` (PROVEN_LEADER) … |
| Cơ bản & KQKD | ước tính LNST cả năm, SUE, Piotroski, cảnh báo | E2 `kq_nowcast`, KQ-r1, FA-r1 |
| Thế giới & xúc tác | α ngành WS-v1, tác động | IMPACT_EVIDENCE |
| Thời điểm | vùng Timeline, TO, pha loãng | Timeline (F0), TO-r1, PX-r1 |
| Thanh khoản | LQ-v1 hạng, GTGD TB20 | LQ-r1 (chưa kiểm định) |
| AI | số bản phân tích, đã chấm, giá trị gia tăng | ARL-v1 |

**Màu theo bằng chứng, không theo hướng** (giữ mẫu của StockImpactCard): chỉ lớp có dấu ĐẠT / MỘT PHẦN mới tô màu chiều; lớp chưa kiểm định / không đạt hiển thị trung tính, có chữ.

## 5. Điều hướng

- Mặc định mã khi mở tab 2 (Q6): `ticker` cục bộ → `selectedTicker` toàn cục **nếu thuộc vũ trụ bảng E1** → mã hạng 1 Elite HL → VNINDEX (chỉ khi không có quyết định).
- Liên kết sâu: `?tab=quyet-dinh&sub=profile&t=NAF&v=signals` (giữ slug cũ, chỉ thêm tham số).
- Nút ở thanh đầu: Chart (tab Kỹ thuật), Phòng họp AI (tab 3, đúng mã), Chu kỳ (tab Ngành › Cycle Fingerprint, dùng `focusCycle` của #403).
