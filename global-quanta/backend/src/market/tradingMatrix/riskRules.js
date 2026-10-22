// Trading Matrix M3 — cờ rủi ro "cần xem xét" (spec §6.6, M3-prereg §3): KHÔNG phải lệnh mua / bán. Mỗi cờ có severity, điều kiện
// kích hoạt, dữ liệu đầu vào, điều kiện đóng cờ và nhãn bằng chứng. Nguồn chưa có -> UNAVAILABLE (không giả "không có cờ").
import { MATRIX_VALIDATION } from "./matrixValidation.js";

const f = (x, d = 1) => (x == null ? "—" : x.toFixed(d).replace(".", ","));

export function riskFlags({ day, flow, links = null, events = null }) {
  const out = [];
  const sc2 = day?.SC2;
  const imp = links?.impact && !links.impact.error ? links.impact : null;
  const sx = links?.sectors && !links.sectors.error ? links.sectors : null;
  out.push({
    id: "RF3", title: "Chỉ số vs độ rộng phân kỳ", severity: sc2?.state === "CONFIRMED" ? "CAUTION" : "INFO",
    status: sc2?.state === "CONFIRMED" ? "ON" : "OFF",
    trigger: "VN-Index tăng > 0,5%/5 phiên trong khi trung vị cổ phiếu ≤ 0 và độ rộng giảm",
    close: "VN-Index 5 phiên ≤ 0, hoặc cổ phiếu hồi lại (trung vị > 0 và độ rộng không giảm)",
    evidence: sc2?.state === "CONFIRMED" ? sc2.evidence : [],
    // Liên kết: các trụ đang giữ / kéo chỉ số (Index Impact) và ngành tụt hậu.
    related: imp || sx ? { tickers: imp?.up?.map((x) => x.symbol) ?? [], sectors: sx?.laggards?.map((x) => x.industry) ?? [] } : null,
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
  // RF1: sự kiện đã xác nhận (Project A) + ngành đã tăng/giảm mạnh 5 phiên (|trung vị| ≥ 3%) + độ rộng ngành co ≥ 10 điểm.
  if (events === null) out.push({ id: "RF1", title: "Tin tức + giá giãn xa", severity: "INFO", status: "UNAVAILABLE", detail: "Lần quét gần nhất không đọc được nguồn sự kiện đã xác nhận (Project A).", label: "CHƯA CÓ NGUỒN" });
  else {
    const hits = [];
    for (const e of events) for (const ind of e.industries) {
      const m = sx?.medianReturn5?.[ind];
      if (!m || m.m5 === null || m.breadth5 === null) continue;
      if (Math.abs(m.m5) >= 3 && Math.sign(m.m5) === (e.direction === "positive" ? 1 : -1) && m.breadth5 - m.breadth >= 10) hits.push({ ind, m });
    }
    out.push({ id: "RF1", title: "Tin tức + giá giãn xa", severity: hits.length ? "CAUTION" : "INFO", status: sx ? (hits.length ? "ON" : "OFF") : "UNAVAILABLE",
      detail: !sx ? "Chưa có số liệu ngành." : hits.length ? hits.map(({ ind, m }) => `${ind}: trung vị 5 phiên ${f(m.m5)}%, độ rộng ${f(m.breadth5)} → ${f(m.breadth)}%`).join(" · ") : `${events.length} sự kiện đã xác nhận đang hiệu lực — chưa ngành nào giãn giá kèm độ rộng co.`,
      trigger: "Sự kiện đã xác nhận + trung vị ngành 5 phiên cùng chiều sự kiện ≥ 3% + độ rộng ngành giảm ≥ 10 điểm",
      close: "Độ rộng ngành hồi lại hoặc sự kiện hết hiệu lực", related: hits.length ? { tickers: [], sectors: hits.map((h) => h.ind) } : null,
      validation: "Không có lịch sử sự kiện để kiểm định — chỉ ghi sổ thực tế.", label: "THỰC NGHIỆM" });
  }
  out.push({ id: "RF5", title: "Kế hoạch giao dịch đầy đủ", severity: "INFO", status: "CHECKLIST",
    detail: "Trước khi vào lệnh: ghi mức giá vô hiệu luận điểm và mức lỗ tối đa chấp nhận (do bạn chọn) — hệ thống không tự tạo mức giá.", label: "QUY TRÌNH" });
  return out;
}
