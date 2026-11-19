# Nạp số liệu vĩ mô trong nước bằng CSV (V1, 19/11/2026)

Bảy biến trong nước chưa có nguồn mở cập nhật tự động: lãi suất liên ngân hàng (IR), M2, tín dụng (CREDIT), FDI giải ngân, xuất khẩu (EXPORT), IIP (IO), PMI. Quản trị viên nạp tay qua route admin của Gateway. **Không bao giờ nạp số ước tính hay số mô phỏng.** Chỉ nạp số do cơ quan công bố.

## Nguồn chính thức

| Mã | Chuỗi | Cơ quan | Ngày công bố điển hình | Đơn vị trong CSV |
|---|---|---|---|---|
| IR | Lãi suất liên ngân hàng 1 tháng | NHNN (sbv.gov.vn) | hằng ngày, lấy bình quân hoặc cuối tháng | %/năm |
| M2 | Cung tiền M2 | NHNN | khoảng ngày 15, trễ 2 tháng | tỷ VND |
| CREDIT | Dư nợ tín dụng | NHNN | khoảng ngày 10, trễ 1 tháng | tỷ VND |
| FDI | FDI giải ngân | Cục Thống kê (gso.gov.vn) | ngày 6 tháng sau | triệu USD |
| EXPORT | Kim ngạch xuất khẩu | Cục Thống kê | ngày 6 tháng sau | triệu USD |
| IO | Chỉ số sản xuất công nghiệp | Cục Thống kê | ngày 6 tháng sau | chỉ số |
| PMI | PMI sản xuất Việt Nam | S&P Global (chỉ con số tiêu đề đã công bố) | ngày làm việc đầu tháng sau | điểm |
| CPI | Lạm phát so cùng kỳ (nạp tay để có sớm hơn IMF khoảng 1 tháng) | Cục Thống kê | ngày 6 tháng sau | % |

## Định dạng CSV

Hai cột: kỳ và giá trị. Kỳ nhận `YYYY-MM`, `YYYY-MM-DD` hoặc `dd/mm/yyyy`. Số nhận cả kiểu Việt Nam (`3,25`) lẫn kiểu Anh (`3.25`), khi đặt `locale` là `vi`, `en` hoặc `auto`. Số liệu ngày sẽ được gộp về tháng (`monthly: "last"` lấy giá trị cuối tháng, `"mean"` lấy bình quân).

```csv
period,value
2026-08,4.88
2026-09,5.08
2026-10,5.21
```

## Gửi lên Gateway

Khoá `MARKET_ADMIN_TOKEN` đọc từ biến môi trường, không dán thẳng vào lệnh. Luôn chạy thử trước (`dryRun: true`), đọc báo cáo chất lượng, rồi mới ghi.

```bash
node -e '
const csv = require("fs").readFileSync("cpi.csv", "utf8");
fetch("https://gateway-production-1da0.up.railway.app/api/macro/admin/import", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer " + process.env.MARKET_ADMIN_TOKEN },
  body: JSON.stringify({ seriesId: "CPI", csv, locale: "auto", source: "TCTK thông cáo 06/11/2026", asOf: "2026-11-06", dryRun: true }),
}).then((r) => r.json()).then((j) => console.log(JSON.stringify(j, null, 2)));'
```

| Trường | Ý nghĩa |
|---|---|
| `asOf` | **Ngày công bố thật** (YYYY-MM-DD). Bỏ trống thì engine ước tính từ độ trễ, nhưng nên ghi ngày thật để backtest không nhìn trước. |
| `source` | Ghi nguồn cụ thể (tên văn bản, ngày). Hiển thị trong mục "Nguồn & chất lượng dữ liệu". |
| `mode` | `"revision"` (mặc định): cơ quan **công bố lại** một số đã có, nên lưu thành vintage mới, giữ bản cũ theo ngày đã biết. `"correction"`: sửa **lỗi nhập** của chính mình, nên ghi đè. |
| `force` | Chỉ dùng khi báo cáo chất lượng có lỗi mức `error` mà anh đã kiểm và chấp nhận. |

## Sau khi nạp

- Mục **Nguồn & chất lượng dữ liệu** hiện:
  - nguồn của từng chuỗi;
  - kỳ kế tiếp dự kiến, hoặc số ngày **quá hạn công bố**;
  - các kỳ mà **hai nguồn lệch nhau** (ví dụ CPI nạp tay khác CPI qua IMF quá 0,05 điểm %);
  - số kỳ đã được công bố lại.
- Chuỗi cần đủ **60 tháng** còn cập nhật mới được đưa vào mô hình. Chưa đủ thì vẫn hiển thị nhưng ghi "chưa dùng".
- "Chế độ vĩ mô" được thiết kế trên IR, CPI và M2. Khi có đủ IR và M2, mô hình tự dùng 3 biến, và nhãn "chế độ lạm phát" tự đổi về "chế độ vĩ mô".
