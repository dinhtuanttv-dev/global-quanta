// LSK1 (07/11/2026) — Lịch sự kiện doanh nghiệp: chuẩn hoá sự kiện VNDirect finfo /v4/events (công khai), phát hiện đổi ngày, kiểm chéo CafeF.
// Hàm thuần (không I/O). Nhóm: DIVIDEND (tiền / cổ phiếu / thưởng / đổi ngày trả), MEETING (ĐHCĐ / chốt quyền họp / lấy ý kiến),
// CAPITAL (phát hành thêm, quyền mua, chuyển đổi, niêm yết bổ sung), STATUS (niêm yết / huỷ, cảnh báo, kiểm soát, ký quỹ, nhắc nhở).
// Ngày (theo đối chiếu dữ liệu 07/11/2026):
//   DIVIDEND: effectiveDate = GDKHQ, actualDate (hoặc expiredDate) = ngày thanh toán; ĐKCC = phiên kế tiếp sau GDKHQ (T+1, quy chế từ 2022).
//   STOCKDIV / KINDDIV: effectiveDate = GDKHQ, expiredDate = ĐKCC.
//   meetingRight: effectiveDate = ĐKCC (GDKHQ = phiên liền trước), actualDate / expiredDate = ngày họp. MEETING: effectiveDate = ngày họp.
//   ISSUE: effectiveDate = GDKHQ quyền mua, expiredDate = hết hạn đăng ký. CONVERT: effectiveDate = ngày chốt, actualDate = ngày chuyển đổi.
export const CE_VERSION = "CE-v1 (2026-11-07)";

export const TYPES = Object.freeze({
  DIVIDEND: { cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền" },
  STOCKDIV: { cat: "STOCK", group: "DIVIDEND", label: "Cổ tức cổ phiếu" },
  KINDDIV: { cat: "BONUS", group: "DIVIDEND", label: "Cổ phiếu thưởng" },
  ADPAYDATE: { cat: "PAY_CHANGE", group: "DIVIDEND", label: "Đổi ngày trả cổ tức" },
  MEETING: { cat: "AGM", group: "MEETING", label: "Họp ĐHCĐ" },
  meetingRight: { cat: "AGM_RECORD", group: "MEETING", label: "Chốt quyền họp ĐHCĐ" },
  POLL: { cat: "POLL", group: "MEETING", label: "Lấy ý kiến cổ đông" },
  ISSUE: { cat: "RIGHTS", group: "CAPITAL", label: "Phát hành thêm / quyền mua" },
  CONVERT: { cat: "CONVERT", group: "CAPITAL", label: "Chuyển đổi trái phiếu" },
  LISTED: { cat: "ADD_LISTING", group: "CAPITAL", label: "Niêm yết bổ sung" },
  listedHose: { cat: "LISTING", group: "STATUS", label: "Niêm yết HOSE" }, listedHnx: { cat: "LISTING", group: "STATUS", label: "Niêm yết HNX" }, listedUpcom: { cat: "LISTING", group: "STATUS", label: "Đăng ký UPCOM" },
  lastTradeHose: { cat: "LAST_TRADE", group: "STATUS", label: "Ngày giao dịch cuối" }, lastTradeHnx: { cat: "LAST_TRADE", group: "STATUS", label: "Ngày giao dịch cuối" }, lastTradeUpcom: { cat: "LAST_TRADE", group: "STATUS", label: "Ngày giao dịch cuối" },
  delistedHose: { cat: "DELIST", group: "STATUS", label: "Huỷ niêm yết" }, delistedHnx: { cat: "DELIST", group: "STATUS", label: "Huỷ niêm yết" }, delistedUpcom: { cat: "DELIST", group: "STATUS", label: "Huỷ niêm yết" },
  alert: { cat: "WARNING", group: "STATUS", label: "Diện cảnh báo" }, control: { cat: "CONTROL", group: "STATUS", label: "Diện kiểm soát" },
  halt: { cat: "HALT", group: "STATUS", label: "Kiểm soát đặc biệt / hạn chế GD" }, suspend: { cat: "HALT", group: "STATUS", label: "Tạm ngừng giao dịch" },
  noticed: { cat: "NOTICE", group: "STATUS", label: "Nhắc nhở công bố thông tin" },
  nomargin: { cat: "NO_MARGIN", group: "STATUS", label: "Không đủ điều kiện ký quỹ" }, eligibleMargin: { cat: "MARGIN_OK", group: "STATUS", label: "Đủ điều kiện ký quỹ trở lại" },
});

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const d10 = (x) => { const s = String(x ?? "").slice(0, 10); return ISO.test(s) ? s : null; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/** Phiên giao dịch kế tiếp / liền trước. isTradingDay(iso) -> boolean. */
export function shiftSession(d, dir, isTradingDay) { let x = d; for (let i = 0; i < 20; i++) { x = addDays(x, dir); if (isTradingDay(x)) return x; } return null; }
const defaultTrading = (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());

/** Một bản ghi VNDirect -> sự kiện chuẩn hoá, hoặc null (loại không theo dõi / thiếu ngày). */
export function normalize(raw, isTradingDay = defaultTrading) {
  const spec = TYPES[raw?.type]; if (!spec) return null;
  const eff = d10(raw.effectiveDate); if (!eff) return null;
  const exp = d10(raw.expiredDate), act = d10(raw.actualDate);
  const e = { id: String(raw.id ?? `${raw.code}|${raw.type}|${eff}`), t: String(raw.code), type: raw.type, cat: spec.cat, group: spec.group, label: spec.label,
    title: String(raw.note ?? "").trim() || spec.label, disclosed: d10(raw.disclosureDate), date: eff,
    ex: null, record: null, pay: null, meeting: null, end: null, cash: null, ratio: null, period: raw.divPeriod ?? null, year: raw.divYear ?? null,
    changed: raw.prevDate && d10(raw.prevDate) !== eff ? d10(raw.prevDate) : null };
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null);
  switch (spec.cat) {
    case "CASH": e.ex = eff; e.record = shiftSession(eff, 1, isTradingDay); e.pay = act ?? exp; e.cash = n(raw.dividend); e.ratio = n(raw.ratio); break;
    case "STOCK": case "BONUS": e.ex = eff; e.record = exp ?? shiftSession(eff, 1, isTradingDay); e.ratio = n(raw.ratio); break;
    case "PAY_CHANGE": e.pay = act ?? exp; e.cash = n(raw.dividend); break;
    case "AGM_RECORD": e.record = eff; e.ex = shiftSession(eff, -1, isTradingDay); e.meeting = act ?? exp; break;
    case "AGM": e.meeting = eff; break;
    case "RIGHTS": e.ex = eff; e.end = exp; e.ratio = n(raw.ratio); break;
    case "CONVERT": e.record = eff; e.end = act ?? exp; break;
    default: e.end = exp; break;
  }
  return e;
}

/** Ngày trọng tâm để xếp lịch: GDKHQ nếu có, rồi ngày họp, rồi ngày hiệu lực. */
export const keyDate = (e) => e.ex ?? e.meeting ?? e.date;

const FIELDS = ["date", "ex", "record", "pay", "meeting", "end", "cash", "ratio", "title"];
/** So hai lần nạp (Map id -> sự kiện): sự kiện mới công bố + trường đổi giá trị. */
export function diffEvents(prev, next, at) {
  const out = [];
  if (!prev) return out;
  for (const [id, e] of next) {
    const p = prev.get(id);
    if (!p) { out.push({ at, kind: "NEW", id, t: e.t, cat: e.cat, label: e.label, date: keyDate(e), title: e.title }); continue; }
    for (const f of FIELDS) if ((p[f] ?? null) !== (e[f] ?? null)) out.push({ at, kind: "CHANGED", id, t: e.t, cat: e.cat, label: e.label, field: f, from: p[f] ?? null, to: e[f] ?? null, date: keyDate(e), title: e.title });
  }
  for (const [id, p] of prev) if (!next.has(id) && keyDate(p) >= at.slice(0, 10)) out.push({ at, kind: "REMOVED", id, t: p.t, cat: p.cat, label: p.label, date: keyDate(p), title: p.title });
  return out;
}

const strip = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
/** Ngày viết trong tiêu đề ("21.7.2025", "21/07/2025", "21-07-2025") -> ISO[]. */
export function datesInTitle(title) {
  const out = [];
  for (const m of String(title).matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g)) {
    const d = Number(m[1]), mo = Number(m[2]);
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) out.push(`${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}
const KIND = { CASH: /(co tuc|tra tien|bang tien)/, STOCK: /(co tuc|co phieu)/, BONUS: /(thuong|co phieu)/, AGM_RECORD: /(dai hoi|dhdcd|dhcd|hop)/, AGM: /(dai hoi|dhdcd|dhcd|hop)/, RIGHTS: /(quyen mua|phat hanh)/ };
/**
 * Kiểm chéo một sự kiện với tin doanh nghiệp CafeF ([[ngày, tiêu đề]]) quanh ngày công bố (−10 … +20 ngày):
 * tiêu đề cùng loại có ghi ngày GDKHQ / ĐKCC / họp trùng -> "CONFIRMED_2"; ghi ngày khác -> "CONFLICT" (kèm ngày CafeF); không có -> "SINGLE".
 */
export function crossCheck(e, rows) {
  const kind = KIND[e.cat]; if (!kind || !rows?.length) return { level: "SINGLE" };
  const anchor = e.disclosed ?? addDays(e.date, -14);
  const lo = addDays(anchor, -10), hi = addDays(anchor, 20);
  const want = new Set([e.ex, e.record, e.meeting, e.date].filter(Boolean));
  let conflict = null, announced = null;
  for (const [d, title] of rows) {
    if (d < lo || d > hi) continue;
    const s = strip(title);
    if (!kind.test(s)) continue;
    // Tin "ngày GDKHQ / ĐKCC tham dự ĐHĐCĐ" thuộc sự kiện chốt quyền họp (AGM_RECORD), không phải ngày họp: bỏ qua cho sự kiện họp.
    if (e.cat === "AGM" && /(gdkhq|dkcc|chot|dang ky cuoi cung)/.test(s)) continue;
    const ds = datesInTitle(title).filter((x) => x >= anchor.slice(0, 4));
    // Tin công bố của chính doanh nghiệp ("MÃ: …") cùng loại, sát ngày công bố, không ghi ngày -> xác nhận sự kiện có thật (chưa xác nhận ngày).
    if (!ds.length) { if (/^[A-Z0-9]{3,5}\s*:/.test(String(title).trim()) && d >= addDays(anchor, -3) && d <= addDays(anchor, 10) && /(co tuc|dkcc|chot|dai hoi|dhdcd|phat hanh|quyen)/.test(s)) announced ??= { date: d, title }; continue; }
    if (!/(gdkhq|dkcc|chot|ngay dang ky|ngay giao dich khong huong quyen|hop|to chuc)/.test(s)) continue;
    if (ds.some((x) => want.has(x))) return { level: "CONFIRMED_2", source: { date: d, title } };
    conflict ??= { date: d, title, dates: ds };
  }
  if (conflict) return { level: "CONFLICT", source: conflict };
  return announced ? { level: "ANNOUNCED_2", source: announced } : { level: "SINGLE" };
}
