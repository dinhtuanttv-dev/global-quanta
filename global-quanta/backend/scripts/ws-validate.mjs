// Kiểm định đặt trước WS (backend/src/market/worldSectors/WS-prereg.md). Chỉ đọc nguồn công khai (Yahoo + Gateway).
//   node backend/scripts/ws-validate.mjs --out backend/src/market/worldSectors/WS-result.json
import { writeFileSync } from "node:fs";
import { COMMODITY_DRIVERS, instrumentsFor, VN_SECTORS } from "../src/market/worldSectors/catalog.js";
import { createWorldSectorService } from "../src/market/worldSectors/worldSectorService.js";
import { createCommodityService } from "../src/market/commodities/commodityService.js";
import { prepare, runWs } from "../src/market/worldSectors/wsValidate.js";

const out = process.argv[process.argv.indexOf("--out") + 1];
const G = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
const j = async (u) => { const r = await fetch(G + u); if (!r.ok) throw new Error(`${u} HTTP ${r.status}`); return r.json(); };

const vnIndex = (await j("/api/market/ohlcv?symbol=VNINDEX&range=5y")).bars.filter((b) => !b.partial && b.close > 0).map((b) => [b.date, b.close]);
const sectors = {};
for (const s of VN_SECTORS) sectors[s.icb] = (await j(`/api/market/sectors/${s.icb}/history`)).index.filter((r) => r[1] > 0).map((r) => [r[0], r[1]]);
const svc = createWorldSectorService({ log: { warn() {} } });
const ser = await svc.series();
const instruments = Object.fromEntries(VN_SECTORS.map((s) => [s.icb, instrumentsFor(s.icb).map((i) => ({ region: i.region, match: i.match, p: prepare(ser.get(i.symbol)?.points ?? []) })).filter((i) => i.p.r.length > 300)]));
const cs = createCommodityService({ log: { warn() {} } });
const dailyDrivers = {}, monthlyDrivers = {};
for (const [icb, list] of Object.entries(COMMODITY_DRIVERS)) {
  for (const [id, sign] of list) {
    const c = await cs.seriesOf(id);
    if (!c?.points?.length) continue;
    if (c.freq === "day") (dailyDrivers[icb] ??= []).push({ sign, p: prepare(c.points) });
    else (monthlyDrivers[icb] ??= []).push({ sign, points: c.points });
  }
}
const res = runWs({ vnIndex, sectors, instruments, dailyDrivers, monthlyDrivers });
res.ranAt = new Date().toISOString();
res.sources = { foreign: "Yahoo (74 mã, catalog.js)", vn: `${G} chỉ số ngành ICB + VN-Index`, commodities: "Yahoo / World Bank Pink Sheet" };
writeFileSync(out, JSON.stringify(res, null, 1));
const f = (x, d = 3) => (x == null ? "—" : Number(x).toFixed(d));
const name = Object.fromEntries(VN_SECTORS.map((s) => [s.icb, s.nameVi]));
console.log(`mẫu ${res.from} → ${res.to}, ${res.sessions} phiên`);
console.log("H2 (tương đối, từng ngành):");
for (const x of res.H2) console.log(`  ${x.icb} ${name[x.icb].padEnd(28)} n=${x.n} IC=${f(x.ic)} p=${f(x.p, 4)} q=${f(x.q)} nửa=[${x.halves.map((h) => f(h)).join(", ")}] ${x.pass ? "ĐẠT" : "—"}`);
console.log(`H1 (tuyệt đối): ${res.H1.map((x) => `${x.icb}:${f(x.ic, 2)}`).join(" ")}`);
console.log(`H3 IC cắt ngang ngày: TB=${f(res.H3.mean, 4)} t=${f(res.H3.t, 2)} p=${f(res.H3.p, 4)} nửa=[${res.H3.halves.map((h) => f(h, 4)).join(", ")}] ngày=${res.H3.days} ${res.H3.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`);
console.log(`H4 IC cắt ngang tháng: TB=${f(res.H4.mean, 4)} t=${f(res.H4.t, 2)} p=${f(res.H4.p, 4)} nửa=[${res.H4.halves.map((h) => f(h, 4)).join(", ")}] tháng=${res.H4.months} ${res.H4.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`);
