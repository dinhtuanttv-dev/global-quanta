// B1 (25/10/2026) — "Timeline điểm mua" của Project A (GET /api/cotuc/buy-timeline) qua Gateway, BỀN khi Project A lỗi.
// Vấn đề: Timeline đọc thẳng CSDL Neon của Project A; Neon hết hạn mức (24/10) -> 500 -> Radar + Elite 10 mất dữ liệu.
// Thiết kế:
//   - Bản tốt gần nhất lưu trên Railway Volume (KV `local:` — không sao sang Supabase) + bộ nhớ; khởi động lại vẫn còn.
//   - Stale-while-revalidate: trả bản đang có NGAY, làm mới nền khi quá hạn (60 phút trong phiên / 6 giờ ngoài phiên).
//   - Single-flight: mọi lượt gọi đồng thời dùng chung MỘT yêu cầu tới Project A (không dồn tải lên Neon).
//   - Lùi theo cấp số nhân khi lỗi (15 phút → 30 → 60 → … tối đa 3 giờ, ±20% ngẫu nhiên) — không đánh thức Neon liên tục khi đang hết hạn mức.
//   - TÍNH LẠI trạng thái theo NGÀY HIỆN TẠI (lịch phiên có ngày nghỉ): bản lưu từ hôm trước vẫn cho đúng "đang trong vùng / còn N phiên /
//     đã qua" — không trình bày số phiên của ngày chụp như của hôm nay.
// Không sao chép thuật toán của Project A: mọi thống kê (thắng, kỳ vọng, FDR, bậc) giữ nguyên như Project A tính.
// B3/B4 (25/10/2026): nguồn CHÍNH là Timeline Gateway tự tính từ kho Cổ tức (`localTimeline`, cùng hàm thuần với Project A — test
// đối chiếu khớp từng dòng); Project A thành bản đối chiếu + dự phòng (mỗi lần lấy được thì so khớp, ghi số dòng lệch vào status).
// Quy tắc độ mới: dữ liệu quyết định cũ hơn 1 phiên -> gắn "cũ"; cũ hơn BUY_TIMING_POLICY.maxAgeSessions phiên -> không hiện vùng mua.
import { isTradingDay, vnDate } from "../calendar.js";

export const BUY_TIMING_KV = "local:elite:buy-timeline";
const MIN = 60_000;
export const BUY_TIMING_POLICY = Object.freeze({ ttlSessionMs: 60 * MIN, ttlOffHoursMs: 6 * 60 * MIN, backoffBaseMs: 15 * MIN, backoffMaxMs: 180 * MIN, timeoutMs: 12_000, maxAgeSessions: 10 });

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const tradingDay = (date) => isTradingDay(new Date(`${date}T03:00:00Z`)); // 10:00 giờ VN của ngày đó

/** Số phiên giao dịch từ `from` (không tính) tới `to` (tính) — 0 nếu to ≤ from. */
export function sessionsBetween(from, to, isTrading = tradingDay) {
  if (!(to > from)) return 0;
  let n = 0;
  const d = new Date(`${from}T00:00:00Z`);
  for (let guard = 0; guard < 400; guard++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (s > to) break;
    if (isTrading(s)) n++;
  }
  return n;
}

/** `n` phiên giao dịch kế tiếp SAU `from` (lịch có ngày nghỉ) — để giao diện tính "mở cửa phiên kế tiếp" đúng ngày nghỉ lễ. */
export function nextSessions(from, n = 15, isTrading = tradingDay) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  for (let guard = 0; out.length < n && guard < 60; guard++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const s = d.toISOString().slice(0, 10);
    if (isTrading(s)) out.push(s);
  }
  return out;
}

/** Tính lại trạng thái / số phiên tới vùng mua theo `today` (hàm thuần, có test). */
export function rebaseRows(rows, today, isTrading = tradingDay) {
  return rows.map((r) => {
    const status = today > r.entryToDate ? "PASSED" : today >= r.entryFromDate ? "IN_WINDOW" : "UPCOMING";
    return { ...r, status, sessionsToEntry: status === "UPCOMING" ? sessionsBetween(today, r.entryFromDate, isTrading) : 0 };
  });
}

/** So khớp Timeline Project A với Timeline Gateway (bỏ qua trạng thái / số phiên — hai bản có thể tính ở hai thời điểm trong ngày). */
export function compareTimelines(a, b) {
  const key = (r) => [r.tier, r.kind, r.entryFromDate, r.entryToDate, r.exitDate, r.windowId, r.nEvents, r.netExpectancyLcb].join("|");
  const ma = new Map(a.map((r) => [r.id, key(r)])), mb = new Map(b.map((r) => [r.id, key(r)]));
  const diff = [];
  for (const [id, k] of ma) if (mb.get(id) !== k) diff.push(id);
  for (const id of mb.keys()) if (!ma.has(id)) diff.push(id);
  return { projectA: a.length, gateway: b.length, mismatches: diff.length, sample: diff.slice(0, 8) };
}

/** Kiểm vỏ tối thiểu (từng dòng được frontend kiểm nghiêm ngặt bằng zod). */
export function validTimeline(doc) {
  return Boolean(doc && typeof doc === "object" && DAY_RE.test(doc.today ?? "") && Array.isArray(doc.rows) && doc.coverage && doc.counts);
}

export function createBuyTimingService({
  store, base = (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, ""),
  fetchImpl = fetch, now = Date.now, random = Math.random, policy = BUY_TIMING_POLICY, isTrading = tradingDay, log = console,
  /** B3: () => Promise<thân Timeline | null> — tính từ kho Cổ tức của Gateway (null = kho chưa có dữ liệu). */
  localTimeline = null,
} = {}) {
  const st = { snap: null, loaded: false, inflight: null, failures: 0, nextRetryAt: 0, lastError: null, lastAttemptAt: null, fetches: 0, parity: null, localError: null };
  const computeLocal = async () => {
    if (!localTimeline) return null;
    try { const b = await localTimeline(); st.localError = null; return b && validTimeline(b) && b.coverage.decisions > 0 ? b : null; }
    catch (e) { st.localError = String(e?.message ?? e).slice(0, 200); return null; }
  };

  async function load() {
    if (st.loaded) return;
    st.loaded = true;
    try { const kv = await store.getKv(BUY_TIMING_KV); if (kv?.value?.data && validTimeline(kv.value.data)) st.snap = kv.value; } catch { /* kho lỗi -> như chưa có */ }
  }

  const ttl = () => (isTrading(vnDate(new Date(now()))) ? policy.ttlSessionMs : policy.ttlOffHoursMs);
  const fresh = () => st.snap && now() - Date.parse(st.snap.fetchedAt) < ttl();

  /** Một lần lấy từ Project A (single-flight, có lùi khi lỗi). */
  function refresh({ force = false } = {}) {
    if (st.inflight) return st.inflight;
    if (!force && (fresh() || now() < st.nextRetryAt)) return Promise.resolve(false);
    st.lastAttemptAt = new Date(now()).toISOString();
    st.fetches++;
    st.inflight = (async () => {
      try {
        const res = await fetchImpl(`${base}/api/cotuc/buy-timeline`, { signal: AbortSignal.timeout(policy.timeoutMs), headers: { accept: "application/json" } });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(`Project A ${res.status}: ${String(body?.error ?? "").slice(0, 120)}`);
        if (!validTimeline(body)) throw new Error("Project A trả Timeline sai hợp đồng.");
        st.snap = { fetchedAt: new Date(now()).toISOString(), data: body };
        st.failures = 0; st.nextRetryAt = 0; st.lastError = null;
        const local = await computeLocal();
        if (local) st.parity = { at: st.snap.fetchedAt, ...compareTimelines(body.rows, local.rows) };
        await store.setKv(BUY_TIMING_KV, st.snap).catch((e) => log.warn?.(`[buy-timing] lưu KV lỗi: ${e.message}`));
        return true;
      } catch (e) {
        st.failures++;
        const wait = Math.min(policy.backoffMaxMs, policy.backoffBaseMs * 2 ** (st.failures - 1)) * (0.8 + 0.4 * random());
        st.nextRetryAt = now() + wait;
        st.lastError = String(e?.message ?? e).slice(0, 200);
        log.warn?.(`[buy-timing] lấy Timeline lỗi (lần ${st.failures}, thử lại sau ${Math.round(wait / MIN)} phút): ${st.lastError}`);
        return false;
      } finally {
        st.inflight = null;
      }
    })();
    return st.inflight;
  }

  return {
    refresh,
    status: () => ({ hasSnapshot: Boolean(st.snap), fetchedAt: st.snap?.fetchedAt ?? null, failures: st.failures, nextRetryAt: st.nextRetryAt ? new Date(st.nextRetryAt).toISOString() : null, lastError: st.lastError, lastAttemptAt: st.lastAttemptAt, fetches: st.fetches, parity: st.parity, localError: st.localError, localEnabled: Boolean(localTimeline) }),
    /**
     * Timeline (đã tính lại theo hôm nay). `tickers` -> chỉ các mã đó. Chưa có bản nào -> chờ MỘT lần lấy; có rồi -> trả ngay, làm mới nền.
     * Kết quả cùng hợp đồng với Project A + `meta` (nguồn, thời điểm lấy, cũ hay không, lỗi gần nhất).
     */
    async get({ tickers = null } = {}) {
      await load();
      const local = await computeLocal();
      if (!st.snap && !local) await refresh();
      else void refresh();
      const today = vnDate(new Date(now()));
      // Phiên giao dịch kế tiếp tính từ 10 ngày trước hôm nay (đủ để giao diện chọn "phiên kế tiếp sau ngày dựng danh mục").
      const back = new Date(`${today}T00:00:00Z`); back.setUTCDate(back.getUTCDate() - 10);
      const sessions = nextSessions(back.toISOString().slice(0, 10), 25, isTrading);
      const data = local ?? st.snap?.data ?? null;
      // Độ mới tính theo PHIÊN từ lần engine tính quyết định gần nhất (asOf.decisions), không theo lần lấy.
      const asOfDay = data?.asOf?.decisions ? vnDate(new Date(data.asOf.decisions)) : null;
      const ageSessions = asOfDay ? sessionsBetween(asOfDay, today, isTrading) : null;
      const meta = {
        source: local ? "GATEWAY_STORE" : "PROJECT_A_BUY_TIMELINE", via: local ? "gateway-compute" : "gateway-cache",
        fetchedAt: local ? new Date(now()).toISOString() : st.snap?.fetchedAt ?? null, snapshotToday: data?.today ?? null,
        dataAsOf: data?.asOf?.decisions ?? null, ageSessions,
        stale: local ? (ageSessions ?? 0) > 1 : !st.snap || !fresh() || (ageSessions ?? 0) > 1,
        lastError: st.lastError, nextRetryAt: st.nextRetryAt ? new Date(st.nextRetryAt).toISOString() : null, parity: st.parity,
      };
      if (!data) return { available: false, today, sessions, meta };
      if (ageSessions != null && ageSessions > policy.maxAgeSessions) {
        return { available: false, today, sessions, meta: { ...meta, lastError: `Dữ liệu điểm mua đã cũ ${ageSessions} phiên (> ${policy.maxAgeSessions}) — không hiện vùng mua để tránh sai.` } };
      }
      const want = tickers ? new Set(tickers.map((t) => String(t).toUpperCase())) : null;
      const rows = rebaseRows(data.rows.filter((r) => !want || want.has(String(r.ticker).toUpperCase())), today, isTrading);
      const live = rows.filter((r) => r.status !== "PASSED");
      return {
        available: true, ...data, today, sessions, rows,
        counts: { ...data.counts, inWindow: live.filter((r) => r.status === "IN_WINDOW").length, upcoming: live.filter((r) => r.status === "UPCOMING").length },
        meta,
      };
    },
  };
}
