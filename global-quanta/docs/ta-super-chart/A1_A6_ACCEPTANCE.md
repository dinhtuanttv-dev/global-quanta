# TA VN-Index — A1 → A6: ma trận nghiệm thu và bằng chứng

Đối chiếu với tài liệu "04 — Ma trận nghiệm thu và kế hoạch kiểm chứng" (25/10/2026). Mỗi mục ghi trạng thái và bằng chứng có thể chạy lại.

## 1. Dữ liệu và provenance
| ID | Trạng thái | Bằng chứng |
|---|---|---|
| D-01 | Đạt | Chip dữ liệu: nguồn · ngày dữ liệu · trạng thái · độ phủ (`data-freshness`, `data-freshness-detail`); `useTaSeries` giữ `provenance` + `quality` |
| D-02 | Đạt | `dataStatus.ts`: "Đang giao dịch" chỉ khi `partialToday` và lấy ≤ 15 phút; thiếu / sai thời điểm -> "không rõ" (test `dataStatus.test.ts`) |
| D-03 | Đạt | Thời điểm = `asOf` của Gateway; không có `fetchedAt` thì không coi là mới (test "receivedAt không làm trẻ") |
| D-04 | Đạt | Sự kiện quyền bị bỏ qua / độ phủ danh nghĩa < 100% hiện cảnh báo (`events-skipped`) |
| D-05 | Đạt | Như D-04 + nguồn sự kiện quyền |
| D-06 | Đạt | Chỉ số: "Điểm chỉ số", khối ngoại ghi rõ không áp dụng (R1) |
| D-07 | Đạt | Null / 0 / rỗng / lỗi tách bạch (R1); lỗi tải phân loại + Thử lại (`useTaSeries.test.tsx`); nến phút thô (DGC 15 phút phẳng) bị phát hiện, khung mịn hơn bị khoá |
| D-08 | Đạt | Nến cuối đang hình thành (phiên / tuần / tháng) vẽ rỗng + chip "tạm tính" (`lastBarForming`) |
| D-09 | Đạt | Đổi mã bằng mọi đường xoá vùng khoanh / chế độ chọn neo; phân tích lỗi xoá kết quả cũ (A1) |
| D-10 | Đạt | `PanelBoundary` từng panel + chart + bộ lọc (`a1Resilience.test.tsx`) |

## 2. Chỉ báo / engine
| ID | Trạng thái | Bằng chứng |
|---|---|---|
| Q-01, Q-03 | Đạt | Oracle Python độc lập `backend/scripts/indicator-oracle.py` -> `indicatorOracle.json`; 5 kịch bản tăng / giảm / phẳng / xen kẽ / khởi động, sai số ≤ 1e-9 (`indicatorOracle.test.ts`) |
| Q-02 | Đạt | ADX thiếu dữ liệu: "chưa đủ, cần ≥ 28 nến" (R1) |
| Q-04 | Đạt | Phát lại từng tiền tố trên FPT + VNINDEX: pivot, BOS/CHoCH, OB, FVG, thanh khoản, VSA, CVD divergence không đổi khi thêm nến (`prefixReplay.test.ts`). Wyckoff: phân loại hồi tố, đã gắn INFERRED / lịch sử |
| Q-05 | Đạt | Worker lỗi -> báo lỗi; Worker chết -> chạy lại yêu cầu đang chờ trên luồng chính |
| Q-06 | Đạt | Huỷ yêu cầu cũ khi dữ liệu / khung đổi (sẵn có) |
| Q-07 | Đạt | Nhãn HARD / DERIVED / INFERRED + nguồn trên từng panel (R3) |

## 3. Backtest và bộ lọc
| ID | Trạng thái | Bằng chứng |
|---|---|---|
| R-01, R-03, R-05, R-06 | Đạt | `CHART-SIGNALS-prereg.md` (R6): thời điểm tín hiệu = nến xác nhận, phí, chuẩn so sánh, tách thời gian cố định, 9 giả thuyết + BH-FDR |
| R-02 | Đạt | Backtest dock: tín hiệu chưa đủ kỳ hạn bị loại và hiển thị số lượng |
| R-04 | Đạt | Backtest dock: mẫu không chồng cửa sổ (đếm số bị bỏ); R6: chống lặp 20 phiên + bootstrap cụm ngày |
| R-07 | Đạt | Lỗi ≠ rỗng (sẵn có); nhãn tuổi bản quét "CŨ n phiên" cho 5 bộ lọc (`ScanAge`) |
| R-08, R-09 | Đạt | Số mã quét / kết quả; điểm luôn ghi "không phải xác suất" |

## 4. Chart, hình vẽ, trạng thái người dùng
| ID | Trạng thái | Bằng chứng |
|---|---|---|
| C-01, C-02 | Đạt | Cập nhật từng nến; làm mới giữ khung nhìn; sửa nguyên nhân gốc (rightOffset kéo về mép phải). Kiểm trên trình duyệt: khung 1m, xem quá khứ, làm mới có nến mới -> khung nhìn giữ nguyên |
| C-03 | Đạt | Đổi mã / khung: huỷ nét dở, bỏ vùng khoanh, bỏ chế độ chọn neo |
| C-04, C-05, C-08, C-10 | Đạt | SC3 (chọn / ẩn / xoá / hoàn tác 50 bước, xoá tất cả có xác nhận) |
| C-06 | Đạt | Khoá trên máy theo tài khoản; chuyển dữ liệu cũ một lần (`userScope.test.ts`) |
| C-07 | Đạt | Phiên bản máy chủ + 409 + gộp theo id (`userRevision.test.js`, `chartP3.test.ts`) |
| C-09 | Đạt | 0 nút dưới 24 px (desktop) / 44 px (cảm ứng); mọi nút có tên |

## 5. Responsive và accessibility
E2E bảo toàn có 8 khung nhìn: 1920, 1440, 1280, 1024, 390×844, 360×800, mobile ngang 844×390, zoom 200% (720×450). Vùng `sr-status` (aria-live) đọc bối cảnh chart, trạng thái dữ liệu, công cụ đang chọn, bảng đang mở.

## 6. Hiệu năng — SLO (anh duyệt 25/10/2026)
| Chỉ số | SLO |
|---|---|
| Kéo/zoom p95 desktop (khung D 4 lớp; khung 1m ~4.500 nến) | ≤ 16,7 ms (+1 ms sai số đo) |
| Kéo/zoom p95 mobile 390 px, CPU chậm 4× | ≤ 33,4 ms |
| Đổi mã (trung vị) | ≤ 2 s |
| Bộ nhớ tăng sau 20 lần đổi mã | ≤ 40 MB |

Chạy lại: `node backend/e2e/ta-perf.ts --base <site> --pw-file <file> [--local-auth http://localhost:8787]` (thoát 1 nếu vượt SLO).
