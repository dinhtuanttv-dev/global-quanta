# Phương án dự phòng sau khi lên Vercel Hobby (21/11/2026)

**Trạng thái:** rà soát + thử chịu lỗi trên production; **chưa sửa code**. Mỗi hạng mục làm thành PR riêng sau khi được duyệt.

## 1. Kiến trúc hiện tại và điểm lỗi đơn lẻ

```
Trình duyệt ──► dinhtuan-ck (Vercel Hobby, 100% tĩnh) ──► Railway Gateway (dữ liệu + đăng nhập)  ◄── điểm lỗi lớn nhất
                                                        └► QMS tuan-quant-scanner (Vercel Hobby) ──► Supabase
```

| Thành phần | Mức phụ thuộc | Hiện trạng chịu lỗi |
|---|---|---|
| Vercel (trang tĩnh) | Thấp: chỉ phát HTML/JS | Rất bền. Hobby chỉ rollback được về bản liền trước |
| **Railway Gateway** | **Gần như toàn bộ dữ liệu + đăng nhập** | Không có `railway.json` → khởi động lại mặc định tối đa 10 lần (đúng kịch bản dừng hẳn ngày 23/10); Railway không có đường dẫn health check; **không có giám sát ngoài** |
| QMS | Tab PHÂN TÍCH CƠ BẢN (Timeline, cổ tức), bảng quét dự phòng | Hạn mức Hobby còn dư nhiều; vượt hạn mức thì bị **khoá 30 ngày** |
| Supabase (DB của QMS) | Dữ liệu QMS | Đã từng bị khoá (402, 10/2026) |

## 2. Kết quả thử chịu lỗi trên production (chặn từng phụ thuộc, 7 tab, dữ liệu thật)

| Kịch bản | Tab còn dùng được | Tab trống | Lỗi JS (crash) | Người dùng thấy gì |
|---|---|---|---|---|
| Bình thường (Hobby) | 7/7 | 0 | 0 | — |
| **QMS sập** | 6/7 | Cơ bản › Timeline | 0 | "Không tải được timeline: Failed to fetch" |
| **Gateway sập** | Cơ bản (qua QMS), một phần Tổng quan | 5/7 | 0 | Hàng chục dòng "Failed to fetch", TopBar "MẤT KẾT NỐI", **không có thông báo chung, không có dữ liệu cũ** |

**Điểm tốt:** không tab nào crash (0 lỗi trang ở mọi kịch bản). Phiên đăng nhập đang có được giữ khi Gateway lỗi tạm (`SessionState = 'transient'`).

**Phát hiện quan trọng:** Gateway đã tính sẵn **cùng Timeline** (`/api/cotuc-store/buy-timeline`); so với QMS khớp **164/164 dòng**, số đếm trùng.

## 3. Phương án dự phòng, chia theo lớp

### Lớp A: không để sập (phòng ngừa)
| # | Việc | Vì sao | Loại |
|---|---|---|---|
| **A1** | `railway.json` cho Gateway: `restartPolicyType: ALWAYS`, `healthcheckPath: /health`, `healthcheckTimeout: 120` | Không còn dừng hẳn sau 10 lần khởi động lại; deploy mới chỉ nhận traffic khi đã khoẻ (không bị gián đoạn khi deploy) | Cấu hình + railway up |
| **A2** | Giám sát ngoài bằng GitHub Actions (miễn phí, repo công khai): mỗi 10 phút gọi `/health` Gateway, trang chính, 1 route QMS, `/api/market/preopen`; lỗi 2 lần liên tiếp thì **mở issue** (GitHub gửi email cho bạn), hồi phục thì tự đóng | Hiện nay Gateway sập lúc đêm thì không ai biết | Tệp workflow mới |
| **A3** | Railway: đặt **cảnh báo** chi tiêu (đề xuất $10) và kiểm **giới hạn cứng** đủ cao | Chạm giới hạn cứng thì Railway **dừng Gateway**, cả trang ngừng theo | Dashboard Railway (bạn làm) |
| A4 | Theo dõi hạn mức Vercel Hobby mỗi tuần (B6): CPU, bộ nhớ, số lần gọi của QMS | Vượt mức thì khoá 30 ngày | Chỉ đọc |

### Lớp B: khi QMS lỗi
| # | Việc | Vì sao | Loại |
|---|---|---|---|
| **B1** | Timeline điểm mua: QMS lỗi thì **tự chuyển sang Gateway** `/api/cotuc-store/buy-timeline` (cùng dữ liệu, đã đối chiếu 164/164), ghi rõ "nguồn dự phòng: Gateway" | Tab Cơ bản không còn trống khi QMS hoặc Supabase gặp sự cố | PR frontend nhỏ |
| B2 | Rà các route Cổ tức còn lại (`decision-states`, `quality-score`, `universe-scores`, `events`) xem kho Cổ tức trên Gateway có thay được không | Gỡ dần phụ thuộc vào QMS | Nghiên cứu |

### Lớp C: khi Gateway lỗi
| # | Việc | Vì sao | Loại |
|---|---|---|---|
| **C1** | **Một băng thông báo chung**: "Máy chủ dữ liệu đang gián đoạn, hệ thống tự thử lại" kèm giờ mất kết nối, thay cho hàng chục dòng "Failed to fetch" | Chuyên nghiệp, rõ ràng, người dùng biết đó là sự cố tạm thời | PR frontend nhỏ |
| **C2** | **Bộ nhớ đệm bền phía trình duyệt** cho các API chỉ đọc quan trọng (giới hạn dung lượng, hạn 24 giờ): khi Gateway sập vẫn hiện **bản cuối**, có nhãn "bản lưu lúc hh:mm" | Gateway trục trặc ngắn thì người dùng gần như không thấy gián đoạn | PR frontend vừa |
| ✗ | **Không** đưa Gateway qua proxy CDN của Vercel | Lượng request của Gateway rất lớn, sẽ ăn vào hạn mức 1 triệu request CDN và 10 GB Fast Origin Transfer của Hobby | — |

### Lớp D: triển khai an toàn trên Hobby
| # | Việc | Vì sao | Loại |
|---|---|---|---|
| **D1** | `vercel.json`: `/assets/*` → `Cache-Control: public, max-age=31536000, immutable` | Hiện là `max-age=0`: mỗi lần mở trang phải hỏi lại về file JS 3 MB → chậm hơn và tốn request CDN. Tên file có mã băm nên cache an toàn | Cấu hình |
| **D2** | **Bản sao khẩn cấp**: giữ project `global-quanta` (đã ngắt Git) làm dự phòng nóng. Nếu `dinhtuan-ck` hỏng mà rollback một bước không đủ, `vercel deploy --prod` commit tốt vào `global-quanta` trong ~2 phút. **Giữ `global-quanta` trong `FRONTEND_ORIGIN`** của Gateway (đính chính đề xuất gỡ trước đây) | Hobby chỉ rollback được về bản liền trước | Runbook |
| **D3** | Runbook sự cố (tài liệu): Gateway sập → `railway redeploy`/`railway up`; frontend lỗi → `vercel rollback` / `git revert`; QMS vượt hạn mức → B1 đã che Timeline | Xử lý trong vài phút, không phải điều tra lại | Tài liệu |

## 4. Thứ tự đề xuất

1. **A1 + A2 + D1 + C1 + B1**: làm nhanh, tác động lớn nhất (mỗi việc 1 PR nhỏ). A1 cần cho phép `railway up`; còn lại chỉ cần cho phép merge.
2. **A3**: bạn làm trên dashboard Railway.
3. **C2 + D3**: sau khi lớp 1 ổn định.
4. **B2, A4**: liên tục.

## 5. Chưa kiểm được
- Chính sách khởi động lại và giới hạn chi tiêu hiện tại trên dashboard Railway (không có `railway.json` thì đoán là mặc định).
- Vercel Hobby có gửi email cảnh báo khi gần chạm hạn mức hay không.

## 6. Điều chỉnh khi triển khai (21/11/2026)
- **A1 không dùng `railway.json`:** Railway thông báo "Config as Code" ngừng được đọc từ **01/12/2026**. Chính sách khởi động lại **Always** đặt trên dashboard Railway; gói Hobby của Railway là gói trả phí nên được phép. **Không bật health check**: service Gateway có volume nên Railway không chạy chồng hai bản; tài liệu không nói rõ chuyện gì xảy ra khi bản mới trượt health check, nên không nhận rủi ro chưa kiểm chứng.
- **B1 hoãn:** `useBuyTimeline.ts` và `BuyTimelineTab.tsx` nằm trong **khoá tuyệt đối Timeline điểm mua** (test F0, SHA-256). Muốn có dự phòng Gateway cho Timeline thì cần bạn quyết định mở khoá riêng cho thay đổi này. Lớp chịu lỗi C2 chỉ áp cho Gateway, nên Timeline (gọi QMS) không bị ảnh hưởng.
- **C2 triển khai bằng một lớp chặn duy nhất** (`services/gatewayResilience.ts`, cài ở `main.tsx`) thay vì sửa 24 nơi gọi Gateway.
- **A2:** `.github/workflows/uptime.yml`: Gateway `/health` mỗi 15 phút; trang và QMS (route có cache CDN 6 giờ) mỗi giờ.
- **Không tăng hạn mức:** C1/C2 không phát sinh request lúc bình thường; A2 thêm khoảng 720 request CDN/tháng tới Vercel (hạn mức 1 triệu), trong khi D1 bỏ được 1 lượt hỏi lại file JS ở mỗi lần mở trang.
