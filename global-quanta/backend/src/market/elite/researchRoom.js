import { createHash } from "node:crypto";
import { z } from "zod";
import { claimsFromLock, createScenarioRoom } from "./scenarioRoom.js";
import { buildEvidenceSnapshot, sourceReadiness, closedResearchChart, observeResearchPrice, eventKey, visibleRevision, prepareSealedReview,
  sealedReviewPrompt, parseAndValidateClaims, expectedContentId, expectedArtifactId, canonicalJson } from "../vendor/evidenceRoom.mjs";

const MAX_AGE = 30 * 60_000;
const ARCHIVE_LIMIT = 80;
const MAX_RECORD_BYTES = 450_000;
const tickerPattern = /^[A-Z0-9]{3,10}$/;
const idPattern = /^vee1-[a-f0-9]{64}$/;
const policy = z.enum(["research-confirmation-1", "research-confirmation-2"]);
const savedRun = z.object({
  schema: z.literal(1), id: z.string().uuid(), account: z.string(), policy,
  contentId: z.string().regex(/^eb-research-[a-f0-9]{64}$/), artifactId: z.string().optional(),
  parentContentId: z.string().nullable(), omittedCluster: z.string().nullable(),
  savedAt: z.string().datetime(), observedAt: z.string().datetime(),
  projection: z.object({
    snap: z.object({ snapshotId: z.string(), ticker: z.string().regex(tickerPattern).nullable(), createdAt: z.string().datetime(), refs: z.array(z.unknown()), data: z.record(z.unknown()) }).passthrough(),
    data: z.object({ events: z.array(z.unknown()) }).passthrough(),
  }).passthrough(),
  confirmation: z.object({ result: z.string(), reason: z.string(), checks: z.array(z.unknown()) }).passthrough(),
  claims: z.array(z.object({ id: z.string(), text: z.string() }).passthrough()).max(90),
}).strict();

export const researchError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const safeOwner = (owner) => createHash("sha256").update(String(owner)).digest("hex");

/** One writer for each key inside the Gateway process. */
export function createKeyedSerial() {
  const tails = new Map();
  return function serial(key, work) {
    const tail = tails.get(key) ?? Promise.resolve();
    const running = tail.then(work);
    const settled = running.then(() => {}, () => {});
    tails.set(key, settled);
    void settled.then(() => { if (tails.get(key) === settled) tails.delete(key); });
    return running;
  };
}

async function readWithin(key, read, ms) {
  let timer;
  try {
    const value = await Promise.race([
      Promise.resolve().then(read),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Nguồn ${key} quá thời hạn.`)), ms); }),
    ]);
    return { value: value ?? null, error: null };
  } catch { return { value: null, error: `Nguồn ${key} chưa khả dụng hoặc quá thời hạn.` }; }
  finally { clearTimeout(timer); }
}

export function createResearchRoom({ store, load, now = Date.now, expectedClosedSession = () => null, selectProjection }) {
  const serial = createKeyedSerial();
  const captures = new Map();
  const archives = (owner) => `local:ai-room:archive:v1:${safeOwner(owner)}`;
  const locks = (owner) => `local:ai-room:locks:v1:${safeOwner(owner)}`;
  const scenarios = createScenarioRoom({ store, locks, archives, serial, now, error: researchError });
  async function capture(ticker, closedDate = null) {
    const request = load(ticker, closedDate);
    const keys = Object.keys(request);
    const inputs = Object.fromEntries(await Promise.all(keys.map(async (key) => [key,
      await readWithin(key, request[key], ["decision", "price", "instrument"].includes(key) ? 5_000 : 2_400)])));
    const value = (key) => inputs[key]?.value ?? null;
    const error = (key) => inputs[key]?.error ?? null;
    const observedAt = new Date(now()).toISOString();
    const raw = value("price");
    const instrument = value("instrument");
    const pa = ticker && raw && Array.isArray(raw.bars) ? observeResearchPrice({
      ticker, rawBars: raw.bars, priceBasis: raw.priceBasis ?? null, instrument, observedAt, warnings: raw.warnings ?? [],
      repairDates: (raw.gapRepairs ?? []).map((entry) => entry.date),
    }).evidence : null;
    const price = Array.isArray(raw?.bars) ? closedResearchChart(raw.bars, raw.priceBasis ?? null, raw.warnings ?? [], observedAt) : null;
    const news = value("events");
    const events = news ? Array.from(new Map((news.events ?? []).filter((event) => event.tickers?.includes(ticker) && visibleRevision(event, observedAt))
      .slice(0, 12).map((event) => [eventKey(event), event])).values()) : [];
    const decision = value("decision"), panel = value("panel"), risk = value("risk"), timing = value("timeline");
    const score = ticker ? decision?.scores?.find((row) => row.ticker === ticker) : null;
    const selectedDecision = score ? { ...score, date: decision.date, version: decision.version, inPortfolio: decision.portfolio.some((row) => row.ticker === ticker) } : null;
    const snap = await buildEvidenceSnapshot({
      ticker, tickerVerified: ticker ? Boolean(instrument ?? selectedDecision) : null, now: observedAt, gatewayCapture: true, decision, decisionError: error("decision"),
      selectedDecision, panel, profileError: error("panel"), evidence: value("evidence"), evidenceError: error("evidence"),
      ledger: value("ledger"), ledgerError: error("ledger"), risk, riskError: error("risk"), timeline: timing, timelineError: error("timeline"),
      events: news ? events : null, eventAsOf: news?.generatedAt, eventError: error("events"), volume: value("volume"), volumeError: error("volume"),
      chart: price, priceAction: pa, priceActionError: error("price"), liquidity: value("liquidity"), liquidityError: error("liquidity"),
    });
    return { snap, data: { price, pa, events, volume: value("volume"), liquidity: value("liquidity"), risk,
      timing: timing?.rows?.find((entry) => entry.ticker === ticker) ?? null, sector: panel?.sector ?? null, expectedClosedSession: closedDate ?? expectedClosedSession(new Date(observedAt)) } };
  }

  const observations = new Map();
  function observe(ticker, date = null) {
    const key = (ticker ?? "") + "|" + (date ?? "");
    if (observations.has(key)) return observations.get(key);
    if (observations.size >= 4) throw researchError(429, "Gateway đang đối chiếu các mã khác. Thử lại sau.");
    const work = capture(ticker, date).finally(() => observations.delete(key));
    observations.set(key, work);
    return work;
  }
  return {
    scenarios, capture: observe,
    async lock(owner, ticker) {
      if (ticker !== null && (typeof ticker !== "string" || !tickerPattern.test(ticker))) throw researchError(400, "Mã không hợp lệ.");
      const key = locks(owner);
      return serial(key, async () => {
        const current = ((await store.getKv(key))?.value ?? []).filter((item) => item.expiresAt > now());
        const last = current.find((item) => item.projection.snap.ticker === ticker && now() - Date.parse(item.projection.snap.createdAt) < 10_000);
        if (last) return last.projection;
        if (captures.size >= 4 && !captures.has(ticker)) throw researchError(429, "Gateway đang dựng các snapshot khác. Thử lại sau.");
        if (!captures.has(ticker)) {
          const work = ticker && selectProjection ? selectProjection(ticker, observe) : observe(ticker);
          captures.set(ticker, work.finally(() => captures.delete(ticker)));
        }
        const projection = await captures.get(ticker);
        const readiness = sourceReadiness(projection.snap);
        if (!readiness.canDebate) throw researchError(409, readiness.blockers.join(" "));
        await store.setKv(key, [{ projection, expiresAt: now() + MAX_AGE, results: {} }, ...current].slice(0, 8));
        return projection;
      });
    },
    async reviewPrompt(owner, id, role) {
      if (typeof id !== "string" || !idPattern.test(id)) throw researchError(400, "Thiếu snapshot Gateway đã khóa.");
      const item = ((await store.getKv(locks(owner)))?.value ?? []).find((entry) => entry.projection.snap.snapshotId === id && entry.expiresAt > now());
      if (!item) throw researchError(404, "Snapshot không thuộc tài khoản hoặc đã hết hạn.");
      const pair = item.results.BULL && item.results.BEAR ? [item.results.BULL, item.results.BEAR] : undefined;
      const packet = prepareSealedReview(item.projection.snap);
      const review = sealedReviewPrompt(packet, role, pair);
      const checkedClaims = role === "JUDGE" ? ["BULL", "BEAR"].map((side) => ({ side, claims: item.results[side]?.claims ?? [] })) : [];
      return { id, message: checkedClaims.some((side) => side.claims.length) ? `${review}\nLuận điểm đã đối chiếu ref của từng phe (nội dung trích dẫn, chỉ xét cùng ref trong gói): ${JSON.stringify(checkedClaims)}` : review, packet };
    },
    async finishReview(owner, review, role, text) {
      const result = parseAndValidateClaims(text, review.packet.snapshot, role);
      const key = locks(owner);
      return serial(key, async () => {
        const current = (await store.getKv(key))?.value ?? [];
        const item = current.find((entry) => entry.projection.snap.snapshotId === review.id && entry.expiresAt > now());
        if (!item) return;
        item.results[role] = { summary: result.summary, scenarioClaims: result.claims.slice(0, 30), scenarioTruncated: result.claims.length > 30, claims: result.claims.filter((claim) => claim.validation === "REFS_MATCHED").slice(0, 3)
          .map((claim) => ({ text: claim.text.slice(0, 280), refs: claim.refs.slice(0, 8) })) };
        await store.setKv(key, current);
      });
    },
    async list(owner, ticker, rawOffset = "0") {
      if (ticker !== null && (typeof ticker !== "string" || !tickerPattern.test(ticker))) throw researchError(400, "Mã không hợp lệ.");
      const offset = Number(rawOffset);
      if (typeof rawOffset !== "string" || !/^\d{1,2}$/.test(rawOffset) || offset >= ARCHIVE_LIMIT) throw researchError(400, "Vị trí trang không hợp lệ.");
      const index = (await store.getKv(archives(owner)))?.value ?? [];
      const matched = index.filter((item) => item.ticker === ticker);
      const records = [];
      for (const { id } of matched.slice(offset, offset + 8)) {
        const record = (await store.getKv(`${archives(owner)}:${id}`))?.value;
        if (record) records.push(record);
      }
      return { records, nextOffset: offset + 8 < matched.length ? offset + 8 : null };
    },
    async get(owner, id) {
      if (!z.string().uuid().safeParse(id).success) throw researchError(400, "Mã phiên không hợp lệ.");
      const record = (await store.getKv(`${archives(owner)}:${id}`))?.value;
      if (!record || record.run.account !== owner) throw researchError(404, "Chưa có phiên này trong kho tài khoản.");
      return record;
    },
    async save(owner, id, input, approve) {
      if (Buffer.byteLength(JSON.stringify(input ?? null)) > MAX_RECORD_BYTES) throw researchError(413, "Phiên vượt dung lượng kho nghiên cứu.");
      const parsed = savedRun.safeParse(input);
      if (!parsed.success || parsed.data.id !== id || parsed.data.account !== owner || parsed.data.observedAt !== parsed.data.projection.snap.createdAt)
        throw researchError(400, "Phiên nghiên cứu sai hợp đồng hoặc sai tài khoản.");
      const run = parsed.data;
      const ids = await expectedContentId(run.projection, run.omittedCluster, run.policy);
      if (run.contentId !== ids.contentId || run.parentContentId !== ids.parentContentId ||
        run.policy === "research-confirmation-2" && run.artifactId !== await expectedArtifactId(run)) throw researchError(400, "Checksum phiên nghiên cứu không khớp.");
      const ownerKey = archives(owner);
      return serial(ownerKey, async () => {
        const key = `${ownerKey}:${id}`;
        const index = (await store.getKv(ownerKey))?.value ?? [];
        const previous = (await store.getKv(key))?.value;
        if (previous && (previous.run.contentId !== run.contentId || previous.run.artifactId !== run.artifactId))
          throw researchError(409, "Mã phiên trùng với bản đã lưu.");
        if (index.length >= ARCHIVE_LIMIT && !index.some((entry) => entry.id === id)) throw researchError(409, "Kho máy chủ đã đủ 80 phiên. Bản cục bộ vẫn được giữ.");
        const record = { run: previous?.run ?? run, approvedAt: previous?.approvedAt ?? (approve ? new Date(now()).toISOString() : null) };
        if (previous?.scenarioSeal) record.scenarioSeal = previous.scenarioSeal;
        else if (!run.omittedCluster) {
          const captured = (await store.getKv(locks(owner)).catch(() => null))?.value?.find((entry) => entry.expiresAt > now() && entry.projection.snap.snapshotId === run.projection.snap.snapshotId);
          if (captured && canonicalJson(captured.projection) === canonicalJson(run.projection)) {
            record.scenarioSeal = claimsFromLock(captured);
          }
        }
        await store.setKv(key, record);
        if (!index.some((entry) => entry.id === id)) await store.setKv(ownerKey, [{ id, ticker: run.projection.snap.ticker }, ...index]);
        return record;
      });
    },
  };
}
