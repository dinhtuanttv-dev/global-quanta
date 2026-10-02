// Tin tức thông minh cho danh mục: gom tin THẬT từ nhiều nguồn, gắn mã, khử trùng lặp, phân loại sự kiện,
// chấm cảm xúc, đo phản ứng giá so với VN-Index và xếp hạng mức quan trọng.
//
// Nguồn:
//   - VNDirect finfo (api-finfo.vndirect.com.vn/v4/news): công bố thông tin chính thức (HOSE/HNX/UPCOM)
//     và tin doanh nghiệp, đã gắn mã sẵn — nguồn chính, truy vấn theo đúng các mã trong danh mục.
//   - RSS Vietstock (Cổ phiếu, Doanh nghiệp) và CafeF (Thị trường chứng khoán, Doanh nghiệp): tin báo chí,
//     gắn mã bằng nhận diện "(HOSE: XXX)" / mã niêm yết trong tiêu đề + tóm tắt.
// Mỗi nguồn lỗi độc lập (trả về rỗng + ghi trạng thái), không làm hỏng cả bảng tin.

import { canonicalSymbol, isValidSymbol, isIndexSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { addDays, mapLimit } from "../util.js";
import { classifyEvent, extractTickers, jaccard, sentiment, stripHtml, titleTokens } from "./newsNlp.js";

export const MAX_NEWS_TICKERS = 60;
const UA = "Mozilla/5.0 (compatible; GlobalQuanta/1.0)";
export const RSS_FEEDS = [
  { id: "VIETSTOCK", label: "Vietstock", url: "https://vietstock.vn/830/chung-khoan/co-phieu.rss" },
  { id: "VIETSTOCK", label: "Vietstock", url: "https://vietstock.vn/737/doanh-nghiep/hoat-dong-kinh-doanh.rss" },
  { id: "CAFEF", label: "CafeF", url: "https://cafef.vn/thi-truong-chung-khoan.rss" },
  { id: "CAFEF", label: "CafeF", url: "https://cafef.vn/doanh-nghiep.rss" },
];
// Độ tin cậy nguồn: công bố chính thức > báo chuyên ngành.
const SOURCE_WEIGHT = { DISCLOSURE: 1.0, VNDIRECT_NEWS: 0.8, VIETSTOCK: 0.75, CAFEF: 0.7 };
const HALF_LIFE_DAYS = 3;

export function parseTickers(raw) {
  const list = [...new Set((Array.isArray(raw) ? raw : String(raw ?? "").split(/[\s,;]+/)).map(canonicalSymbol).filter(Boolean))];
  if (!list.length) throw new ValidationError("Cần ít nhất 1 mã.");
  if (list.length > MAX_NEWS_TICKERS) throw new ValidationError(`Tối đa ${MAX_NEWS_TICKERS} mã.`);
  const bad = list.filter((t) => !isValidSymbol(t) || isIndexSymbol(t));
  if (bad.length) throw new ValidationError(`Mã không hợp lệ: ${bad.join(", ")}`);
  return list;
}

/** "2026-10-01 16:16:19" (giờ VN) / RFC-822 -> ISO có múi giờ. */
export function toIso(dateLike) {
  if (!dateLike) return null;
  const s = String(dateLike).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
  if (m) return `${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}+07:00`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function fetchVndirectNews(tickers, { fetchImpl = globalThis.fetch, days = 30, now = Date.now } = {}) {
  const since = new Date(now() - days * 86_400_000).toISOString().slice(0, 10);
  const chunks = [];
  for (let i = 0; i < tickers.length; i += 15) chunks.push(tickers.slice(i, i + 15));
  const out = [];
  await mapLimit(chunks, 3, async (chunk) => {
    const url = `https://api-finfo.vndirect.com.vn/v4/news?q=tagCodes:${chunk.join(",")}~newsDate:gte:${since}~locale:VN&size=${Math.min(100, chunk.length * 8)}&sort=newsDate:desc`;
    const res = await fetchImpl(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`VNDirect HTTP ${res.status}`);
    const json = await res.json();
    for (const n of json?.data ?? []) {
      const official = /disclosure/.test(n.newsGroup ?? "") || ["HOSE", "HNX", "UPCOM", "SSC"].includes(String(n.newsSource ?? "").toUpperCase());
      out.push({
        id: `vnd-${n.newsId}`,
        title: stripHtml(n.newsTitle),
        summary: stripHtml(n.newsAbstract || n.newsContent).slice(0, 400),
        url: n.newsUrl || (n.attachments?.[0]?.url ?? null) || n.dstockUrl || null,
        attachment: n.attachments?.[0]?.url ?? null,
        publishedAt: toIso(n.newsDate),
        source: official ? "DISCLOSURE" : "VNDIRECT_NEWS",
        sourceLabel: official ? `Công bố ${n.newsSource ?? ""}`.trim() : (n.newsSource ? String(n.newsSource) : "VNDirect"),
        tickers: String(n.tagCodes ?? "").split(",").map((t) => t.trim()).filter(Boolean),
      });
    }
  });
  return out;
}

export function parseRss(xml, feed) {
  const items = [];
  for (const block of String(xml).split(/<item[\s>]/).slice(1)) {
    const pick = (tag) => block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "";
    const title = stripHtml(pick("title"));
    if (!title) continue;
    const link = stripHtml(pick("link")) || stripHtml(pick("guid"));
    items.push({
      id: `${feed.id.toLowerCase()}-${link || title}`,
      title,
      summary: stripHtml(pick("description")).slice(0, 400),
      url: link || null,
      attachment: null,
      publishedAt: toIso(stripHtml(pick("pubDate"))),
      source: feed.id,
      sourceLabel: feed.label,
      tickers: [],
    });
  }
  return items;
}

export async function fetchRssFeeds({ fetchImpl = globalThis.fetch, feeds = RSS_FEEDS } = {}) {
  const status = {};
  const all = [];
  await mapLimit(feeds, 4, async (feed) => {
    try {
      const res = await fetchImpl(feed.url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(15_000), redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = parseRss(await res.text(), feed);
      all.push(...items);
      status[feed.url] = { ok: true, items: items.length };
    } catch (error) {
      status[feed.url] = { ok: false, error: error.message };
    }
  });
  return { items: all, status };
}

/**
 * Gắn mã, khử trùng lặp (cùng mã + tiêu đề Jaccard ≥ 0,6 trong 3 ngày → gộp, đếm số nguồn xác nhận),
 * phân loại, chấm cảm xúc. Chỉ giữ tin có mã thuộc `wanted`.
 */
export function enrichAndDedupe(raw, { wanted, symbols }) {
  const items = [];
  for (const r of raw) {
    const text = `${r.title}. ${r.summary ?? ""}`;
    const found = r.tickers.length ? r.tickers : extractTickers(text, symbols);
    const tickers = found.filter((t) => wanted.has(t));
    if (!tickers.length) continue;
    // Loại sự kiện theo TIÊU ĐỀ trước; tiêu đề không rõ mới xét tóm tắt (tránh từ khoá lẻ trong thân bài).
    const byTitle = classifyEvent(r.title);
    const ev = byTitle.id !== "OTHER" ? byTitle : classifyEvent(r.summary ?? "");
    const sent = sentiment(r.title);
    const sentBody = r.summary ? sentiment(r.summary) : { score: 0, hits: [] };
    items.push({
      ...r, tickers,
      // Tiêu đề nặng hơn tóm tắt; tiêu đề nhắc mã -> liên quan trực tiếp.
      direct: tickers.some((t) => r.title.includes(t)) || r.source === "DISCLOSURE" || r.source === "VNDIRECT_NEWS",
      eventType: ev.id, eventLabel: ev.label, eventWeight: ev.weight,
      sentiment: Math.max(-1, Math.min(1, sent.score * 0.75 + sentBody.score * 0.25)),
      sentimentHits: [...new Set([...sent.hits, ...sentBody.hits])].slice(0, 6),
      tokens: titleTokens(r.title),
    });
  }
  items.sort((a, b) => (SOURCE_WEIGHT[b.source] ?? 0) - (SOURCE_WEIGHT[a.source] ?? 0));
  const kept = [];
  for (const it of items) {
    const t = Date.parse(it.publishedAt ?? 0);
    const dup = kept.find((k) => k.tickers.some((x) => it.tickers.includes(x))
      && Math.abs(Date.parse(k.publishedAt ?? 0) - t) < 3 * 86_400_000
      && jaccard(k.tokens, it.tokens) >= 0.6);
    if (dup) {
      dup.corroboration += 1;
      dup.alsoIn.push(it.sourceLabel);
      dup.tickers = [...new Set([...dup.tickers, ...it.tickers])];
      continue;
    }
    kept.push({ ...it, corroboration: 1, alsoIn: [] });
  }
  return kept.map(({ tokens, ...rest }) => rest);
}

/**
 * Phản ứng giá sau tin: lợi suất mã từ phiên đóng cửa TRƯỚC tin tới phiên mới nhất, trừ VN-Index cùng kỳ;
 * KL phiên công bố so với trung bình 20 phiên trước.
 * @param {Map<string, {date, close, closeAdj, volume}[]>} daily
 * @param {Map<string, number>} indexClose
 */
export function priceReaction(item, ticker, daily, indexClose) {
  const rows = daily.get(ticker);
  if (!rows?.length || !item.publishedAt) return null;
  const pub = new Date(item.publishedAt);
  const vn = new Date(pub.getTime() + 7 * 3_600_000);
  const day = vn.toISOString().slice(0, 10);
  const afterClose = vn.getUTCHours() * 60 + vn.getUTCMinutes() >= 15 * 60;
  // Phiên "trước tin": tin sau 15h -> chính phiên đó; trong / trước giờ giao dịch -> phiên liền trước.
  let iBase = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date < day || (afterClose && rows[i].date === day)) { iBase = i; break; }
  }
  if (iBase < 0 || iBase === rows.length - 1) return { sessions: 0, ret: null, excess: null, volumeRatio: null };
  const base = rows[iBase], last = rows.at(-1);
  const ret = (last.closeAdj ?? last.close) / (base.closeAdj ?? base.close) - 1;
  const ib = indexClose.get(base.date), il = indexClose.get(last.date);
  const excess = ib && il ? ret - (il / ib - 1) : null;
  const react = rows[iBase + 1];
  const prior = rows.slice(Math.max(0, iBase - 19), iBase + 1).map((r) => r.volume || 0).filter((v) => v > 0);
  const avg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : null;
  return {
    sessions: rows.length - 1 - iBase,
    ret: round(ret, 4), excess: excess === null ? null : round(excess, 4),
    volumeRatio: avg && react?.volume ? round(react.volume / avg, 2) : null,
    from: base.date, to: last.date,
  };
}

/** Mức quan trọng 0–100: loại sự kiện × độ tin cậy nguồn × độ mới (bán rã 3 ngày) × cường độ cảm xúc × xác nhận chéo × phản ứng KL. */
export function importance(item, nowMs, reaction) {
  const ageDays = item.publishedAt ? Math.max(0, (nowMs - Date.parse(item.publishedAt)) / 86_400_000) : 7;
  const recency = 0.5 ** (ageDays / HALF_LIFE_DAYS);
  const src = SOURCE_WEIGHT[item.source] ?? 0.6;
  const sent = 0.7 + 0.3 * Math.abs(item.sentiment);
  const corr = 1 + 0.15 * Math.min(3, item.corroboration - 1);
  const vol = reaction?.volumeRatio ? Math.min(1.3, 1 + Math.max(0, reaction.volumeRatio - 1.5) * 0.15) : 1;
  const direct = item.direct ? 1 : 0.7;
  return Math.round(100 * Math.min(1, item.eventWeight * src * recency * sent * corr * vol * direct * 1.25));
}

/** Nhận định ngắn, có căn cứ: tin tốt/xấu đã/chưa phản ánh vào giá. */
export function insightOf(item, reaction) {
  if (!reaction || reaction.excess === null) return null;
  const s = item.sentiment, x = reaction.excess;
  const pct = `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
  if (s >= 0.25 && x <= 0.005) return { tone: "watch", text: `Tin tích cực nhưng giá chưa phản ánh (${pct} so VN-Index)` };
  if (s <= -0.25 && x >= -0.005) return { tone: "watch", text: `Tin tiêu cực nhưng giá chưa phản ứng (${pct} so VN-Index)` };
  if (s >= 0.25) return { tone: "up", text: `Giá đã phản ánh ${pct} so VN-Index` };
  if (s <= -0.25) return { tone: "down", text: `Giá đã phản ánh ${pct} so VN-Index` };
  return Math.abs(x) >= 0.03 ? { tone: x > 0 ? "up" : "down", text: `Giá biến động ${pct} so VN-Index sau tin` } : null;
}

/**
 * @param {{ store, cache }} service
 */
export async function getNewsForTickers(service, rawTickers, { days = 14, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const tickers = parseTickers(rawTickers);
  const store = service.store;
  const wanted = new Set(tickers);
  const symbols = new Set(((await store.getSecurities())?.rows ?? []).map((r) => r.symbol));

  const sourceStatus = {};
  const [vnd, rss] = await Promise.all([
    service.cache.wrap(`news:vnd:${[...tickers].sort().join(",")}:${days}`, 5 * 60_000, () => fetchVndirectNews(tickers, { fetchImpl, days, now }))
      .then((items) => { sourceStatus.VNDIRECT = { ok: true, items: items.length }; return items; })
      .catch((e) => { sourceStatus.VNDIRECT = { ok: false, error: e.message }; return []; }),
    service.cache.wrap("news:rss", 5 * 60_000, () => fetchRssFeeds({ fetchImpl })),
  ]);
  Object.assign(sourceStatus, rss.status);

  const cutoff = now() - days * 86_400_000;
  const raw = [...vnd, ...rss.items].filter((r) => !r.publishedAt || Date.parse(r.publishedAt) >= cutoff);
  const items = enrichAndDedupe(raw, { wanted, symbols });

  // Phản ứng giá: dữ liệu ngày SSI đã lưu + VN-Index (bảng trạng thái thị trường).
  const dates = await store.getMarketDailyDates();
  const from = addDays(new Date(cutoff).toISOString().slice(0, 10), -40);
  const involved = [...new Set(items.flatMap((i) => i.tickers))];
  const daily = new Map();
  if (involved.length && dates.length) {
    for (const r of await store.getMarketDailyRange({ from, to: dates.at(-1), symbols: involved })) {
      if (!daily.has(r.symbol)) daily.set(r.symbol, []);
      daily.get(r.symbol).push(r);
    }
  }
  let indexClose = new Map();
  try {
    const rows = typeof store.selectRows === "function" ? await store.selectRows("market_regime_daily", { gte: { trading_date: from }, select: "trading_date,close" }) : [];
    indexClose = new Map(rows.map((r) => [r.trading_date, Number(r.close)]));
  } catch { /* bỏ qua: không có VN-Index thì không tính phần vượt */ }

  const nowMs = now();
  const out = items.map((it) => {
    const primary = it.tickers[0];
    const reaction = priceReaction(it, primary, daily, indexClose);
    return {
      id: it.id, title: it.title, summary: it.summary, url: it.url, attachment: it.attachment,
      publishedAt: it.publishedAt, source: it.source, sourceLabel: it.sourceLabel, alsoIn: it.alsoIn, corroboration: it.corroboration,
      tickers: it.tickers, eventType: it.eventType, eventLabel: it.eventLabel,
      sentiment: round(it.sentiment, 2), sentimentHits: it.sentimentHits,
      reaction, insight: insightOf(it, reaction), importance: importance(it, nowMs, reaction),
    };
  }).sort((a, b) => b.importance - a.importance || String(b.publishedAt).localeCompare(String(a.publishedAt)));

  const perTicker = {};
  for (const it of out) for (const t of it.tickers) {
    const p = (perTicker[t] ??= { count: 0, sentimentSum: 0, top: null });
    p.count++; p.sentimentSum += it.sentiment;
    if (!p.top) p.top = it.id;
  }
  for (const p of Object.values(perTicker)) { p.avgSentiment = round(p.sentimentSum / p.count, 2); delete p.sentimentSum; }

  return { generatedAt: new Date(nowMs).toISOString(), days, tickers, items: out.slice(0, 120), perTicker, sources: sourceStatus };
}

function round(v, d) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
