#!/usr/bin/env node
// CT0 (20/11/2026, docs/elite-cycle-timing-brain 08) — báo cáo đối chiếu CHỈ ĐỌC của "Bộ não Chu kỳ & Thời điểm":
//   1) hai đường Timeline điểm mua: Project A /api/cotuc/buy-timeline ↔ Gateway /api/elite/buy-timing (dòng, asOf, đếm, từng trường);
//   2) hai làn cổ tức: W1–W5 (Timeline) ↔ Săn cổ tức TO-v1 (/api/corp-events/to) — Elite đang thấy bao nhiêu, Cổ tức thấy bao nhiêu;
//   3) ngày công bố KQKD theo Timeline ↔ nghiên cứu sự kiện (Project A) cho các mã truyền vào (--es MSH,VCP).
// Không ghi dữ liệu, không cần khoá. Chạy: node scripts/parity/timing-brain.mjs [--es MSH,VCP] [--json]
const GW = process.env.GW_URL ?? "https://gateway-production-1da0.up.railway.app";
const PA = process.env.PA_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const args = process.argv.slice(2);
const esTickers = (args[args.indexOf("--es") + 1] && args.includes("--es") ? args[args.indexOf("--es") + 1] : "").split(",").filter(Boolean);
const asJson = args.includes("--json");

async function get(url) {
  const t0 = Date.now();
  const r = await fetch(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return { body: await r.json(), ms: Date.now() - t0 };
}

const [pa, gw, to] = await Promise.all([get(`${PA}/api/cotuc/buy-timeline`), get(`${GW}/api/elite/buy-timing`), get(`${GW}/api/corp-events/to`)]);
const A = pa.body.rows ?? [], B = gw.body.rows ?? [];
const ma = new Map(A.map((r) => [r.id, r])), mb = new Map(B.map((r) => [r.id, r]));
const fieldDiffs = [], sessionDiffs = [];
for (const [id, ra] of ma) {
  const rb = mb.get(id); if (!rb) continue;
  for (const f of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (JSON.stringify(ra[f]) === JSON.stringify(rb[f])) continue;
    (f === "sessionsToEntry" ? sessionDiffs : fieldDiffs).push({ id, field: f, a: ra[f], b: rb[f] });
  }
}
const toQual = (to.body.radar?.rows ?? []).filter((r) => r.qualifies);
const wDiv = B.filter((r) => r.kind === "DIVIDEND");
const report = {
  at: new Date().toISOString(),
  timeline: {
    rows: { projectA: A.length, gateway: B.length, onlyA: [...ma.keys()].filter((k) => !mb.has(k)), onlyB: [...mb.keys()].filter((k) => !ma.has(k)) },
    asOf: { projectA: pa.body.asOf, gateway: gw.body.asOf }, counts: { projectA: pa.body.counts, gateway: gw.body.counts },
    fieldDiffs, sessionDiffs: sessionDiffs.map((d) => `${d.id}: PA ${d.a} / GW ${d.b}`), latencyMs: { projectA: pa.ms, gateway: gw.ms },
  },
  dividendLanes: {
    w: { rows: wDiv.length, validated: wDiv.filter((r) => r.tier === "VALIDATED").map((r) => `${r.ticker} ${r.status}`) },
    to: { radar: to.body.radar?.rows?.length ?? 0, qualifying: toQual.map((r) => `${r.t} GDKHQ ${r.ex}`) },
    overlap: [...new Set(wDiv.map((r) => r.ticker))].filter((t) => toQual.some((r) => r.t === t)),
    eliteBeforeCT3: toQual.length, eliteAfterCT3: wDiv.length + toQual.length,
  },
  earningsDates: [],
};
for (const t of esTickers) {
  const tl = B.find((r) => r.ticker === t && r.kind === "EARNINGS");
  try {
    const { body } = await get(`${PA}/api/cotuc/event-study?ticker=${encodeURIComponent(t)}&kind=EARNINGS`);
    const es = body.upcoming?.date ?? null, tlD = tl?.eventDate ?? null;
    const gap = es && tlD ? Math.abs(Date.parse(es) - Date.parse(tlD)) / 864e5 : null;
    report.earningsDates.push({ ticker: t, timeline: tlD, timelineBasis: tl?.eventDateBasis ?? null, eventStudy: es, eventStudyBasis: body.upcoming?.status ?? null, gapDays: gap });
  } catch (e) { report.earningsDates.push({ ticker: t, error: String(e.message ?? e) }); }
}

if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }
const T = report.timeline, L = report.dividendLanes;
console.log(`BÁO CÁO ĐỐI CHIẾU BỘ NÃO THỜI ĐIỂM · ${report.at}`);
console.log(`1) Timeline: PA ${T.rows.projectA} dòng (${T.latencyMs.projectA} ms) · GW ${T.rows.gateway} dòng (${T.latencyMs.gateway} ms) · chỉ PA ${T.rows.onlyA.length} · chỉ GW ${T.rows.onlyB.length}`);
console.log(`   asOf PA ${JSON.stringify(T.asOf.projectA)} · GW ${JSON.stringify(T.asOf.gateway)}`);
console.log(`   đếm PA ${JSON.stringify(T.counts.projectA)} · GW ${JSON.stringify(T.counts.gateway)}`);
console.log(`   khác trường (trừ sessionsToEntry): ${T.fieldDiffs.length}${T.fieldDiffs.length ? " — " + T.fieldDiffs.slice(0, 10).map((d) => `${d.id}.${d.field}`).join(", ") : ""}`);
console.log(`   sessionsToEntry khác (ngoại lệ đã biết): ${T.sessionDiffs.length}${T.sessionDiffs.length ? " — " + T.sessionDiffs.slice(0, 12).join("; ") : ""}`);
console.log(`2) Cổ tức: W1–W5 ${L.w.rows} dòng (đạt: ${L.w.validated.join(", ") || "—"}) · TO ${L.to.radar} đợt, đủ điều kiện: ${L.to.qualifying.join(", ") || "—"} · trùng mã ${L.overlap.length}`);
console.log(`   Elite thấy vùng cổ tức: trước CT3 ${L.eliteBeforeCT3} · sau CT3 (hai làn) ${L.eliteAfterCT3}`);
for (const e of report.earningsDates) console.log(`3) ${e.ticker}: ${e.error ? `lỗi ${e.error}` : `Timeline ${e.timeline} (${e.timelineBasis}) · nghiên cứu sự kiện ${e.eventStudy} (${e.eventStudyBasis}) · lệch ${e.gapDays ?? "—"} ngày`}`);
