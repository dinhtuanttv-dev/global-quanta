// Đồng thuận CTCK (31/10/2026). Toàn bộ do code tính từ nhận định đã kiểm chứng, AI không chấm điểm.
//   Điểm đồng thuận C = Σ wᵢsᵢ / Σ wᵢ, s ∈ {−1, 0, +1}, w = 2^(−tuổi/30 ngày), mỗi CTCK chỉ lấy báo cáo mới nhất có quan điểm.
//   Bất đồng H = entropy Shannon của phân bố trọng số 3 nhóm, chia ln 3 (0 = cùng ý, 1 = chia đều).
//   Số nguồn hiệu dụng Nₑ = (Σw)² / Σw².
export const HALF_LIFE_DAYS = 30;
export const WINDOW_DAYS = 120;
export const LEDGER_HORIZON = 20;
export const LEDGER_MIN_N = 12;
const DAY = 86_400_000;
const SCORE = { positive: 1, neutral: 0, negative: -1 };
const r = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d + 0);
const quantile = (xs, q) => { const a = [...xs].sort((x, y) => x - y); if (!a.length) return null; const p = (a.length - 1) * q, l = Math.floor(p); return a[l] + (a[Math.min(l + 1, a.length - 1)] - a[l]) * (p - l); };

const fresh = (reports, nowMs) => reports.filter((x) => x.publishedAt && nowMs - Date.parse(x.publishedAt) <= WINDOW_DAYS * DAY).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
const weightOf = (date, nowMs) => 2 ** (-Math.max(0, nowMs - Date.parse(date)) / DAY / HALF_LIFE_DAYS);
const cite = (x, c) => ({ broker: x.broker, reportId: x.id, title: x.title, date: x.publishedAt, url: x.url, quote: c.quote, page: c.page, publicSummary: !!x.publicSummaryOnly });

export function viewConsensus(reports, nowMs) {
  const byBroker = new Map();
  for (const x of fresh(reports, nowMs)) if (x.marketView && !byBroker.has(x.broker)) byBroker.set(x.broker, x);
  const items = [...byBroker.values()].map((x) => ({ ...cite(x, x.marketView), stance: x.marketView.stance, weight: r(weightOf(x.publishedAt, nowMs), 3) }));
  const sum = items.reduce((a, x) => a + x.weight, 0);
  if (!items.length || !(sum > 0)) return { n: 0, items: [], score: null, disagreement: null, nEff: null, dist: { positive: 0, neutral: 0, negative: 0 } };
  const dist = { positive: 0, neutral: 0, negative: 0 };
  for (const x of items) dist[x.stance] += x.weight;
  const ps = Object.values(dist).map((v) => v / sum).filter((p) => p > 0);
  return {
    n: items.length, items, score: r(items.reduce((a, x) => a + x.weight * SCORE[x.stance], 0) / sum),
    disagreement: r(-ps.reduce((a, p) => a + p * Math.log(p), 0) / Math.log(3)), nEff: r(sum ** 2 / items.reduce((a, x) => a + x.weight ** 2, 0), 1),
    dist: Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, r(v / sum, 3)])),
  };
}

/** Ma trận CTCK × chủ đề: mỗi ô là nhận định mới nhất của CTCK đó về chủ đề đó. */
export function topicMatrix(reports, nowMs) {
  const cells = {};
  for (const x of fresh(reports, nowMs)) for (const t of x.topics ?? []) {
    const key = `${x.broker}|${t.topic}`;
    if (!cells[key]) cells[key] = { stance: t.stance, ...cite(x, t) };
  }
  return cells;
}

/** Mục tiêu VN-Index: chỉ gộp kịch bản cơ sở cùng kỳ hạn, mỗi CTCK một giá trị mới nhất. */
export function targetStats(reports, nowMs, indexClose) {
  const items = [];
  const seen = new Set();
  for (const x of fresh(reports, nowMs)) for (const t of x.targets ?? []) {
    const key = `${x.broker}|${t.scenario}|${t.horizonEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ value: t.value, scenario: t.scenario, horizonEnd: t.horizonEnd, ...cite(x, t) });
  }
  const groups = new Map();
  for (const t of items) if (t.scenario === "base" && t.horizonEnd) groups.set(t.horizonEnd, [...(groups.get(t.horizonEnd) ?? []), t.value]);
  // Trung vị chỉ có nghĩa khi có ít nhất 2 CTCK cùng kỳ.
  const top = [...groups.entries()].filter(([, v]) => v.length >= 2).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const median = top ? quantile(top[1], 0.5) : null;
  return {
    items, horizon: top?.[0] ?? null, n: top?.[1].length ?? 0, median: r(median, 0), q1: top ? r(quantile(top[1], 0.25), 0) : null, q3: top ? r(quantile(top[1], 0.75), 0) : null,
    indexClose: r(indexClose, 2), upsidePct: median != null && indexClose > 0 ? r((median / indexClose - 1) * 100, 1) : null,
  };
}

/** Ngành: đồng thuận CTCK đặt cạnh điểm z định lượng; đánh dấu khi hai bên ngược chiều rõ. */
export function sectorConsensus(reports, nowMs, quant = new Map()) {
  const byIcb = new Map();
  for (const x of fresh(reports, nowMs)) for (const s of x.sectors ?? []) {
    const m = byIcb.get(s.icb) ?? new Map();
    if (!m.has(x.broker)) m.set(x.broker, { stance: s.stance, weight: weightOf(x.publishedAt, nowMs), ...cite(x, s) });
    byIcb.set(s.icb, m);
  }
  return [...byIcb.entries()].map(([icb, m]) => {
    const it = [...m.values()], sum = it.reduce((a, x) => a + x.weight, 0);
    const net = sum > 0 ? it.reduce((a, x) => a + x.weight * SCORE[x.stance], 0) / sum : 0;
    const q = quant.get(icb) ?? null;
    return { icb, nameVi: q?.nameVi ?? icb, net: r(net), n: it.length, quantZ: r(q?.z ?? null), diverges: it.length >= 2 && q?.z != null && Math.abs(net) >= 0.5 && Math.abs(q.z) >= 0.5 && Math.sign(net) !== Math.sign(q.z), items: it.map(({ weight, ...x }) => x) };
  }).sort((a, b) => b.n - a.n || Math.abs(b.net) - Math.abs(a.net));
}

/** CTCK nào vừa đổi quan điểm giữa hai báo cáo liên tiếp. */
export function viewChanges(reports, nowMs) {
  const out = [];
  const byBroker = new Map();
  for (const x of fresh(reports, nowMs)) if (x.marketView) byBroker.set(x.broker, [...(byBroker.get(x.broker) ?? []), x]);
  for (const list of byBroker.values()) for (let i = 0; i + 1 < list.length; i++) {
    if (list[i].marketView.stance !== list[i + 1].marketView.stance) out.push({ ...cite(list[i], list[i].marketView), from: list[i + 1].marketView.stance, to: list[i].marketView.stance });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/** Sổ chấm điểm tiến: quan điểm tại ngày đăng so với VN-Index sau 20 phiên. Chưa đủ mẫu thì không xếp hạng. */
export function scoreLedger(reports, bars) {
  const close = bars.map((b) => b.close);
  const rets = close.map((c, i) => (i + LEDGER_HORIZON < close.length ? close[i + LEDGER_HORIZON] / c - 1 : null));
  const known = rets.filter((x) => x != null);
  const baseUp = known.length ? known.filter((x) => x > 0).length / known.length : null;
  const brokers = {};
  for (const x of reports) {
    if (!x.marketView || !x.publishedAt) continue;
    const b = (brokers[x.broker] ??= { n: 0, hits: 0, pending: 0, neutral: 0 });
    if (x.marketView.stance === "neutral") { b.neutral++; continue; }
    const i = bars.findIndex((k) => k.date >= x.publishedAt);
    if (i < 0 || rets[i] == null) { b.pending++; continue; }
    b.n++;
    if ((rets[i] > 0) === (x.marketView.stance === "positive")) b.hits++;
  }
  for (const b of Object.values(brokers)) {
    b.ready = b.n >= LEDGER_MIN_N;
    // Beta-nhị thức với tiền nghiệm 10 lần quan sát quanh tần suất nền: mẫu nhỏ không tạo ra xếp hạng giả.
    b.shrunkHit = b.ready && baseUp != null ? r((b.hits + 10 * baseUp) / (b.n + 10), 3) : null;
  }
  return { horizon: LEDGER_HORIZON, minN: LEDGER_MIN_N, baseUpRate: r(baseUp, 3), brokers };
}

export function buildConsensus({ reports, nowMs, indexBars = [], quant = new Map() }) {
  const close = indexBars.at(-1)?.close ?? null;
  return { view: viewConsensus(reports, nowMs), topics: topicMatrix(reports, nowMs), targets: targetStats(reports, nowMs, close), sectors: sectorConsensus(reports, nowMs, quant), changes: viewChanges(reports, nowMs), ledger: scoreLedger(reports, indexBars) };
}
