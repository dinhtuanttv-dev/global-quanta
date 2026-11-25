import { prepareSealedReview, sealedReviewPrompt, parseAndValidateClaims, sourceReadiness } from "../vendor/evidenceRoom.mjs";
import { lastCompletedSessionDate } from "../calendar.js";

const tickerPattern = /^[A-Z][A-Z0-9]{2}$/;
const key = (ticker) => "local:ai-room:publication:v1:" + ticker;

// Anchor vendor-adjusted history to the observed raw close on the cutoff day.
// Common adjustments applied after that cutoff cancel in (adj/raw)_i / (adj/raw)_cutoff.
export function historicalPrices(stored, date) {
  const rows = stored.filter((r) => r.date <= date).sort((a, b) => a.date.localeCompare(b.date));
  const end = rows.at(-1);
  const valid = end?.date === date && rows.every((r) => [r.close, r.closeAdj, r.open, r.high, r.low].every((n) => Number.isFinite(n) && n > 0));
  if (!valid) return { bars: rows, priceBasis: "unadjusted", warnings: ["Thiếu cơ sở điều chỉnh lịch sử."] };
  const anchor = end.closeAdj / end.close;
  const bars = rows.map((r) => {
    const factor = (r.closeAdj / r.close) / anchor;
    return { date: r.date, open: r.open * factor, high: r.high * factor, low: r.low * factor, close: r.close * factor, volume: r.volume };
  });
  return { bars, priceBasis: "ADJUSTED_TO_SESSION", warnings: ["Phục dựng từ kho ngày, neo giá điều chỉnh vào ngày của snapshot."] };
}

export function coreTickers(decision) {
  const rows = decision?.portfolio ?? [];
  const classified = rows.some((row) => row.hl?.pz?.lane);
  return [...new Set(rows.filter((row) => tickerPattern.test(row.ticker) && (!classified || row.hl?.pz?.lane === "CORE"))
    .sort((a, b) => (a.hl?.rank ?? a.rank ?? Infinity) - (b.hl?.rank ?? b.rank ?? Infinity))
    .map((row) => row.ticker))];
}

// Every required observation belongs to the selected close. Optional evidence keeps its actual timestamp.
export function isClosedProjection(projection, ticker, session) {
  const { snap, data } = projection;
  return snap.ticker === ticker && snap.decisionSession === session && sourceReadiness(snap).canDebate &&
    data.pa?.asOf === session && data.pa.barClosed === true && data.price?.bars.at(-1)?.date === session &&
    (!data.volume || (!data.volume.partialToday && data.volume.asOf === session));
}

export async function selectSessionProjection(ticker, capture, status, read) {
  const expected = status.expectedClosedSession;
  if (status.stage === "PUBLISHED") {
    const live = await capture(ticker);
    if (live.snap.decisionSession === expected && live.data.price?.bars.at(-1)?.date === expected && sourceReadiness(live.snap).canDebate) return live;
  }
  const stored = await read(ticker);
  if (stored?.session === expected && status.stage === "PUBLISHED" && isClosedProjection(stored.projection, ticker, expected)) return stored.projection;
  const previous = status.decisionSession && status.decisionSession < expected ? status.decisionSession :
    lastCompletedSessionDate(new Date(expected + "T00:00:00+07:00"));
  const alternatives = [...new Set([previous, stored?.session].filter((date) => date && date < expected))].sort().reverse();
  for (const date of alternatives) {
    const projection = stored?.session === date ? stored.projection : await capture(ticker, date);
    if (isClosedProjection(projection, ticker, date))
      return { ...projection, fallback: { session: date, expectedSession: expected } };
  }
  throw Object.assign(new Error("Phiên mới đang đồng bộ. Chưa có snapshot dự phòng đủ nguồn cho mã này."), { statusCode: 409 });
}

// The Gateway owns one scheduler. A checkpoint is committed after each provider response, before the next role.
// GET uses only the persisted artifact or the bounded hot cache and never invokes a provider.
export function createResearchAutonomy({ store, session, decision, capture, infer, configured, now = Date.now, log = console }) {
  const hot = new Map();
  let running;
  async function read(ticker) {
    if (typeof ticker !== "string" || !tickerPattern.test(ticker)) throw Object.assign(new Error("Mã cổ phiếu không hợp lệ."), { statusCode: 400 });
    const record = hot.get(ticker) ?? (await store.getKv(key(ticker)))?.value ?? null;
    if (record) remember(ticker, record);
    return record;
  }
  function remember(ticker, record) {
    hot.delete(ticker);
    hot.set(ticker, record);
    if (hot.size > 40) hot.delete(hot.keys().next().value);
  }
  async function write(ticker, record) {
    await store.setKv(key(ticker), record);
    remember(ticker, record);
  }
  async function processTicker(ticker, date, publication, historical, sourcePublication) {
    let record = await read(ticker);
    if (record?.session > date) return;
    if (!record || record.session !== date || record.publication !== publication) {
      let projection = await capture(ticker, historical ? date : null);
      if (!historical && !isClosedProjection(projection, ticker, date)) projection = await capture(ticker, date);
      if (!isClosedProjection(projection, ticker, date)) return;
      record = { session: date, publication, sourcePublication, projection, roles: {}, state: "SNAPSHOT", attempts: 0, retryAt: null };
      await write(ticker, record);
    }
    if (record.state === "READY" || !configured() || record.retryAt > now()) return;
    const packet = prepareSealedReview(record.projection.snap);
    try {
      for (const side of ["BULL", "BEAR", "JUDGE"]) {
        if (record.roles[side]) continue;
        const pair = side === "JUDGE" ? [record.roles.BULL, record.roles.BEAR] : undefined;
        const message = sealedReviewPrompt(packet, side, pair) + (pair ? "\nLuận điểm đối chiếu: " + JSON.stringify(pair.map((r) =>
          r.claims.filter((c) => c.validation === "REFS_MATCHED").slice(0, 3).map((c) => ({ text: c.text.slice(0, 280), refs: c.refs.slice(0, 8) })))) : "");
        const result = parseAndValidateClaims(await infer(side, message), packet.snapshot, side);
        if (!result.ok || !result.claims.length || result.claims.some((c) => c.side !== side || c.validation === "MISREPRESENTED" || c.validation === "UNSUPPORTED"))
          throw new Error("Phản hồi chưa đạt kiểm tra schema, vai hoặc tham chiếu.");
        record = { ...record, roles: { ...record.roles, [side]: result }, attempts: 0, retryAt: null,
          state: side === "JUDGE" ? "READY" : "PARTIAL" };
        await write(ticker, record);
      }
    } catch (error) {
      const attempts = record.attempts + 1;
      // Extend the circuit after repeated provider failures; a recovered provider can resume the same role.
      await write(ticker, { ...record, attempts, retryAt: now() + (attempts >= 5 ? 3_600_000 : 30_000 * 2 ** (attempts - 1)), state: attempts >= 5 ? "FAILED" : "RETRY" });
      log.warn?.("[ai-room] " + ticker + " " + date + " · " + error.message);
    }
  }
  async function work() {
    const status = await session();
    const doc = await decision();
    if (!doc?.date || doc.date !== status.decisionSession || doc.hl?.dataGuard?.frozen) return;
    const historical = doc.date < status.expectedClosedSession;
    if (!historical && status.stage !== "PUBLISHED") return;
    for (const ticker of coreTickers(doc)) {
      try {
        const old = await read(ticker);
        // Preserve the actual sealed copy when the next session starts synchronising.
        const version = historical && old?.session === doc.date ? old.publication :
          [doc.date, doc.version, doc.builtAt ?? "", historical ? "archive" : status.publication].join("|");
        await processTicker(ticker, doc.date, version, historical, status.publication);
      } catch (error) { log.warn?.("[ai-room] " + ticker + " · " + error.message); }
    }
  }
  return { read, tick() {
    running ??= work().finally(() => { running = null; });
    return running;
  } };
}
