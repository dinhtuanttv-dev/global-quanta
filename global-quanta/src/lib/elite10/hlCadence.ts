// E4-HL v1.1 (21/11/2026): câu chữ nhịp vào lệnh theo phiên bản tài liệu — tài liệu E4-HL v1 (cũ) giữ nguyên câu "đầu tuần".
// v1.1: 2 phiên cân bằng mỗi tuần (phiên đầu của thứ Hai–thứ Tư và của thứ Năm–thứ Sáu) + mua bù ngay khi có lệnh bán (U0, U2).
export interface HlCadenceVi { v11: boolean; session: string; next: string; rule: string; short: string }
const isV11 = (x: { upgrade?: unknown; version?: string } | string | null | undefined) =>
  typeof x === "string" ? /v1\.1/.test(x) : Boolean(x && (x.upgrade || /v1\.1/.test(x.version ?? "")));

export function hlCadenceVi(x: { upgrade?: unknown; version?: string } | string | null | undefined): HlCadenceVi {
  return isV11(x)
    ? { v11: true, session: "phiên vào lệnh (thứ Hai / thứ Năm hoặc mua bù)", next: "phiên cân bằng kế tiếp (thứ Hai hoặc thứ Năm)",
      rule: "ở 2 phiên cân bằng mỗi tuần (thứ Hai, thứ Năm) và mua bù ngay khi có lệnh bán", short: "vào thứ Hai / thứ Năm (mua bù khi có lệnh bán)" }
    : { v11: false, session: "phiên vào lệnh (đầu tuần)", next: "phiên đầu tuần kế tiếp", rule: "chỉ ở phiên đầu mỗi tuần", short: "vào phiên đầu tuần" };
}
const DOW_VI = ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"];
/** Nhãn phiên vào lệnh trong lịch sử (bản ghi không mang phiên bản): tên thứ của phiên. */
export function rebalanceDayVi(date: string): string {
  return DOW_VI[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "—";
}
