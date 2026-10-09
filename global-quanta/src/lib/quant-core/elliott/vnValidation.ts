// Kết quả kiểm định đặt trước E4 (2026-10-09) cho engine Elliott GET trên dữ liệu VN — engine sau E1, tham số mặc định.
// Thiết lập: 225 mã (≥ 340 nến, GTGD TB20 ≥ 5 tỷ), khung D, 10/2023–10/2026, point-in-time; ngoài mẫu (OOS) từ 2026-03-07.
// Lợi suất vượt trội: mở cửa T+1 → đóng cửa T+20, phí 0,6%, trừ trung bình cùng ngày. KTC 95% bootstrap theo cụm ngày.
// Chuẩn ĐẠT (lợi suất): OOS n ≥ 30, TB > 0, cận dưới KTC > 0. Mục tiêu sóng 5: OOS n ≥ 100, lift ≥ 1,10, cận dưới KTC (chạm − nền) > 0.
import type { ElliottScenario } from "./elliottGet.js";

type StatTable = { max: number; p: number }[];

/**
 * Bảng tỷ lệ sóng 2/3/4 theo dữ liệu VN (bậc trung, zigzag 3%; 1.553 xung lực hợp lệ, hoàn chỉnh, không chồng nhau),
 * pha trộn với bảng sách (blendTables, k = 50), cùng khoảng (bucket) với STAT_TABLES. Đạt tiêu chí B: n ≥ 200,
 * ổn định giữa hai nửa tập mã (TVD ≤ 0,06), khác sách (TVD sóng 2 = 0,57, sóng 3 = 0,39). Có selection bias: chỉ
 * gồm cấu trúc thoả quy tắc — dùng để XẾP HẠNG kịch bản, không phải xác suất xảy ra.
 */
export const ELLIOTT_VN_TABLES: Record<"w2" | "w3" | "w4", StatTable> = {
  w2: [{ max: 0.38, p: 0.115 }, { max: 0.5, p: 0.142 }, { max: 0.6, p: 0.182 }, { max: 0.62, p: 0.031 }, { max: Infinity, p: 0.53 }],
  w3: [{ max: 1, p: 0.116 }, { max: 1.6, p: 0.338 }, { max: 1.75, p: 0.086 }, { max: 2.62, p: 0.289 }, { max: Infinity, p: 0.171 }],
  w4: [{ max: 0.24, p: 0.089 }, { max: 0.3, p: 0.13 }, { max: 0.5, p: 0.606 }, { max: 0.62, p: 0.135 }, { max: Infinity, p: 0.04 }],
};

export type ElliottCheckKey = "wave4Osc" | "wave3Strongest" | "wave3Band" | "wave5Divergence";

/** Tỷ lệ xung lực VN hoàn chỉnh thoả từng điều kiện dao động của sách, theo bậc zigzag (tiêu chí F). */
export const ELLIOTT_VN_OSC_RATES: Record<ElliottCheckKey, { book: string; byPct: Record<"0.03" | "0.06", number> }> = {
  wave4Osc: { book: "≈ 94% (T-15/T-16)", byPct: { "0.03": 0.006, "0.06": 0.038 } },
  wave3Strongest: { book: "luôn (T-13)", byPct: { "0.03": 0.864, "0.06": 0.915 } },
  wave3Band: { book: "thường (T-20)", byPct: { "0.03": 0.397, "0.06": 0.604 } },
  wave5Divergence: { book: "thường (T-19)", byPct: { "0.03": 0.079, "0.06": 0.261 } },
};

/** Nhãn ngắn cho một điều kiện dao động: tỷ lệ VN thật ở bậc gần nhất của kịch bản. */
export function oscCheckVnNote(key: ElliottCheckKey, sc?: Pick<ElliottScenario, "degree"> | null): string {
  const r = ELLIOTT_VN_OSC_RATES[key], pct = sc?.degree === "minor" || sc?.degree === "intermediate" || !sc?.degree ? "0.03" : "0.06";
  return `Trên VN ${Math.round(r.byPct[pct] * 1000) / 10}% xung lực thoả (sách: ${r.book})`.replace(".", ",");
}

export interface ElliottValidationRow { status: "VALIDATED" | "EXPERIMENTAL" | "PASS" | "FAIL"; summary: string }

export const ELLIOTT_VN_VALIDATION: Record<"A" | "B" | "C" | "C2" | "D" | "E" | "F" | "G1" | "G2", ElliottValidationRow> = {
  A: { status: "PASS", summary: "Không vẽ lại: 7.092 lần so pivot đã xác nhận tại t với toàn chuỗi — 0 lệch; 13.336 xung lực hoàn chỉnh giữ nguyên 100%." },
  B: { status: "PASS", summary: "Bảng tỷ lệ VN khác sách và ổn định: sóng 2 hồi > 62% chiếm 53% (sách: 15%; vùng 50–60% chỉ 16,5% so với 73%). Sóng 4 gần sách (61% trong 30–50%)." },
  C: { status: "EXPERIMENTAL", summary: "Mục tiêu sóng 5: ngoài mẫu 126 lần, chạm 55,6% so với mức ngẫu nhiên cùng khoảng cách 54,3% (lift 1,02) — không có lợi thế." },
  C2: { status: "FAIL", summary: "Cửa sổ sóng 5 = 62–100% của 0→3 (T-43): trên VN chỉ 23,6% xung lực kết thúc trong cửa sổ; trung vị sóng 5 = 52% của 0→3." },
  D: { status: "EXPERIMENTAL", summary: "Mức vô hiệu (cực trị sóng 4) bị thủng trước mục tiêu ở 43,7% lần ngoài mẫu (toàn kỳ 38,7%)." },
  E: { status: "EXPERIMENTAL", summary: "Tuần ∩ ngày cùng sóng 3/5 tăng: ngoài mẫu 100 lần, vượt trội 20 phiên −0,15% [KTC −2,16; 1,98]; chỉ D −0,08%, chỉ W −0,86% — không có lợi thế." },
  F: { status: "FAIL", summary: "Điều kiện dao động của sách hiếm khi đúng ở bậc ngày nhỏ: sóng 4 kéo dao động về ≥ 90% chỉ 0,6% (3%) / 3,8% (6%), đúng dần ở bậc 12–20% (26–48%). Nguyên nhân: dao động 5/35 trễ ~17 phiên, dài hơn sóng." },
  G1: { status: "EXPERIMENTAL", summary: "Mua khi dao động về 0 sau sóng 3: chỉ 4 sự kiện trong 3 năm — chưa kiểm định được." },
  G2: { status: "EXPERIMENTAL", summary: "Bán khi xung lực tăng hoàn chỉnh có phân kỳ sóng 5: 29 sự kiện (ngoài mẫu 1), TB ≈ 0% — chưa kiểm định được." },
};

export const ELLIOTT_VN_NOTE =
  "Kiểm định đặt trước (225 mã, 10/2023–10/2026): không tín hiệu Elliott nào có lợi thế lợi suất ngoài mẫu. " +
  "Trọng số kịch bản dùng bảng tỷ lệ sóng của VN thay cho bảng sách, nhưng vẫn chỉ là so sánh tương đối — chỉ để đối chiếu với tài liệu, không dùng để ra quyết định.";
