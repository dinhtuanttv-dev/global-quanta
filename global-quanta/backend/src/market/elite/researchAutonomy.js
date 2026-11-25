import { prepareSealedReview, sealedReviewPrompt, parseAndValidateClaims, sourceReadiness } from "../vendor/evidenceRoom.mjs";
import { lastCompletedSessionDate } from "../calendar.js";

const tickerPattern = /^[A-Z][A-Z0-9]{2}$/;
const key = (ticker) => "local:ai-room:publication:v1:" + ticker;
const circuitKey = (provider) => "local:ai-room:provider:v1:" + provider;
const providers = ["claude", "gemini"];

function providerFailure(error) {
  const status = error?.status ?? error?.statusCode;
  if (status === 402 || /credit balance is too low|insufficient[_ ](?:credits|quota)|billing hard limit/i.test(error?.message ?? "")) return "BILLING";
  if (status === 401 || status === 403) return "AUTH";
  return status === 429 ? "RATE_LIMIT" : null;
}

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
  const circuits = new Map();
  let running;
  async function circuit(provider) {
    if (!circuits.has(provider)) circuits.set(provider, (await store.getKv(circuitKey(provider)))?.value ?? null);
    const blocked = circuits.get(provider);
    return blocked?.retryAt > now() ? blocked : null;
  }
  function enabled(provider) {
    const config = configured();
    return typeof config === "boolean" ? config : Boolean(config[provider]);
  }
  async function health(doc) {
    const core = coreTickers(doc);
    const records = (await Promise.all(core.map(read))).filter((r) => r && r.session === doc?.date);
    const blocked = await Promise.all(providers.map(async (provider) => !enabled(provider) ?
      { provider, reason: "NOT_CONFIGURED", retryAt: null } : await circuit(provider)));
    return { session: doc?.date ?? null, core: core.length, snapshots: records.length, ready: records.filter((r) => r.state === "READY").length,
      bull: records.filter((r) => r.roles.BULL).length, bear: records.filter((r) => r.roles.BEAR).length, judge: records.filter((r) => r.roles.JUDGE).length,
      blocked: blocked.filter(Boolean) };
  }
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
    if (record.state === "READY") return;
    const packet = prepareSealedReview(record.projection.snap);
    let writes = Promise.resolve();
    // Debaters run independently. Serialize only the local checkpoint so a slow provider
    // cannot overwrite the role already committed by the other provider.
    const commit = (side, result, failure) => {
      writes = writes.then(async () => {
        const roles = { ...record.roles }, failures = { ...record.failures };
        if (result) { roles[side] = result; delete failures[side]; }
        else failures[side] = failure;
        const pending = Object.values(failures);
        const state = roles.JUDGE ? "READY" : pending.length ? "RETRY" : "PARTIAL";
        const next = { ...record, roles, failures, state, retryAt: pending.length ? Math.min(...pending.map((f) => f.retryAt)) : null };
        await write(ticker, next);
        record = next;
      });
      return writes;
    };
    async function runSide(side) {
      const lastFailure = record.failures?.[side];
      // Old unconstrained-generation failures can retry once with the new contract.
      // Explicit provider circuits and successful roles survive this migration.
      if (record.roles[side] || (lastFailure?.retryAt > now() && lastFailure.reason !== "REVIEW_ERROR")) return;
      const provider = side === "BEAR" ? "gemini" : "claude";
      if (!enabled(provider) || await circuit(provider)) return;
      try {
        const pair = side === "JUDGE" ? [record.roles.BULL, record.roles.BEAR] : undefined;
        const message = sealedReviewPrompt(packet, side, pair) + (pair ? "\nLuận điểm đối chiếu: " + JSON.stringify(pair.map((r) =>
          r.claims.filter((c) => c.validation === "REFS_MATCHED").slice(0, 3).map((c) => ({ text: c.text.slice(0, 280), refs: c.refs.slice(0, 8) })))) : "");
        const guidance = "\nViết 1–3 luận điểm theo đúng bằng chứng. Mỗi luận điểm chọn một ref chính, sao chép asOf của ref. supports và invalidates chỉ nhận ID bằng chứng có trong gói hoặc mảng rỗng. Mọi số trong câu phải có numericAssertions khớp chính xác giá trị và đơn vị của ref vô hướng. Tách phần suy luận và dữ liệu thiếu.";
        const previous = record.failures?.[side]?.validation;
        const prompt = message + guidance + (previous ? "\nLần trước bộ kiểm tra báo: " + previous : "");
        const result = parseAndValidateClaims(await infer(side, prompt, packet.snapshot), packet.snapshot, side);
        const rejected = result.claims.filter((c) => c.side !== side || ["MISREPRESENTED", "UNSUPPORTED"].includes(c.validation));
        const cited = result.claims.some((c) => c.refs.length && ["REFS_MATCHED", "STRUCTURAL_ONLY"].includes(c.validation));
        if (!result.ok || !cited || rejected.length) {
          const validation = (result.error || rejected.flatMap((c) => c.validationNotes).slice(0, 3).join(" ") || "Cần ít nhất một luận điểm có ref trong gói.").slice(0, 440);
          throw Object.assign(new Error("Claim validation"), { validation });
        }
        await commit(side, result);
      } catch (error) {
        const reason = providerFailure(error);
        const attempts = (lastFailure?.reason === "REVIEW_ERROR" ? 0 : lastFailure?.attempts ?? 0) + 1;
        const delay = reason === "BILLING" || reason === "AUTH" ? 15 * 60_000 : reason === "RATE_LIMIT" ? 60_000 :
          attempts >= 5 ? 3_600_000 : 30_000 * 2 ** (attempts - 1);
        const retryAt = now() + delay;
        if (reason) {
          const blocked = { provider, reason, retryAt };
          await store.setKv(circuitKey(provider), blocked);
          circuits.set(provider, blocked);
        }
        const failure = reason ?? (error.validation ? "VALIDATION" : "PROVIDER_ERROR");
        await commit(side, null, { attempts, retryAt, reason: failure, ...(error.validation ? { validation: error.validation } : {}) });
        log.warn?.("[ai-room] " + ticker + " " + date + " " + side + " · " + failure + (error.status ? " HTTP " + error.status : ""));
      }
    }
    await Promise.all([runSide("BULL"), runSide("BEAR")]);
    if (record.roles.BULL && record.roles.BEAR) await runSide("JUDGE");
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
  return { read, health, tick() {
    running ??= work().finally(() => { running = null; });
    return running;
  } };
}
