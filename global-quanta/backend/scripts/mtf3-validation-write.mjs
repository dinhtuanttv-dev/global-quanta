// MTF v3 · S7 — sinh src/market/structure/validation3.js từ báo cáo của scripts/mtf3-validate.mjs (không sửa tay số liệu).
//   node scripts/mtf3-validation-write.mjs src/market/structure/MTF-v3-report.json
import fs from "node:fs";

const r = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const pick = (s) => (s ? { n: s.n, nF: s.nF, nA: s.nA, mean: s.mean, ci: s.ci, p: s.p } : null);
const H = Object.fromEntries(Object.entries(r.stats).map(([k, v]) => [k, { verdict: r.verdicts[k], q: v.q, IS: pick(v.IS), OOS: pick(v.OOS), placebo: r.placebo?.[k] ?? null, halves: r.halves?.[k] ?? null }]));
const tbl = (t) => Object.fromEntries(Object.entries(t).map(([g, v]) => [g, { IS: pick(v.IS), OOS: pick(v.OOS) }]));
const f = (x) => (x == null ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2).replace(".", ",")}%`);
const pass = Object.values(r.verdicts).filter((v) => v === "PASS").length;
const summary = `Kiểm định đặt trước MTF v3 (chạy một lần ${r.generatedAt.slice(0, 10)}, VNDirect 2013 → 2026, ${r.universe.symbols} mã kể cả ${r.universe.delisted} mã đã huỷ niêm yết; ngoài mẫu ≥ 2021, phí 0,6%): ${pass ? `${pass}/6 giả thuyết ĐẠT` : "KHÔNG giả thuyết nào trong H1–H6 đạt"}. `
  + `Vào giai đoạn 2 ${f(H.H1.OOS.mean)}/40 phiên ngoài mẫu (dương cả trong mẫu nhưng chưa đủ ý nghĩa); phá vỡ nền giai đoạn 2 ${f(H.H3.OOS.mean)} (âm có ý nghĩa); `
  + `chân dưới đổi theo chân trên ${f(H.H2.OOS.mean)}; nén → mở rộng ${f(H.H4.OOS.mean)}; Elliott × EMA ${f(H.H6.OOS.mean)}; cổng cấm vào: nhóm bị cấm còn TỐT hơn ${f(H.H5.OOS.mean)} — ở cổ phiếu VN đà tăng thường tiếp diễn. Cấu trúc, thiết lập và kế hoạch chỉ để MÔ TẢ.`;
const doc = { prereg: r.prereg, status: "DONE", ranAt: r.generatedAt.slice(0, 10), engine: r.engine, data: r.data, universe: r.universe, verdicts: r.verdicts, verdictValidated: pass > 0, summary, H, stageTable: tbl(r.stageTable), weekDowTable: tbl(r.weekDowTable) };
fs.writeFileSync("src/market/structure/validation3.js", `// MTF v3 — kết quả kiểm định ĐẶT TRƯỚC (MTF-v3-prereg.md), chạy bằng scripts/mtf3-validate.mjs. Tệp sinh tự động bằng\n// scripts/mtf3-validation-write.mjs; không sửa tay số liệu. Giao diện chỉ gắn "ĐÃ KIỂM ĐỊNH" cho thành phần PASS.\nexport const STRUCTURE_VALIDATION_V3 = Object.freeze(${JSON.stringify(doc)});\n`);
console.log(summary);
