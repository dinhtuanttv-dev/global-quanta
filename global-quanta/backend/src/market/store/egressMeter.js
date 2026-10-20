// D0 (2026-10-20) — đồng hồ đo băng thông đọc Supabase (egress) + ngân sách ngày.
//
// Bối cảnh: gói miễn phí Supabase tính 5 GB egress/THÁNG cho cả TỔ CHỨC (hai project Gateway + Project A dùng chung).
// Tháng 10/2026 vượt quota hai lần mà không ai biết trước -> project bị khoá (HTTP 402). Từ nay mọi phản hồi PostgREST
// được đo theo NHÃN (job / route) để biết ai tốn, và có ngân sách ngày:
//   - ngày vượt `softMb` -> cảnh báo (log + Telegram), vẫn phục vụ;
//   - ngày vượt `hardMb` HOẶC tháng ≥ 90% hạn mức -> lượt đọc của route người xem bị từ chối (503 nêu rõ nguyên nhân);
//   - ngày vượt `jobMb`  HOẶC tháng ≥ 97% hạn mức -> cả job cũng dừng đọc (không bao giờ chạm trần để bị khoá 402).
// Ngưỡng ngày đủ rộng cho lần nạp đầy kho đệm (một lần sau khi khôi phục); lúc ổn định mỗi ngày chỉ vài MB.
// Hạn mức tháng mặc định 3,5 GB cho Gateway: chừa ~1,5 GB cho project Supabase của Project A (cùng tổ chức, chung 5 GB).
// Số đo là byte JSON đã giải nén (≥ byte thực trên đường truyền khi có gzip) -> ước lượng THẬN TRỌNG.
import { AsyncLocalStorage } from "node:async_hooks";

const als = new AsyncLocalStorage();
const MB = 1024 * 1024;

/** Chạy `fn` với nhãn đo egress (VD "job:scanUniverse", "http:/api/market/ta-series"). */
export function withDbTag(tag, fn) {
  return als.run({ tag }, fn);
}
export function currentDbTag() {
  return als.getStore()?.tag ?? "other";
}
const isJobTag = (tag) => tag.startsWith("job:");

export class EgressBudgetError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 503;
    this.egressBudget = true;
  }
}

const vnDay = (ms) => new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export function createEgressMeter({
  now = Date.now,
  softMb = num(process.env.MARKET_EGRESS_SOFT_MB, 150),
  hardMb = num(process.env.MARKET_EGRESS_HARD_MB, 300),
  jobMb = num(process.env.MARKET_EGRESS_JOB_MB, 500),
  monthlyQuotaMb = num(process.env.MARKET_EGRESS_MONTH_QUOTA_MB, 3584),
  onAlert = () => {},
} = {}) {
  let alert = onAlert;
  let day = vnDay(now());
  let month = day.slice(0, 7);
  let state = fresh();
  let monthBytes = 0; // tổng tháng (gồm cả các ngày trước, nạp từ KV khi khởi động)
  let monthDays = {}; // { "YYYY-MM-DD": bytes }
  const alerted = new Set();

  function fresh() {
    return { bytes: 0, requests: 0, byTag: {}, byTable: {}, blocked: 0 };
  }
  function roll() {
    const d = vnDay(now());
    if (d === day) return;
    monthDays[day] = state.bytes;
    day = d;
    if (d.slice(0, 7) !== month) { month = d.slice(0, 7); monthBytes = 0; monthDays = {}; }
    state = fresh();
    alerted.clear();
  }

  /** Gọi TRƯỚC khi gửi một lượt đọc. Ném EgressBudgetError khi vượt ngân sách. */
  function check(tag = currentDbTag()) {
    roll();
    const used = state.bytes / MB;
    const monthPct = monthBytes / MB / monthlyQuotaMb;
    const job = isJobTag(tag);
    if (used >= jobMb || monthPct >= 0.97 || (!job && (used >= hardMb || monthPct >= 0.9))) {
      state.blocked += 1;
      const why = monthPct >= (job ? 0.97 : 0.9)
        ? `tháng này đã dùng ${Math.round(monthPct * 100)}% hạn mức ${monthlyQuotaMb} MB`
        : `hôm nay đã dùng ${used.toFixed(0)} MB (trần ${job ? jobMb : hardMb} MB)`;
      throw new EgressBudgetError(`Băng thông kho dữ liệu: ${why} — tạm ngừng đọc để giữ gói miễn phí; dữ liệu đã lưu đệm vẫn phục vụ.`);
    }
  }

  function record(bytes, { table = "?", tag = currentDbTag() } = {}) {
    roll();
    state.bytes += bytes;
    state.requests += 1;
    monthBytes += bytes;
    const t = (state.byTag[tag] ??= { bytes: 0, requests: 0 });
    t.bytes += bytes; t.requests += 1;
    const b = (state.byTable[table] ??= { bytes: 0, requests: 0 });
    b.bytes += bytes; b.requests += 1;
    const used = state.bytes / MB;
    for (const [level, limit] of [["soft", softMb], ["hard", hardMb]]) {
      if (used >= limit && !alerted.has(level)) {
        alerted.add(level);
        alert(level, `Băng thông Supabase hôm nay ${used.toFixed(0)} MB ≥ ngưỡng ${level === "soft" ? "cảnh báo" : "chặn"} ${limit} MB. Nhiều nhất: ${top(state.byTag, 3)}.`);
      }
    }
  }

  function top(map, n) {
    return Object.entries(map).sort((a, b) => b[1].bytes - a[1].bytes).slice(0, n).map(([k, v]) => `${k} ${(v.bytes / MB).toFixed(1)} MB`).join(", ");
  }

  function snapshot() {
    roll();
    const vn = new Date(now() + 7 * 3_600_000);
    const daysInMonth = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() + 1, 0)).getUTCDate();
    const dayOfMonth = vn.getUTCDate();
    const pastDays = Object.values(monthDays);
    const avgPast = pastDays.length ? pastDays.reduce((a, b) => a + b, 0) / pastDays.length : state.bytes;
    const projected = monthBytes + Math.max(0, daysInMonth - dayOfMonth) * Math.max(avgPast, state.bytes);
    const mb = (x) => Math.round((x / MB) * 100) / 100;
    const rows = (m) => Object.entries(m).sort((a, b) => b[1].bytes - a[1].bytes).map(([k, v]) => ({ key: k, mb: mb(v.bytes), requests: v.requests }));
    return {
      day, month,
      today: { mb: mb(state.bytes), requests: state.requests, blocked: state.blocked },
      budget: { softMb, hardMb, jobMb, monthlyQuotaMb, status: state.bytes / MB >= hardMb || monthBytes / MB >= 0.9 * monthlyQuotaMb ? "blocked" : state.bytes / MB >= softMb || projected / MB >= monthlyQuotaMb ? "warn" : "ok" },
      monthToDate: { mb: mb(monthBytes), projectedMb: mb(projected), quotaPct: Math.round((projected / MB / monthlyQuotaMb) * 1000) / 10 },
      byTag: rows(state.byTag).slice(0, 30),
      byTable: rows(state.byTable),
      note: "Byte JSON đã giải nén (ước lượng thận trọng, ≥ byte thực tế trên đường truyền). Hạn mức Supabase miễn phí tính chung cả tổ chức.",
    };
  }

  /** Trạng thái bền (lưu KV định kỳ) để tổng tháng không mất khi khởi động lại. */
  function persistable() {
    roll();
    return { month, days: { ...monthDays, [day]: state.bytes } };
  }
  function restore(doc) {
    roll();
    if (!doc || doc.month !== month) return;
    monthDays = {};
    for (const [d, b] of Object.entries(doc.days ?? {})) if (d !== day && Number.isFinite(b)) monthDays[d] = b;
    const todayPrev = Number(doc.days?.[day]) || 0;
    state.bytes += todayPrev;
    monthBytes = Object.values(monthDays).reduce((a, b) => a + b, 0) + state.bytes;
  }

  return { check, record, snapshot, persistable, restore, setAlert: (fn) => { alert = fn; } };
}

let shared = null;
/** Đồng hồ dùng chung cho tiến trình (store Supabase + route /api/health/db-budget). */
export function sharedEgressMeter() {
  shared ??= createEgressMeter();
  return shared;
}
export function setSharedEgressMeter(m) {
  shared = m;
}
