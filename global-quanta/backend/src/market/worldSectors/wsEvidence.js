// Kết quả kiểm định đặt trước WS (WS-results.md, 2026-10-17) — áp dụng đúng hệ quả đã đăng ký. Cập nhật khi chạy lại ws-validate.
export const WS_EVIDENCE = {
  version: "WS-v1 (đăng ký 2026-10-17, commit a8c6666)",
  sample: "2023-01-03 → 2026-10-16, 942 phiên",
  shortList: { pass: true, ic: 0.0203, t: 2.53, p: 0.0057, labelVi: "BẰNG CHỨNG (xếp hạng ngắn hạn, IC nhỏ ≈ 0,02)" },
  mediumList: { pass: false, ic: -0.007, t: -0.21, p: 0.583, labelVi: "THĂM DÒ (kiểm định trung hạn không đạt)" },
  sectors: { "0500": { pass: true, ic: 0.182, q: 0.016, labelVi: "BẰNG CHỨNG (ngắn hạn, tương đối)" } },
};

/** Nhãn bằng chứng cho điểm ngắn hạn của một ngành. */
export function sectorEvidence(icb) {
  const s = WS_EVIDENCE.sectors[icb];
  return s?.pass ? { label: "EVIDENCE", ...s } : { label: "EXPERIMENTAL", labelVi: "THĂM DÒ (ngành chưa đạt kiểm định riêng)" };
}
