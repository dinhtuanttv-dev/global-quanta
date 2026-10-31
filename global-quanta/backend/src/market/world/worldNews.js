// Tin kinh tế thế giới (U1, 31/10/2026). Chỉ lấy tiêu đề và đường dẫn từ nguồn có danh tính; không viết lại nội dung.
// Xác thực: đường dẫn phải thuộc đúng tên miền của nguồn, có ngày đăng hợp lệ. Mức xác nhận:
//   official = cơ quan công bố trực tiếp; corroborated = từ 2 nhà xuất bản độc lập trở lên cùng đưa; single = mới một nguồn báo chí.
// Mỗi tin giữ 2 mốc: publishedAt (nguồn ghi) và firstSeenAt (hệ thống thấy lần đầu). Chủ đề chỉ là gắn nhãn theo từ khoá, không kết luận tác động.

const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)", accept: "application/rss+xml, application/xml, text/xml" };
export const NEWS_KV_KEY = "world:news:v1";
export const REFRESH_MS = 5 * 60_000;
export const KEEP_DAYS = 7;
const MAX_ITEMS = 400;
const FUTURE_SKEW_MS = 10 * 60_000;
const DAY = 86_400_000;

export const TOPICS = {
  rates: "Lãi suất & ngân hàng trung ương",
  usd: "Đồng USD",
  energy: "Dầu & năng lượng",
  china: "Trung Quốc",
  trade: "Thương mại & thuế quan",
  chips: "Bán dẫn",
  growth: "Tăng trưởng & lạm phát",
  metals: "Kim loại",
  em: "Thị trường mới nổi & châu Á",
};
const TOPIC_RULES = [
  ["rates", /\b(fed|fomc|federal reserve|central banks?|interest rates?|rate (?:cut|hike)s?|treasury yields?|bond yields?|ecb|bank of japan|boj|bank of england|powell|lagarde)\b/i],
  ["usd", /\b(dollar|greenback|dxy|forex)\b/i],
  ["energy", /\b(oil|brent|wti|crude|opec|tankers?|hormuz|lng|natural gas|gasoline|refiner(?:y|ies))\b/i],
  ["china", /\b(china|chinese|beijing|yuan|pboc|renminbi)\b/i],
  ["trade", /\b(tariffs?|trade war|trade deal|wto|export controls?|sanctions?|customs dut(?:y|ies))\b/i],
  ["chips", /\b(semiconductors?|chips?|chipmakers?|nvidia|tsmc)\b/i],
  ["growth", /\b(gdp|inflation|cpi|pce|pmi|payrolls?|jobless|unemployment|recession|consumer spending|retail sales)\b/i],
  ["metals", /\b(steel|iron ore|copper|aluminium|aluminum|nickel)\b/i],
  ["em", /\b(emerging markets?|vietnam|asean|southeast asia)\b/i],
];
const NOISE = /\b(sports?|celebrity|recipe|horoscope|crypto hack)\b/i;

export const WORLD_FEEDS = [
  { id: "FED", label: "Cục Dự trữ Liên bang Mỹ", url: "https://www.federalreserve.gov/feeds/press_monetary.xml", hosts: ["federalreserve.gov"], authority: "official", topic: "rates" },
  { id: "ECB", label: "Ngân hàng Trung ương châu Âu", url: "https://www.ecb.europa.eu/rss/press.html", hosts: ["ecb.europa.eu"], authority: "official", topic: "rates" },
  { id: "BOJ", label: "Ngân hàng Trung ương Nhật Bản", url: "https://www.boj.or.jp/en/rss/whatsnew.xml", hosts: ["boj.or.jp"], authority: "official", topic: "rates" },
  { id: "BOE", label: "Ngân hàng Trung ương Anh", url: "https://www.bankofengland.co.uk/rss/news", hosts: ["bankofengland.co.uk"], authority: "official", topic: "rates" },
  { id: "EIA", label: "Cơ quan Thông tin Năng lượng Mỹ", url: "https://www.eia.gov/rss/todayinenergy.xml", hosts: ["eia.gov"], authority: "official", topic: "energy" },
  { id: "BEA", label: "Cục Phân tích Kinh tế Mỹ", url: "https://apps.bea.gov/rss/rss.xml", hosts: ["bea.gov"], authority: "official", topic: "growth" },
  { id: "WTO", label: "Tổ chức Thương mại Thế giới", url: "https://www.wto.org/library/rss/latest_news_e.xml", hosts: ["wto.org"], authority: "official", topic: "trade" },
  { id: "USTR", label: "Đại diện Thương mại Mỹ", url: "https://ustr.gov/rss.xml", hosts: ["ustr.gov"], authority: "official", topic: "trade" },
  { id: "WSJ", label: "Wall Street Journal", url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain", hosts: ["wsj.com"], authority: "press" },
  { id: "MW", label: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", hosts: ["marketwatch.com"], authority: "press" },
  { id: "CNBC", label: "CNBC · Kinh tế", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", hosts: ["cnbc.com"], authority: "press" },
  { id: "CNBC", label: "CNBC · Năng lượng", url: "https://www.cnbc.com/id/19836768/device/rss/rss.html", hosts: ["cnbc.com"], authority: "press" },
  { id: "FT", label: "Financial Times", url: "https://www.ft.com/rss/home", hosts: ["ft.com"], authority: "press" },
  { id: "BBC", label: "BBC · Kinh doanh", url: "https://feeds.bbci.co.uk/news/business/rss.xml", hosts: ["bbc.co.uk", "bbc.com"], authority: "press" },
  { id: "GUARDIAN", label: "The Guardian · Kinh doanh", url: "https://www.theguardian.com/uk/business/rss", hosts: ["theguardian.com"], authority: "press" },
  { id: "SCMP", label: "South China Morning Post · Kinh tế", url: "https://www.scmp.com/rss/318421/feed", hosts: ["scmp.com"], authority: "press" },
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export function cleanText(raw) {
  return String(raw ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** Đường dẫn chỉ hợp lệ khi là http(s) và thuộc đúng tên miền của nguồn. */
export function hostAllowed(url, hosts) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const h = u.hostname.toLowerCase();
    return hosts.some((d) => h === d || h.endsWith(`.${d}`));
  } catch { return false; }
}

export function topicsOf(title, feed) {
  const found = TOPIC_RULES.filter(([, re]) => re.test(title)).map(([k]) => k);
  if (feed.topic && !found.includes(feed.topic)) found.push(feed.topic);
  return found;
}

/** XML của một nguồn -> tin hợp lệ. Bỏ tin không có đường dẫn đúng miền, không có ngày, ngày tương lai, hoặc không thuộc chủ đề nào. */
export function parseFeed(xml, feed, nowMs) {
  const out = [];
  for (const block of String(xml).split(/<item[\s>]/).slice(1)) {
    const pick = (tag) => cleanText(block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
    const title = pick("title");
    const url = pick("link") || pick("guid");
    const ms = Date.parse(pick("pubDate") || pick("dc:date"));
    if (!title || !hostAllowed(url, feed.hosts) || !Number.isFinite(ms) || ms > nowMs + FUTURE_SKEW_MS) continue;
    if (NOISE.test(title)) continue;
    const topics = topicsOf(title, feed);
    if (!topics.length) continue;
    out.push({ url, title, source: feed.id, sourceLabel: feed.label, authority: feed.authority, publishedAt: new Date(ms).toISOString(), topics });
  }
  return out;
}

const STOP = new Set("the a an of to in on for and or as at by with from is are was be its it this that after over amid says said new will has have how why what than into".split(" "));
export function tokensOf(title) {
  return new Set(title.toLowerCase().replace(/[^a-z0-9% ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
}

/**
 * Gộp theo URL, giữ firstSeenAt cũ, rồi gom các nhà xuất bản khác nhau cùng đưa một chuyện trong 48 giờ (Jaccard tiêu đề ≥ 0,5).
 * Chỉ tính khác nhà xuất bản (hai trang WSJ và MarketWatch thuộc cùng nhóm Dow Jones tính là một).
 */
const OWNER = { WSJ: "DOWJONES", MW: "DOWJONES" };
export function mergeNews(prev, fresh, nowMs) {
  const byUrl = new Map(prev.map((x) => [x.url, x]));
  for (const f of fresh) {
    const old = byUrl.get(f.url);
    byUrl.set(f.url, { ...f, firstSeenAt: old?.firstSeenAt ?? new Date(nowMs).toISOString() });
  }
  const items = [...byUrl.values()]
    .filter((x) => nowMs - Date.parse(x.publishedAt) <= KEEP_DAYS * DAY)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_ITEMS);
  const toks = items.map((x) => tokensOf(x.title));
  return items.map((x, i) => {
    const owner = OWNER[x.source] ?? x.source;
    const also = new Map();
    items.forEach((y, j) => {
      if (i === j) return;
      const o = OWNER[y.source] ?? y.source;
      if (o === owner || also.has(o)) return;
      if (Math.abs(Date.parse(x.publishedAt) - Date.parse(y.publishedAt)) > 2 * DAY) return;
      if (jaccard(toks[i], toks[j]) >= 0.5) also.set(o, { source: y.source, sourceLabel: y.sourceLabel, url: y.url });
    });
    const corroborating = [...also.values()];
    return { ...x, corroborating, verification: x.authority === "official" ? "official" : corroborating.length ? "corroborated" : "single" };
  });
}

export function createWorldNews({ store = null, fetchImpl = globalThis.fetch, feeds = WORLD_FEEDS, now = Date.now, log = console } = {}) {
  let state = null, inflight = null, loaded = false;
  async function load() {
    if (loaded) return;
    loaded = true;
    try { state = (await store?.getKv?.(NEWS_KV_KEY))?.value ?? null; } catch (e) { log.warn?.(`[world-news] đọc kho: ${e.message}`); }
  }
  async function refresh() {
    const t = now();
    const status = {};
    const fresh = [];
    await Promise.all(feeds.map(async (feed) => {
      const key = feed.label;
      try {
        const r = await fetchImpl(feed.url, { headers: UA, signal: AbortSignal.timeout(15_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const items = parseFeed(await r.text(), feed, t);
        fresh.push(...items);
        const newest = items.reduce((m, x) => Math.max(m, Date.parse(x.publishedAt)), 0);
        status[key] = { id: feed.id, label: feed.label, authority: feed.authority, ok: true, items: items.length, newestAt: newest ? new Date(newest).toISOString() : null, checkedAt: new Date(t).toISOString() };
      } catch (e) {
        const was = state?.sources?.[key];
        status[key] = { id: feed.id, label: feed.label, authority: feed.authority, ok: false, error: String(e.message).slice(0, 120), items: was?.items ?? 0, newestAt: was?.newestAt ?? null, checkedAt: new Date(t).toISOString(), lastOkAt: was?.ok ? was.checkedAt : was?.lastOkAt ?? null };
      }
    }));
    const items = mergeNews(state?.items ?? [], fresh, t);
    state = { refreshedAt: new Date(t).toISOString(), items, sources: status };
    try { await store?.setKv?.(NEWS_KV_KEY, state); } catch (e) { log.warn?.(`[world-news] ghi kho: ${e.message}`); }
    return state;
  }
  const refreshOnce = () => (inflight ??= refresh().catch((e) => { log.warn?.(`[world-news] ${e.message}`); return state; }).finally(() => { inflight = null; }));
  return {
    refreshOnce,
    /** Có bản lưu thì trả ngay và làm mới nền khi đã quá hạn; lần đầu mới phải chờ. */
    async get({ topic = null, limit = 60 } = {}) {
      await load();
      const age = state?.refreshedAt ? now() - Date.parse(state.refreshedAt) : Infinity;
      if (!state) await refreshOnce();
      else if (age >= REFRESH_MS) void refreshOnce();
      const all = state?.items ?? [];
      const items = (topic ? all.filter((x) => x.topics.includes(topic)) : all).slice(0, limit);
      const sources = Object.values(state?.sources ?? {});
      return {
        refreshedAt: state?.refreshedAt ?? null, items, total: all.length, topics: TOPICS, sources,
        counts: { official: all.filter((x) => x.verification === "official").length, corroborated: all.filter((x) => x.verification === "corroborated").length, single: all.filter((x) => x.verification === "single").length },
        noteVi: "Tiêu đề giữ nguyên ngôn ngữ gốc của nguồn. Chủ đề gắn theo từ khoá, không kết luận tác động.",
      };
    },
    startTimer() {
      const h = setInterval(() => { void refreshOnce(); }, REFRESH_MS);
      h.unref?.();
      return h;
    },
  };
}
