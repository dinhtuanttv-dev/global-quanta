# Rà soát hạ Vercel Pro → Hobby

> **Đọc Phần 5 trước.** Phần 5 (rà soát lại cùng ngày) dùng số liệu runtime thật và bảng giới hạn Hobby chính thức, đồng thời **thay thế** các nhận định "chưa kiểm" trong Phần 0–4: giới hạn cron, trần thời gian chạy, và thứ tự ưu tiên H1–H6.

**Ngày:** 21/11/2026 · **Trạng thái:** chỉ đọc và phân tích, chưa sửa code hay cấu hình · **Code rà soát:** `global-quanta` `origin/main` `3be0d0cf`; `quant-macro-scanner` (QMS) `origin/main` `65ef3aa`
**Nguồn số liệu:** Vercel API và CLI (`vercel inspect`, danh sách deployment), request thật tới Gateway và QMS, tài liệu Vercel.

---

## 0. Tóm tắt

1. **Gần như toàn bộ chi phí là phút CPU build, và tăng theo số lần build chứ không theo độ nặng của build.** Mỗi lần build thật chỉ 38–41 giây, nhưng được làm tròn lên 1 phút và nhân với 4 vCPU, nên tính **4 CPU-phút** (theo `vercel inspect`: "1m x 4vCPU"). Từ 30/10, mỗi project `dinhtuan-ck` và `global-quanta` có **397 deployment**: 239 bản xem trước, 158 production, 88 được bỏ qua nhờ `ignoreCommand`. Hai project cộng lại là khoảng 618 lần build thật × 4 ≈ 41 giờ; cộng QMS 20 lần thì khớp với ~49,6 giờ trên hoá đơn.
2. **Dừng `global-quanta` an toàn.** Code chạy thật không có URL `global-quanta.vercel.app` nào viết cứng. CORS của Gateway đọc từ biến `FRONTEND_ORIGIN` và đã cho phép `dinhtuan-ck`. **Nhưng không dừng được bằng ô "Ignored Build Step" trên dashboard**, vì `vercel.json` có `ignoreCommand`, và theo tài liệu Vercel thuộc tính này ghi đè thiết lập dashboard. Cách đúng: ngắt Git của project `global-quanta`.
3. **Phần chạy thực tế (runtime) hiện nằm trong mức miễn phí của Hobby.** Chi phí runtime gần như toàn bộ do **QMS** (`tuan-quant-scanner`) tạo ra, không phải hai project Vite (vốn chỉ là trang tĩnh). Rủi ro khi lên Hobby nằm ở QMS: **12 cron xếp theo chuỗi giờ**, và **luồng SSE** `/api/global/stream` chạy liên tục mỗi khi có người mở tab KẾT NỐI THẾ GIỚI.
4. **Điểm phải tự quyết:** theo điều khoản của Vercel, gói Hobby chỉ dành cho **mục đích cá nhân, phi thương mại**. Nếu trang có thu phí hoặc phục vụ khách hàng thì không đủ điều kiện.

---

## 1. Dừng `global-quanta`, giữ `dinhtuan-ck`

### 1.1 Tham chiếu tới `global-quanta.vercel.app`

| [Tệp:Dòng] | Phát hiện | Rủi ro khi dừng | Đề xuất |
|---|---|---|---|
| `backend/src/server.js:90` + `backend/src/utils/corsOrigins.js:1-4` | CORS Gateway đọc từ biến `FRONTEND_ORIGIN` (Railway). Chú thích dòng 4 lấy `global-quanta` làm ví dụ. Thử preflight thật: Gateway cho phép `dinhtuan-ck`, `global-quanta`, cả hai mẫu URL xem trước, và chặn origin lạ | **Không có.** `dinhtuan-ck` đã được cho phép | Sau khi dừng hẳn, bỏ `global-quanta` khỏi `FRONTEND_ORIGIN` trên Railway (thu hẹp CORS). Không gấp |
| `backend/test/corsOrigins.test.js:6-9` | Test dùng URL `global-quanta` làm dữ liệu mẫu | Không | Giữ nguyên |
| `src/config/marketGateway.test.ts:5` | Chỉ là tên một ca test | Không | Giữ nguyên |
| QMS `components/quant/ta-command-center/TVChartPanel.tsx:267` | Dòng chữ trên giao diện QMS có liên kết tới trang cũ | Thấp: liên kết sẽ trỏ tới bản đã ngừng cập nhật | Đổi liên kết sang `dinhtuan-ck` khi tiện |
| `src/hooks/useSieuQuetScanner.ts:5` và 17 tệp khác dùng `VITE_API_BASE_URL` | Trỏ tới **QMS** (`tuan-quant-scanner-psi.vercel.app`), không phải `global-quanta` | Không liên quan | Xem Phần 2.3 |
| OAuth / webhook / canonical | Không có OAuth hay webhook trỏ về Vercel; `index.html` không có canonical/og:url. Đăng nhập chạy trên Railway (`/api/auth/*` qua Gateway) | Không | — |
| Biến môi trường Vercel | **Chưa kiểm được:** API trả 403 khi liệt kê biến môi trường. Từ code, frontend chỉ đọc `VITE_API_BASE_URL`, `VITE_MARKET_API_BASE_URL`, `VITE_MARKET_GATEWAY_ENABLED` | Thấp | Tự xem trên Settings › Environment Variables của `dinhtuan-ck` và đảm bảo có đủ biến `global-quanta` đang có |

### 1.2 Cách dừng build `global-quanta`

| Cách | Hiệu quả | Rủi ro | Đánh giá |
|---|---|---|---|
| Ô "Ignored Build Step" trên dashboard | **Không có tác dụng.** `vercel.json:3` có `ignoreCommand`, và tài liệu Vercel ghi rõ thuộc tính này ghi đè thiết lập dashboard | — | Không dùng |
| **Ngắt Git** (Settings › Git › Disconnect, hoặc `vercel git disconnect` trong project `global-quanta`) | Dừng mọi build mới; `global-quanta.vercel.app` tiếp tục phục vụ bản cuối | Bản cũ không còn được cập nhật và dần lệch với Gateway | **Đề xuất.** Không cần sửa code, đảo ngược được |
| Sửa `ignoreCommand` để bỏ qua theo project (`VERCEL_PROJECT_PRODUCTION_URL`) | Dừng build `global-quanta` mà vẫn giữ kết nối Git | Phải sửa code; một lỗi trong lệnh có thể chặn build của cả `dinhtuan-ck` | Chỉ dùng nếu muốn giữ Git |
| Pause project | Domain trả lỗi; có thể vẫn nhận build (chưa kiểm được) | Ai còn đánh dấu trang cũ sẽ thấy lỗi | Bước sau cùng |
| Xoá project | Hết hẳn | Không đảo ngược được | Chỉ khi chắc chắn |

**Trình tự an toàn:**
1. Đối chiếu biến môi trường của hai project.
2. Ngắt Git của `global-quanta`.
3. Merge một PR bất kỳ để kiểm tra: chỉ còn **một** dòng kiểm tra "Vercel – dinhtuan-ck" chạy.
4. Sau 1–2 tuần không còn truy cập vào trang cũ, pause hoặc xoá `global-quanta` và gỡ origin của nó khỏi `FRONTEND_ORIGIN`.

**Không mất dữ liệu:** hai project Vite không lưu dữ liệu trên Vercel. Dữ liệu nằm ở Railway (Gateway, volume `/data`) và ở DB của QMS.

**Tác động:** mỗi lần merge hoặc push giảm từ 2 xuống 1 lần build, tức giảm khoảng 50% phút build ngay lập tức.

---

## 2. Tương thích gói Hobby

> Giới hạn Hobby dưới đây theo hiểu biết của tôi, nhưng chưa trích được bảng chính thức trong lượt này. **Cần đối chiếu `https://vercel.com/docs/limits` và trang Usage trước khi hạ gói.** Đã xác nhận từ tài liệu: Hobby chỉ rollback được về bản production liền trước; lịch chạy trên Hobby tối thiểu cách nhau 15 phút (với Schedules mới).

### 2.1 Cấu hình (`vercel.json`, build)

| [Tệp:Dòng] | Phát hiện | Rủi ro trên Hobby | Đề xuất |
|---|---|---|---|
| `global-quanta/vercel.json:1-4` | Không có `crons`, `functions` hay `maxDuration`; chỉ có `ignoreCommand` | Thấp | Giữ nguyên. Xem 1.2 |
| QMS `vercel.json:2-50` | **12 cron.** Tất cả chạy mỗi ngày hoặc mỗi tuần, tức tần suất hợp lệ trên Hobby. Nhưng **5 job xếp chuỗi theo phút**: `dividend-universe-scan` 22:00 → `dividend-events-scan` 22:05 → `dividend-universe-score` 22:15 → `dividend-ai-analysis` 22:30 → `sector-top20-scan` 22:35 → `sieu-quet-scan` 22:45, và `refresh-macro` 23:00 → `resolve-insight-outcomes` 23:15 | **Cao.** (a) Trên Hobby, cron có thể chạy **bất kỳ lúc nào trong giờ đó**, nên thứ tự 22:00 → 22:05 → 22:15 không còn được đảm bảo; job sau có thể chạy trên dữ liệu cũ. (b) Giới hạn số cron trên Hobby trước đây là 2; nếu vẫn thấp như vậy thì 12 cron sẽ **không deploy được** | Gộp chuỗi thành **một cron điều phối** gọi tuần tự từng bước, hoặc chuyển cron sang **Railway Gateway** (đã có `scheduler.js`, chạy chính xác theo phút). Đề xuất chuyển sang Gateway, nhất quán với hướng "chuyển cron nặng của QMS sang Gateway" đã ghi ngày 30/10 |
| QMS `vercel.json:52-59` | `api/stock.py`, `api/cluster.py`: `maxDuration` 30 | Thấp | — |
| QMS `app/api/**` | `maxDuration`: 13×10 s, 2×15, 8×30, 25×60, 1×90, 2×120, 2×300. Cao nhất: `cron/earnings-seasonality-scan` và `cron/timing-signals-scan` 300 s, `catalysts/chat` 120 s | Trung bình. Cả ba project đều bật Fluid compute; trên Hobby với Fluid, trần thời gian theo tôi biết là 300 s. Nếu Fluid bị tắt, trần cũ là 60 s và 5 route trên sẽ hết giờ | Giữ Fluid bật. Đối chiếu trần thời gian trên trang Limits. Hai route 300 s nên chuyển sang Gateway |
| `global-quanta/package.json:8` | `"build": "tsc && vite build"`. Mỗi lần build tốn ~40 giây kể cả kiểm tra kiểu | Thấp. Trên Hobby, phút build không bị tính tiền; trên Pro thì 41 giây vẫn làm tròn lên 1 phút | Không cần đổi vì lý do chi phí. Nếu muốn build nhanh hơn: đặt Build Command trên Vercel là `vite build`, để `tsc` chạy trong test |
| Cả 3 project: `elasticConcurrencyEnabled: true`, máy build standard 4 vCPU | Build đồng thời theo yêu cầu là tính năng trả phí | Thấp. Trên Hobby build chạy lần lượt; merge liên tiếp sẽ phải chờ | Chấp nhận. Gộp các lần merge, đúng như quy tắc đã ghi về giới hạn deploy |

### 2.2 Runtime: tính toán nặng chạy trên Vercel

| [Tệp:Dòng] | Phát hiện | Rủi ro | Đề xuất |
|---|---|---|---|
| `global-quanta/api/scan.js:19` + `api/_lib/*` (12 tệp), `api/health.js:1` | Hai function vẫn được build và deploy (`vercel inspect`: `λ api/scan` 1,55 MB, `λ api/health`). **Frontend không còn gọi tới:** AI Chart Vision đã chuyển sang Gateway, còn badge sức khoẻ gọi `/api/health/db-budget` của Gateway. `api/scan` là endpoint POST công khai, chạy tính toán và backtest trên Vercel | Trung bình. Không tốn gì khi không ai gọi, nhưng bất kỳ ai cũng có thể gọi và đốt CPU của gói Hobby | Bỏ thư mục `api/` khỏi deploy (xoá hoặc dùng `.vercelignore`). Khi đó trang thành 100% tĩnh |
| QMS cron `dividend-*`, `sieu-quet-*`, `sector-top20-scan`, `elite10-agm-cycle-scan` (`maxDuration` 30–90) | Các job quét toàn bộ universe chạy trên Vercel | Trung bình. Hiện chi phí rất nhỏ (Fluid Active CPU $0,11, bộ nhớ $0,43), nhưng đây là phần tăng theo số mã và số job | Chuyển dần sang Gateway (xem 2.1) |
| QMS `app/api/global/stream/route.ts:3,120-138` | SSE: mỗi kết nối giữ function **55 giây**, gửi tín hiệu giữ kết nối mỗi 15 giây, rồi đóng | **Cao khi có thêm người dùng.** Xem 2.3 | Xem 2.3 |

### 2.3 Polling và cache phía frontend

| [Tệp:Dòng] | Phát hiện | Rủi ro | Đề xuất |
|---|---|---|---|
| `src/hooks/useGlobalStream.ts:122` (dùng ở `KetNoiTheGioiTab.tsx:87`) | `new EventSource(QMS/api/global/stream)`. Trình duyệt **tự nối lại** sau mỗi lần đóng, nên mỗi tab KẾT NỐI THẾ GIỚI đang mở tạo **khoảng 60 lần gọi/giờ, mỗi lần 55 giây function**, kể cả khi tab đang ẩn (`EventSource` không dừng theo `visibilityState`). Cùng hook này đã đọc Gateway `/api/world/pulse` mỗi 60 giây (dòng 92, 144) | **Cao.** Theo ước tính thô của tôi, một tab mở 8 giờ/ngày đã ngốn phần lớn bộ nhớ function miễn phí hằng tháng của Hobby. Vượt mức trên Hobby thì **function bị tạm ngưng tới hết tháng**, và toàn bộ QMS (cổ tức, bảng quét dự phòng…) ngừng theo | Ưu tiên 1: bỏ SSE, chỉ dùng Gateway pulse (vốn đã chạy); hoặc ít nhất đóng `EventSource` khi `document.visibilityState === "hidden"` |
| 18 tệp `VITE_API_BASE_URL` (QMS), ví dụ `useDividendEvents.ts` 15 phút, `useQualityScore.ts` 30 phút, `useSectorRotation.ts` 5 phút, `useHousingPrices.ts` 6 giờ | Polling qua SWR. SWR mặc định **không polling khi tab ẩn**, và không nơi nào bật `refreshWhenHidden` | Thấp | Giữ nguyên. Với `useSectorRotation` 5 phút: kiểm tra endpoint đó có đọc từ Gateway được không |
| `InfraHealthBadge.tsx:99`, `EsaPanel.tsx:66`, `useBoardQuotes.ts:57`, `usePriceTick.ts:30`… | `setInterval` không kiểm `visibilityState`, nhưng gọi **Railway Gateway** hoặc chỉ là đồng hồ giao diện | **Không ảnh hưởng Vercel** (chỉ tốn Railway) | Không thuộc phạm vi Hobby; có thể dừng khi tab ẩn để đỡ tải Railway |
| QMS `app/api/**` | 43/88 route `force-dynamic`, chỉ 11/88 có `s-maxage` (60–1800 s) | Trung bình. Mỗi lượt đọc là một lần gọi function | Thêm `Cache-Control: s-maxage=…, stale-while-revalidate=…` cho các route chỉ đọc, dữ liệu theo ngày (cổ tức, universe, sector-cycle) |

### 2.4 Tối ưu build và bundle

| [Tệp:Dòng] | Phát hiện | Rủi ro | Đề xuất |
|---|---|---|---|
| Quy trình PR | 239 bản xem trước/project/chu kỳ. Mỗi lần push vào nhánh PR là 2 lần build | Trên Pro: tốn 4 CPU-phút mỗi lần. Trên Hobby: không tính tiền nhưng xếp hàng, và có giới hạn deployment/ngày (cần kiểm; hiện ~36/ngày cho cả hai project) | (a) Ngắt `global-quanta` (−50%). (b) Tuỳ chọn: chỉ build `main`, bỏ bản xem trước, vì mọi PR đều đã có test cục bộ và ảnh chụp trước khi merge. Đổi lại sẽ mất bản xem trước trên Vercel |
| `ignoreCommand` hiện tại | 88/397 deployment đã được bỏ qua khi commit chỉ đổi `backend/`: hoạt động tốt | — | Giữ nguyên |
| `dist/assets/index-*.js` | **Một file JS 2,9 MB** (cộng worker 80 KB), không chia nhỏ | Thấp với hạn mức truyền dữ liệu; ảnh hưởng tốc độ tải lần đầu | Tách theo tab chính bằng `React.lazy`. Đây là việc cải thiện hiệu năng, không bắt buộc cho Hobby |
| `vercel inspect` | "post-build duration 11s": đóng gói 2 function không dùng | Thấp | Bỏ `api/` (xem 2.2) |

---

## 3. Rủi ro khác khi hạ gói

| Hạng mục | Rủi ro | Đề xuất |
|---|---|---|
| Điều khoản Hobby | Chỉ dùng cá nhân, phi thương mại | Bạn tự xác nhận |
| Rollback | Hobby chỉ rollback được về bản production **liền trước** (đã xác nhận trong tài liệu). Quy trình hiện tại hay ghi `dpl_…` để quay về bản cũ hơn | Rollback xa hơn thì phải `git revert` rồi build lại |
| Vượt hạn mức trên Hobby | Không bị tính phí, mà **bị tạm ngưng** tới hết chu kỳ | Xử lý SSE và cron (2.1, 2.3) **trước** khi hạ gói |
| Deployment Protection | Cả 3 project bật Vercel Authentication cho URL xem trước | Theo tôi biết vẫn có trên Hobby; cần kiểm |
| Thời điểm | Pro còn 9 ngày (tới ~30/11) | Làm Phần 1 ngay; xử lý SSE và cron trước 28/11 rồi mới hạ |

---

## 4. Đề xuất thứ tự duyệt

| # | Hạng mục | Loại | Tác động |
|---|---|---|---|
| H1 | Ngắt Git `global-quanta` (dashboard) | Cấu hình, không code | −50% build ngay |
| H2 | Bỏ SSE `useGlobalStream`, dùng Gateway pulse (hoặc dừng khi tab ẩn) | Bản vá nhỏ ở frontend | Gỡ rủi ro lớn nhất về runtime trên Hobby |
| H3 | QMS: gộp chuỗi cron hoặc chuyển sang Gateway | Backend QMS và Gateway | Gỡ rủi ro thứ tự chạy và số lượng cron |
| H4 | Bỏ `api/` khỏi deploy `dinhtuan-ck` | Bản vá nhỏ | Trang thành 100% tĩnh, bớt bề mặt bị lạm dụng |
| H5 | QMS: thêm `s-maxage` cho route chỉ đọc | Bản vá QMS | Bớt lần gọi function |
| H6 | (Tuỳ chọn) chỉ build `main`; build command `vite build`; tách bundle | Cấu hình hoặc bản vá | Bớt build, tải trang nhanh hơn |

Mỗi hạng mục chỉ làm sau khi bạn duyệt, và mỗi cái là một PR riêng.

---

## 5. Rà soát lại bằng số liệu thật, và phương án đề xuất

### 5.1 Số liệu sử dụng thực tế, 21 ngày (31/10 → 21/11), nguồn `vercel metrics`

| Chỉ số | QMS `tuan-quant-scanner` | `dinhtuan-ck` | `global-quanta` | Mức miễn phí Hobby/tháng (docs/plans/hobby) | Ước tính 30 ngày so với mức miễn phí |
|---|---|---|---|---|---|
| Số lần gọi function | 12.526 | **4** | **2** | 1.000.000 | ~18 nghìn, tức **~2%** |
| Active CPU | 0,62 giờ | ~0 | ~0 | 4 giờ | ~0,9 giờ, tức **~22%** |
| Thời gian function chạy (bộ nhớ cấp phát 2 GB) | 23,1 giờ ≈ 46 GB-giờ | ~0 | ~0 | 360 GB-giờ | ~66 GB-giờ, tức **~18%** |

**Riêng SSE `/api/global/stream`: 18,3 trên 23,1 giờ chạy (79%)**, nhưng chỉ dùng 0,16 giờ CPU. Nó giữ 2 GB bộ nhớ chỉ để đợi. Bỏ SSE thì thời gian chạy còn khoảng 4,8 giờ/21 ngày, tức khoảng 14 GB-giờ/tháng (~4% mức miễn phí).

**Kết luận:** runtime **đã nằm trong mức Hobby với dư địa lớn**. Hai project Vite gần như là trang tĩnh. Chi phí hiện tại hầu như toàn bộ là phút build của gói Pro.

### 5.2 Giới hạn Hobby chính thức (thay cho các ước đoán ở Phần 2)

| Hạng mục | Hobby | Nguồn | Hệ quả với dự án |
|---|---|---|---|
| Số cron | **100/project**, chạy tối đa **1 lần/ngày**, lệch **±59 phút** | docs/schedules/cron-jobs/usage-and-pricing | 12 cron QMS **hợp lệ** (đều chạy ngày/tuần). Chỉ còn rủi ro **thứ tự** của chuỗi job cách nhau vài phút |
| Thời gian function | 300 giây mặc định và tối đa (Fluid), 2 GB/1 vCPU | docs/functions/limitations | Route dài nhất của QMS là 300 giây: **hợp lệ** |
| Build | 100 deployment/ngày, **1 build đồng thời**, tối đa 45 phút/build, máy **2 vCPU** | docs/limits, docs/plans/hobby | Sau H1: khoảng 18 deployment/ngày. Build sẽ chậm hơn (2 thay vì 4 vCPU) và chạy lần lượt |
| Vượt hạn mức | "phải chờ tới khi đủ 30 ngày mới dùng lại được tính năng" | docs/plans/hobby | Rủi ro thật nếu runtime tăng đột biến → phải giữ dư địa |
| Repo Git | Không hỗ trợ repo thuộc **tổ chức** GitHub | docs/limits | Đã kiểm `gh api`: cả hai repo thuộc **tài khoản cá nhân** (`type: User`) → **không vướng** |
| Rollback | Chỉ về bản production liền trước | docs/cli/rollback | Quay về bản xa hơn: `git revert` rồi build lại |
| Log runtime | 1 giờ | docs/limits | Muốn điều tra sự cố QMS cũ hơn 1 giờ thì không còn log |
| Thương mại | Không tìm thấy câu chữ trong các trang docs đã đọc; nhiều khả năng nằm ở Điều khoản (vercel.com/legal/terms) | — | Bạn tự xác nhận |
| Phút build có bị đo/tính trên Hobby không | Không có trang nào nêu | — | Không xác nhận được; không ảnh hưởng chi phí vì Hobby không tính tiền |

### 5.3 Đính chính về SSE (H2)

- `useGlobalStream.ts` (`mergePulse`): khi Gateway hoạt động, mọi giá **ngày** (DXY, VIX, US10Y, vàng, dầu, Risk-On, chỉ số) đều lấy từ **Gateway**. SSE chỉ còn cấp các trường **theo tháng**: BDI, cà phê, quặng sắt, cao su, urê, cước container.
- Gọi thử SSE hôm nay: cao su và urê **cập nhật lần cuối 10/09/2026**, BDI và cà phê **trống**. Luồng chạy 24/7 chỉ để mang về vài số đã cũ hơn 2 tháng.
- **Phương án đúng:** thay `EventSource` bằng **một lần gọi JSON thường** (SWR, làm mới mỗi giờ, tự dừng khi tab ẩn). Cần thêm một route JSON nhỏ ở QMS, đọc cùng dữ liệu, có `s-maxage=3600`. Hiển thị giữ nguyên; dữ liệu tháng nên ghi kèm ngày cập nhật để người xem biết số đã cũ.
- Ghi chú riêng (không thuộc Hobby): dữ liệu cao su/urê dừng cập nhật từ 10/09 là **lỗi dữ liệu** cần xem ở job của QMS.

### 5.4 Đính chính về cron (H3)

Giới hạn 100 cron/project nên **không phải chuyển cron đi**. Chỉ cần đảm bảo **thứ tự** khi mỗi cron có thể lệch tới 59 phút. Cách tối thiểu là **đổi giờ trong QMS `vercel.json`**, để mỗi bước của chuỗi nằm ở một **giờ riêng**; các khung giờ không chồng nhau nên thứ tự luôn đúng.
- Chuỗi cổ tức (UTC): `dividend-universe-scan` 21:00 → `dividend-events-scan` 22:00 → `dividend-universe-score` 23:00 → `dividend-ai-analysis` 00:00 → `sector-top20-scan` 01:00 → `sieu-quet-scan` 02:00.
- Chuỗi vĩ mô: `refresh-macro` 23:00 → `resolve-insight-outcomes` 00:00 (cần xem chúng có phụ thuộc nhau không).
- Mỗi job tối đa 90 giây nên vừa trong một giờ. Tất cả vẫn xong trước giờ mở cửa ở Việt Nam (09:00 = 02:00 UTC); **cần kiểm** `sieu-quet-scan` lúc 02:00 UTC có kịp trước lúc người dùng cần không, nếu không thì dồn cả chuỗi sớm hơn.
- Cách này chỉ đổi giờ trong cấu hình, không sửa code. Việc chuyển cron sang Gateway trở thành tuỳ chọn về sau, không còn là điều kiện để lên Hobby.

### 5.5 Phương án đề xuất: hạ xuống Hobby, có dư địa an toàn

So sánh hai hướng:
- **Giữ Pro:** $20/tháng cố định. Sau khi ngắt `global-quanta`, phút build còn khoảng $5–6, vẫn nằm trong $20 credit, nên hoá đơn **không giảm**.
- **Hạ Hobby:** $0. Runtime đang dùng dưới 25% mức miễn phí (dưới 5% sau khi bỏ SSE).
- **Đánh đổi:** build chạy lần lượt trên máy 2 vCPU; rollback chỉ về bản liền trước; cron lệch ±59 phút; log 1 giờ; vượt hạn mức thì khoá 30 ngày.
- **Đề xuất:** hạ xuống Hobby **sau khi** xong các bước dưới đây. Cần thì nâng lại Pro bất cứ lúc nào.

| Bước | Việc | Loại | Phải xong trước khi hạ? | Kiểm tra sau khi làm |
|---|---|---|---|---|
| **B1** | Ngắt Git `global-quanta` (dashboard). Trước đó đối chiếu biến môi trường hai project | Cấu hình | Có (−50% build) | Merge một PR: chỉ còn **1** dòng kiểm tra "Vercel – dinhtuan-ck" |
| **B2** | QMS: route JSON `/api/global/monthly` (`s-maxage=3600`); frontend thay SSE bằng SWR 1 giờ | PR QMS + PR frontend | Có (giảm 79% thời gian chạy function) | Tab KẾT NỐI THẾ GIỚI hiện đủ các ô tháng; `vercel metrics` không còn `/api/global/stream` |
| **B3** | QMS `vercel.json`: tách chuỗi cron sang các giờ riêng | PR QMS (chỉ cấu hình) | Có | Ngày đầu tiên: so dữ liệu cổ tức/top20/siêu quét với ngày trước |
| **B4** | Bỏ thư mục `api/` khỏi deploy `dinhtuan-ck` (6 lần gọi/21 ngày, đều không cần) | PR nhỏ | Nên làm | `vercel inspect`: không còn dòng `λ`; trang thành 100% tĩnh |
| **B5** | Hạ gói (Settings › Billing); kiểm `elasticConcurrencyEnabled` đã tắt | Dashboard | — | Build tiếp theo chạy được; trang mở bình thường |
| **B6** | Theo dõi 7 ngày: `vercel metrics … provisioned_memory_mb / function_cpu_time_ms` của QMS | Chỉ đọc | Sau khi hạ | Dưới 50% mức miễn phí theo tốc độ tháng |
| B7 (tuỳ chọn) | `s-maxage` cho các route đọc nhiều của QMS (`earnings-cycle-stats` 2.768 lần, `decision-states` 1.101 lần…); tách bundle 2,9 MB | PR | Không | — |

**Thời hạn:** Pro hết khoảng 30/11. Nên làm B1 ngay, B2–B4 trước 27/11, rồi B5 vào 28/11.

**Không đụng tới:** Railway Gateway (không thuộc Vercel), dữ liệu (Railway volume và DB của QMS), giao diện người dùng (ngoài việc các ô theo tháng chuyển sang gọi JSON).

---

## 6. Kết quả thực hiện (21/11/2026)

| Bước | Kết quả | Bằng chứng |
|---|---|---|
| B1 | `global-quanta` đã ngắt Git (`vercel git disconnect`); trang cũ vẫn phục vụ bản cuối (200) | Hai lần merge sau đó chỉ build `dinhtuan-ck` |
| B2 + B4 | GQ #371 LIVE (main `a6ba9b8d`): bỏ SSE, Gateway pulse dừng khi ẩn tab, sửa ghi chú nguồn, xoá `api/` | `vercel inspect`: không còn function; bundle không còn `/api/global/stream` |
| B3 | QMS #50 LIVE: chuỗi cron 18→19→20→21 giờ UTC, `refresh-lowfreq` thứ Hai 03:00; Vercel nhận đủ 13 cron | API project `crons.definitions` |
| Dữ liệu | Chạy `refresh-lowfreq` một lần: giá nhà BIS 2026-Q2 cho 8/9 nước (JP 2025-Q4 là mới nhất của BIS); cao su 2,83 và urê 420 (kỳ 10/2026) trong bảng QMS | `/api/global/housing`; log cron lần 2: `unchanged: 9`, phân bón 12 dòng |
| QMS #51 | Log kết quả cron và tải file World Bank một lần (3 thay vì 5 lần tải). **Build đầu tiên trên Hobby: máy basic 2 vCPU, 1 phút 22 giây, READY** | `vercel inspect` |
| B5 | Team đã ở **Hobby** (người dùng đổi trên dashboard) | Ảnh Billing |
| Kiểm khói | 7 tab trên production, dữ liệu thật: 0 lỗi trang, 0 request thất bại, 0 lời gọi `/api` Vercel, **trước và sau khi hạ gói giống nhau** | `smoke-pro.json` / `smoke-hobby.json` |

**Đính chính:** sau lần chạy đầu, tôi báo nhầm rằng AU/FR/urê "chưa ghi được". Vòng kiểm tra của tôi dừng ngay khi thấy quý mới đầu tiên, lúc cron vẫn còn đang ghi. Thực tế lần chạy đầu đã ghi đủ (urê lúc 04:19:09).

**B6, theo dõi:** đo bằng `vercel metrics vercel.function_invocation.function_duration_ms|function_cpu_time_ms --project tuan-quant-scanner`. Theo tốc độ tháng, mức dùng phải dưới 50% hạn mức Hobby: 4 giờ CPU, 360 GB-giờ bộ nhớ. Hobby chỉ giữ log runtime 1 giờ.
