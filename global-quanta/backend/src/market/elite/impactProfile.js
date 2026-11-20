// D4 (19/11/2026) — khối "Tác động lên cổ phiếu" của Hồ sơ 360° › Tổng hợp: GET /api/elite/impact/:ticker.
// Chỉ GOM số từ các dịch vụ đã có (ws_stock, Hồ sơ PFA/kqkdEngine, snapshot Chất xúc tác, Event Radar, kho hàng hoá, pha loãng PX0,
// sổ X6-F). Không tính lại công thức nào. Dấu bằng chứng (seal) của mỗi lớp lấy từ IMPACT_EVIDENCE — không suy ra ở đây hay ở giao diện.
// aggregate luôn null cho tới khi ≥ 1 lớp ĐẠT INC-r1 và người dùng quyết định riêng (D5). Thiết kế: Tac-dong-co-phieu/05.
import { IMPACT_EVIDENCE } from "./evidenceRegistry.js";

export const IMPACT_VERSION = "IMP-v1 (19/11/2026)";
const SEAL = new Map(IMPACT_EVIDENCE.map((e) => [e.id, e]));
const STEEL_IDS = new Set(["IRON_ORE", "STEEL_ASIA"]);
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => (fin(v) ? Math.round(v * 1e4) / 1e4 : null);
const sign = (v) => (fin(v) && v !== 0 ? Math.sign(v) : 0);
const RADAR_DAYS = 30;
export const ER_R1_FIRST_VERDICT = "2027-05-20";

/** Một lớp: luôn có evidenceId + seal (từ sổ). available=false -> giao diện ghi lý do, không có hướng. */
function layer(id, labelVi, evidenceId, body) {
  const ev = SEAL.get(evidenceId);
  return { id, labelVi, evidenceId, seal: ev?.seal ?? "CHƯA KIỂM ĐỊNH", evidenceVi: ev?.detail ?? null, evidenceSrc: ev?.src ?? null,
    available: false, value: null, direction: null, detailVi: null, source: null, at: null, ...body };
}
const missing = (reasonVi) => ({ available: false, reasonVi });

export function earningsLayer(fa) {
  const e = fa?.earnings;
  if (!e?.available) return layer("earnings", "Kết quả kinh doanh", "KQ-r1", missing(e?.reasonVi ?? "Chưa có hồ sơ KQKD của mã."));
  const n = e.nowcast;
  if (!n || !fin(n.growth)) return layer("earnings", "Kết quả kinh doanh", "KQ-r1", { ...missing(`BCTC ${e.quarter}: chưa đủ dữ liệu để ước tính LNST cả năm.`), source: "kqkdEngine · VNDirect", at: e.published ?? null });
  return layer("earnings", "Kết quả kinh doanh", "KQ-r1", {
    available: true, value: { nowcastYoY: r4(n.growth), est: n.est ?? null, lo: n.lo ?? null, hi: n.hi ?? null, cumShare: r4(n.cumShare), quarter: e.quarter, sueCore: r4(e.surprise?.sueCore) },
    direction: sign(n.growth), source: "kqkdEngine · VNDirect", at: e.published ?? null,
  });
}

/** Hàng hoá gắn với mã (danh mục vnTickers). Mỗi mặt hàng mang tốc độ phản ánh của nó; dấu theo kiểm định chờ chạy (CT-r1 / CT-r2) hoặc MÔ TẢ. */
export function commodityLayer(ticker, snapshot) {
  const items = (snapshot?.items ?? []).filter((i) => (i.vnTickers ?? []).includes(ticker));
  if (!snapshot) return layer("commodity", "Hàng hoá dẫn dắt", "CM-x", missing("Chưa đọc được kho hàng hoá."));
  if (!items.length) return layer("commodity", "Hàng hoá dẫn dắt", "CM-x", { ...missing("Mã không gắn với mặt hàng nào trong 22 mặt hàng theo dõi."), none: true });
  const evidenceId = items.some((i) => STEEL_IDS.has(i.id)) ? "CT-r1" : items.some((i) => i.id === "COTTON") ? "CT-r2" : "CM-x";
  const rows = items.map((i) => ({ id: i.id, nameVi: i.nameVi, proxy: !!i.proxy, available: !!i.available, value: i.value ?? null, unit: i.unit ?? null,
    changePct: fin(i.change?.pct) ? i.change.pct : null, basisVi: i.change?.basisVi ?? null, period: i.period ?? null, speed: i.transmission?.speed ?? "unmeasured" }));
  const at = rows.map((r) => r.period).filter(Boolean).sort().at(-1) ?? null;
  return layer("commodity", "Hàng hoá dẫn dắt", evidenceId, {
    available: rows.some((r) => r.available), value: { items: rows },
    // Chưa kiểm định quan hệ giá hàng hoá -> lợi suất cổ phiếu: không gán hướng.
    direction: null, source: "Yahoo · World Bank Pink Sheet", at, ...(rows.some((r) => r.available) ? {} : { reasonVi: "Không lấy được giá các mặt hàng liên quan." }),
  });
}

export function worldLayers(ws) {
  const d = ws?.ok ? ws.data : null;
  if (!d) {
    const why = ws?.error ?? "Chưa đọc được truyền dẫn thế giới.";
    return [layer("world_short", "Ngành thế giới — phiên tới", "WS-v1", missing(why)), layer("world_medium", "Ngành thế giới — 3 tháng", "WS-r2", missing(why))];
  }
  const sec = d.sector ? `${d.sector.nameVi} (ICB ${d.sector.icb})` : null;
  if (!d.sector) {
    const why = d.note ?? "Ngành của mã không thuộc 22 ngành ICB có ánh xạ thế giới.";
    return [layer("world_short", "Ngành thế giới — phiên tới", "WS-v1", missing(why)), layer("world_medium", "Ngành thế giới — 3 tháng", "WS-r2", missing(why))];
  }
  const short = d.sectorShort
    ? layer("world_short", "Ngành thế giới — phiên tới", "WS-v1", { available: true, value: { sector: sec, stance: d.sectorShort.stance, alphaBps: d.sectorShort.alphaBps ?? null, pOutperform: d.sectorShort.pOutperform ?? null },
      direction: d.sectorShort.stance === "overweight" ? 1 : d.sectorShort.stance === "underweight" ? -1 : 0, source: "Gateway ws_stock" })
    : layer("world_short", "Ngành thế giới — phiên tới", "WS-v1", missing(`Chưa có điểm ngắn hạn của ngành ${sec}.`));
  const medium = d.sectorMedium
    ? layer("world_medium", "Ngành thế giới — 3 tháng", "WS-r2", { available: true, value: { sector: sec, stance: d.sectorMedium.stance, ws3m: d.sectorMedium.ws3m ?? null, rrg: d.sectorMedium.rrg ?? null, exposure: d.stockExposure ?? null },
      direction: d.sectorMedium.stance === "supportive" ? 1 : d.sectorMedium.stance === "adverse" ? -1 : 0, source: "Gateway ws_stock", detailVi: d.stockExposure ? null : d.note ?? null })
    : layer("world_medium", "Ngành thế giới — 3 tháng", "WS-r2", missing(`Chưa có bối cảnh trung hạn của ngành ${sec}.`));
  return [short, medium];
}

/** cat = kết quả catalyst_ticker (runCatalystTool); x6 = tiến độ sổ X6-F (chỉ số đếm). */
export function catalystLayer(cat, x6) {
  const progress = x6 ? { n: x6.matured20 ?? 0, need: x6.minN ?? 30, signals: x6.signals ?? null, clusters: x6.clusters ?? null, estimatedReadyOn: x6.estimatedReadyOn ?? null } : null;
  const d = cat?.ok ? cat.data : null;
  if (!d) return layer("catalyst", "Chất xúc tác", "X6-F", { ...missing(cat?.error ?? "Chưa đọc được snapshot Chất xúc tác."), progress });
  const cards = d.cards ?? [];
  const benefit = cards.filter((c) => c.direction === "benefit").length, harm = cards.filter((c) => c.direction === "harm").length;
  const dir = d.impact?.direction;
  return layer("catalyst", "Chất xúc tác", "X6-F", {
    available: true, progress,
    value: { benefit, harm, compositeScore: d.impact?.compositeScore ?? null, top: cards.slice(0, 3).map((c) => ({ title: c.catalyst ?? null, direction: c.direction, corroboration: c.corroboration ?? null, priceInStatus: c.priceInStatus ?? null })), stale: !!d.isStale },
    direction: dir === "benefit" ? 1 : dir === "harm" ? -1 : 0, source: "engine Chất xúc tác (Gateway)", at: d.scannedAt ?? null,
    detailVi: d.found ? null : "Engine chưa ghi nhận xúc tác nào gắn với mã này (không có nghĩa là không có tin).",
  });
}

/** Tin Event Radar gắn mã trong 30 ngày gần nhất (đã gộp cụm ở list()). Không có lợi suất — ER-r1 chấm từ 20/05/2027. */
export function radarLayer(radar, nowMs) {
  const base = { progress: { earliestVerdict: ER_R1_FIRST_VERDICT } };
  if (!radar) return layer("events", "Sự kiện (Event Radar)", "ER-r1", { ...missing("Chưa đọc được Event Radar."), ...base });
  const from = nowMs - RADAR_DAYS * 86_400_000;
  const evs = (radar.events ?? []).filter((e) => Date.parse(e.publishedAt ?? e.firstSeenAt ?? "") >= from);
  const pos = evs.filter((e) => e.sentiment > 0).length, neg = evs.filter((e) => e.sentiment < 0).length;
  return layer("events", "Sự kiện (Event Radar)", "ER-r1", {
    ...base, available: true,
    value: { count: evs.length, positive: pos, negative: neg, days: RADAR_DAYS,
      latest: evs.slice(0, 3).map((e) => ({ eventId: e.eventId, title: e.title ?? null, eventLabel: e.eventLabel ?? e.eventType ?? null, severity: e.severity ?? null, sentiment: fin(e.sentiment) ? e.sentiment : null,
        corroboration: e.corroborationCount ?? null, official: e.sourceAuthority === "configured_official_feed", publishedAt: e.publishedAt ?? e.firstSeenAt ?? null })) },
    direction: null, source: "Event Radar (Gateway)", at: evs[0]?.publishedAt ?? null,
    detailVi: evs.length ? null : `Không có tin gắn mã trong ${RADAR_DAYS} ngày gần nhất.`,
  });
}

export function dilutionLayer(dil) {
  if (!dil) return layer("dilution", "Pha loãng ≥ 10%", "PX-r1", missing("Chưa đọc được vòng đời pha loãng."));
  const p = dil.phase ?? { phase: "NONE" };
  return layer("dilution", "Pha loãng ≥ 10%", "PX-r1", {
    available: true, value: { phase: p.phase, sessionsTo: p.sessionsTo ?? null, day: p.day ?? null, listed: p.listed ?? null, ex: p.ex ?? null, ratio: p.ratio ?? null, cat: p.cat ?? null, listing: p.listing ?? null },
    direction: null, source: "PX0 · sự kiện doanh nghiệp", at: dil.asOf ?? null,
    detailVi: "Săn cổ tức TO-v1 đang tích luỹ sổ tiến (TO-r1) — xem góc nhìn Sự kiện & thời điểm.",
  });
}

/** N1 (20/11/2026): nhóm dệt may có liên kết toàn cầu đã đo (GL-1, MÔ TẢ) — chỉ đúng các mã đã có trong phép đo. */
export const GLOBAL_LINK_TEXTILE = new Set(["TNG", "TCM", "GIL", "STK", "MSH"]);
export function globalLinkExtra(ticker) {
  if (!GLOBAL_LINK_TEXTILE.has(ticker)) return null;
  const ev = SEAL.get("GL-1");
  return { evidenceId: "GL-1", seal: ev?.seal ?? "MÔ TẢ", textVi: "Liên kết toàn cầu: nhóm dệt may (TNG, TCM, GIL, STK, MSH) đồng biến riêng với nhóm may Đài Loan, Shenzhou và Nike (tương quan tuần 0,16 sau khi trừ thị trường, đo trong mẫu 2013–2019). Cùng tuần, không dự báo — không cộng điểm." };
}

export function buildImpactProfile({ ticker, nowMs, fa = null, commodities = null, ws = null, catalyst = null, x6 = null, radar = null, dilution = null }) {
  const layers = [earningsLayer(fa), commodityLayer(ticker, commodities), ...worldLayers(ws), catalystLayer(catalyst, x6), radarLayer(radar, nowMs), dilutionLayer(dilution)];
  // Bất biến: chỉ lớp có số mới có hướng; lớp chưa kiểm định / không đạt không bao giờ được cộng.
  for (const l of layers) if (!l.available) l.direction = null;
  const gl = globalLinkExtra(ticker); if (gl) { const wm = layers.find((l) => l.id === "world_medium"); if (wm) wm.extra = gl; }
  return {
    version: IMPACT_VERSION, ticker, asOf: new Date(nowMs).toISOString(), layers,
    aggregate: null, aggregateVi: "Tổng hợp có trọng số: không hiển thị cho tới khi ≥ 1 lớp ĐẠT cổng gia tăng INC-r1 và được duyệt riêng (D5).",
    elite: "Không lớp nào cộng vào Điểm Elite.",
  };
}

const withTimeout = (p, ms, label) => Promise.race([Promise.resolve().then(p), new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: quá ${ms / 1000}s`)), ms).unref?.())]);

/**
 * Nguồn (đều tuỳ chọn; thiếu nguồn -> lớp đó available=false kèm lý do):
 *   fa(t) Hồ sơ PFA · commodities() snapshot hàng hoá · ws(t) ws_stock · catalyst(t) catalyst_ticker · x6() tiến độ X6-F · radar(t) Event Radar · dilution(t) PX0
 */
export function createImpactProfile({ sources, now = Date.now, ttlMs = 5 * 60_000, failTtlMs = 30_000, timeoutMs = 12_000, log = console }) {
  const memo = new Map();
  let comMemo = null;
  let failed = 0; // số lần nguồn lỗi/treo — kết quả có nguồn lỗi chỉ đệm failTtlMs (VD lần gọi đầu sau khởi động, chiến lược ngành đang dựng)
  const safe = async (name, fn) => {
    if (!fn) return null;
    try { return await withTimeout(fn, timeoutMs, name); } catch (e) { failed++; log.warn?.(`[elite-impact] ${name}: ${e?.message}`); return null; }
  };
  const commodities = () => {
    if (comMemo && now() - comMemo.at < ttlMs) return comMemo.value;
    const value = safe("commodities", sources.commodities).then((v) => { if (!v) comMemo = null; return v; });
    comMemo = { at: now(), value };
    return value;
  };
  async function ticker(t) {
    const hit = memo.get(t);
    if (hit && now() - hit.at < hit.ttl) return hit.doc;
    const failedBefore = failed;
    const [fa, com, ws, catalyst, x6, radar, dilution] = await Promise.all([
      safe("fa", sources.fa && (() => sources.fa(t))), commodities(), safe("ws", sources.ws && (() => sources.ws(t))),
      safe("catalyst", sources.catalyst && (() => sources.catalyst(t))), safe("x6", sources.x6), safe("radar", sources.radar && (() => sources.radar(t))),
      safe("dilution", sources.dilution && (() => sources.dilution(t))),
    ]);
    const doc = buildImpactProfile({ ticker: t, nowMs: now(), fa, commodities: com, ws, catalyst, x6, radar, dilution });
    if (memo.size > 300) memo.delete(memo.keys().next().value);
    memo.set(t, { at: now(), doc, ttl: failed > failedBefore ? failTtlMs : ttlMs });
    return doc;
  }
  return { ticker };
}
