// 26/11/2026 — Mô hình Hồ sơ phân tích của Snapshot bằng chứng (tab con 3 · Phòng họp AI).
// Mục tiêu: khi bấm Snapshot / một lớp xác nhận, người đọc thấy NGAY kết luận, vì sao, số đo then chốt, chất lượng dữ liệu và
// điều kiện làm thay đổi đánh giá — thay vì danh sách endpoint / JSON thô. Mọi con số lấy từ snapshot đang xem (hoặc quyết định
// Elite HL CÙNG PHIÊN); không tự suy ra tín hiệu mới, không gọi AI. Nhãn "đọc" là diễn giải cơ học từ số đo, không phải dự báo.
import type { EvidenceRef, EvidenceSnapshot, JsonValue } from "../../../../lib/evidenceBrain/types";
import type { Confirmation, ResearchData } from "../../../../lib/evidenceBrain/research";
import type { HlPick, HlQueueItem } from "../../../../lib/elite10/decisionTypes";
import { PRIMARY_VI, PZ_VI, type PrimaryState } from "../../../../lib/elite10/cockpit";
import { dateVi, numberVi, sessionDay } from "./roomView";

export type DTone = "good" | "warn" | "bad" | "neutral";
export type DomainId = "decision" | "priceAction" | "volume" | "liquidity" | "events" | "seasonal" | "risk";
export interface Fact { label: string; value: string; tone?: DTone; hint?: string }
export interface DomainCard { id: DomainId; title: string; state: string; tone: DTone; read: string; facts: Fact[]; change: string[] }
export interface SourceRow { key: string; label: string; state: string; asOf: string; tone: DTone; note: string | null }
export interface Dossier {
  verdict: { label: string; tone: DTone; reason: string };
  scope: string;
  scoreline: { pass: number; wait: number; fail: number; missing: number; total: number };
  domains: DomainCard[];
  quality: { rows: SourceRow[]; issues: string[]; refs: { total: number; verified: number; derived: number; current: number; stale: number; missing: number } };
  triggers: string[];
}

const RESULT_VI: Record<Confirmation["result"], string> = {
  BLOCKED: "DỮ LIỆU ĐANG CHẶN", NO_CONFIRMATION: "CÓ LỚP CHƯA ĐẠT", INDETERMINATE: "CHƯA ĐỦ CĂN CỨ",
  PENDING: "CHỜ XÁC NHẬN", CRITERIA_MET: "ĐỦ ĐIỀU KIỆN KIỂM TRA", CONTEXT: "BỐI CẢNH VỊ THẾ",
};
const RESULT_TONE: Record<Confirmation["result"], DTone> = {
  BLOCKED: "bad", NO_CONFIRMATION: "bad", INDETERMINATE: "warn", PENDING: "warn", CRITERIA_MET: "good", CONTEXT: "neutral",
};
const CHECK_VI = { PASS: "ĐẠT", FAIL: "CHƯA ĐẠT", MISSING: "THIẾU CĂN CỨ", WAIT: "ĐANG CHỜ", CONTEXT: "BỐI CẢNH", EXCLUDED: "LOẠI KHỎI MÔ PHỎNG" } as const;
const CHECK_TONE = { PASS: "good", FAIL: "bad", MISSING: "warn", WAIT: "warn", CONTEXT: "neutral", EXCLUDED: "neutral" } as const;
const SOURCE_VI = { LOADED: "Đã tải", LOADING: "Đang tải", ERROR: "Lỗi nguồn", NOT_REQUESTED: "Chưa nạp", UNAVAILABLE: "Không khả dụng" } as const;
const LANE_VI = { CORE: "Lõi", RUNNER: "Chạy lãi", WAIT: "Chờ nền" } as const;
const PA_VI: Record<string, string> = {
  TRIGGERED: "Đã kích hoạt", FORMING: "Đang hình thành", INVALIDATED: "Đã vô hiệu", EXPIRED: "Hết hiệu lực", INSUFFICIENT: "Chưa đủ dữ liệu",
  UNKNOWN: "Chưa rõ", LOADING: "Đang tải", NOT_APPLICABLE: "Không áp dụng",
};
const OBV_VI = { up: "đi lên", down: "đi xuống", flat: "đi ngang" } as const;
/** Nguồn phải cùng phiên với Bảng quyết định thì mới dùng làm căn cứ. */
const SESSION_BOUND = new Set(["decision", "profile", "liquidity", "priceAction"]);

export const pctVi = (x: number | null | undefined, digits = 1, signed = true) => x == null || !Number.isFinite(x) ? "—"
  : `${signed && x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x * 100).toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
/** Giá cổ phiếu: đồng nguyên khi ≥ 1.000 (giá điều chỉnh có lẻ thập phân không mang nghĩa). */
const px = (x: number | null | undefined) => numberVi(x, finite(x) && Math.abs(x) >= 1000 ? 0 : 2);
const sentence = (x: string) => x.trim().replace(/[.。]+$/, "");
const TREND_VI: Record<string, string> = { bullish: "Tăng", bearish: "Giảm", neutral: "Đi ngang", sideways: "Đi ngang", up: "Tăng", down: "Giảm" };
const obj = (v: JsonValue | undefined): Record<string, JsonValue> | null => v && typeof v === "object" && !Array.isArray(v) ? v : null;

/** Giá đóng gần nhất của snapshot: nến ngày đã đóng (ưu tiên) rồi khối lượng. */
export function lastClose(data: ResearchData): { value: number | null; day: string | null } {
  const bars = data.price?.bars ?? [];
  const bar = bars[bars.length - 1];
  if (bar && finite(bar.close)) return { value: bar.close, day: bar.date ?? null };
  const q = data.volume?.today;
  return q && finite(q.price) ? { value: q.price, day: q.date } : { value: null, day: null };
}

function decisionCard(snap: EvidenceSnapshot, check: Confirmation["checks"][number] | undefined, pick: HlPick | null, queue: HlQueueItem | null): DomainCard {
  const m = snap.funnel.membership;
  const state = m.state as PrimaryState;
  const held = m.state === "PORTFOLIO_CORE" || m.state === "PORTFOLIO_RUNNER";
  const facts: Fact[] = [{ label: "Tư cách", value: PRIMARY_VI[state] ?? m.state }];
  if (m.rank != null || pick?.hl.rank != null) facts.push({ label: "Hạng HL", value: `#${pick?.hl.rank ?? m.rank}` });
  const pz = pick?.hl.pz?.state ?? (m.pz as keyof typeof PZ_VI | null);
  if (pz && PZ_VI[pz as keyof typeof PZ_VI]) facts.push({ label: "Vị trí giá (PZ)", value: PZ_VI[pz as keyof typeof PZ_VI], tone: pz === "BUY_ZONE" ? "good" : pz === "FAILED" ? "bad" : pz === "EXTENDED" ? "warn" : "neutral" });
  const change: string[] = [];
  let read = check?.reason ?? m.reason ?? "Engine chưa ghi lý do cho mã này.";
  if (pick) {
    const h = pick.hl;
    if (h.pz?.lane) facts.push({ label: "Ngăn", value: LANE_VI[h.pz.lane] });
    facts.push({ label: "Tỷ trọng", value: pctVi(pick.weight, 1, false) });
    if (h.since) facts.push({ label: "Giữ từ", value: dateVi(h.since, true) });
    if (h.sinceRet != null) facts.push({ label: "Lãi/lỗ từ phiên khoá", value: pctVi(h.sinceRet), tone: h.sinceRet >= 0 ? "good" : "bad" });
    if (h.lsPct != null) facts.push({ label: "LS-v1 (phân vị)", value: numberVi(h.lsPct, 0) });
    if (h.exitBufferLs != null) facts.push({ label: "Cách ngưỡng ra (LS)", value: `${numberVi(h.exitBufferLs, 0)} điểm`, tone: h.exitBufferLs < 10 ? "warn" : "neutral" });
    facts.push({ label: "Mô hình TA đạt", value: String(h.taCount) });
    if (h.rrg != null) facts.push({ label: "RRG ngành", value: numberVi(h.rrg, 0), tone: h.rrg > 0 ? "good" : h.rrg < 0 ? "bad" : "neutral" });
    read = `Đang giữ ${h.since ? `từ ${dateVi(h.since, true)}` : ""}${h.sinceRet == null ? "" : Math.abs(h.sinceRet) < 0.0005 ? ", chưa có biến động giá từ phiên khoá" : `, ${h.sinceRet > 0 ? "lãi" : "lỗ"} ${pctVi(Math.abs(h.sinceRet), 1, false)} từ phiên khoá`}`
      + `${h.pz ? `; giá đang ở "${PZ_VI[h.pz.state]}"` : ""}. Phiếu này trình bày bối cảnh vị thế — không phải tín hiệu mua mới.`;
    if (h.exitBufferLs != null) change.push(`LS-v1 giảm thêm ${numberVi(h.exitBufferLs, 0)} điểm phân vị → chạm ngưỡng ra của Elite HL.`);
    if (h.warnings.length) change.push(...h.warnings.map((w) => `Cảnh báo engine: ${w}.`));
  } else if (queue) {
    facts.push({ label: "Hạng hàng chờ", value: `#${queue.hlRank}` });
    read = `Đạt chuẩn nhưng chưa vào danh mục: ${queue.reasonVi}.`;
    change.push("Vào danh mục ở phiên cân bằng kế tiếp nếu vẫn giữ hạng và còn chỗ trong ngành / tỷ trọng.");
  } else if (!held && m.state !== "UNKNOWN") {
    change.push("Mã cần đi qua đủ Phễu (tầng 1 + RRG ngành + thanh khoản + PZ) ở phiên sau mới có tư cách vào danh mục.");
  }
  if (snap.funnel.frozen) change.unshift(`Data Guard mở khoá: ${snap.funnel.frozenReasons.join("; ") || "nguồn đầy đủ trở lại"}.`);
  const tone: DTone = snap.funnel.frozen ? "bad" : check ? CHECK_TONE[check.state] : held ? "good" : "neutral";
  return { id: "decision", title: "Tư cách Phễu", state: snap.funnel.frozen ? "DATA GUARD" : check ? CHECK_VI[check.state] : held ? "DANH MỤC" : "THEO DÕI", tone, read, facts, change };
}

function priceActionCard(data: ResearchData, check: Confirmation["checks"][number] | undefined): DomainCard {
  const pa = data.pa;
  const close = lastClose(data);
  const facts: Fact[] = [];
  const change: string[] = [];
  if (!pa) return { id: "priceAction", title: "Price Action", state: check ? CHECK_VI[check.state] : "CHƯA CÓ", tone: "warn",
    read: check?.reason ?? "Chưa nạp được Price Action cho mã này.", facts, change: ["Nạp nến ngày đã đóng của đúng mã và phiên quyết định."] };
  facts.push({ label: "Trạng thái", value: PA_VI[pa.state] ?? pa.state, tone: pa.state === "TRIGGERED" && pa.barClosed ? "good" : pa.state === "INVALIDATED" || pa.state === "EXPIRED" ? "bad" : "warn" });
  if (pa.trend) facts.push({ label: "Xu hướng", value: TREND_VI[pa.trend.toLowerCase()] ?? pa.trend });
  if (close.value != null) facts.push({ label: "Giá đóng", value: `${px(close.value)}${close.day ? ` · ${dateVi(close.day)}` : ""}` });
  const s = pa.setup;
  let read = check?.reason ?? (pa.blockers[0] ?? "Engine chưa có setup trên nến đóng.");
  if (s) {
    facts.unshift({ label: "Setup", value: `${s.kind} · ${dateVi(s.stateDate, true)}` });
    if (finite(s.entryReference)) facts.push({ label: "Điểm kích hoạt", value: px(s.entryReference) });
    if (finite(s.invalidationLevel)) {
      const gap = close.value != null ? (close.value - s.invalidationLevel) / close.value : null;
      facts.push({ label: "Mức vô hiệu", value: px(s.invalidationLevel), hint: gap != null ? `cách giá ${pctVi(gap, 1, false)}` : undefined, tone: gap != null && gap < 0.03 ? "warn" : "neutral" });
      change.push(`Đóng cửa dưới ${px(s.invalidationLevel)} → setup vô hiệu, lớp Price Action chuyển "Chưa đạt".`);
    }
    if (finite(s.target)) {
      const up = close.value != null ? (s.target - close.value) / close.value : null;
      facts.push({ label: "Mục tiêu engine", value: px(s.target), hint: up != null ? `còn ${pctVi(up)}` : undefined });
    }
    if (finite(s.entryReference) && finite(s.invalidationLevel) && finite(s.target) && s.entryReference > s.invalidationLevel) {
      const rr = (s.target - s.entryReference) / (s.entryReference - s.invalidationLevel);
      facts.push({ label: "Tỷ lệ lời/lỗ (từ điểm kích hoạt)", value: `${numberVi(rr, 1)} : 1`, tone: rr >= 2 ? "good" : rr < 1 ? "warn" : "neutral" });
    }
    if (pa.state === "FORMING" && finite(s.entryReference)) change.unshift(`Nến ngày đóng trên ${px(s.entryReference)} → setup kích hoạt.`);
  }
  if (pa.state === "TRIGGERED" && pa.barClosed !== true) change.unshift("Chờ nến ngày đóng để xác nhận kích hoạt.");
  facts.push({ label: "Nến", value: pa.barClosed ? "Đã đóng" : pa.barClosed === false ? "Chưa đóng" : "Chưa rõ", tone: pa.barClosed ? "good" : "warn" });
  if (pa.priceBasis) facts.push({ label: "Cơ sở giá", value: pa.priceBasis });
  if (pa.patterns.length) facts.push({ label: "Mẫu hình", value: pa.patterns.slice(0, 4).join(", ") });
  if (pa.blockers.length && check?.state !== "PASS") read += ` Vướng: ${pa.blockers.slice(0, 2).map(sentence).join("; ")}.`;
  return { id: "priceAction", title: "Price Action", state: check ? CHECK_VI[check.state] : PA_VI[pa.state] ?? pa.state, tone: check ? CHECK_TONE[check.state] : "neutral", read, facts, change };
}

function volumeCard(data: ResearchData, check: Confirmation["checks"][number] | undefined): DomainCard {
  const v = data.volume;
  if (!v) return { id: "volume", title: "Khối lượng & dòng tiền", state: check ? CHECK_VI[check.state] : "CHƯA CÓ", tone: "warn",
    read: check?.reason ?? "Chưa nạp được khối lượng của mã.", facts: [], change: ["Nạp khối lượng ngày chốt của đúng mã."] };
  const intraday = v.today.rvolMode === "intraday";
  const rvol = intraday ? v.today.rvolTimeAdjusted : v.today.rvol20;
  const facts: Fact[] = [
    { label: intraday ? "RVOL cùng thời điểm" : "RVOL 20 phiên", value: finite(rvol) ? `${numberVi(rvol)}×` : "—", tone: finite(rvol) ? rvol >= 1.5 ? "good" : rvol < 1 ? "warn" : "neutral" : "neutral",
      hint: intraday ? "trong phiên — chưa chốt" : `phiên ${dateVi(v.today.date)}` },
    { label: "OBV", value: OBV_VI[v.trend.obvDirection], tone: v.trend.obvDirection === "up" ? "good" : v.trend.obvDirection === "down" ? "bad" : "neutral" },
  ];
  if (finite(v.trend.cmf20)) facts.push({ label: "CMF 20", value: numberVi(v.trend.cmf20, 2), tone: v.trend.cmf20 > 0.05 ? "good" : v.trend.cmf20 < -0.05 ? "bad" : "neutral" });
  if (finite(v.trend.upDownVolumeRatio20)) facts.push({ label: "KL phiên tăng / giảm (20)", value: `${numberVi(v.trend.upDownVolumeRatio20, 2)}×` });
  if (v.profile) facts.push({ label: "So với vùng giá trị", value: v.profile.position === "above" ? "Trên vùng giá trị" : v.profile.position === "below" ? "Dưới vùng giá trị" : "Trong vùng giá trị",
    hint: `POC ${numberVi(v.profile.poc)} · ${numberVi(v.profile.valueAreaLow)}–${numberVi(v.profile.valueAreaHigh)}`, tone: v.profile.position === "above" ? "good" : v.profile.position === "below" ? "warn" : "neutral" });
  if (v.foreign && !v.foreign.pendingToday) facts.push({ label: "Khối ngoại ròng 5 / 20 phiên", value: `${numberVi(v.foreign.net5Val / 1e9, 1)} / ${numberVi(v.foreign.net20Val / 1e9, 1)} tỷ`,
    tone: v.foreign.net20Val > 0 ? "good" : v.foreign.net20Val < 0 ? "bad" : "neutral" });
  const div = v.trend.divergence;
  if (div) facts.push({ label: "Cờ giá – khối lượng", value: div.label, tone: "warn", hint: `giá ${numberVi(div.priceChangePct, 1)}% · KL ${numberVi(div.volumeChangePct, 1)}%` });
  const flow = [v.trend.obvDirection === "up" ? "OBV đi lên" : v.trend.obvDirection === "down" ? "OBV đi xuống" : null,
    finite(v.trend.cmf20) ? v.trend.cmf20 > 0.05 ? "CMF dương (tiền vào)" : v.trend.cmf20 < -0.05 ? "CMF âm (tiền ra)" : null : null].filter(Boolean);
  const read = `${finite(rvol) ? `Khối lượng ${rvol >= 1 ? "cao hơn" : "thấp hơn"} nền ${intraday ? "cùng thời điểm" : "20 phiên"} (${numberVi(rvol)}×)` : "Chưa có RVOL"}`
    + `${flow.length ? `; ${flow.join(", ")}` : ""}${div ? `; engine gắn cờ "${div.label}"` : ""}.` + (check && check.state !== "PASS" ? ` Lớp khối lượng: ${sentence(check.reason)}.` : "");
  const change: string[] = [];
  if (intraday) change.push("Chờ khối lượng ngày chốt — RVOL trong phiên chỉ là quan sát tạm.");
  else if (finite(rvol) && rvol < 1) change.push("RVOL ngày ≥ 1× ở phiên tới → lớp khối lượng đạt nền của chính sách.");
  if (div) change.push(`Engine bỏ cờ "${div.label}" ở phiên sau — cờ này đang giữ lớp khối lượng ở trạng thái chờ.`);
  return { id: "volume", title: "Khối lượng & dòng tiền", state: check ? CHECK_VI[check.state] : "BỐI CẢNH", tone: check ? CHECK_TONE[check.state] : "neutral", read, facts, change };
}

function liquidityCard(data: ResearchData, check: Confirmation["checks"][number] | undefined): DomainCard {
  const l = data.liquidity?.liq;
  const facts: Fact[] = [];
  if (l) {
    facts.push({ label: "Lớp thanh khoản", value: l.tier, tone: l.tier === "L1" || l.tier === "L2" ? "good" : l.tier === "L3" || l.tier === "L4" ? "bad" : "neutral" });
    if (finite(l.med20)) facts.push({ label: "GTGD trung vị 20 phiên", value: `${numberVi(l.med20, 1)} tỷ` });
    if (finite(l.p10)) facts.push({ label: "Phiên yếu (P10)", value: `${numberVi(l.p10, 1)} tỷ`, hint: "10% phiên thấp nhất" });
    if (finite(l.illiq)) facts.push({ label: "Độ trượt Amihud", value: `${numberVi(l.illiq, 2)}%/tỷ` });
    if (finite(l.stressDays)) facts.push({ label: "Phiên căng", value: String(l.stressDays) });
    if (finite(l.capacityBn)) facts.push({ label: "Sức chứa lệnh", value: `${numberVi(l.capacityBn, 2)} tỷ/phiên` });
  }
  const read = l ? `${l.tier === "L1" || l.tier === "L2" ? "Đủ sâu" : "Mỏng"} so với vốn tham chiếu: trung vị ${numberVi(l.med20, 1)} tỷ/phiên${l.reasons.length ? `, vướng ${l.reasons.length} tiêu chí LQ-v1` : ""}.` : check?.reason ?? "Chưa có phân tầng thanh khoản.";
  const change = l && (l.tier === "L3" || l.tier === "L4") ? ["GTGD trung vị 20 phiên tăng lên lớp L2 trở lên → lớp thanh khoản đạt."]
    : l ? ["Thanh khoản tụt xuống L3/L4 → loại khỏi chính sách nghiên cứu."] : [];
  return { id: "liquidity", title: "Thanh khoản", state: check ? CHECK_VI[check.state] : l?.tier ?? "CHƯA CÓ", tone: check ? CHECK_TONE[check.state] : "neutral", read, facts, change };
}

function eventsCard(data: ResearchData, official: (e: ResearchData["events"][number]) => boolean, check: Confirmation["checks"][number] | undefined): DomainCard {
  const ev = data.events;
  const prim = ev.filter(official).length;
  const latest = ev.slice().sort((a, b) => Date.parse(b.publishedAt ?? b.firstSeenAt) - Date.parse(a.publishedAt ?? a.firstSeenAt))[0];
  const facts: Fact[] = [
    { label: "Cụm tin", value: String(ev.length) },
    { label: "Công bố gốc", value: String(prim), tone: prim ? "good" : "neutral" },
    { label: "Cần đối chiếu", value: String(ev.length - prim), tone: ev.length - prim ? "warn" : "neutral" },
  ];
  if (latest) facts.push({ label: "Mới nhất", value: `${dateVi(latest.publishedAt ?? latest.firstSeenAt)} · ${latest.title}` });
  const read = ev.length ? `${ev.length} cụm tin; ${prim} cụm từ nguồn công bố gốc. Xúc tác chỉ là bối cảnh — nhiều kênh đăng lại cùng tài liệu không phải xác nhận độc lập.`
    : "Không có tin gắn mã trong cửa sổ Event Radar.";
  return { id: "events", title: "Xúc tác", state: check ? CHECK_VI[check.state] : ev.length ? "RÀ SOÁT" : "KHÔNG CÓ TIN", tone: ev.length - prim ? "warn" : "neutral", read, facts,
    change: ev.length - prim ? ["Đối chiếu tin \"cần đối chiếu\" với tài liệu công bố gốc trước khi dùng làm luận điểm."] : [] };
}

function seasonalCard(data: ResearchData): DomainCard | null {
  const t = data.timing;
  if (!t) return null;
  return { id: "seasonal", title: "Cửa sổ mùa vụ", state: t.status === "IN_WINDOW" ? "TRONG CỬA SỔ" : t.status === "UPCOMING" ? "SẮP TỚI" : "ĐÃ QUA",
    tone: t.status === "IN_WINDOW" && t.tier === "VALIDATED" ? "good" : "neutral",
    read: `${t.windowLabel}: vào ${dateVi(t.entryFromDate)} → ${dateVi(t.entryToDate)}; kỳ vọng ròng ${numberVi(t.netExpectancy * 100, 1)}% (cận dưới ${numberVi(t.netExpectancyLcb * 100, 1)}%) trên ${t.nEvents} sự kiện. Chỉ là bối cảnh, không đổi tư cách Phễu.`,
    facts: [{ label: "Bậc", value: t.tier === "VALIDATED" ? "Đã kiểm chứng" : "Gần đạt" }, { label: "Số sự kiện", value: String(t.nEvents) },
      { label: "Kỳ vọng ròng", value: `${numberVi(t.netExpectancy * 100, 1)}%`, tone: t.netExpectancyLcb > 0 ? "good" : "neutral" }, { label: "FDR q", value: numberVi(t.fdrQValue, 3) }],
    change: [] };
}

function riskCard(data: ResearchData, day: string | null): DomainCard | null {
  const r = data.risk;
  if (!r?.available) return null;
  const facts: Fact[] = [];
  if (r.volatility) facts.push({ label: "Biến động năm", value: pctVi(r.volatility.annual, 1, false) });
  const v95 = r.var?.["0.95"]?.historical;
  if (v95) facts.push({ label: "VaR 95% (1 phiên)", value: pctVi(v95.var, 2, false), hint: `CVaR ${pctVi(v95.cvar, 2, false)}` });
  if (finite(r.beta)) facts.push({ label: "Beta với VN-Index", value: numberVi(r.beta, 2) });
  if (r.maxDrawdown) facts.push({ label: "Sụt giảm lớn nhất", value: pctVi(r.maxDrawdown.value, 1), tone: "warn" });
  if (r.diversification) facts.push({ label: "Số vị thế độc lập (ENB)", value: numberVi(r.diversification.enb, 1) });
  if (finite(r.invested)) facts.push({ label: "Cổ phiếu / tiền mặt", value: `${pctVi(r.invested, 0, false)} / ${pctVi(r.cash ?? 1 - r.invested, 0, false)}` });
  const stale = Boolean(day && sessionDay(r.date) !== day);
  return { id: "risk", title: "Rủi ro danh mục", state: stale ? "LỆCH PHIÊN" : "BỐI CẢNH", tone: stale ? "warn" : "neutral",
    read: `${r.label} · đo ${dateVi(r.date, true)}${r.sessions ? ` trên ${r.sessions} phiên` : ""}. Số đo của cả danh mục, không riêng mã đang xem.`, facts, change: [] };
}

export function sourceRows(snap: EvidenceSnapshot): SourceRow[] {
  const day = sessionDay(snap.decisionSession);
  return snap.sources.map((s) => {
    const mismatch = Boolean(s.state === "LOADED" && day && s.asOf && SESSION_BOUND.has(s.key) && sessionDay(s.asOf) !== day);
    const note = [s.error, mismatch ? `Lệch phiên: nguồn ${dateVi(s.asOf)}, quyết định ${dateVi(day)}` : null, ...s.warnings].filter(Boolean).join(" · ") || null;
    return { key: s.key, label: s.label, state: SOURCE_VI[s.state], asOf: s.asOf ? dateVi(s.asOf, true) : "—", note,
      tone: s.state === "ERROR" ? "bad" : s.state !== "LOADED" || mismatch || s.warnings.length ? "warn" : "good" };
  });
}

export function buildDossier({ snap, data, confirmation, pick, queue, official }: {
  snap: EvidenceSnapshot; data: ResearchData; confirmation: Confirmation | null; pick: HlPick | null; queue: HlQueueItem | null;
  official: (e: ResearchData["events"][number]) => boolean;
}): Dossier {
  const checks = confirmation?.checks ?? [];
  const by = (id: string) => checks.find((c) => c.id === id);
  const day = sessionDay(snap.decisionSession);
  const domains: DomainCard[] = [decisionCard(snap, by("decision"), pick, queue)];
  if (snap.ticker) domains.push(priceActionCard(data, by("priceAction")), volumeCard(data, by("volume")), liquidityCard(data, by("liquidity")), eventsCard(data, official, by("events")));
  const seasonal = seasonalCard(data); if (seasonal) domains.push(seasonal);
  const risk = riskCard(data, day); if (risk) domains.push(risk);
  const rows = sourceRows(snap);
  const issues = [
    ...snap.conflicts.map((c) => `Mâu thuẫn: ${c}`),
    ...snap.funnel.frozenReasons.map((r) => `Data Guard: ${r}`),
    ...snap.missing.map((m) => `Thiếu: ${m}`),
    ...snap.stale.map((m) => `Cũ: ${m}`),
    ...snap.limitations,
  ];
  const refs = snap.refs;
  const count = (f: (r: EvidenceRef) => boolean) => refs.filter(f).length;
  const graded = checks.filter((c) => c.state !== "CONTEXT" && c.state !== "EXCLUDED");
  const result = confirmation?.result ?? (snap.ticker ? "INDETERMINATE" : "CONTEXT");
  const triggers = [...new Set(domains.flatMap((d) => d.change))].slice(0, 6);
  const scope = snap.ticker ? `${snap.ticker}${pick ? ` · trong danh mục Elite HL` : queue ? " · hàng chờ Elite HL" : ""} · phiên quyết định ${dateVi(snap.decisionSession, true)}`
    : `Danh mục ${snap.portfolioKind === "ELITE_FLOW" ? "Elite" : "Elite HL"} · phiên ${dateVi(snap.decisionSession, true)}`;
  return {
    verdict: { label: RESULT_VI[result], tone: RESULT_TONE[result], reason: confirmation?.reason ?? (snap.ticker ? "Chưa đánh giá được các lớp xác nhận." : "Chọn mã để kiểm tra các điều kiện theo cổ phiếu.") },
    scope,
    scoreline: { pass: graded.filter((c) => c.state === "PASS").length, wait: graded.filter((c) => c.state === "WAIT").length,
      fail: graded.filter((c) => c.state === "FAIL").length, missing: graded.filter((c) => c.state === "MISSING").length, total: graded.length },
    domains,
    quality: { rows, issues, refs: { total: refs.length, verified: count((r) => r.status === "VERIFIED"), derived: count((r) => r.status === "DERIVED"),
      current: count((r) => r.freshness === "CURRENT"), stale: count((r) => r.freshness === "STALE"), missing: count((r) => r.freshness === "MISSING") } },
    triggers,
  };
}

/** Giá trị ref → chữ đọc được (không JSON). Số theo kiểu Việt Nam, kèm đơn vị; đối tượng → cặp khoá: giá trị một tầng. */
export function refValueText(value: JsonValue, unit: string | null): string {
  if (value === null) return "—";
  if (typeof value === "number") return `${numberVi(value, Math.abs(value) < 1 ? 4 : 2)}${unit ? ` ${unit}` : ""}`;
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "string") return `${value}${unit ? ` ${unit}` : ""}`;
  if (Array.isArray(value)) return value.length === 0 ? "(trống)" : value.every((v) => typeof v !== "object" || v === null) ? value.map((v) => refValueText(v, null)).join(", ") : `${value.length} mục`;
  return "";
}
export function refPairs(value: JsonValue): [string, string][] {
  const o = obj(value);
  if (!o) return [];
  return Object.entries(o).filter(([, v]) => v !== null && v !== undefined).slice(0, 12)
    .map(([k, v]) => [k, typeof v === "object" && v !== null && !Array.isArray(v) ? `${Object.keys(v).length} trường` : refValueText(v, null)]);
}
