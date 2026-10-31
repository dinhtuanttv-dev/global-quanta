// Bản tin AI có kiểm chứng (U4, 31/10/2026). AI chỉ diễn giải số liệu và tin đã có, không tự chấm xác suất.
// Mọi câu đi qua kiểm chứng bằng code trước khi lưu:
//   1. phải trích dẫn mã bằng chứng có thật; 2. mọi con số trong câu phải có trong đúng bằng chứng được trích;
//   3. câu về ngành phải trích bằng chứng của ngành đó, chiều không được trái điểm định lượng khi |z| ≥ 0,5.
// Câu không đạt bị loại và đếm vào rejected, không sửa hộ.
export const BRIEF_KV_KEY = "world:brief:v1";
export const KEEP_RUNS = 7;
export const MANUAL_COOLDOWN_MS = 45 * 60_000;
export const MAX_RUNS_PER_DAY = 6;
const NEWS_WINDOW_MS = 72 * 3_600_000;
const MAX_NEWS = 30;
const CALL_TIMEOUT_MS = 90_000;
const TZ_OFFSET_MS = 7 * 3_600_000;
/** Giờ chạy tự động theo giờ Việt Nam: sau khi Mỹ đóng cửa và sau khi Việt Nam đóng cửa. */
export const AUTO_SLOTS = [[7, 45], [15, 30]];

const vnDay = (ms) => new Date(ms + TZ_OFFSET_MS).toISOString().slice(0, 10);

/** Gom bằng chứng, mỗi mục có mã ổn định để AI trích dẫn và code kiểm tra. */
export function buildEvidence({ monitor, news, strategy, nowMs }) {
  const items = [];
  const movers = (monitor?.items ?? []).filter((i) => i.available && !i.stale && i.change != null);
  const picked = [...movers].sort((a, b) => Math.abs(b.z ?? 0) - Math.abs(a.z ?? 0)).slice(0, 14);
  for (const m of picked) {
    const unit = m.changeIn === "bps" ? "điểm cơ bản" : "%";
    items.push({ ref: `M:${m.id}`, kind: "market", text: `${m.nameVi}: giá ${round(m.value)} ${m.unit}, thay đổi ${round(m.change)} ${unit}, z ${round(m.z)}, phiên ${m.date}`, numbers: [m.value, m.change, m.z, m.rangePct], source: m.sourceVi, at: m.date });
  }
  const fresh = (news?.items ?? []).filter((n) => nowMs - Date.parse(n.publishedAt) <= NEWS_WINDOW_MS).slice(0, MAX_NEWS);
  fresh.forEach((n, i) => items.push({ ref: `N:${i + 1}`, kind: "news", text: `${n.title} (${n.sourceLabel}, ${n.verification})`, numbers: numbersIn(n.title), source: n.sourceLabel, at: n.publishedAt, url: n.url, verification: n.verification }));
  for (const r of strategy?.short?.rows ?? []) {
    if (r.zx == null) continue;
    const med = (strategy.medium ?? []).find((x) => x.icb === r.icb);
    items.push({ ref: `S:${r.icb}`, kind: "sector", icb: r.icb, z: r.zx, nameVi: r.nameVi, text: `Ngành ${r.nameVi} (ICB ${r.icb}): z ngắn hạn ${round(r.zx)}, lợi suất tương đối kỳ vọng ${round(r.alphaBps)} điểm cơ bản/phiên, tư thế ${r.stance}${med ? `, bối cảnh trung hạn ${med.stance}` : ""}`, numbers: [r.zx, r.alphaBps, r.pOutperform == null ? null : r.pOutperform * 100], source: "Chiến lược ngành Gateway", at: strategy.vnLast });
  }
  return items;
}
const round = (v) => (v == null || !Number.isFinite(v) ? "n/a" : Number(v.toFixed(2)));

/** Lấy số trong câu, hiểu cả dấu thập phân kiểu Việt ("1,5") và dấu nghìn ("7.580" hoặc "7,580"). Bỏ năm và số thứ tự nhỏ gắn chữ không phải số liệu. */
export function numbersIn(text) {
  const out = [];
  for (const m of String(text).matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = m[0];
    const candidates = new Set();
    candidates.add(Number(raw.replace(/,/g, "")));
    candidates.add(Number(raw.replace(/\./g, "").replace(",", ".")));
    out.push({ raw, values: [...candidates].filter(Number.isFinite) });
  }
  return out.map((x) => x.values);
}

/** Một số trong câu khớp bằng chứng nếu bằng một số đã cho sau khi làm tròn tới số chữ số thập phân của câu (so trị tuyệt đối). */
export function numberMatches(values, evidenceNumbers) {
  const flat = evidenceNumbers.flat(Infinity).filter((v) => v != null && Number.isFinite(v)).map(Math.abs);
  return values.some((v) => flat.some((e) => (Number.isInteger(v) ? Math.round(e) === v || Math.floor(e) === v : Math.abs(e - v) <= Math.max(0.051, e * 0.001))));
}

/** Ngày, tháng, năm và mốc thời gian trong câu không phải số liệu cần đối chiếu. */
const DATE_LIKE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b(?:19|20)\d{2}\b|\b(?:tháng|quý|phiên|ngày)\s+\d{1,2}(?:\/\d{1,2}(?:\/\d{2,4})?)?\b|\bQ[1-4]\b|\b\d{1,2}\s*(?:giờ|tháng|năm|ngày|tuần|phiên)\b|\bICB\s*\d+\b|\bS&P\s*500\b|\b\d{3}\s*ngày\b|\bG\d+\b/gi;

export function checkSentence(text, refs, evidenceByRef) {
  if (typeof text !== "string" || !text.trim()) return "câu rỗng";
  const list = Array.isArray(refs) ? refs.filter((r) => typeof r === "string") : [];
  if (!list.length) return "không có trích dẫn";
  const bad = list.filter((r) => !evidenceByRef.has(r));
  if (bad.length) return `trích dẫn không có thật: ${bad.join(", ")}`;
  const cited = list.map((r) => evidenceByRef.get(r));
  const stripped = text.replace(DATE_LIKE, " ");
  for (const values of numbersIn(stripped)) {
    if (!numberMatches(values, cited.map((c) => c.numbers ?? []))) return `con số không có trong bằng chứng: ${values[0]}`;
  }
  return null;
}

export function checkSector(s, evidenceByRef) {
  const ref = `S:${s?.icb}`;
  const ev = evidenceByRef.get(ref);
  if (!ev) return "ngành không có trong dữ liệu";
  if (!["bullish", "bearish", "neutral"].includes(s.direction)) return "chiều không hợp lệ";
  if (!Array.isArray(s.refs) || !s.refs.includes(ref)) return "chưa trích bằng chứng của ngành";
  if (s.direction === "bullish" && ev.z <= -0.5) return "trái chiều điểm định lượng";
  if (s.direction === "bearish" && ev.z >= 0.5) return "trái chiều điểm định lượng";
  return checkSentence(s.text, s.refs, evidenceByRef);
}

export const SYSTEM_PROMPT = `Bạn là nhà phân tích kinh tế vĩ mô, viết tiếng Việt, ngắn gọn, trung lập.
Chỉ dùng các mục BẰNG CHỨNG được cung cấp. Không dùng kiến thức bên ngoài, không suy đoán số liệu, không dự báo giá, không khuyến nghị mua bán.
Mỗi câu phải trích dẫn mã bằng chứng trong refs. Mọi con số trong câu phải chép đúng từ bằng chứng được trích. Không ghi xác suất hay độ tin cậy.
Tin tức chỉ cho biết điều đã được đưa tin; nếu tin thuộc mức "single" thì viết "theo <nguồn>", không khẳng định.
Trả về đúng một đối tượng JSON, không kèm chữ nào khác:
{"summary":[{"text":"...","refs":["M:..."]}],"sectors":[{"icb":"0500","direction":"bullish|bearish|neutral","text":"...","refs":["S:0500","N:1"]}]}
summary tối đa 5 câu nêu điều đáng chú ý nhất. sectors tối đa 8 ngành có bằng chứng rõ, phải trích S:<icb> của ngành đó.`;

/** Áp kiểm chứng lên kết quả AI. Trả về phần đạt, kèm danh sách phần bị loại để minh bạch. */
export function verifyBrief(raw, evidence) {
  const byRef = new Map(evidence.map((e) => [e.ref, e]));
  const rejected = [];
  const view = (refs) => refs.map((r) => { const e = byRef.get(r); return { ref: r, kind: e.kind, label: e.kind === "news" ? e.text : e.text, source: e.source, at: e.at, url: e.url ?? null, verification: e.verification ?? null }; });
  const summary = [];
  for (const s of Array.isArray(raw?.summary) ? raw.summary.slice(0, 5) : []) {
    const why = checkSentence(s?.text, s?.refs, byRef);
    if (why) rejected.push({ text: String(s?.text ?? "").slice(0, 200), reason: why });
    else summary.push({ text: s.text.trim(), citations: view(s.refs) });
  }
  const sectors = [];
  const seen = new Set();
  for (const s of Array.isArray(raw?.sectors) ? raw.sectors.slice(0, 8) : []) {
    const why = seen.has(s?.icb) ? "ngành trùng" : checkSector(s, byRef);
    if (why) { rejected.push({ text: String(s?.text ?? "").slice(0, 200), reason: why }); continue; }
    seen.add(s.icb);
    const ev = byRef.get(`S:${s.icb}`);
    sectors.push({ icb: s.icb, nameVi: ev.nameVi, direction: s.direction, quantZ: ev.z, text: s.text.trim(), citations: view(s.refs) });
  }
  return { summary, sectors, rejected };
}

export function createWorldBrief({ store = null, getMonitor, getNews, getStrategy, callModel, now = Date.now, log = console } = {}) {
  let state = null, loaded = false, inflight = null;
  async function load() {
    if (loaded) return;
    loaded = true;
    try { state = (await store?.getKv?.(BRIEF_KV_KEY))?.value ?? null; } catch (e) { log.warn?.(`[world-brief] đọc kho: ${e.message}`); }
    state ??= { runs: [], attempts: [] };
  }
  const runsToday = () => (state.attempts ?? []).filter((t) => vnDay(t) === vnDay(now())).length;

  async function run(trigger) {
    const t = now();
    state.attempts = [...(state.attempts ?? []).filter((x) => t - x < 3 * 86_400_000), t];
    const [monitor, news, strategy] = await Promise.all([getMonitor(), getNews({ limit: 200 }), getStrategy()]);
    const evidence = buildEvidence({ monitor, news, strategy, nowMs: t });
    if (!evidence.length) throw new Error("Không có bằng chứng để phân tích.");
    const user = `Thời điểm: ${new Date(t).toISOString()}\nBẰNG CHỨNG:\n${evidence.map((e) => `[${e.ref}] ${e.text}`).join("\n")}`;
    const res = await Promise.race([
      callModel({ systemPrompt: SYSTEM_PROMPT, parts: [{ text: user }] }),
      new Promise((_, rej) => { const h = setTimeout(() => rej(new Error("Gemini quá thời gian.")), CALL_TIMEOUT_MS); h.unref?.(); }),
    ]);
    const checked = verifyBrief(res.json, evidence);
    const doc = { id: `${t}`, generatedAt: new Date(t).toISOString(), trigger, model: res.modelUsed ?? null, ...checked, inputCounts: { market: evidence.filter((e) => e.kind === "market").length, news: evidence.filter((e) => e.kind === "news").length, sector: evidence.filter((e) => e.kind === "sector").length } };
    state.runs = [doc, ...state.runs].slice(0, KEEP_RUNS);
    state.lastError = null;
    return doc;
  }
  async function persist() {
    try { await store?.setKv?.(BRIEF_KV_KEY, state); } catch (e) { log.warn?.(`[world-brief] ghi kho: ${e.message}`); }
  }
  function runOnce(trigger) {
    return (inflight ??= run(trigger)
      .catch((e) => { state.lastError = { at: new Date(now()).toISOString(), message: String(e.message).slice(0, 200) }; log.warn?.(`[world-brief] ${e.message}`); throw e; })
      .finally(async () => { inflight = null; await persist(); }));
  }
  const nextManualAt = () => {
    const last = (state.attempts ?? []).at(-1);
    return last ? last + MANUAL_COOLDOWN_MS : 0;
  };
  return {
    async get({ runId = null } = {}) {
      await load();
      const latest = runId ? state.runs.find((r) => r.id === runId) ?? null : state.runs[0] ?? null;
      return {
        latest, runs: state.runs.slice(0, 3).map((r) => ({ id: r.id, generatedAt: r.generatedAt })), running: !!inflight, lastError: state.lastError ?? null,
        nextManualAt: nextManualAt() > now() ? new Date(nextManualAt()).toISOString() : null, capReached: runsToday() >= MAX_RUNS_PER_DAY,
        schedule: AUTO_SLOTS.map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`),
      };
    },
    /** Chạy theo yêu cầu người dùng; luôn qua giãn cách và trần lượt/ngày để giữ chi phí. */
    async runManual() {
      await load();
      if (inflight) return { status: "running" };
      if (runsToday() >= MAX_RUNS_PER_DAY) return { status: "cap" };
      if (nextManualAt() > now()) return { status: "cooldown", nextManualAt: new Date(nextManualAt()).toISOString() };
      void runOnce("manual").catch(() => {});
      return { status: "started" };
    },
    /** Đến giờ tự động thì chạy một lần cho mỗi khung giờ; ngày nghỉ cuối tuần không chạy. */
    async tick() {
      await load();
      const t = now();
      const vn = new Date(t + TZ_OFFSET_MS);
      if (vn.getUTCDay() === 0 || vn.getUTCDay() === 6) return false;
      const mins = vn.getUTCHours() * 60 + vn.getUTCMinutes();
      const slot = [...AUTO_SLOTS].reverse().find(([h, m]) => mins >= h * 60 + m);
      if (!slot) return false;
      const slotStart = Date.parse(`${vnDay(t)}T00:00:00Z`) - TZ_OFFSET_MS + (slot[0] * 60 + slot[1]) * 60_000;
      if ((state.attempts ?? []).some((x) => x >= slotStart) || inflight || runsToday() >= MAX_RUNS_PER_DAY) return false;
      await runOnce("auto").catch(() => {});
      return true;
    },
    startTimer() {
      const h = setInterval(() => { void this.tick(); }, 5 * 60_000);
      h.unref?.();
      return h;
    },
  };
}
