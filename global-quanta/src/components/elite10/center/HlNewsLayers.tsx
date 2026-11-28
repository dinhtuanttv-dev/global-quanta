// HL-RADAR P2 (20/11/2026, tài liệu 20 mục 4.2) — "Tin & tác động 14 ngày" trên bảng Danh mục Elite HL + chip lọc hiển thị + thông báo
// tuỳ chọn. Mọi phần tử mang data-hl-layer (test vân tay gỡ chúng ra). MÔ TẢ: không đổi hạng, tỷ trọng, ngưỡng ra; xúc tác X6 THĂM DÒ.
//  - HlNewsStrip: dải SVG 14 ngày — mỗi tin một chấm theo giờ đăng (màu = cảm xúc, cỡ = mức quan trọng, viền đôi = ≥ 2 nguồn),
//    tin nổi bật có vòng vàng; huy hiệu phản ứng giá ESA + mũi tên nhận định; dòng tóm tắt. Bấm chấm -> bài gốc.
//  - HlRowFilters: chỉ ẩn / hiện dòng (mặc định tắt) — không đổi thứ tự hay số liệu.
//  - useHlNewsNotify: thông báo trình duyệt khi mã đang giữ có tin nóng mới (mặc định TẮT, cần bật và cấp quyền).
import { useEffect, useState } from "react";
import { esaOf, NEWS_STRIP_DAYS, type HlRowSignal } from "../../../lib/elite10/hlRowSignals";
import { NEWS_HOT_IMPORTANCE, NEWS_HOT_WINDOW_H } from "../../../lib/newsSignals";
import { browserNotify, notifyPermission, requestNotifyPermission } from "../../../lib/priceAlerts";
import type { SmartNewsItem } from "../../../hooks/useSmartNews";

const UP = "#34d399", DOWN = "#fb7185", AMBER = "#f59e0b", MUTED = "#94a3b8";
const W = 150, H = 26, PAD = 4;
const ESA_TONE: Record<string, string> = { up: "border-emerald-400/50 text-emerald-200", warn: "border-amber-400/50 text-amber-200", muted: "border-white/15 text-slate-400" };
const tone = (s: number) => (s >= 0.15 ? UP : s <= -0.15 ? DOWN : MUTED);
const hm = (iso: string | null) => { if (!iso) return "—"; const v = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString(); return `${v.slice(8, 10)}/${v.slice(5, 7)} ${v.slice(11, 16)}`; };
const sgn = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(2).replace(".", ",")}`;

export const NEWS_COL_TITLE = "Tin & tác động 14 ngày";
export const NEWS_COL_WIDTH = 190;

export function HlNewsHeader() {
  return (
    <th className="pl-2 font-normal" data-hl-layer="news-col" data-testid="hl-news-th"
      title="Mỗi chấm = một tin (màu = cảm xúc, cỡ = mức quan trọng, viền đôi = nhiều nguồn); vòng vàng = tin nổi bật. Phản ứng giá ESA và nhận định chỉ MÔ TẢ, không đổi danh mục.">
      {NEWS_COL_TITLE} <span className="rounded border border-white/15 px-1 text-[10px] text-slate-400">MÔ TẢ</span>
    </th>
  );
}

export function HlNewsStrip({ s, now, mobile = false }: { s: HlRowSignal | undefined; now: number; mobile?: boolean }) {
  if (!s) return null;
  const from = now - NEWS_STRIP_DAYS * 86_400_000;
  const x = (iso: string) => PAD + ((Date.parse(iso) - from) / (now - from)) * (W - 2 * PAD);
  const esa = esaOf(s.top);
  const hot = s.news?.hot;
  const body = (
    <>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" className="block"
        aria-label={s.items.length ? `${s.ticker}: ${s.items.length} tin trong 14 ngày${s.top ? `, nổi bật: ${s.top.title}` : ""}` : `${s.ticker}: không có tin trong 14 ngày`}>
        <line x1={PAD} y1={H / 2} x2={W - PAD} y2={H / 2} stroke="rgba(148,163,184,0.25)" />
        {Array.from({ length: NEWS_STRIP_DAYS + 1 }, (_, i) => <line key={i} x1={PAD + (i * (W - 2 * PAD)) / NEWS_STRIP_DAYS} x2={PAD + (i * (W - 2 * PAD)) / NEWS_STRIP_DAYS} y1={H / 2 - (i % 7 === 0 ? 4 : 2)} y2={H / 2 + (i % 7 === 0 ? 4 : 2)} stroke="rgba(148,163,184,0.2)" />)}
        <line x1={W - PAD} x2={W - PAD} y1={3} y2={H - 3} stroke="rgba(56,189,248,0.5)" strokeDasharray="2 2" />
        {[...s.items].reverse().map((n) => <NewsDot key={n.id} n={n} cx={x(n.publishedAt!)} top={s.top?.id === n.id} />)}
      </svg>
      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-400" data-testid={`hl-news-sum-${mobile ? "m-" : ""}${s.ticker}`}>
        {s.items.length ? <>{s.items.length} tin{s.news ? ` · cảm xúc 3 ngày ${sgn(s.news.sentiment)}` : ""}{hot ? <b className="text-amber-300"> · tin nóng</b> : ""}</> : "Không có tin trong 14 ngày"}
        {esa && <span className={`rounded border px-1 ${ESA_TONE[esa.tone]}`} title="Phản ứng giá của tin nổi bật (ESA Campbell–Wasley) — MÔ TẢ">{esa.text}</span>}
        {s.top?.insight && <span title={s.top.insight.text} style={{ color: s.top.insight.tone === "up" ? UP : s.top.insight.tone === "down" ? DOWN : AMBER }}>{s.top.insight.tone === "up" ? "▲" : s.top.insight.tone === "down" ? "▼" : "◐"}</span>}
      </span>
    </>
  );
  return mobile
    ? <div className="mt-1" data-hl-layer="news" data-testid={`hl-news-m-${s.ticker}`}>{body}</div>
    : <td className="pl-2 align-top" data-hl-layer="news" data-testid={`hl-news-${s.ticker}`}>{body}</td>;
}

function NewsDot({ n, cx, top }: { n: SmartNewsItem; cx: number; top: boolean }) {
  const r = 2 + Math.min(1, n.importance / 100) * 3.2;
  const title = `${hm(n.publishedAt)} · ${n.sourceLabel}${n.corroboration > 1 ? ` (+${n.corroboration - 1} nguồn)` : ""} · quan trọng ${n.importance} · cảm xúc ${sgn(n.sentiment)}\n${n.title}${esaOf(n) ? `\nPhản ứng giá: ${esaOf(n)!.text}` : ""}`;
  const dot = (
    <g data-news-dot={n.id}>
      <title>{title}</title>
      {top && <circle cx={cx} cy={H / 2} r={r + 3.2} fill="none" stroke={AMBER} strokeWidth={1} />}
      {n.corroboration > 1 && <circle cx={cx} cy={H / 2} r={r + 1.6} fill="none" stroke={tone(n.sentiment)} strokeWidth={0.8} opacity={0.8} />}
      <circle cx={cx} cy={H / 2} r={r} fill={tone(n.sentiment)} opacity={0.85} />
    </g>
  );
  return n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer">{dot}</a> : dot;
}

export type HlFilter = "hot" | "buy" | "stealth";
const FILTER_VI: Record<HlFilter, string> = { hot: `Có tin nóng ${NEWS_HOT_WINDOW_H}h`, buy: "Có điểm mua ⏱", stealth: "Có ◆ Stealth 20" };
export function matchFilters(s: HlRowSignal | undefined, f: ReadonlySet<HlFilter>): boolean {
  if (!f.size) return true;
  if (f.has("hot") && !s?.news?.hot) return false;
  if (f.has("buy") && !s?.buy) return false;
  if (f.has("stealth") && !s?.stealth) return false;
  return true;
}

export function HlRowFilters({ filters, onToggle, shown, total, notifyOn, onNotify, notifyState }: {
  filters: ReadonlySet<HlFilter>; onToggle: (f: HlFilter) => void; shown: number; total: number;
  notifyOn: boolean; onNotify: () => void; notifyState: string;
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[10px]" data-hl-layer="filters" data-testid="hl-filters" role="group" aria-label="Lọc hiển thị dòng">
      <span className="text-slate-500">Lọc hiển thị (không đổi danh mục):</span>
      {(Object.keys(FILTER_VI) as HlFilter[]).map((k) => (
        <button key={k} type="button" aria-pressed={filters.has(k)} onClick={() => onToggle(k)} data-testid={`hl-filter-${k}`}
          className={`min-h-[24px] rounded border px-1.5 ${filters.has(k) ? "border-amber-400/50 bg-amber-400/10 text-amber-200" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{FILTER_VI[k]}</button>
      ))}
      {filters.size > 0 && <span className="text-amber-200" data-testid="hl-filter-count">Đang hiện {shown}/{total} mã</span>}
      <button type="button" aria-pressed={notifyOn} onClick={onNotify} data-testid="hl-notify" title={`Thông báo trình duyệt khi mã đang giữ có tin quan trọng ≥ ${NEWS_HOT_IMPORTANCE} trong ${NEWS_HOT_WINDOW_H} giờ — mặc định tắt`}
        className={`ml-auto min-h-[24px] rounded border px-1.5 ${notifyOn ? "border-white/15 bg-white/5 text-q-text" : "border-white/10 text-slate-500 hover:text-slate-300"}`}>
        {notifyOn ? "🔔 Thông báo tin nóng: bật" : "🔕 Thông báo tin nóng: tắt"}{notifyOn && notifyState ? ` · ${notifyState}` : ""}
      </button>
    </div>
  );
}

const NOTIFY_KEY = "gq.hl.notify.v1", NOTIFIED_KEY = "gq.hl.notified.v1";
const readJson = <T,>(k: string, d: T): T => { try { const raw = window.localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : d; } catch { return d; } };
const writeJson = (k: string, v: unknown) => { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } };

/** Thông báo tin nóng của mã đang giữ — mặc định TẮT; mỗi tin chỉ báo một lần (nhớ theo trình duyệt). */
export function useHlNewsNotify(rows: Map<string, HlRowSignal>, now: number) {
  const [on, setOn] = useState<boolean>(() => readJson(NOTIFY_KEY, false));
  const [perm, setPerm] = useState(() => notifyPermission());
  const toggle = async () => {
    const next = !on;
    if (next && perm !== "granted" && perm !== "unsupported") setPerm(await requestNotifyPermission());
    setOn(next); writeJson(NOTIFY_KEY, next);
  };
  useEffect(() => {
    if (!on || perm !== "granted") return;
    const seen = new Set(readJson<string[]>(NOTIFIED_KEY, []));
    let changed = false;
    for (const s of rows.values()) for (const n of s.items) {
      const age = n.publishedAt ? (now - Date.parse(n.publishedAt)) / 3_600_000 : 999;
      if (age > NEWS_HOT_WINDOW_H || n.importance < NEWS_HOT_IMPORTANCE || seen.has(n.id)) continue;
      browserNotify(`${s.ticker} · tin quan trọng (Elite HL)`, `${n.title} — ${n.sourceLabel}. Mô tả, không phải khuyến nghị.`, `hl-news-${n.id}`);
      seen.add(n.id); changed = true;
    }
    if (changed) writeJson(NOTIFIED_KEY, [...seen].slice(-300));
  }, [rows, on, perm, now]);
  const state = perm === "unsupported" ? "trình duyệt không hỗ trợ" : perm === "denied" ? "bị chặn trong trình duyệt" : on && perm !== "granted" ? "chờ cấp quyền" : "";
  return { on, toggle, state };
}
