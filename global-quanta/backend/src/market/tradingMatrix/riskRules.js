// Trading Matrix M3 — cờ rủi ro "cần xem xét" (spec §6.6, M3-prereg §3): KHÔNG phải lệnh mua / bán. Mỗi cờ có severity, điều kiện
// kích hoạt, dữ liệu đầu vào, điều kiện đóng cờ và nhãn bằng chứng. Nguồn chưa có -> UNAVAILABLE (không giả "không có cờ").
import { MATRIX_VALIDATION } from "./matrixValidation.js";

const f = (x, d = 1) => (x == null ? "—" : x.toFixed(d).replace(".", ","));

export function riskFlags({ day, flow }) {
  const out = [];
  const sc2 = day?.SC2;
  out.push({
    id: "RF3", title: "Chỉ số vs độ rộng phân kỳ", severity: sc2?.state === "CONFIRMED" ? "CAUTION" : "INFO",
    status: sc2?.state === "CONFIRMED" ? "ON" : "OFF",
    trigger: "VN-Index tăng > 0,5%/5 phiên trong khi trung vị cổ phiếu ≤ 0 và độ rộng giảm",
    close: "VN-Index 5 phiên ≤ 0, hoặc cổ phiếu hồi lại (trung vị > 0 và độ rộng không giảm)",
    evidence: sc2?.state === "CONFIRMED" ? sc2.evidence : [],
    validation: MATRIX_VALIDATION.summary.SC2, label: "THỰC NGHIỆM",
  });
  const fo = flow?.foreign, ife = flow?.ife;
  let rf4 = { status: "UNAVAILABLE", detail: "Cần cả khối ngoại và dấu chân lệnh lớn" };
  if (fo && ife) {
    const a = Math.abs(fo.net5) >= 1e9 ? Math.sign(fo.net5) : 0, b = Math.abs(ife.zLd5) >= 0.5 ? Math.sign(ife.zLd5) : 0;
    const on = a !== 0 && b !== 0 && a !== b;
    rf4 = { status: on ? "ON" : "OFF", detail: on ? `Khối ngoại 5 phiên ${fo.net5 > 0 ? "mua" : "bán"} ròng nhưng dấu chân lệnh lớn z5 ${f(ife.zLd5, 2)} ngược chiều` : "Các nguồn dòng tiền không ngược chiều" };
  }
  out.push({ id: "RF4", title: "Dòng tiền phân kỳ", severity: rf4.status === "ON" ? "CAUTION" : "INFO", ...rf4,
    trigger: "Khối ngoại 5 phiên (|ròng| ≥ 1 tỷ) và dấu chân lệnh lớn (|z5| ≥ 0,5) ngược dấu", close: "Hai nguồn cùng chiều hoặc về trung tính",
    validation: "Không có lịch sử khối ngoại theo mã để kiểm định — chỉ ghi sổ thực tế.", label: "THỰC NGHIỆM" });
  out.push({ id: "RF2", title: "Bất thường ATO / ATC", severity: "INFO", status: "UNAVAILABLE", detail: "Chưa có khối lượng theo pha phiên của toàn thị trường.", label: "CHƯA CÓ NGUỒN" });
  out.push({ id: "RF1", title: "Tin tức + giá giãn xa", severity: "INFO", status: "UNAVAILABLE", detail: "Nguồn sự kiện đã xác nhận (Project A) đang lỗi.", label: "CHƯA CÓ NGUỒN" });
  out.push({ id: "RF5", title: "Kế hoạch giao dịch đầy đủ", severity: "INFO", status: "CHECKLIST",
    detail: "Trước khi vào lệnh: ghi mức giá vô hiệu luận điểm và mức lỗ tối đa chấp nhận (do bạn chọn) — hệ thống không tự tạo mức giá.", label: "QUY TRÌNH" });
  return out;
}
