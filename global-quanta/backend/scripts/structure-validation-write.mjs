// MTF v2 — sinh backend/src/market/structure/validation.js từ báo cáo của scripts/structure-validate-v2.mjs (không sửa tay số liệu).
//   node scripts/structure-validation-write.mjs <report.json> [ranAt YYYY-MM-DD]
import fs from "node:fs";
import { STRUCTURE_VALIDATION as OLD } from "../src/market/structure/validation.js";

const [file, ranAt = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!file) { console.error("Cách dùng: node scripts/structure-validation-write.mjs <report.json> [ranAt]"); process.exit(1); }
const r = JSON.parse(fs.readFileSync(file, "utf8"));
const vi = (x, d = 2) => (x == null ? "—" : `${x < 0 ? "−" : x > 0 ? "+" : ""}${Math.abs(x).toFixed(d).replace(".", ",")}`);
const ci = (s) => (s?.ci ? `[${s.ci.map((v) => vi(v)).join("; ")}]` : "");
const st = (s) => (s && s.n ? { n: s.n, mean: s.mean, ci: s.ci ?? null, p: s.p ?? null, hit: s.hit ?? null } : { n: 0 });
const pair = (x) => ({ IS: st(x.IS), OOS: st(x.OOS) });
const V = r.verdicts.final;
const validated = ["V1", "V2", "V3"].some((k) => V[k] === "PASS");
const d = r.descriptive;
const pass = Object.entries(V).filter(([, v]) => v === "PASS").map(([k]) => k);

const summary = [
  `Kiểm định đặt trước MTF v2 (engine bám đúng tài liệu gốc — trùng bản Python 100% trên dữ liệu mẫu; ngoài mẫu ${r.prereg.oosFrom.slice(0, 7)} → ${r.universe.to.slice(0, 7)}, VN100 + VN30 khung 1 giờ, dữ liệu SSI):`,
  pass.length ? `ĐẠT: ${pass.join(", ")}.` : "KHÔNG giả thuyết nào trong V1–V5 đạt.",
  `Điểm vào L khung 1 giờ ${vi(r.V1.OOS.mean)}%/10 phiên sau phí ${ci(r.V1.OOS)}; có cổng R:R ≥ 1: ${vi(r.V2.OOS.mean)}% ${ci(r.V2.OOS)};`,
  `L khung ngày ${vi(r.V3.OOS.mean)}%/20 phiên ${ci(r.V3.OOS)}; vào giai đoạn B tái tích lũy ${vi(r.V4.OOS.mean)}% ${ci(r.V4.OOS)}; S khung ngày ${vi(r.V5.OOS.mean)}% ${ci(r.V5.OOS)}.`,
  `Ngược với tài liệu, cả trong và ngoài mẫu giai đoạn B có lợi suất vượt trội ÂM (${vi(d.stageTable.B.OOS.mean)}%/20 phiên ngoài mẫu) còn cờ Quá đà DƯƠNG (${vi(d.ext.on.OOS.mean)}%) — ở cổ phiếu VN, đà tăng thường tiếp diễn hơn là "mua khi về MA".`,
  `Cấu trúc, kết luận và kịch bản chỉ để MÔ TẢ.${r.hmm.verdict === "PASS" ? " Xác suất chuyển giai đoạn (HMM) đạt hiệu chỉnh — lợi thế nhỏ." : ""}`,
].join(" ");

const out = {
  prereg: `${r.prereg.version}`, status: "DONE", ranAt, engine: r.engine,
  period: { from: r.universe.from, to: r.universe.to, isTo: r.prereg.isTo, oosFrom: r.prereg.oosFrom, h1IsFrom: r.prereg.h1IsFrom, symbolsDaily: r.universe.daily, symbolsH1: r.universe.h1 },
  verdicts: V, pValues: r.verdicts.pValues, qValues: r.verdicts.qValues,
  /** MTF-v2-prereg: chỉ dùng chữ MUA / BÁN khi V1–V3 có ít nhất một ĐẠT. */
  verdictValidated: validated,
  summary,
  stats: {
    V1: { ...pair(r.V1), placebo: r.V1.placebo }, V2: { ...pair(r.V2), placebo: r.V2.placebo }, V3: { ...pair(r.V3), placebo: r.V3.placebo },
    V4: { ...pair(r.V4), placebo: r.V4.placebo }, V5: { ...pair(r.V5), placebo: r.V5.placebo },
  },
  /** Lợi suất vượt trội 20 phiên kế tiếp theo giai đoạn khung ngày (không trừ phí), KTC bootstrap cụm ngày — mô tả. */
  stageTable: Object.fromEntries(Object.entries(d.stageTable).map(([k, v]) => [k, pair(v)])),
  ext: { on: pair(d.ext.on), off: pair(d.ext.off), note: d.ext.note },
  patternContext: { reaccum: pair(d.patternContext.reaccum), reversal: pair(d.patternContext.reversal) },
  v1ByDayStage: { aligned: pair(d.v1ByDayStage.yes), other: pair(d.v1ByDayStage.no) },
  meta: { verdict: r.meta.verdict, baseRate: r.meta.baseRateIS ?? null, oos: r.meta.oos ?? null, note: r.meta.verdict === "PASS" ? null : `Meta-labeling không đạt (AUC ngoài mẫu ${vi(r.meta.oos?.auc, 2).replace("+", "")}) — không hiển thị xác suất; chỉ tỷ lệ nền lịch sử.`, ...(r.meta.model ? { model: r.meta.model } : {}) },
  cone: Object.values(r.cqr).every((c) => c.verdict === "PASS") ? Object.fromEntries(Object.entries(r.cqr).map(([h, c]) => [h, c.params])) : null,
  coneReport: Object.fromEntries(Object.entries(r.cqr).map(([h, c]) => [h, { verdict: c.verdict, model: c.model, baseline: c.baseline, widthGain: c.widthGain }])),
  stageModel: { verdict: r.hmm.verdict, up: r.hmm.up, down: r.hmm.down, typical: r.hmm.typical, ...(r.hmm.model ? { model: r.hmm.model } : {}) },
  /** Lần kiểm định trước (engine v1, 2026-10-21) — lưu để đối chiếu. */
  previous: { prereg: OLD.previous?.prereg ?? OLD.prereg, engine: OLD.previous?.engine ?? OLD.engine, ranAt: OLD.previous?.ranAt ?? OLD.ranAt, verdicts: OLD.previous?.verdicts ?? OLD.verdicts, summary: OLD.previous?.summary ?? OLD.summary },
};
if (out.cone) throw new Error("Nón CQR đạt: cần chuyển tham số đúng định dạng forecastCone trước khi ghi."); // giữ đúng định dạng cũ khi có
const head = `// Cấu trúc đa khung — kết quả kiểm định ĐẶT TRƯỚC MTF v2 (MTF-v2-prereg.md), chạy ${ranAt} bằng scripts/structure-validate-v2.mjs (dữ liệu SSI).
// Giao diện chỉ gắn nhãn ĐÃ KIỂM ĐỊNH cho thành phần PASS. cone = null: nón dự báo KHÔNG đạt độ phủ -> không hiển thị.
// Tệp sinh tự động bằng scripts/structure-validation-write.mjs; không sửa tay số liệu.
`;
fs.writeFileSync(new URL("../src/market/structure/validation.js", import.meta.url), `${head}export const STRUCTURE_VALIDATION = Object.freeze(${JSON.stringify(out)});\n`);
console.log(summary);
console.log("verdictValidated", validated, "stageModel", out.stageModel.verdict);
