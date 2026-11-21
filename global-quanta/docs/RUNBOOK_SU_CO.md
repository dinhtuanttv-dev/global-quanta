# Runbook sự cố: dinhtuan-ck (Vercel Hobby) · Gateway (Railway) · QMS (Vercel Hobby)

Cập nhật 21/11/2026. Dùng khi nhận issue **"🔴 Sự cố"** (nhãn `uptime`) từ workflow `.github/workflows/uptime.yml`, hoặc khi người dùng báo lỗi.

## 0. Nhận biết nhanh

| Dấu hiệu trên web | Nguyên nhân thường gặp | Mục |
|---|---|---|
| Băng thông báo dưới đáy "Máy chủ dữ liệu đang gián đoạn…" | Gateway (Railway) sập / quá tải | §1 |
| Tab Cơ bản › Timeline ghi "Nguồn dự phòng: Gateway" | QMS hoặc Supabase gián đoạn; web đã tự chuyển nguồn | §2 |
| Trang trắng / lỗi JS sau một lần deploy | Bản frontend lỗi | §3 |
| Issue báo "Trang dinhtuan-ck" | Vercel (hiếm) | §3 |

Web tự chịu lỗi được tới mức nào:
- Gateway lỗi: trình duyệt hiện **bản lưu ≤ 24 giờ**, kèm nhãn giờ lưu.
- QMS lỗi: Timeline tự lấy từ Gateway.
- Không trang nào bị crash: đã thử chặn từng phụ thuộc ngày 21/11.

## 1. Gateway (Railway) không phản hồi
1. Xem trạng thái: `curl -s https://gateway-production-1da0.up.railway.app/health` (bình thường trả `{"status":"ok", memory…}`).
2. Railway dashboard › service **gateway** › Deployments: xem log, tìm `heap out of memory`, `SIGKILL`, `Crashed`.
3. Khởi động lại bản đang chạy: dashboard › Deployments › bản mới nhất › **Restart** (không build lại).
4. Muốn deploy lại đúng code `main`: tạo worktree tại commit `main`, rồi từ **gốc repo** chạy:
   `railway up -p fa664c46-42f8-4a81-8edb-330d0b1ee55c -s gateway -e production --ci`
   (cần câu cho phép đích danh).
5. Kiểm tra lại `/health`, `/api/market/preopen`, `/api/market/topbar`.

**Phòng ngừa (đặt một lần trên dashboard Railway):**
- Settings › Deploy › **Restart Policy = Always**. Mặc định chỉ khởi động lại tối đa 10 lần; đó là nguyên nhân Gateway dừng hẳn ngày 23/10.
- Usage › bật **cảnh báo chi tiêu** (đề xuất $10) và kiểm tra **giới hạn cứng** đủ cao: chạm giới hạn cứng thì Railway dừng Gateway.
- Không dùng `railway.json`: Railway ngừng đọc "Config as Code" từ 01/12/2026.

## 2. QMS (tuan-quant-scanner) lỗi
1. `curl -s -o /dev/null -w "%{http_code}" https://tuan-quant-scanner-psi.vercel.app/api/global/housing`.
2. Vercel dashboard › tuan-quant-scanner › Logs (Hobby **chỉ giữ 1 giờ**, nên xem sớm).
3. Nếu lỗi do hạn mức Hobby (CPU 4 giờ, bộ nhớ 360 GB-giờ, 1 triệu lần gọi/tháng): Hobby **khoá tới khi đủ 30 ngày**. Tạm thời Timeline đã tự lấy từ Gateway. Muốn mở khoá ngay thì nâng Pro một tháng.
4. Cron dữ liệu tháng/quý: `MSYS_NO_PATHCONV=1 vercel crons run /api/cron/refresh-lowfreq --project tuan-quant-scanner --scope dinhtuanttv-devs-projects` (cần cho phép; ghi DB). Kết quả nằm trong log, dòng `[refresh-lowfreq]`.

## 3. Frontend (dinhtuan-ck) lỗi sau deploy
1. **Rollback ngay**: `vercel rollback --scope dinhtuanttv-devs-projects`. Hobby chỉ quay được về **bản production liền trước**.
2. Cần quay xa hơn: `git revert <merge-commit>` → PR → merge. Build trên Hobby mất khoảng 1–2 phút (máy 2 vCPU, chạy lần lượt).
3. **Bản sao khẩn cấp**: project `global-quanta` (đã ngắt Git) vẫn sống tại `global-quanta.vercel.app`, và CORS của Gateway vẫn cho phép. Deploy một commit tốt vào đó:
   `vercel link --project global-quanta --scope dinhtuanttv-devs-projects --yes` (trong thư mục tạm; **xoá `.env.local` mà lệnh tạo ra**) rồi `vercel deploy --prod` từ worktree của commit tốt. Báo người dùng tạm dùng `global-quanta.vercel.app`.

## 4. Sau sự cố
- Issue `uptime` tự đóng khi dịch vụ hồi phục. Ghi nguyên nhân và cách xử lý vào issue trước khi đóng tay (nếu cần).
- Nếu là sự cố lặp lại: mở việc phòng ngừa (ví dụ giảm bộ nhớ, tách job nặng).

## 5. Giám sát định kỳ (mỗi tuần)
- `vercel metrics vercel.function_invocation.function_cpu_time_ms -a sum --project tuan-quant-scanner --since 7d` và `…function_duration_ms…`: theo tốc độ tháng phải dưới 50% hạn mức Hobby.
- GitHub › Actions › **uptime**: lịch chạy còn bật. GitHub tắt lịch chạy của repo công khai sau 60 ngày không có commit.
