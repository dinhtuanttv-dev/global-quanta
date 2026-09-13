/**
 * Canh bao MINH BACH khi khoi phan tich (SMC/VSA/Wyckoff/Elliott/ADX/RSI/
 * MACD/Pattern Scanner/Confluence) la DU LIEU MAU, chua phai tinh toan
 * that. Day la UU TIEN SO 1 (an toan/minh bach) truoc khi noi du lieu
 * that - nguoi dung KHONG duoc nham lan cac badge "DU LIEU THAT" (mau
 * xanh, SourceBadge) o cac panel ben duoi la dang tin cay trong giai
 * doan nay.
 */
export function MockDataBanner({ isMock, fallbackReason }: { isMock: boolean; fallbackReason?: string }) {
  if (!isMock) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-[11px] text-amber-300"
    >
      <p className="font-bold">⚠️ Dữ liệu minh họa — chưa phải phân tích thật</p>
      <p className="mt-1 text-amber-300/90">
        Các chỉ số bên dưới (SMC, VSA, Wyckoff, Elliott, ADX, RSI, MACD, Pattern Scanner, Confluence Score) hiện là{" "}
        <b>dữ liệu mẫu cố định</b>, dùng để minh họa giao diện — <b>chưa được tính từ giá thật</b>. Nhãn "DỮ LIỆU THẬT"
        trên các panel này (nếu có) sẽ được sửa khi tích hợp xong. Chỉ biểu đồ giá (nến) là dữ liệu thật.
      </p>
      {fallbackReason && (
        <p className="mt-1 text-amber-400/70 text-[10px]">Lý do: {fallbackReason}</p>
      )}
    </div>
  );
}
