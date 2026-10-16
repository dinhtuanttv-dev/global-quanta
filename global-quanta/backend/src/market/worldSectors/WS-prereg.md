# WS — Đăng ký trước: điểm "thuận / ngược gió" ngành thế giới → ngành Việt Nam

Ngày đăng ký: 2026-10-17. Bản đăng ký này được commit **trước** khi tính bất kỳ chỉ số dự báo nào (IC, hit rate, backtest) của
điểm WS.

**Công khai trung thực.** Các phần sau đã cố định trong M1 (#117) và M2 (#118) trước bản này: ánh xạ 74 mã → ICB, mức khớp,
trọng số, ngưỡng, cách gộp và chặn z. Đã xem những kết quả sau, nhưng chưa xem kết quả dự báo nào:
- điểm live của đúng một ngày (16/10);
- vài tương quan mô tả (Kim loại công nghiệp, Ngân hàng);
- beta của một số cổ phiếu.

## Đối tượng

- 22 ngành VN trong `catalog.js` (`VN_SECTORS`): 18 ngành ICB cấp 2 cộng 1750, 2770, 3570, 7530.
- Lợi suất ngành VN = log-lợi suất phiên của chỉ số ngành ICB Gateway (Lọc ngành).
- Thị trường VN = VN-Index (Gateway).

## Điểm kiểm định (point-in-time, không tham số ước lượng)

- **S_{s,d} (ngắn hạn), với phiên VN ngày d:**
  - mỗi mã ánh xạ tới ngành s lấy log-lợi suất của phiên gần nhất **trước** ngày d (mọi sàn);
  - z = lợi suất / σ, với σ = độ lệch chuẩn 250 phiên kết thúc tại phiên đó;
  - chặn ±3;
  - gộp theo mức khớp (1 / 0,75 / 0,4) trong khu vực, rồi trung bình đều giữa các khu vực;
  - ngành có hàng hoá dẫn dắt dạng giá NGÀY (`COMMODITY_DRIVERS`): z hàng hoá cùng quy tắc, nhân chiều, rồi trộn 0,7 ngành + 0,3 hàng hoá;
  - định nghĩa này trùng với "thông tin mới sau phiên VN trước" mà giao diện hiển thị.
- **M_{s,t} (trung hạn), tại cuối tháng t:**
  - z 63 phiên của mỗi mã, gộp như trên;
  - cộng 0,3 × z 3 kỳ của hàng hoá dẫn dắt; hàng hoá tháng chỉ dùng các kỳ ≤ tháng t−1, theo độ trễ công bố của Pink Sheet.

## Mẫu

- Từ phiên VN đầu tiên của năm 2023 (σ 250 phiên của mã nước ngoài và chỉ số ICB đã có) tới phiên VN đã đóng gần nhất.
- Hai nửa = chia đôi mẫu theo thời gian.

## Giả thuyết

- **H1 (tuyệt đối, chỉ báo cáo):** IC Spearman giữa S_{s,d} và r_{s,d} của từng ngành.
- **H2 (tương đối, theo từng ngành):**
  - mỗi ngày: S̃ = S − trung bình các ngành; r̃ = r_s − r_VNINDEX;
  - IC Spearman (S̃, r̃) theo thời gian;
  - p một phía (IC ≤ 0) bằng bootstrap khối dừng (khối TB 5 phiên, B = 5 000, seed 20261017);
  - hiệu chỉnh BY trên 22 ngành.
  - **ĐẠT:** q < 0,05 và IC > 0 và IC > 0 ở cả hai nửa.
- **H3 (toàn danh sách, ngắn hạn):**
  - trung bình theo ngày của IC Spearman cắt ngang giữa S và r̃;
  - t-stat Newey–West, trễ 5.
  - **ĐẠT:** trung bình > 0, p một phía < 0,025, và > 0 ở cả hai nửa.
- **H4 (toàn danh sách, trung hạn):**
  - tại cuối mỗi tháng t: IC Spearman cắt ngang giữa M_{s,t} và lợi suất tương đối tháng t+1 (ngành − VN-Index);
  - t-stat Newey–West, trễ 2.
  - **ĐẠT:** trung bình > 0, p một phía < 0,05, và > 0 ở cả hai nửa.

## Hệ quả (áp dụng đúng như viết)

- Ngành đạt H2 → nhãn "BẰNG CHỨNG (ngắn hạn, tương đối)" cho ngành đó. Ngành không đạt giữ "THĂM DÒ".
- H3 đạt → danh sách thuận/ngược gió ngắn hạn được gắn "BẰNG CHỨNG (xếp hạng)"; không đạt → "THĂM DÒ".
- H4 đạt → danh sách trung hạn được gắn "BẰNG CHỨNG (xếp hạng)"; không đạt → "THĂM DÒ".
- Không chỉnh ánh xạ, trọng số hay ngưỡng sau khi xem kết quả. Mọi thay đổi phải là bản đăng ký mới (WS-v2), và kết quả bản này
  vẫn được giữ.
- Chạy lại: `node backend/scripts/ws-validate.mjs --out backend/src/market/worldSectors/WS-result.json`.
