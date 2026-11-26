// PA-VOL-r1 (26/11/2026): tải OHLCV DANH NGHĨA + giá tham chiếu (basicPrice) của MỌI mã trong stocks.json (kể cả đã huỷ niêm yết) từ 2013-01-01,
// VNDirect finfo. Giá điều chỉnh tự dựng từ basicPrice (adClose của VNDirect làm tròn 3 chữ số nghìn đồng — quá thô cho hình dạng nến).
import fs from "node:fs"; import path from "node:path";
const [listF, dir] = process.argv.slice(2); const list = JSON.parse(fs.readFileSync(listF, "utf8"));
let done = 0, fail = 0, empty = 0; const q = list.map((x) => x.code);
const F = ["date", "open", "high", "low", "close", "basicPrice", "ceilingPrice", "floorPrice", "nmVolume", "nmValue", "floor"];
async function one(t) {
  const f = path.join(dir, `${t}.json`); if (fs.existsSync(f)) { done++; return; }
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(`https://api-finfo.vndirect.com.vn/v4/stock_prices?q=code:${t}~date:gte:2013-01-01&size=5000&sort=date:asc`, { headers: { "user-agent": "Mozilla/5.0", accept: "application/json" } });
      if (r.ok) { const d = (await r.json()).data ?? []; fs.writeFileSync(f, JSON.stringify(d.map((x) => F.map((k) => x[k] ?? null)))); done++; if (!d.length) empty++; return; }
    } catch { /* thử lại */ }
    await new Promise((z) => setTimeout(z, 2000 * (a + 1)));
  }
  fail++;
}
async function worker() { while (q.length) { await one(q.shift()); if ((done + fail) % 200 === 0) console.log("xong", done, "lỗi", fail, "rỗng", empty); } }
await Promise.all([worker(), worker(), worker()]);
console.log("HOÀN TẤT: xong", done, "lỗi", fail, "rỗng", empty);
