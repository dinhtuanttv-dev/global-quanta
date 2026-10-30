import { useMemo, useState } from "react";
import { useEventRadar, type EventRadarEvent } from "../../../../hooks/useEventRadar";
import { isTrustedUrl } from "../../../../lib/urlSafety";
import { MACRO_EVENT_TYPES, vnDate } from "./researchFormat";

type MacroType = (typeof MACRO_EVENT_TYPES)[number];
export const MACRO_LABEL: Record<MacroType, string> = {
  MACRO_NEWS: "Tin kinh tế vĩ mô", MONETARY_POLICY: "Chính sách tiền tệ", FISCAL_POLICY: "Tài khóa / thuế",
  MACRO_DATA: "Dữ liệu vĩ mô", SYSTEMIC_STRESS: "Cú sốc hệ thống", MARKET_STRUCTURE: "Hạ tầng / cấu trúc TT",
};
// Màu theo NHÓM (cố định theo nhóm, không theo thứ hạng); chữ luôn dùng màu chữ, màu chỉ ở chấm/thanh nhận diện.
const MACRO_COLOR: Record<MacroType, string> = {
  MACRO_NEWS: "#94a3b8", MONETARY_POLICY: "#22d3ee", FISCAL_POLICY: "#a78bfa",
  MACRO_DATA: "#34d399", SYSTEMIC_STRESS: "#fb7185", MARKET_STRUCTURE: "#fbbf24",
};
const MACRO = new Set<string>(MACRO_EVENT_TYPES);
const DAYS = 7;
const MAX_ITEMS = 60;

const at = (e: EventRadarEvent) => Date.parse(e.publishedAt ?? e.firstSeenAt) || 0;

/** Lọc các sự kiện vĩ mô / toàn thị trường (mới nhất trước). */
export function macroEvents(events: EventRadarEvent[]): EventRadarEvent[] {
  return events.filter((e) => MACRO.has(e.eventType)).sort((a, b) => at(b) - at(a));
}

/** Đếm theo ngày VN × nhóm cho `days` ngày gần nhất (ngày cũ -> mới). */
export function dailyIntensity(events: EventRadarEvent[], days = DAYS, now = Date.now()) {
  const keys = Array.from({ length: days }, (_, i) => vnDate(new Date(now - (days - 1 - i) * 86_400_000).toISOString()));
  const rows = keys.map((day) => ({ day, total: 0, byType: {} as Partial<Record<MacroType, number>> }));
  const index = new Map(keys.map((k, i) => [k, i]));
  for (const e of events) {
    const i = index.get(vnDate(e.publishedAt ?? e.firstSeenAt));
    if (i === undefined) continue;
    const t = e.eventType as MacroType;
    rows[i].total++;
    rows[i].byType[t] = (rows[i].byType[t] ?? 0) + 1;
  }
  return rows;
}

const dayLabel = (day: string) => { const [, m, d] = day.split("-"); return `${d}/${m}`; };
const timeVn = (e: EventRadarEvent) => new Date(e.publishedAt ?? e.firstSeenAt).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" });

function IntensityStrip({ rows, active }: { rows: ReturnType<typeof dailyIntensity>; active: string }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <div className="mb-3" role="img" aria-label={`Số tin vĩ mô theo ngày, ${rows.length} ngày gần nhất: ${rows.map((r) => `${dayLabel(r.day)} ${r.total}`).join(", ")}`}>
      <div className="flex h-16 items-end gap-1.5">
        {rows.map((r) => (
          <div key={r.day} className="group relative flex h-full flex-1 flex-col justify-end" title={`${dayLabel(r.day)}: ${r.total} tin`}>
            <div className="flex flex-col-reverse gap-[2px]" style={{ height: `${(r.total / max) * 100}%` }}>
              {MACRO_EVENT_TYPES.filter((t) => r.byType[t]).map((t) => (
                <div key={t} style={{ flex: r.byType[t], background: MACRO_COLOR[t], opacity: !active || active === t ? 0.9 : 0.18 }} className="min-h-[2px] rounded-[2px]" />
              ))}
            </div>
            <span className="pointer-events-none absolute -top-4 left-1/2 hidden -translate-x-1/2 text-[9px] text-slate-200 group-hover:block">{r.total}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">{rows.map((r) => <span key={r.day} className="flex-1 text-center text-[9px] tabular-nums text-slate-500">{dayLabel(r.day)}</span>)}</div>
    </div>
  );
}

/**
 * Sự kiện vĩ mô — thay "Sự Kiện Vĩ Mô" cũ của Siêu quét AI (nguồn QMS/Neon, lỗi từ ~17/10/2026). Dữ liệu: Event Radar trên Gateway
 * (chuyên mục vĩ mô Vietstock/CafeF + tin chính sách), phân loại tự động theo tiêu đề (radar-classify-v2). Chỉ để theo dõi bối cảnh.
 */
export default function MacroEventsPanel() {
  const { data, error, isLoading, enabled } = useEventRadar({ category: MACRO_EVENT_TYPES.join(","), limit: 250 });
  const [type, setType] = useState<string>("");
  const all = useMemo(() => macroEvents(data?.events ?? []), [data?.events]);
  const counts = useMemo(() => all.reduce<Record<string, number>>((m, e) => ({ ...m, [e.eventType]: (m[e.eventType] ?? 0) + 1 }), {}), [all]);
  const intensity = useMemo(() => dailyIntensity(all), [all]);
  const shown = useMemo(() => (type ? all.filter((e) => e.eventType === type) : all).slice(0, MAX_ITEMS), [all, type]);
  const byDay = useMemo(() => {
    const groups: { day: string; items: EventRadarEvent[] }[] = [];
    for (const e of shown) {
      const day = vnDate(e.publishedAt ?? e.firstSeenAt);
      if (groups[groups.length - 1]?.day !== day) groups.push({ day, items: [] });
      groups[groups.length - 1].items.push(e);
    }
    return groups;
  }, [shown]);
  const chip = (activeChip: boolean) => `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] transition-colors ${activeChip ? "border-amber-500/60 bg-amber-950/40 text-amber-100" : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"}`;

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-b from-slate-950/80 to-slate-950/60 p-4" data-testid="macro-events">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div><h3 className="text-xs font-semibold text-amber-300">Sự kiện vĩ mô</h3>
          <p className="text-[11px] text-slate-400">Tin chính sách tiền tệ, tài khóa, dữ liệu vĩ mô và hạ tầng thị trường — nguồn Event Radar (Gateway).</p></div>
        {data && <span className="text-[10px] tabular-nums text-slate-500">{all.length} tin · cập nhật {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "—"}</span>}
      </div>
      {!enabled && <p className="text-[11px] text-amber-200">Cần Market Gateway được bật.</p>}
      {error && <p role="alert" className="text-[11px] text-rose-300">Không tải được sự kiện vĩ mô: {error.message}</p>}
      {isLoading && !data && <div className="space-y-2" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded bg-white/[0.04]" />)}</div>}
      {data && <>
        <IntensityStrip rows={intensity} active={type} />
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Lọc nhóm sự kiện vĩ mô">
          <button type="button" className={chip(type === "")} aria-pressed={type === ""} onClick={() => setType("")}>Tất cả <b className="tabular-nums text-slate-200">{all.length}</b></button>
          {MACRO_EVENT_TYPES.filter((k) => counts[k]).map((k) =>
            <button key={k} type="button" className={chip(type === k)} aria-pressed={type === k} onClick={() => setType(type === k ? "" : k)}>
              <i className="inline-block h-2 w-2 rounded-full" style={{ background: MACRO_COLOR[k] }} aria-hidden />{MACRO_LABEL[k]} <b className="tabular-nums text-slate-200">{counts[k]}</b>
            </button>)}
        </div>
        {shown.length === 0
          ? <p className="text-[11px] text-slate-400">Chưa có sự kiện vĩ mô trong cửa sổ hiện tại của Radar.</p>
          : <div className="max-h-[560px] overflow-y-auto pr-1">
            {byDay.map((g) => <section key={g.day} aria-label={`Ngày ${dayLabel(g.day)}`}>
              <h4 className="sticky top-0 z-10 bg-slate-950/95 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">{dayLabel(g.day)} · {g.items.length} tin</h4>
              <ul className="relative mb-2 ml-1.5 border-l border-white/10">
                {g.items.map((e) => <li key={e.eventId} className="relative py-1.5 pl-4" data-testid="macro-event">
                  <i className="absolute -left-[4.5px] top-3 h-2 w-2 rounded-full ring-2 ring-slate-950" style={{ background: MACRO_COLOR[e.eventType as MacroType] ?? "#94a3b8" }} aria-hidden />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-slate-500">
                    <span className="tabular-nums">{timeVn(e)}</span>
                    <span className="text-slate-400">{MACRO_LABEL[e.eventType as MacroType] ?? e.eventLabel}</span>
                    {e.severityScore >= 3 && <span className="rounded bg-rose-950/60 px-1 text-rose-200">chú ý cao</span>}
                    {e.corroborationCount > 1 && <span className="text-emerald-300">{e.corroborationCount} nguồn</span>}
                    {isTrustedUrl(e.url) && <a href={e.url!} target="_blank" rel="noopener noreferrer" className="ml-auto text-sky-300/90 underline decoration-sky-300/30 hover:decoration-sky-300">{e.sourceLabel}</a>}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-100">{e.title}</p>
                </li>)}
              </ul>
            </section>)}
          </div>}
        <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Phân loại tự động theo tiêu đề (có thể nhầm); chưa đối chiếu nguồn gốc. Thay cho mục "Sự Kiện Vĩ Mô" cũ (AI Discovery + xác nhận tay trên Project A — nguồn đó ngừng từ khi Neon hết hạn mức). Không phải dự báo hay khuyến nghị.</p>
      </>}
    </div>
  );
}
