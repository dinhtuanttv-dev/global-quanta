# X6 — Kết quả (chạy 2026-10-16, theo đúng X6-prereg.md, không sai lệch giao thức)

Dữ liệu đầy đủ ở `X6-result.json`, gồm từng tín hiệu: t0, SAR5 và SAR20.

## A. Chiều tác động của engine Chất xúc tác (engine trước X1)

| | |
|---|---|
| Bản ghi trong sổ | 88 |
| Loại khỏi mẫu | 8 không có giá trên Gateway; 1 không xác định được t0 |
| Đủ 5 phiên / đủ 20 phiên | 73 / 47 (42 cụm nguồn) |
| **SAR(20) trung bình** | **+3,12%**, KTC95 bootstrap theo cụm **[+0,81%; +5,59%]** |
| Tỷ lệ SAR(20) > 0 | 57,4% (nhị thức một phía p = 0,19, chưa có ý nghĩa) |
| SAR(5) trung bình | −0,54%, KTC95 [−1,90%; +0,66%], chưa có ý nghĩa |
| Benefit (n = 42) | +2,38% [+0,15%; +4,83%] |
| Harm (n = 5) | +9,40% [+1,74%; +17,05%], mẫu rất nhỏ |
| Trung vị / tỉa 2 giá trị mỗi đầu | +2,26% / +2,85%: kết quả không do một vài ngoại lệ |

**Phán quyết theo đăng ký trước: ĐẠT** (n ≥ 30 và cận dưới KTC95 > 0). Nhãn bằng chứng là `VALIDATED_IN_SAMPLE`.

**Giới hạn (bắt buộc nêu cùng nhãn):**
- Mẫu nhỏ (47 tín hiệu) và tập trung trong **một tháng** (t0 từ 07/09 đến 09/10/2026). Các cửa sổ 20 phiên chồng lên nhau. Bootstrap theo nguồn chưa xử lý tương quan cùng thời điểm, nên KTC có thể hẹp hơn thực tế.
- Tỷ lệ trúng 57% chưa khác 50% một cách có ý nghĩa. Ở 5 phiên chưa thấy hiệu ứng. Như vậy hiệu ứng (nếu có) là trung hạn và yếu.
- Mẫu gồm cả tin trung lập từng bị gán "benefit" trước X1. Engine sau X1 phải được chấm lại bằng **kiểm định tiến** (cùng giao thức, tín hiệu từ 17/10/2026, khi có ít nhất 30 tín hiệu đủ 20 phiên).
- "Tỷ lệ thắng" hiển thị trên thẻ là tỷ lệ tăng giá **thô** sau 5 phiên (sổ `catalyst:calibration`, giá Yahoo), không phải lợi suất vượt trội. Hai số đo này khác nhau và không được trộn lẫn.

## B. Cổng MacroScore

**Không chạy**: Gateway đang ở chế độ mô phỏng. Nhãn giữ là `REFERENCE_ONLY` / `SYNTHETIC`. Giao thức cho số liệu thật đã được đăng ký trước ở X6-prereg.md, mục B.
