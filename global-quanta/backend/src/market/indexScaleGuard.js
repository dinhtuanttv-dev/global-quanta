// V0 (19/11/2026) — Chặn lỗi THANG ĐO của nến chỉ số.
// Đã đo: SSI FC v2 trả VNINDEX/VN30 theo thang ×100 từ 16/07/2019 đến 09/01/2020 (VN100 cả năm 2019): 972,53 -> 98.211 -> ... -> 968,54.
// Nguyên tắc: không sửa im lặng. Phiên nào bị đưa về thang đúng (÷100) đều ghi vào `repaired` để trả trong provenance.
// Chỉ áp cho mã chỉ số (điểm chỉ số không có cổ tức/tách cổ phiếu, nên một bước nhảy ×100 giữa hai phiên không bao giờ là thật).
//
// Cách dò: tìm BƯỚC NHẢY giữa hai phiên liền nhau có tỷ lệ ≈ ×100 (lên) hoặc ≈ ÷100 (xuống). Đoạn nằm giữa bước lên và bước xuống
// là đoạn lỗi; nếu cửa sổ yêu cầu bắt đầu/kết thúc giữa đoạn lỗi thì chỉ thấy một bước — đoạn lỗi là phía có giá trị cao.
// Không phụ thuộc độ dài cửa sổ (khác với so trung vị). Giới hạn: cửa sổ nằm GỌN trong đoạn lỗi thì không có bước nào để dò.

const SCALE = 100;
/** Tỷ lệ giữa hai phiên liền nhau được coi là bước nhảy ×100 (biên rộng cho biến động trong phiên quanh đợt lỗi). */
const LO = 40, HI = 250;

const scaleBar = (b) => ({
  ...b,
  open: Number.isFinite(b.open) ? Math.round((b.open / SCALE) * 100) / 100 : b.open,
  high: Number.isFinite(b.high) ? Math.round((b.high / SCALE) * 100) / 100 : b.high,
  low: Number.isFinite(b.low) ? Math.round((b.low / SCALE) * 100) / 100 : b.low,
  close: Math.round((b.close / SCALE) * 100) / 100,
});

/**
 * @param {{date:string, open?:number, high?:number, low?:number, close:number}[]} bars tăng dần theo ngày
 * @returns {{ bars: typeof bars, repaired: null | { kind: "scale-x100", sessions: number, from: string, to: string } }}
 */
export function repairIndexScale(bars) {
  if (!Array.isArray(bars) || bars.length < 2) return { bars, repaired: null };
  const bad = new Array(bars.length).fill(false);
  let inside = null; // chỉ số phiên bắt đầu đoạn lỗi đang mở
  let sawStep = false;
  for (let i = 1; i < bars.length; i++) {
    const a = bars[i - 1].close, b = bars[i].close;
    if (!(a > 0 && b > 0)) continue;
    const r = b / a;
    if (r >= LO && r <= HI) { inside = i; sawStep = true; }
    else if (r <= 1 / LO && r >= 1 / HI) {
      sawStep = true;
      const from = inside ?? 0; // không thấy bước lên: cửa sổ bắt đầu giữa đoạn lỗi
      for (let k = from; k < i; k++) bad[k] = true;
      inside = null;
    }
  }
  if (inside != null) for (let k = inside; k < bars.length; k++) bad[k] = true; // cửa sổ kết thúc giữa đoạn lỗi
  const n = bad.filter(Boolean).length;
  if (!sawStep || !n || n === bars.length) return { bars, repaired: null };
  const idx = bad.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  return { bars: bars.map((b, i) => (bad[i] ? scaleBar(b) : b)), repaired: { kind: "scale-x100", sessions: n, from: bars[idx[0]].date, to: bars[idx.at(-1)].date } };
}
