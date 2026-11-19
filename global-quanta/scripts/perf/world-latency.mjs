// W5 (19/11/2026) — đo độ trễ các route /api/world/* mà tab Truyền dẫn & kịch bản dùng. Không thêm thư viện (fetch của Node).
// Chạy: node scripts/perf/world-latency.mjs <BASE> [N=20] [CONC=4]
//   BASE: Gateway cục bộ (http://localhost:8787) cho đo tải; với production chỉ dùng N nhỏ, CONC=1 (tôn trọng bộ giới hạn tốc độ).
// In p50 / p95 / max (ms), số lỗi và kích thước phản hồi cho từng route; thoát mã 1 nếu có lỗi khác 4xx đã biết.
const [BASE = "http://localhost:8787", N0 = "20", C0 = "4"] = process.argv.slice(2);
const N = Math.max(1, Number(N0)), CONC = Math.max(1, Number(C0));
const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ROUTES = [
  ["GET series", "/api/world/series"],
  ["GET overview", "/api/world/overview"],
  ["POST matrix", "/api/world/matrix", json({})],
  ["GET events", "/api/world/events"],
  ["GET connectedness", "/api/world/connectedness"],
  ["POST scenario usd-strong h3", "/api/world/scenario", json({ scenarioId: "usd-strong", horizon: 3 })],
  ["POST scenario oil-spike h3", "/api/world/scenario", json({ scenarioId: "oil-spike", horizon: 3 })],
  ["GET elite impact HPG", "/api/elite/impact/HPG"],
  ["GET elite liquidity HPG", "/api/elite/liquidity/HPG"],
];
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

let bad = 0;
console.log(`BASE ${BASE} · ${N} lần/route · đồng thời ${CONC}`);
console.log("route".padEnd(30), "p50".padStart(7), "p95".padStart(7), "max".padStart(7), "lỗi".padStart(5), "KB".padStart(7));
for (const [name, path, init] of ROUTES) {
  const times = []; let errors = 0, size = 0, status = 0;
  const one = async () => {
    const t0 = performance.now();
    try {
      const r = await fetch(BASE + path, init);
      const buf = await r.arrayBuffer(); size = buf.byteLength; status = r.status;
      if (!r.ok) errors++;
    } catch { errors++; }
    times.push(performance.now() - t0);
  };
  for (let i = 0; i < N; i += CONC) await Promise.all(Array.from({ length: Math.min(CONC, N - i) }, one));
  if (errors) bad++;
  console.log(name.padEnd(30), q(times, 0.5).toFixed(0).padStart(7), q(times, 0.95).toFixed(0).padStart(7), Math.max(...times).toFixed(0).padStart(7), String(errors).padStart(5), (size / 1024).toFixed(1).padStart(7), errors ? `HTTP ${status}` : "");
}
process.exit(bad ? 1 : 0);
