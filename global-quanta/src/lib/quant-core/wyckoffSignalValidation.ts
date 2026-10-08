// Kết quả kiểm định đặt trước W4 (2026-10-09) cho tín hiệu Wyckoff — số liệu engine v2 (mặc định).
// Thiết lập: 225 mã, khung D, 10/2024–10/2026, point-in-time mỗi nến, ngoài mẫu (OOS) từ 2026-03-07.
// Kế hoạch 3 lần: luật VN (T+1 mở cửa, T+2,5, phí 0,15% + trượt 0,1%/chiều + thuế 0,1%, bỏ trần / gap > 5%, tối đa 60 phiên),
// đối chứng cùng mã, ngày ngẫu nhiên, cùng % rủi ro. Chuyển pha: vượt trội 20 phiên so với trung bình cùng ngày.
// Chuẩn ĐẠT (VALIDATED): OOS n ≥ 30, PF ≥ 1,1, TB > 0, TB > đối chứng, cận dưới KTC 95% > 0. 14 giả thuyết được thử.

export type SignalKey = "T1" | "T2" | "T3" | "PH-buy:C" | "PH-buy:D" | "PH-buy:E" | "PH-sell:D" | "PH-sell:E";

export interface SignalValidation {
  status: "VALIDATED" | "EXPERIMENTAL";
  /** Tóm tắt ngoài mẫu, hiển thị trên thẻ. */
  summary: string;
  /** Kết quả ngoài mẫu ngược chiều kỳ vọng và có ý nghĩa thống kê. */
  adverse: boolean;
}

export const WYCKOFF_SIGNAL_VALIDATION: Record<SignalKey, SignalValidation> = {
  T1: { status: "EXPERIMENTAL", adverse: true, summary: "Ngoài mẫu 132 lệnh: thắng 6,8%, TB −4,35%/lệnh [KTC −5,47; −3,21], PF 0,14 — kém hơn vào lệnh ngẫu nhiên (−3,68%). Trong mẫu PF 1,36: phụ thuộc chế độ thị trường." },
  T2: { status: "EXPERIMENTAL", adverse: false, summary: "Ngoài mẫu mới 5 lệnh (< 30) — chưa kiểm định được. Toàn kỳ 55 lệnh PF 0,81." },
  T3: { status: "EXPERIMENTAL", adverse: false, summary: "Ngoài mẫu mới 2 lệnh (< 30) — chưa kiểm định được. Toàn kỳ 27 lệnh PF 1,55." },
  "PH-buy:C": { status: "EXPERIMENTAL", adverse: true, summary: "Ngoài mẫu 54 lần: vượt trội 20 phiên −3,01% [KTC −4,92; −0,94] — NGƯỢC kỳ vọng." },
  "PH-buy:D": { status: "EXPERIMENTAL", adverse: false, summary: "Ngoài mẫu 40 lần: −0,31% [−3,51; 2,96]; toàn kỳ −1,23% — không có lợi thế." },
  "PH-buy:E": { status: "EXPERIMENTAL", adverse: false, summary: "Ngoài mẫu 67 lần: −1,05% [−3,06; 1,45] — không có lợi thế (v3: toàn kỳ −4,98%, ngược kỳ vọng)." },
  "PH-sell:D": { status: "EXPERIMENTAL", adverse: false, summary: "Ngoài mẫu 50 lần: +0,10% [−2,55; 2,76] — không có lợi thế." },
  "PH-sell:E": { status: "EXPERIMENTAL", adverse: false, summary: "Ngoài mẫu 113 lần: −0,47% [−2,35; 1,44] — đúng chiều nhưng chưa có ý nghĩa." },
};

export const WYCKOFF_SIGNAL_NOTE =
  "Kiểm định đặt trước 14 giả thuyết (225 mã, 10/2024–10/2026): KHÔNG tín hiệu nào đạt; vị trí trên bản đồ chu kỳ cũng không phân biệt được lợi suất. " +
  "Tín hiệu chỉ để đối chiếu với tài liệu, không dùng để ra quyết định.";
