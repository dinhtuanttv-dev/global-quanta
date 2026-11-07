# Elite × TO — Đăng ký trước: EX-r1, COMP-r1, DIV-IC (sổ ảo, không đổi danh mục Elite 10)

Ngày đăng ký: 07/11/2026. Người duyệt: chủ dự án ("Giai đoạn II: đăng ký trước rồi chạy sổ ảo tới mốc đánh giá").

Bản này viết **trước** khi có mã ghi sổ. Không sửa định nghĩa hay tiêu chí sau khi xem dữ liệu; muốn đổi thì đăng ký lại (r2).

**Ràng buộc:**
- Danh mục Elite 10 chính thức (E3-v4) **không đổi**.
- Mọi thứ dưới đây là **sổ ảo**, chạy tới mốc đánh giá chung khoảng tháng 2–3/2027. Tại mốc đó xem cùng sổ E3, Cash Gate và TO-L1.
- Tín hiệu mới **không** được thêm vào sổ đăng ký E2 (SIGNAL_SPECS). Lý do: thêm sẽ làm tăng số phép thử Benjamini–Hochberg, đổi q-value và hạng của tín hiệu đang có, tức là gián tiếp đổi danh mục chính thức.

## Dữ liệu chung
- **Giá:** giá điều chỉnh VNDirect ở kho Gateway (đã gồm cổ tức trước thuế); VN-Index.
- **Sự kiện:** đợt cổ tức tiền VNDirect, cùng định nghĩa TO-v1 (`divRunup.js`).
- **Ngày bắt đầu ghi:** 09/11/2026 (phiên đầu tiên sau đăng ký), đồng bộ với sổ TO-L1.

## EX-r1 — Giữ qua GDKHQ (đợt lợi suất ≥ 5%)
- **Đo lường:**
  - Với mỗi lệnh TO-L1 (đủ điều kiện TO-r1), đo phần giữ tiếp từ đóng cửa phiên cuối còn quyền tới đóng cửa GDKHQ + 4 phiên (5 phiên).
  - Tính vượt VN-Index, đã gồm cổ tức nhận sau thuế 5%, không trừ phí.
- **Tham chiếu (2022–2026, MÔ TẢ):** −2,87%, khoảng tin cậy 95% [−3,71%; −2,09%], dương 20%, 129 đợt.
- **Hai lần xem, tại 30 và 60 đợt có kết quả:**
  - Đạt khi **cận trên** khoảng tin cậy 97,5% (bootstrap theo tháng GDKHQ, 2000 lần, seed 20261107) **< 0**.
  - Kết quả mỗi lần xem ghi vĩnh viễn.
- **Áp vào Elite (thông tin):** cảnh báo GDKHQ trên bảng Elite đã có ở Giai đoạn I, nhãn THĂM DÒ. Quy tắc "bán ở phiên cuối còn quyền" chỉ chạy trong sổ ảo (COMP-r1, biến thể GUARD).

## COMP-r1 — Danh mục ghép ảo "Elite 10 + Săn cổ tức" (ghi tách đóng góp)
Ghi theo ngày, lợi nhuận từ đóng cửa phiên trước tới đóng cửa phiên này. Tỷ trọng lõi lấy từ danh mục Elite chính thức dựng gần nhất **trước** phiên đó (KV `elite:decision:<ngày>`).

| Biến thể | Định nghĩa |
|---|---|
| CORE | Danh mục Elite 10 chính thức, đúng tỷ trọng. |
| GUARD | CORE, nhưng vị thế có GDKHQ cổ tức tiền nhóm lợi suất ≥ 5% thì bán ở đóng cửa phiên cuối còn quyền và để tiền mặt (lãi 0) trong 5 phiên GDKHQ … GDKHQ + 4. Nếu mã vẫn còn trong danh mục thì mua lại. Phí bán 0,25%, mua lại 0,2%. |
| SLEEVE | CORE, cộng tối đa 2 lệnh đang mở của sổ TO-L1, mỗi lệnh 10% giá trị, lấy vốn chia theo tỷ trọng của lõi. Vào và ra theo đúng TO-r1, phí 0,2% + 0,25%. |
| COMP | GUARD + SLEEVE cùng lúc. |

- **Đóng góp từng lớp** = chênh lệch lợi nhuận ngày so với CORE: ΔGUARD, ΔSLEEVE, ΔCOMP. Chi phí xoay vòng của lõi như nhau ở mọi biến thể nên không tính.
- **Đánh giá tại mốc (≥ 60 phiên ghi):** COMP đạt khi đủ cả hai điều kiện:
  - (a) trung bình ΔCOMP ngày > 0, với cận dưới khoảng tin cậy 95% của bootstrap khối tròn (khối 10 phiên, 2000 lần, seed 20261107) > 0;
  - (b) sụt giảm lớn nhất của COMP không tệ hơn CORE quá 1 điểm %.
- **Giới hạn ghi nhận trước:** số lệnh của lớp vệ tinh ít (khoảng 25–35/năm), lớp bảo vệ hiếm khi kích hoạt (1/310 vị thế trong mẫu đã xem). Rất có thể chưa đủ mẫu tại mốc; khi đó kết luận là **CHƯA ĐỦ MẪU**, không phải đạt.

## DIV-IC — Tín hiệu "đang trong cửa sổ cổ tức" theo khung tín hiệu Elite (sổ riêng)
- **Giá trị tín hiệu** của mã i ở phiên d:
  - bằng lợi suất đợt chi (theo giá trước công bố) nếu phiên vào ≤ d < GDKHQ;
  - bằng 0 nếu không.
- **IC ngày** = tương quan hạng Spearman (hạng trung bình khi trùng) giữa giá trị tín hiệu và lợi nhuận vượt VN-Index 5 phiên kế tiếp (d → d+5), trên toàn danh mục. Chỉ tính phiên có ≥ 3 mã mang giá trị khác 0.
- **Đánh giá tại mốc (≥ 60 phiên IC):** trung bình IC > 0 và thống kê t Newey–West (độ trễ 5) ≥ 2.
- **Lưu ý:** chân trời cố định 5 phiên có thể vượt qua GDKHQ. Lịch sử cho thấy chân trời này cho kết quả gần 0 (−0,04%), trong khi TO-r1 bán đúng phiên cuối còn quyền thì dương. Vì vậy DIV-IC đo xem tín hiệu có ích **trong khung cố định của Elite** hay không, không phải đo TO-r1.

## Hệ quả
- Tới mốc đánh giá, mọi nhãn là **THĂM DÒ**. Không biến thể nào được tự đưa vào danh mục chính thức.
- Muốn đưa vào thì cần quyết định của chủ dự án sau khi xem kết quả, và một bản đăng ký mới cho cách đưa vào.
