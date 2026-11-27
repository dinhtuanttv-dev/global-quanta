import { prepareSealedReview, sealedReviewPrompt, parseAndValidateClaims, sourceReadiness } from "../vendor/evidenceRoom.mjs";
import { lastCompletedSessionDate } from "../calendar.js";

const tickerPattern = /^[A-Z][A-Z0-9]{2}$/;
const key = (ticker) => "local:ai-room:publication:v1:" + ticker;
const circuitKey = (provider) => "local:ai-room:provider:v1:" + provider;
// M1 (27/11/2026, QĐ1 của chủ dự án): Gemini (hạn mức miễn phí) chạy CẢ BA vai; làn "claude" (GPT chính, Claude dự phòng — xem
// chatService.runPrimary) chỉ là dự phòng khi Gemini bị giới hạn / lỗi xác thực. Thứ tự trong mảng = thứ tự ưu tiên.
export const LANES = Object.freeze(["gemini", "claude"]);
const providers = LANES;

// 26/11/2026 (Ho-so-360-v2/25 A2–A3): 429 chờ tăng dần (1 → 2 → 4… phút, trần 1 giờ, tôn trọng Retry-After); lỗi không phải của nhà
// cung cấp có trần số lần thử mỗi phiên — đạt trần thì vai đó dừng tới phiên sau (trước đây: 429 chờ cố định 60 s, thử mãi).
const MAX_ATTEMPTS = { VALIDATION: 4, PROVIDER_ERROR: 8 };
function retryAfterMs(error) {
  const h = error?.headers;
  const v = typeof h?.get === "function" ? h.get("retry-after") : h?.["retry-after"] ?? error?.retryAfter;
  const sec = Number(v);
  return Number.isFinite(sec) && sec > 0 ? Math.min(sec * 1000, 3_600_000) : 0;
}

function providerFailure(error) {
  const status = error?.status ?? error?.statusCode;
  if (status === 402 || error?.billing || /credit balance is too low|insufficient[_ ](?:credits|quota)|billing hard limit|no credits remaining/i.test(error?.message ?? "")) return "BILLING";
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
export function createResearchAutonomy({ store, session, decision, capture, infer, configured, now = Date.now, log = console, ledger = null }) {
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
      // Làn đã trả lời từng vai (M1): biết bao nhiêu vai chạy trên Gemini miễn phí, bao nhiêu phải dùng dự phòng.
      lanes: Object.fromEntries(providers.map((p) => [p, records.reduce((n, r) => n + Object.values(r.lanes ?? {}).filter((l) => l === p).length, 0)])),
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
    const commit = (side, result, failure, lane = null) => {
      writes = writes.then(async () => {
        const roles = { ...record.roles }, failures = { ...record.failures };
        const lanes = { ...record.lanes };
        if (result) { roles[side] = result; delete failures[side]; if (lane) lanes[side] = lane; }
        else failures[side] = failure;
        const pending = Object.values(failures).filter((f) => !f.exhausted);
        const state = roles.JUDGE ? "READY" : pending.length ? "RETRY" : "PARTIAL";
        const next = { ...record, roles, failures, lanes, state, retryAt: pending.length ? Math.min(...pending.map((f) => f.retryAt)) : null };
        await write(ticker, next);
        record = next;
        void ledger?.record(ticker, next); // ARL-v1: sổ phán quyết (lỗi ghi sổ không chặn vòng nền)
      });
      return writes;
    };
    async function runSide(side) {
      const lastFailure = record.failures?.[side];
      // Old unconstrained-generation failures can retry once with the new contract.
      // Explicit provider circuits and successful roles survive this migration.
      if (record.roles[side] || lastFailure?.exhausted || (lastFailure?.retryAt > now() && lastFailure.reason !== "REVIEW_ERROR")) return;
      const message = sealedReviewPrompt(packet, side, side === "JUDGE" ? [record.roles.BULL, record.roles.BEAR] : undefined) + (side === "JUDGE" ? "\nLuận điểm đối chiếu: " + JSON.stringify([record.roles.BULL, record.roles.BEAR].map((r) =>
        r.claims.filter((c) => c.validation === "REFS_MATCHED").slice(0, 3).map((c) => ({ text: c.text.slice(0, 280), refs: c.refs.slice(0, 8) })))) : "");
      const guidance = "\nViết 1–3 luận điểm theo đúng bằng chứng. Mỗi luận điểm chọn một ref chính, sao chép asOf của ref. supports và invalidates chỉ nhận ID bằng chứng có trong gói hoặc mảng rỗng. Mọi số trong câu phải có numericAssertions khớp chính xác giá trị và đơn vị của ref vô hướng. Tách phần suy luận và dữ liệu thiếu.";
      const previous = record.failures?.[side]?.validation;
      const prompt = message + guidance + (previous ? "\nLần trước bộ kiểm tra báo: " + previous : "");
      // Làn đầu tiên còn dùng được trả lời; làn bị giới hạn / hết tín dụng / sai khoá -> ngắt mạch làn đó và thử ngay làn kế tiếp.
      let providerBlock = null;
      for (const provider of providers) {
        if (!enabled(provider) || await circuit(provider)) continue;
        try {
          const result = parseAndValidateClaims(await infer(side, prompt, packet.snapshot, provider), packet.snapshot, side);
          const rejected = result.claims.filter((c) => c.side !== side || ["MISREPRESENTED", "UNSUPPORTED"].includes(c.validation));
          const cited = result.claims.some((c) => c.refs.length && ["REFS_MATCHED", "STRUCTURAL_ONLY"].includes(c.validation));
          if (!result.ok || !cited || rejected.length) {
            const validation = (result.error || rejected.flatMap((c) => c.validationNotes).slice(0, 3).join(" ") || "Cần ít nhất một luận điểm có ref trong gói.").slice(0, 440);
            throw Object.assign(new Error("Claim validation"), { validation });
          }
          await commit(side, result, null, provider);
          const prior = circuits.get(provider);
          if (prior?.strikes) { circuits.set(provider, null); await store.setKv(circuitKey(provider), null); }
          return;
        } catch (error) {
          const reason = providerFailure(error);
          if (reason) {
            const prior = circuits.get(provider);
            const strikes = reason === "RATE_LIMIT" ? (prior?.reason === "RATE_LIMIT" ? prior.strikes ?? 1 : 0) + 1 : 1;
            const delay = reason === "BILLING" || reason === "AUTH" ? 15 * 60_000 :
              Math.max(retryAfterMs(error), Math.min(60_000 * 2 ** (strikes - 1), 3_600_000));
            const blocked = { provider, reason, retryAt: now() + delay, ...(reason === "RATE_LIMIT" ? { strikes } : {}) };
            await store.setKv(circuitKey(provider), blocked);
            circuits.set(provider, blocked);
            providerBlock = providerBlock && providerBlock.retryAt <= blocked.retryAt ? providerBlock : blocked;
            log.warn?.("[ai-room] " + ticker + " " + date + " " + side + " · " + provider + " " + reason + " -> làn kế tiếp");
            continue;
          }
          const attempts = (lastFailure?.reason === "REVIEW_ERROR" ? 0 : lastFailure?.attempts ?? 0) + 1;
          const failure = error.validation ? "VALIDATION" : "PROVIDER_ERROR";
          const exhausted = attempts >= (MAX_ATTEMPTS[failure] ?? MAX_ATTEMPTS.PROVIDER_ERROR);
          const retryAt = now() + (attempts >= 5 ? 3_600_000 : 30_000 * 2 ** (attempts - 1));
          await commit(side, null, { attempts, retryAt: exhausted ? null : retryAt, reason: failure, provider, ...(exhausted ? { exhausted: true } : {}), ...(error.validation ? { validation: error.validation } : {}) });
          log.warn?.("[ai-room] " + ticker + " " + date + " " + side + " · " + provider + " " + failure + (error.status ? " HTTP " + error.status : ""));
          return;
        }
      }
      // Mọi làn đều đang ngắt mạch: ghi lý do của làn mở lại sớm nhất (không tính vào số lần thử của vai).
      if (providerBlock) await commit(side, null, { attempts: lastFailure?.attempts ?? 0, retryAt: providerBlock.retryAt, reason: providerBlock.reason, provider: providerBlock.provider });
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
