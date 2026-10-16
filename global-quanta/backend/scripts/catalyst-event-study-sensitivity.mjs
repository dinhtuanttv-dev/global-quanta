// X6 — phân tích độ nhạy SAU kiểm định (KHÔNG đăng ký trước), rà soát nguồn gốc 2026-10-16:
//   node backend/scripts/catalyst-event-study-sensitivity.mjs <ledger.json> <snapshot latest.json> <X6-result.json> <out.json>
// Loại tín hiệu từ dữ liệu mẫu (scripts/seed-catalyst.ts của Project A, đã gỡ — khớp chữ ký ticker|category|direction|propagation)
// và tin trung lập (sự kiện quyền) nhận diện qua tiêu đề trong snapshot; cùng bootstrap theo cụm như giao thức chính.
import { readFileSync, writeFileSync } from "node:fs";
import { clusterBootstrap, binomUpperP } from "../src/market/catalystValidation/eventStudy.js";
const [ledP, snapP, resP, outP] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(ledP, "utf8")).result; const led = new Map();
for (let i = 0; i < raw.length; i += 2) { const r = JSON.parse(raw[i + 1]); led.set(r.id, r); }
const SEED = new Set(["HPG|contract|benefit|direct", "NKG|contract|benefit|competitor", "VGC|contract|benefit|downstream", "NVL|regulatory|harm|direct", "VCB|macro|benefit|direct", "VCB|regulatory|harm|direct"]);
const snap = JSON.parse(readFileSync(snapP, "utf8")); const title = new Map();
for (const s of snap.sectors) for (const c of [...s.primaryCards, ...s.cascadeCards]) title.set(c.sourceId, c.sourceTitle);
const res = JSON.parse(readFileSync(resP, "utf8"));
const cls = (x) => { const l = led.get(x.id); if (l && SEED.has(`${l.ticker}|${l.category}|${l.direction}|${l.propagationDistance}`)) return "seed"; const t = title.get(x.sourceId); if (t && /không hưởng quyền|giao dịch bổ sung/i.test(t)) return "neutral"; return t ? "real" : "unverified"; };
const rows = res.rows.filter((x) => x.sar20 != null).map((x) => ({ ...x, cls: cls(x) }));
const out = {};
const run = (name, rs) => { const b = clusterBootstrap(rs.map((x) => x.sar20), rs.map((x) => x.sourceId)); const w = rs.filter((x) => x.sar20 > 0).length; out[name] = { n: b.n, clusters: b.clusters, mean: b.mean, lo: b.lo, hi: b.hi, hitRate: w / b.n, binomP: binomUpperP(w, b.n) }; console.log(name, JSON.stringify({ n: b.n, mean: +(b.mean * 100).toFixed(2), lo: +(b.lo * 100).toFixed(2), hi: +(b.hi * 100).toFixed(2), hit: +(w / b.n * 100).toFixed(1) })); };
run("all", rows);
run("exclSeed", rows.filter((x) => x.cls !== "seed"));
run("exclSeedNeutral", rows.filter((x) => x.cls !== "seed" && x.cls !== "neutral"));
const counts = Object.fromEntries(["seed", "neutral", "real", "unverified"].map((k) => [k, rows.filter((x) => x.cls === k).length]));
console.log("counts", JSON.stringify(counts), "seed rows", rows.filter((x) => x.cls === "seed").map((x) => `${x.ticker}:${(x.sar20 * 100).toFixed(1)}`).join(" "));
writeFileSync(outP, JSON.stringify({ note: "Phân tích độ nhạy SAU KIỂM ĐỊNH (không đăng ký trước): loại tín hiệu từ dữ liệu mẫu (scripts/seed-catalyst.ts, khớp ticker|category|direction|propagation) và tin trung lập nhận diện được qua tiêu đề trong snapshot.", counts, results: out }, null, 1));
