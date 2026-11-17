// PFA-v1 (17/11/2026) — HỒ SƠ 360° · DOANH NGHIỆP & SỰ KIỆN: read-model ghép các engine cơ bản ĐÃ CHẠY trên Gateway theo mã và theo
// phiên bảng tín hiệu E1. Không tính lại công thức nào: chỉ đọc
//   • KQKD (fundamentals/kqkdEngine qua kqkd.summary): LNST TTM, tăng trưởng, Piotroski 9 phép thử, Beneish M, Altman Z″, dồn tích,
//     CFO/LNST, SUE, nowcast, cờ — kèm ngày công bố thật;
//   • lịch công bố KQKD (kqkd.calendar): quý vừa rồi / quý tới, khoảng dự kiến;
//   • cổ tức (events/dividendScreener): lợi suất, tỷ lệ chi trả, FCF/cổ tức, chuỗi năm trả, độ bền DS-v2, FM-v1, XD-v1;
//   • sự kiện doanh nghiệp (events/corpEvents CE-v1): GDKHQ, chốt quyền, thanh toán, cổ tức cổ phiếu, phát hành, diện cảnh báo…;
//   • Săn cổ tức TO-v1 (events/divRunupService.tickerHistory).
// CẢNH BÁO (pha B): nhãn mô tả gắn lên vị thế — KHÔNG đổi danh mục, KHÔNG phải cổng loại. Cổng loại chỉ được bật khi qua FA-r1.
// POINT-IN-TIME: tài liệu dựng cho đúng phiên E1 (asOf) và khoá; quý KQKD công bố SAU asOf bị ẩn số; sự kiện công bố sau asOf bị bỏ.
// Tổ chức tài chính (ngân hàng / chứng khoán / bảo hiểm): chỉ số dòng tiền doanh nghiệp, Piotroski, Beneish, Altman = KHÔNG ÁP DỤNG.

export const PFA_VERSION = "PFA-v1 (17/11/2026)";
// Khoá "local:" = chỉ lưu trên ổ Gateway, KHÔNG sao lên Supabase (băng thông bị giới hạn); giữ PFA_KEEP phiên gần nhất.
export const PFA_KV = { index: "local:elite:pfa:index", doc: (d) => `local:elite:pfa:${d}` };
export const PFA_KEEP = 30;
/** Ngưỡng cảnh báo (mô tả, cố định — đổi ngưỡng = đổi phiên bản). */
export const PFA_RULES = Object.freeze({
  piotroskiLow: 3, piotroskiMinTests: 7, accrualHigh: 0.1, exSoonSessions: 10, kqkdSoonDays: 14,
  stockDivMin: 0.1, eventLookbackDays: 120, eventMaxRows: 12,
});
const FIN_TPL = new Set(["bank", "sec", "ins"]);
const CF_FLAGS = new Set(["HIGH_ACCRUAL", "NEG_CFO", "M_FLAG", "Z_DISTRESS"]);
const STATUS_CATS = { WARNING: "Diện cảnh báo", CONTROL: "Diện kiểm soát", HALT: "Hạn chế / tạm ngừng giao dịch", NOTICE: "Nhắc nhở công bố thông tin", NO_MARGIN: "Không đủ điều kiện ký quỹ", DELIST: "Huỷ niêm yết" };
const fin = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
/** Số phiên giao dịch từ `from` (không tính) tới `to` (tính), bỏ thứ Bảy / Chủ nhật — xấp xỉ (không trừ ngày lễ), ghi rõ ở giao diện. */
export function weekdaysBetween(from, to) {
  if (!from || !to || to <= from) return to === from ? 0 : null;
  let n = 0;
  for (let t = Date.parse(`${from}T00:00:00Z`) + 86_400_000, e = Date.parse(`${to}T00:00:00Z`); t <= e; t += 86_400_000) { const w = new Date(t).getUTCDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

/** Khối KQKD từ dòng tóm tắt + (tuỳ chọn) chi tiết. `kq.created` là ngày công bố thật của quý. */
export function earningsBlock(kq, detail, asOf) {
  if (!kq) return { available: false, reasonVi: "Chưa có BCTC quý trong kho KQKD." };
  const published = detail?.latest?.published ?? kq.created ?? null;
  if (published && asOf && published > asOf) {
    return { available: false, quarter: kq.quarter, published, reasonVi: `BCTC ${kq.quarter} công bố ${published}, sau phiên ${asOf} — không dùng để tránh nhìn trước.` };
  }
  const financial = FIN_TPL.has(kq.tpl);
  const q = detail?.quality ?? null;
  const pio = financial ? null : q?.piotroski ?? null;
  return {
    available: true, quarter: kq.quarter, fiscal: kq.fiscal ?? null, published, publishedSource: detail?.latest?.publishedSource ?? null, tpl: kq.tpl ?? null, financial,
    npatTtm: kq.ttm?.npat ?? q?.npatTtm ?? null, topTtm: kq.ttm?.top ?? q?.topTtm ?? null, epsTtm: kq.ttm?.eps ?? null,
    npatYoY: kq.npatYoY ?? null, coreYoY: kq.coreYoY ?? null, topYoY: kq.topYoY ?? null, ytd: kq.ytd?.growth ?? null, ttmGrowth: kq.ttmGrowth ?? null,
    netMarginTtm: r4(kq.netMarginTtm), roe: r4(kq.roe), nonCoreShare: r4(kq.nonCoreShare),
    piotroski: pio ? { score: pio.score, of: pio.of, tests: (pio.tests ?? []).map((t) => ({ id: t.id, label: t.label, pass: t.pass })) } : null,
    beneish: financial || !fin(kq.m) ? null : { m: r4(kq.m), flag: Boolean(kq.mFlag) },
    altman: financial || !fin(kq.z) ? null : { z: r4(kq.z), zone: kq.zZone ?? null },
    accrual: financial ? null : r4(kq.accrual), cfoToNpat: financial ? null : r4(kq.cfoToNpat),
    kpi: financial ? null : kq.kpi ?? null,
    surprise: { sueNpat: r4(kq.sueNpat), sueCore: r4(kq.sueCore) },
    nowcast: kq.nowcast ? { growth: r4(kq.nowcast.growth), est: kq.nowcast.est ?? null, lo: kq.nowcast.lo ?? null, hi: kq.nowcast.hi ?? null, cumShare: r4(kq.nowcast.cumShare) } : null,
    seasonDev: r4(kq.seasonDev),
    // Tổ chức tài chính: bỏ các cờ dòng tiền / Beneish / Altman (không áp dụng) — kho KQKD vẫn gắn cho mẫu "sec".
    flags: (kq.flags ?? []).filter((f) => !(financial && CF_FLAGS.has(f))),
    na: financial ? ["piotroski", "beneish", "altman", "accrual", "cfoToNpat"] : [],
    evidence: detail?.evidence ? { nowcast: detail.evidence.nowcast ? { pass: detail.evidence.nowcast.pass, label: detail.evidence.nowcast.label, ic: detail.evidence.nowcast.ic, p: detail.evidence.nowcast.p } : null, sue: detail.evidence.sueCore ? { pass: detail.evidence.sueCore.pass, label: detail.evidence.sueCore.label, ic: detail.evidence.sueCore.ic, p: detail.evidence.sueCore.p } : null, prereg: detail.evidence.prereg ?? null } : null,
  };
}

/** Khối lịch công bố KQKD (quý hiện hành đã công bố chưa, quý tới dự kiến khi nào). */
export function calendarBlock(cur, next, asOf) {
  const pick = (r, label) => (r ? { label, status: r.status ?? null, date: r.date && (!asOf || r.date <= asOf) ? r.date : null, expected: r.expected ?? null, band: r.band ?? null, medianLag: r.medianLag ?? null, lateShare: r4(r.lateShare), ownN: r.ownN ?? null } : null);
  return { current: pick(cur, "current"), next: pick(next, "next") };
}

/** Khối cổ tức từ dòng Bộ lọc cổ tức (đã tính trên Gateway). */
export function dividendBlock(row) {
  if (!row) return { available: false, reasonVi: "Mã ngoài danh sách Bộ lọc cổ tức." };
  const d = row.div ?? {}, f = row.fund ?? {}, dq = row.dq ?? null;
  return {
    available: true, price: row.price ?? null, yieldGross: row.yieldGross ?? null, yieldNet: row.yieldNet ?? null,
    ttmCash: d.ttmCash ?? null, payments12m: d.payments12m ?? null, stockPct12m: d.stockPct12m ?? null, lastEx: d.lastEx ?? null, lastCash: d.lastCash ?? null,
    lastFy: d.lastFy ?? null, lastFyCash: d.lastFyCash ?? null, streak: d.streak ?? null, cagr3: d.cagr3 ?? null, cuts5: d.cuts5 ?? null, years5: d.years5 ?? null, history: d.history ?? [],
    payout: f.payout ?? null, fcfCover: f.fcfCover ?? null, pe: f.pe ?? null, pb: f.pb ?? null,
    exStudy: row.ex ?? null,
    // DQ-v1 (độ bền cổ tức): lợi suất chuẩn hoá, lịch sử công ty, Lintner, bảng kiểm, rủi ro, bẫy lợi suất — MÔ TẢ.
    quality: dq ? {
      version: dq.version ?? null, yield: dq.yield ?? null, company: dq.company ?? null,
      lintner: dq.lintner ? { ok: dq.lintner.ok, speed: r4(dq.lintner.speed), targetPayout: r4(dq.lintner.targetPayout), r2: r4(dq.lintner.r2), n: dq.lintner.n ?? null } : null,
      nextYield: r4(dq.lintnerNextYield), checks: (dq.checks ?? []).map((c) => ({ id: c.id, label: c.label, pass: c.pass })), checksPassed: dq.checksPassed ?? null, checksKnown: dq.checksKnown ?? null,
      risk: dq.risk ?? null, trap: dq.trap ?? null,
    } : null,
    fm: row.fm ? { version: row.fm.version ?? null, label: row.fm.label ?? null, score: row.fm.score ?? null, groups: row.fm.groups ?? null, rank: row.fm.rank ?? null, of: row.fm.of ?? null, quintile: row.fm.quintile ?? null } : null,
  };
}

/** Sự kiện doanh nghiệp: chỉ sự kiện đã CÔNG BỐ tới asOf; sắp tới (ngày hiệu lực ≥ asOf) và gần đây (≤ eventLookbackDays). */
export function eventsBlock(events, asOf, rules = PFA_RULES) {
  const known = (events ?? []).filter((e) => !e.disclosed || e.disclosed <= asOf);
  const key = (e) => e.ex ?? e.meeting ?? e.date ?? e.record ?? null;
  const row = (e) => {
    const k = key(e);
    return { cat: e.cat, group: e.group, label: e.label, title: e.title ?? null, disclosed: e.disclosed ?? null, ex: e.ex ?? null, record: e.record ?? null, pay: e.pay ?? null,
      meeting: e.meeting ?? null, date: k, cash: e.cash ?? null, ratio: e.ratio ?? null, leadDays: e.disclosed && k ? dayDiff(e.disclosed, k) : null, sessionsAway: k && k >= asOf ? weekdaysBetween(asOf, k) : null };
  };
  const upcoming = known.filter((e) => key(e) && key(e) >= asOf).map(row).sort((a, b) => a.date.localeCompare(b.date)).slice(0, rules.eventMaxRows);
  const recent = known.filter((e) => !STATUS_CATS[e.cat] && key(e) && key(e) < asOf && dayDiff(key(e), asOf) <= rules.eventLookbackDays).map(row).sort((a, b) => b.date.localeCompare(a.date)).slice(0, rules.eventMaxRows);
  const status = known.filter((e) => STATUS_CATS[e.cat] && key(e) && key(e) <= asOf && dayDiff(key(e), asOf) <= 365).map(row).sort((a, b) => b.date.localeCompare(a.date));
  return { upcoming, recent, status: status.slice(0, 4) };
}

/** Săn cổ tức TO-v1 của mã: sự kiện gần nhất, kết quả cửa sổ đã đóng. */
export function toBlock(h) {
  if (!h?.events?.length) return { available: false };
  const ev = h.events.slice(0, 6).map((e) => ({ ex: e.ex, disclosed: e.disclosed ?? null, yield: r4(e.y), bucket: e.bucket ?? null, qualifies: Boolean(e.qualifies), entryDate: e.entryDate ?? null,
    exitDate: e.outcome?.exitDate ?? null, excess: r4(e.outcome?.excess), postEx5: r4(e.postEx5?.excess), runUp: r4(e.runUp) }));
  const done = ev.filter((e) => fin(e.excess));
  return { available: true, sector: h.sector ?? null, events: ev, done: done.length, hitRate: done.length ? r4(done.filter((e) => e.excess > 0).length / done.length) : null };
}

/** Cảnh báo pha B — mô tả, không loại. Mỗi cảnh báo: { id, level: "warn"|"info", text, source }. */
export function pfaWarnings(doc, rules = PFA_RULES) {
  const w = [], e = doc.earnings, add = (id, level, text, source) => w.push({ id, level, text, source });
  if (e?.available) {
    if (fin(e.npatTtm) && e.npatTtm < 0) add("LOSS_TTM", "warn", `Lỗ 4 quý gần nhất (LNST TTM ${Math.round(e.npatTtm / 1e9).toLocaleString("vi-VN")} tỷ)`, `KQKD ${e.quarter}`);
    if (!e.financial) {
      if (e.piotroski && e.piotroski.of >= rules.piotroskiMinTests && e.piotroski.score <= rules.piotroskiLow) add("PIOTROSKI_LOW", "warn", `Piotroski ${e.piotroski.score}/${e.piotroski.of} — sức khoẻ tài chính yếu`, `KQKD ${e.quarter}`);
      if (e.beneish?.flag) add("BENEISH", "warn", `Beneish M ${e.beneish.m} > −1,78 — cần soát chất lượng số liệu (sàng lọc, không phải kết luận)`, `KQKD ${e.quarter}`);
      if (e.altman?.zone === "DISTRESS") add("ALTMAN", "warn", `Altman Z″ ${e.altman.z} — vùng rủi ro tài chính`, `KQKD ${e.quarter}`);
      if (fin(e.accrual) && e.accrual > rules.accrualHigh) add("ACCRUAL", "warn", `Dồn tích cao (${(e.accrual * 100).toFixed(1)}% tài sản) — lợi nhuận chưa thành tiền`, `KQKD ${e.quarter}`);
      if (fin(e.cfoToNpat) && e.cfoToNpat < 0 && fin(e.npatTtm) && e.npatTtm > 0) add("NEG_CFO", "warn", "Có lãi nhưng dòng tiền kinh doanh 4 quý âm", `KQKD ${e.quarter}`);
    }
    if (e.flags.includes("AUDIT_DIFF")) add("AUDIT_DIFF", "info", "Tổng 4 quý lệch BCTC năm kiểm toán > 2%", `KQKD ${e.quarter}`);
    if (e.flags.includes("NON_CORE")) add("NON_CORE", "info", "Phần lớn lợi nhuận đến từ hoạt động ngoài cốt lõi", `KQKD ${e.quarter}`);
  }
  for (const s of doc.events?.status ?? []) add(`STATUS_${s.cat}`, s.cat === "NOTICE" || s.cat === "NO_MARGIN" ? "info" : "warn", `${STATUS_CATS[s.cat]} (${s.date})`, "Sự kiện doanh nghiệp");
  for (const u of doc.events?.upcoming ?? []) {
    if (u.sessionsAway == null || u.sessionsAway > rules.exSoonSessions) continue;
    if ((u.cat === "STOCK" || u.cat === "BONUS") && fin(u.ratio) && u.ratio / 100 >= rules.stockDivMin) add("STOCK_EX_SOON", "warn", `GDKHQ ${u.label.toLowerCase()} ${u.ratio}% sau khoảng ${u.sessionsAway} phiên (${u.ex}) — phần cổ phiếu mới chưa bán được tới khi niêm yết bổ sung`, "Sự kiện doanh nghiệp");
    else if (u.cat === "CASH") add("CASH_EX_SOON", "info", `GDKHQ cổ tức tiền ${fin(u.cash) ? u.cash.toLocaleString("vi-VN") + "đ" : ""} sau khoảng ${u.sessionsAway} phiên (${u.ex})`, "Sự kiện doanh nghiệp");
    else if (u.cat === "RIGHTS") add("RIGHTS_SOON", "info", `Quyền mua / phát hành thêm, GDKHQ ${u.ex}`, "Sự kiện doanh nghiệp");
  }
  const nx = doc.calendar?.next;
  if (nx && nx.status === "UPCOMING" && nx.band?.[0] && dayDiff(doc.asOf, nx.band[0]) <= rules.kqkdSoonDays && dayDiff(doc.asOf, nx.band[1] ?? nx.band[0]) >= 0) add("KQKD_SOON", "info", `KQKD quý tới dự kiến ${nx.band[0]} → ${nx.band[1]}`, "Lịch công bố KQKD");
  return w;
}

/** Hồ sơ một mã tại phiên asOf. */
export function buildProfileFa({ ticker, asOf, kq, detail = null, cal = {}, ds = null, events = [], to = null }) {
  const doc = {
    version: PFA_VERSION, ticker, asOf,
    earnings: earningsBlock(kq, detail, asOf), calendar: calendarBlock(cal.current ?? null, cal.next ?? null, asOf),
    dividend: dividendBlock(ds), events: eventsBlock(events, asOf), to: toBlock(to),
  };
  doc.warnings = pfaWarnings(doc);
  return doc;
}

// ---------------------------------------------------------------- dịch vụ
/**
 * Dựng & khoá hồ sơ PFA cho mọi mã của bảng E1 phiên mới nhất (một lần mỗi phiên). Phiên cũ chỉ đọc bản đã lưu.
 * deps: panel.panel(date?) · kqkd.summary()/detail(t)/calendar() · dividendScreener.get() · corpEvents.doc() · divRunup.tickerHistory(t)
 */
export function createProfileFa({ store, panel, kqkd, dividendScreener, corpEvents, divRunup = null, now = Date.now, log = console }) {
  const kv = async (k) => { try { return (await store.getKv(k))?.value ?? null; } catch { return null; } };
  let memo = null, building = null;

  async function build({ force = false } = {}) {
    if (building) return building;
    building = (async () => {
      const p = await panel.panel();
      if (!p?.rows?.length) throw new Error("Chưa có bảng tín hiệu E1.");
      const asOf = p.date;
      if (!force) { const have = memo?.asOf === asOf ? memo : await kv(PFA_KV.doc(asOf)); if (have) return (memo = have); }
      const t0 = now();
      const [sum, cal, ds] = await Promise.all([kqkd.summary().catch(() => null), Promise.resolve(kqkd.calendar?.()).catch(() => null), dividendScreener.get().catch(() => null)]);
      const kqBy = new Map((sum?.rows ?? []).map((r) => [r.t, r])), dsBy = new Map((ds?.rows ?? []).map((r) => [r.t, r]));
      const curBy = new Map((cal?.current?.rows ?? []).map((r) => [r.t, r])), nextBy = new Map((cal?.next?.rows ?? []).map((r) => [r.t, r]));
      const evBy = new Map(); for (const e of corpEvents.doc()?.events ?? []) (evBy.get(e.t) ?? evBy.set(e.t, []).get(e.t)).push(e);
      const tickers = {}; let detailOk = 0;
      for (const r of p.rows) {
        const t = r.ticker;
        let detail = null; try { detail = await kqkd.detail(t); if (detail) detailOk++; } catch { detail = null; }
        let to = null; try { to = divRunup ? await divRunup.tickerHistory(t) : null; } catch { to = null; }
        const d = buildProfileFa({ ticker: t, asOf, kq: kqBy.get(t) ?? null, detail, cal: { current: curBy.get(t), next: nextBy.get(t) }, ds: dsBy.get(t) ?? null, events: evBy.get(t) ?? [], to });
        delete d.version; delete d.asOf; tickers[t] = d;
      }
      const doc = {
        version: PFA_VERSION, asOf, builtAt: new Date(now()).toISOString(), panelVersion: p.version ?? null, rules: PFA_RULES,
        sources: { kqkd: sum?.latestQuarter ?? null, kqkdBuilt: sum?.builtAt ?? null, calendar: cal?.asOf ?? null, dividend: ds?.asOf ?? null, events: corpEvents.doc()?.fetchedAt ?? null },
        coverage: { tickers: p.rows.length, earnings: Object.values(tickers).filter((x) => x.earnings.available).length, detail: detailOk, dividend: Object.values(tickers).filter((x) => x.dividend.available).length },
        ms: now() - t0, tickers,
      };
      await store.setKv(PFA_KV.doc(asOf), doc);
      const idx = (await kv(PFA_KV.index))?.dates ?? [];
      const all = [...new Set([...idx, asOf])].sort(), keep = all.slice(-PFA_KEEP);
      for (const old of all.slice(0, -PFA_KEEP)) await store.setKv(PFA_KV.doc(old), null);
      await store.setKv(PFA_KV.index, { dates: keep });
      log.info?.(`[elite] PFA ${asOf}: ${doc.coverage.tickers} mã, ${doc.ms} ms`);
      return (memo = doc);
    })().finally(() => { building = null; });
    return building;
  }
  /** Tài liệu của một phiên (mặc định phiên mới nhất — dựng nếu chưa có). */
  async function doc(date = null) {
    if (date) return memo?.asOf === date ? memo : await kv(PFA_KV.doc(date));
    const p = await panel.panel().catch(() => null);
    if (p && memo?.asOf === p.date) return memo;
    return build();
  }
  /** Bảng cảnh báo gọn cho mọi mã (bảng quyết định) — không gửi cả hồ sơ. */
  async function warnings(date = null) {
    const d = await doc(date); if (!d) return null;
    return { version: d.version, asOf: d.asOf, builtAt: d.builtAt, rules: d.rules, tickers: Object.fromEntries(Object.entries(d.tickers).map(([t, x]) => [t, x.warnings])) };
  }
  async function ticker(t, date = null) {
    const d = await doc(date); if (!d) return null;
    const x = d.tickers[t]; if (!x) return { version: d.version, asOf: d.asOf, ticker: t, missing: true };
    return { version: d.version, asOf: d.asOf, builtAt: d.builtAt, rules: d.rules, sources: d.sources, ticker: t, ...x };
  }
  return { build, doc, warnings, ticker, status: () => ({ version: PFA_VERSION, asOf: memo?.asOf ?? null, builtAt: memo?.builtAt ?? null, coverage: memo?.coverage ?? null, ms: memo?.ms ?? null }) };
}
