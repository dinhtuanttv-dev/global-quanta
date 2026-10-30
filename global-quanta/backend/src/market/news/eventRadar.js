import { createHash } from "node:crypto";
import { fetchRssFeeds, fetchVndirectNews, RSS_FEEDS } from "./newsService.js";
import { classifyEvent, extractTickers, fold, jaccard, sentiment, stripHtml, titleTokens } from "./newsNlp.js";
import { createEventRadarRepository } from "./eventRadarRepository.js";
import { resolveEntities } from "./entityResolver.js";
import { stockNameIndexFor } from "./stockNames.js";

const HEALTH_KEY = "event-radar:source-health:v1";
const EVENT_RETENTION = 2500;
const POLL_MS = Math.max(60_000, Number(process.env.EVENT_RADAR_POLL_MS) || 5 * 60_000);
const DISCLOSURE_SYMBOL_LIMIT = Math.max(30, Math.min(300, Number(process.env.EVENT_RADAR_DISCLOSURE_SYMBOL_LIMIT) || 120));

const hash = (value) => createHash("sha256").update(String(value ?? "")).digest("hex");
const iso = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

// Nhóm vĩ mô / toàn thị trường. 30/10/2026 (EV-R1): siết từ khoá — bản cũ khớp "thue" trong "lãi sau thuế", "lai suat" trong
// "trái phiếu lãi suất 12,5%", "hose" trong mọi bài nhắc sàn -> phần lớn tin "tài khoá / hạ tầng" thực ra là KQKD doanh nghiệp.
// Chỉ xét TIÊU ĐỀ (tóm tắt chứa nhiều từ lẻ); tin doanh nghiệp rõ loại (KQKD, pháp lý, cổ tức…) thắng nhóm vĩ mô, trừ cú sốc hệ thống.
export const RADAR_CLASSIFIER_VERSION = "radar-classify-v2";
const SYSTEM_EVENT_RULES = [
  { id: "SYSTEMIC_STRESS", label: "Cú sốc / rủi ro hệ thống", re: /(vo no|khung hoang|thien tai|bao so|lu lut|dong dat|mat dien|tan cong mang|su co he thong|chien tranh|cam van|dut gay chuoi cung ung|bank run|khung bo)/ },
  { id: "MONETARY_POLICY", label: "Chính sách tiền tệ", re: /(lai suat dieu hanh|lai suat tai cap von|lai suat tai chiet khau|lai suat lien ngan hang|lai suat huy dong|lai suat cho vay|mat bang lai suat|ngan hang nha nuoc|\bnhnn\b|tang truong tin dung|room tin dung|han muc tin dung|ty gia|ngoai hoi|du tru bat buoc|tin phieu|bom rong|hut rong|\bfed\b|\becb\b)/ },
  { id: "FISCAL_POLICY", label: "Chính sách tài khóa / thuế", re: /(chinh sach thue|thue suat|giam thue|mien thue|gian thue|tang thue|thue gtgt|thue vat|thue thu nhap doanh nghiep|thue tieu thu dac biet|thue doi ung|thue quan|ngan sach nha nuoc|thu ngan sach|chi ngan sach|dau tu cong|giai ngan von|nghi dinh|thong tu|du thao luat|luat sua doi|quoc hoi thong qua)/ },
  { id: "MACRO_DATA", label: "Dữ liệu vĩ mô", re: /(\bgdp\b|\bcpi\b|lam phat|chi so gia|kim ngach xuat khau|kim ngach nhap khau|can can thuong mai|xuat sieu|nhap sieu|\bpmi\b|\bfdi\b|san xuat cong nghiep|\biip\b|tong muc ban le|cuc thong ke|tong cuc thong ke|that nghiep)/ },
  { id: "MARKET_STRUCTURE", label: "Hạ tầng / cấu trúc thị trường", re: /(nang hang thi truong|nang hang chung khoan|\bftse\b|\bmsci\b|\bkrx\b|he thong giao dich|\bvsdc?\b|luu ky|bu tru|ngung giao dich toan|loi giao dich|non-prefunding|ubcknn|uy ban chung khoan)/ },
];
const COMPANY_FIRST = new Set(["LEGAL", "EARNINGS", "INSIDER", "MNA", "DIVIDEND", "ISSUANCE", "AGM", "PERSONNEL"]);
const MACRO_NEWS = { id: "MACRO_NEWS", label: "Tin kinh tế vĩ mô", weight: 0.6 };

// EV-R2: chuyên mục vĩ mô / tài chính–ngân hàng (nguồn cũ chỉ có chuyên mục cổ phiếu + doanh nghiệp -> gần như không có tin vĩ mô).
export const MACRO_RSS_FEEDS = [
  { id: "VIETSTOCK", label: "Vietstock · Vĩ mô", url: "https://vietstock.vn/761/kinh-te/vi-mo.rss", section: "macro" },
  { id: "CAFEF", label: "CafeF · Vĩ mô – đầu tư", url: "https://cafef.vn/vi-mo-dau-tu.rss", section: "macro" },
  { id: "CAFEF", label: "CafeF · Tài chính – ngân hàng", url: "https://cafef.vn/tai-chinh-ngan-hang.rss", section: "macro" },
];
const RADAR_FEEDS = [...RSS_FEEDS, ...MACRO_RSS_FEEDS];

/** item: { title, summary?, feedSection?, tickers? } */
export function classifyRadarEvent(item) {
  const title = fold(item.title);
  const system = SYSTEM_EVENT_RULES.find((rule) => rule.re.test(title));
  const company = classifyEvent(item.title);
  const noTicker = !(item.tickers?.length);
  const macroSection = item.feedSection === "macro" && noTicker;
  // "Chủ tịch nước / Chủ tịch UBCKNN", "nghị quyết" (Trung ương / Quốc hội) không gắn mã -> không phải nhân sự / ĐHĐCĐ doanh nghiệp.
  if (COMPANY_FIRST.has(company.id) && !(noTicker && (company.id === "AGM" || company.id === "PERSONNEL"))) return company;
  if (system) return { id: system.id, label: system.label, weight: system.id === "SYSTEMIC_STRESS" ? 1 : 0.8 };
  if (macroSection) return MACRO_NEWS;
  return company;
}

/** Đọc ra: phân loại lại sự kiện đã lưu bằng quy tắc hiện hành (nội dung nguồn không đổi). */
function withCurrentClassification(event) {
  if (event.classifierVersion === RADAR_CLASSIFIER_VERSION) return event;
  const c = classifyRadarEvent({ title: event.title, summary: event.summary, feedSection: event.feedSection, tickers: event.tickers });
  const severity = severityFor(c.id, event.title, event.summary);
  return { ...event, eventType: c.id, eventLabel: c.label, severity: severity.level, severityScore: severity.score, classifierVersion: RADAR_CLASSIFIER_VERSION };
}

/** Chỉ phân loại (do đổi quy tắc) khác nhau — nội dung nguồn và mã ghép giữ nguyên -> không phải bản sửa của nguồn. */
function onlyClassificationChanged(old, event) {
  if (!old) return false;
  const same = (k) => (old[k] ?? null) === (event[k] ?? null);
  const tickers = (e) => [...(e.tickers ?? [])].sort().join(",");
  return ["title", "summary", "url", "attachment", "publishedAt", "source", "sourceLabel", "sourceAuthority", "usageTermsStatus"].every(same)
    && tickers(old) === tickers(event);
}

function sourceAuthority(item) {
  if (item.sourceAuthority === "official") return "configured_official_feed";
  if (item.sourceAuthority === "editorial") return "configured_editorial_feed";
  if (item.source === "DISCLOSURE" || /công bố|disclosure|hose|hnx|ssc|upcom/i.test(`${item.sourceLabel} ${item.source ?? ""}`)) return "disclosure_tagged_aggregator";
  if (["VIETSTOCK", "CAFEF", "VNE", "VTV", "TTXVN"].includes(String(item.source).toUpperCase())) return "editorial_media";
  return "unverified";
}

function severityFor(eventType, title, summary) {
  const t = fold(`${title} ${summary ?? ""}`);
  const critical = /(vo no|khung hoang|thien tai|bao so|dong dat|dinh chi|huy niem yet|khoi to|bank run|loi giao dich dien rong)/.test(t);
  if (critical) return { level: "critical_watch", score: 4 };
  const high = ["SYSTEMIC_STRESS", "MONETARY_POLICY", "LEGAL", "MNA"].includes(eventType)
    || /(phat hanh|trai phieu|thanh tra|xu phat|dieu tra|lai suat|ty gia|dau tu cong)/.test(t);
  if (high) return { level: "high_attention", score: 3 };
  if (["EARNINGS", "DIVIDEND", "ISSUANCE", "CONTRACT"].includes(eventType)) return { level: "material", score: 2 };
  return { level: "monitor", score: 1 };
}

function stableEventId(item) {
  const identity = item.url || item.id || `${item.source}|${item.title}|${item.publishedAt}`;
  return `evt_${hash(identity).slice(0, 24)}`;
}

// EV1: cách gắn mã -> nhãn + độ tin (nguồn gắn sẵn > tiêu đề công bố / "HOSE: X" > mã đứng riêng > tên công ty / thương hiệu).
const ENTITY_RANK = [
  ["provider_tagged", 0.95], ["exchange_tag", 0.9], ["symbol_dictionary_match", 0.72], ["company_name_match", 0.7],
];
function entityMatchOf(tagged, entities) {
  if (tagged.length) return ENTITY_RANK[0];
  if (entities.some((e) => e.via === "disclosure_title" || e.via === "exchange_tag")) return ENTITY_RANK[1];
  if (entities.some((e) => e.via === "code")) return ENTITY_RANK[2];
  if (entities.length) return ENTITY_RANK[3];
  return ["market_wide_or_unmatched", 0.35];
}

function makeDocument(item, firstSeenAt, symbols, entityIndex = null) {
  const title = stripHtml(item.title).slice(0, 500);
  const summary = stripHtml(item.summary).slice(0, 600);
  const tagged = (item.tickers ?? []).map((value) => String(value).toUpperCase()).filter((value) => symbols.has(value));
  const entities = entityIndex
    ? resolveEntities(`${title} ${summary}`, entityIndex).filter((e) => symbols.has(e.code))
    : extractTickers(`${title} ${summary}`, symbols).map((code) => ({ code, via: "code" }));
  const tickers = [...new Set([...tagged, ...entities.map((e) => e.code)])];
  const [entityMatch, entityConfidence] = entityMatchOf(tagged, entities);
  const classification = classifyRadarEvent({ ...item, title, summary, tickers });
  const sentimentResult = sentiment(`${title}. ${summary}`);
  const severity = severityFor(classification.id, title, summary);
  const eventId = stableEventId(item);
  const authority = sourceAuthority(item);
  const contentHash = hash(JSON.stringify({
    title, summary, url: item.url ?? null, attachment: item.attachment ?? null,
    publishedAt: iso(item.publishedAt), source: item.source ?? null, sourceLabel: item.sourceLabel ?? null,
    authority, usageTermsStatus: item.usageTermsStatus ?? "review_required", eventType: classification.id,
    tickers: [...tickers].sort(),
  }));
  return {
    eventId,
    sourceId: String(item.id ?? eventId).slice(0, 500),
    source: String(item.source ?? "UNKNOWN").toUpperCase(),
    sourceLabel: String(item.sourceLabel ?? item.source ?? "Nguồn chưa rõ").slice(0, 120),
    sourceAuthority: authority,
    verificationStatus: authority === "configured_official_feed" ? "official_source_not_crosschecked"
      : authority === "disclosure_tagged_aggregator" ? "disclosure_tagged_unverified" : "unconfirmed",
    usageTermsStatus: item.usageTermsStatus ?? "review_required",
    title,
    summary,
    url: item.url ?? null,
    attachment: item.attachment ?? null,
    publishedAt: iso(item.publishedAt),
    firstSeenAt,
    effectiveAt: null,
    updatedAt: null,
    contentHash,
    eventType: classification.id,
    eventLabel: classification.label,
    tickers,
    entityMatch,
    entityConfidence,
    entities: entities.slice(0, 12),
    severity: severity.level,
    severityScore: severity.score,
    sentiment: sentimentResult.score,
    evidenceTerms: sentimentResult.hits.slice(0, 8),
    corroboratingSources: [],
    corroborationCount: 1,
    clusterId: null,
    revision: 1,
    reaction: null,
    reactionStatus: "not_calculated",
    classifierVersion: RADAR_CLASSIFIER_VERSION,
    feedSection: item.feedSection ?? null,
  };
}

function clusterDocuments(documents) {
  const sorted = [...documents].sort((a, b) => (b.severityScore - a.severityScore) || String(b.publishedAt).localeCompare(String(a.publishedAt)));
  const clusters = [];
  for (const doc of sorted) {
    const tokens = titleTokens(doc.title);
    const time = Date.parse(doc.publishedAt ?? doc.firstSeenAt);
    const match = clusters.find((candidate) => {
      const delta = Math.abs(candidate.time - time);
      const sharedEntity = candidate.doc.tickers.some((ticker) => doc.tickers.includes(ticker));
      const sameMacroType = candidate.doc.eventType === doc.eventType && !doc.tickers.length && !candidate.doc.tickers.length;
      return delta <= 72 * 60 * 60_000 && (sharedEntity || sameMacroType) && jaccard(candidate.tokens, tokens) >= 0.45;
    });
    if (!match) {
      const eventDay = new Date(time).toISOString().slice(0, 10);
      const clusterId = `clu_${hash(`${eventDay}|${doc.eventType}|${[...doc.tickers].sort().join(",")}|${[...tokens].sort().join(" ")}`).slice(0, 20)}`;
      doc.clusterId = clusterId;
      clusters.push({ doc, tokens, time, sources: new Set([doc.sourceLabel]), ids: new Set([doc.eventId]) });
      continue;
    }
    match.sources.add(doc.sourceLabel);
    match.ids.add(doc.eventId);
    match.doc.corroboratingSources = [...match.sources].filter((s) => s !== match.doc.sourceLabel).slice(0, 8);
    match.doc.corroborationCount = match.sources.size;
    match.doc.tickers = [...new Set([...match.doc.tickers, ...doc.tickers])];
    // A second report is corroboration, never a second independent event observation.
    doc.clusterId = match.doc.clusterId;
  }
  return sorted;
}

function eventRow(event) {
  return {
    event_id: event.eventId,
    cluster_id: event.clusterId,
    published_at: event.publishedAt,
    first_seen_at: event.firstSeenAt,
    source: event.source,
    source_label: event.sourceLabel,
    source_authority: event.sourceAuthority,
    verification_status: event.verificationStatus,
    event_type: event.eventType,
    severity: event.severity,
    tickers: event.tickers,
    content_hash: event.contentHash,
    revision: event.revision,
    payload: event,
    updated_at: new Date().toISOString(),
  };
}

function revisionRow(event, observedAt = event.firstSeenAt) {
  // Sequence revisions by observation order. Content hashes alone would collapse A→B→A.
  const revisionId = `${event.eventId}:${String(event.revision).padStart(8, "0")}`;
  return {
    revision_id: revisionId,
    event_id: event.eventId,
    content_hash: event.contentHash,
    observed_at: observedAt,
    payload: event,
  };
}

function collapseClusters(events) {
  const priority = { configured_official_feed: 4, disclosure_tagged_aggregator: 3, configured_editorial_feed: 2, editorial_media: 2, unverified: 1 };
  const groups = new Map();
  for (const event of events) {
    const key = event.clusterId || event.eventId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  return [...groups.values()].map((group) => {
    group.sort((a, b) => (priority[b.sourceAuthority] ?? 0) - (priority[a.sourceAuthority] ?? 0)
      || b.severityScore - a.severityScore || String(b.publishedAt).localeCompare(String(a.publishedAt)));
    const primary = group[0];
    const sourceDocuments = group.map((item) => ({
      eventId: item.eventId, source: item.source, sourceLabel: item.sourceLabel, url: item.url,
      publishedAt: item.publishedAt, verificationStatus: item.verificationStatus, usageTermsStatus: item.usageTermsStatus,
    }));
    const sources = [...new Set(sourceDocuments.map((item) => item.sourceLabel))];
    return {
      ...primary,
      tickers: [...new Set(group.flatMap((item) => item.tickers ?? []))],
      corroboratingSources: sources.filter((source) => source !== primary.sourceLabel),
      corroborationCount: sources.length,
      sourceDocuments,
      documentCount: group.length,
    };
  }).sort((a, b) => String(b.publishedAt ?? b.firstSeenAt).localeCompare(String(a.publishedAt ?? a.firstSeenAt)));
}

export function createEventRadar({ service, repository = createEventRadarRepository(), fetchImpl = globalThis.fetch, now = Date.now, enabled = String(process.env.EVENT_RADAR_ENABLED).toLowerCase() !== "false" } = {}) {
  const store = service.store;
  let timer;
  let inFlight = null;
  let starting = false;
  let lastPollAt = 0;
  let lastManualPollAt = 0;
  let latestHealth = { generatedAt: null, sources: {} };
  let legacyImportAttempted = false;

  async function importLegacyLedger() {
    if (legacyImportAttempted) return;
    if (String(process.env.EVENT_RADAR_IMPORT_FROM_MARKET_STORE).toLowerCase() !== "true") {
      legacyImportAttempted = true;
      return;
    }
    const [events, revisions, health] = await Promise.all([
      store.selectRows("market_event_radar_events", { select: "*", order: "first_seen_at.desc", limit: EVENT_RETENTION }),
      store.selectRows("market_event_radar_revisions", { select: "*", order: "observed_at.asc", limit: 100_000 }),
      store.getKv(HEALTH_KEY),
    ]);
    const result = await repository.importLegacy({ events, revisions, health: health?.value ?? null });
    legacyImportAttempted = true;
    console.info(`[event-radar] Legacy import: ${JSON.stringify(result)}`);
  }

  async function collect() {
    await importLegacyLedger();
    const securities = (await store.getSecurities())?.rows ?? [];
    const universe = await service.getUniverse().catch(() => ({ tickers: [] }));
    const liquidity = new Map((universe.tickers ?? []).map((row) => [String(row.ticker).toUpperCase(), Number(row.avgValue20 ?? 0)]));
    const securityBySymbol = new Map(securities.map((row) => [String(row.symbol ?? "").toUpperCase(), row]));
    for (const row of universe.tickers ?? []) {
      const symbol = String(row.ticker ?? "").toUpperCase();
      if (symbol && !securityBySymbol.has(symbol)) securityBySymbol.set(symbol, { symbol, name: row.name, sector: row.sector, avgValue20: row.avgValue20 });
    }
    const allSecurities = [...securityBySymbol.values()];
    const symbols = new Set(allSecurities.map((row) => String(row.symbol ?? "").toUpperCase()).filter(Boolean));
    const hasLiquidityRank = [...liquidity.values()].some((value) => value > 0);
    const active = allSecurities.slice().sort((a, b) =>
      (liquidity.get(String(b.symbol).toUpperCase()) ?? 0) - (liquidity.get(String(a.symbol).toUpperCase()) ?? 0)
      || String(a.symbol).localeCompare(String(b.symbol))).slice(0, DISCLOSURE_SYMBOL_LIMIT);
    const customFeeds = String(process.env.EVENT_RADAR_RSS_FEEDS ?? "").split(";").map((entry) => {
      const [id, label, rawUrl, authority = "editorial", terms = "review_required"] = entry.split("|").map((part) => part.trim());
      if (!id || !label || !rawUrl || !["official", "editorial"].includes(authority) || !["review_required", "approved"].includes(terms)) return null;
      try {
        const url = new URL(rawUrl);
        if (url.protocol !== "https:") return null;
        return { id: `CUSTOM_${id.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`, label, url: url.toString(), authority, usageTermsStatus: terms };
      } catch { return null; }
    }).filter(Boolean).slice(0, 20);
    const rssPromise = fetchRssFeeds({ fetchImpl, feeds: [...RADAR_FEEDS, ...customFeeds] });
    const disclosurePromise = active.length
      ? fetchVndirectNews(active.map((row) => String(row.symbol).toUpperCase()), { fetchImpl, days: 3 })
          .then((items) => ({ items, error: null }))
          .catch((error) => ({ items: [], error: error.message }))
      : Promise.resolve({ items: [], error: "Chưa có danh mục chứng khoán để lấy công bố gắn mã." });
    const [rssResult, disclosureResult] = await Promise.all([rssPromise, disclosurePromise]);
    const firstSeenAt = new Date(now()).toISOString();
    const raw = [...rssResult.items, ...disclosureResult.items];
    const names = stockNameIndexFor(store, { fetchImpl, now });
    const entityIndex = await names.index(symbols).catch(() => null);
    const documents = raw.map((item) => makeDocument(item, firstSeenAt, symbols, entityIndex));
    const dedupedById = new Map();
    for (const doc of documents) {
      const prior = dedupedById.get(doc.eventId);
      if (!prior || doc.contentHash !== prior.contentHash) dedupedById.set(doc.eventId, doc);
    }
    const clustered = clusterDocuments([...dedupedById.values()]);
    const allFeeds = [...RADAR_FEEDS, ...customFeeds];
    const rssSources = Object.fromEntries(allFeeds.map((feed, index) => {
      const sourceKey = `${feed.id}_${index + 1}`;
      return [sourceKey, { ...rssResult.status[feed.url], label: feed.label, url: feed.url, usageTermsStatus: feed.usageTermsStatus ?? "review_required" }];
    }));
    const sources = { ...rssSources, VNDIRECT_DISCLOSURES: {
      ok: !disclosureResult.error,
      items: disclosureResult.items.length,
      error: disclosureResult.error,
      coverage: { symbolsRequested: active.length, universeSize: allSecurities.length, capped: allSecurities.length > active.length, selectionBasis: hasLiquidityRank ? "avgValue20_then_symbol" : "symbol", entityNames: names.meta() },
    } };
    latestHealth = { generatedAt: firstSeenAt, sources };
    await repository.setHealth(latestHealth);

    if (clustered.length) {
      const existing = await repository.listEvents({ ids: clustered.map((event) => event.eventId), limit: EVENT_RETENTION });
      const byId = new Map(existing.map((row) => [row.event_id, row]));
      const upserts = [];
      const revisions = [];
      for (const event of clustered) {
        const old = byId.get(event.eventId);
        if (old?.content_hash === event.contentHash) {
          // Keep original first-seen timestamp and revision for unchanged documents.
          event.firstSeenAt = old.payload?.firstSeenAt ?? event.firstSeenAt;
          event.revision = Number(old.revision) || 1;
        } else if (onlyClassificationChanged(old.payload, event)) {
          // Đổi quy tắc phân loại (RADAR_CLASSIFIER_VERSION) không phải bản sửa của nguồn: giữ phiên bản + trạng thái xác minh.
          event.firstSeenAt = old.payload?.firstSeenAt ?? event.firstSeenAt;
          event.revision = Number(old.revision) || 1;
          event.verificationStatus = old.payload?.verificationStatus ?? event.verificationStatus;
          event.updatedAt = old.payload?.updatedAt ?? null;
        } else if (old) {
          event.firstSeenAt = old.payload?.firstSeenAt ?? event.firstSeenAt;
          event.revision = (Number(old.revision) || 1) + 1;
          event.updatedAt = firstSeenAt;
          event.verificationStatus = "updated_needs_review";
        }
        upserts.push(eventRow(event));
        revisions.push(revisionRow(event, firstSeenAt));
      }
      await repository.saveBatch({ events: upserts, revisions, retain: EVENT_RETENTION });
    }
    lastPollAt = now();
    return { ingested: clustered.length, sources };
  }

  async function poll({ force = false } = {}) {
    if (!enabled) return { disabled: true };
    if (inFlight) return inFlight;
    if (!force && now() - lastPollAt < POLL_MS) return { skipped: true, lastPollAt: new Date(lastPollAt).toISOString() };
    inFlight = collect().finally(() => { inFlight = null; });
    return inFlight;
  }

  async function refreshNow() {
    const cooldownMs = 60_000;
    const remainingMs = cooldownMs - (now() - lastManualPollAt);
    if (remainingMs > 0) {
      const error = new Error(`Radar vừa được yêu cầu cập nhật; thử lại sau ${Math.ceil(remainingMs / 1000)} giây.`);
      error.statusCode = 429;
      throw error;
    }
    lastManualPollAt = now();
    return poll({ force: true });
  }

  async function list({ ticker = null, status = null, category = null, limit = 100 } = {}) {
    // Reads never wait for external feeds. The scheduler owns collection; the
    // explicit authenticated refresh action can request an immediate poll.
    const [rows, storedHealth] = await Promise.all([
      repository.listEvents({ limit: EVENT_RETENTION }),
      repository.getHealth(),
    ]);
    const wanted = ticker ? String(ticker).toUpperCase() : null;
    const matching = rows.map((row) => row.payload).filter(Boolean).map(withCurrentClassification).filter((event) =>
      (!wanted || event.tickers?.includes(wanted))
      && (!status || event.verificationStatus === status)
      && (!category || event.eventType === category));
    const events = collapseClusters(matching).slice(0, Math.min(250, Math.max(1, limit)));
    return {
      generatedAt: storedHealth?.generatedAt ?? latestHealth.generatedAt,
      events,
      sources: storedHealth?.sources ?? latestHealth.sources,
      meta: {
        storage: repository.storageInfo,
        disclosureCoverage: `Công bố gắn mã: tối đa ${DISCLOSURE_SYMBOL_LIMIT} mã; ưu tiên thanh khoản khi có dữ liệu xếp hạng. Không bao phủ toàn bộ công bố không gắn mã.`,
        pollIntervalMs: POLL_MS,
        disclaimer: "Radar hỗ trợ theo dõi và nghiên cứu. Mức độ sự kiện không phải dự báo lợi suất hoặc khuyến nghị giao dịch.",
      },
    };
  }

  async function getEvent(eventId, revisionPage = {}) {
    const row = await repository.getEvent(eventId);
    if (!row) return null;
    const revisionResult = await repository.listRevisions(eventId, revisionPage);
    return {
      event: row.payload ? withCurrentClassification(row.payload) : row.payload,
      revisions: revisionResult.rows.map((revision) => revision.payload),
      revisionPage: { hasMore: revisionResult.hasMore, nextBefore: revisionResult.nextBefore },
    };
  }

  async function start() {
    if (!enabled || timer || starting) return;
    if (!repository.storageInfo.configuredPath) {
      console.warn("[event-radar] EVENT_RADAR_DATA_DIR is unset; the local ledger may not survive container replacement. Mount a persistent volume and set this path.");
    }
    starting = true;
    await poll().catch((error) => console.warn(`[event-radar] Poll lỗi: ${error.message}`));
    starting = false;
    if (timer) return;
    timer = setInterval(() => { void poll().catch((error) => console.warn(`[event-radar] Poll lỗi: ${error.message}`)); }, POLL_MS);
    timer.unref?.();
  }

  return { poll, refreshNow, list, getEvent, start, stop: () => { clearInterval(timer); timer = undefined; }, status: () => ({ enabled, lastPollAt: lastPollAt ? new Date(lastPollAt).toISOString() : null, intervalMs: POLL_MS, running: Boolean(inFlight) }) };
}

