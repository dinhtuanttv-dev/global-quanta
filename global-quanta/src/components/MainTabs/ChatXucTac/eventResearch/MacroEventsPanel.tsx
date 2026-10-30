import { useMemo, useState } from "react";
import { useEventRadar, type EventRadarEvent } from "../../../../hooks/useEventRadar";
import { isTrustedUrl } from "../../../../lib/urlSafety";
import { MACRO_EVENT_TYPES, vnDateTime } from "./researchFormat";

export const MACRO_LABEL: Record<(typeof MACRO_EVENT_TYPES)[number], string> = {
  MACRO_NEWS: "Tin kinh tế vĩ mô", MONETARY_POLICY: "Chính sách tiền tệ", FISCAL_POLICY: "Tài khóa / thuế",
  MACRO_DATA: "Dữ liệu vĩ mô", SYSTEMIC_STRESS: "Cú sốc hệ thống", MARKET_STRUCTURE: "Hạ tầng / cấu trúc TT",
};
const MACRO = new Set<string>(MACRO_EVENT_TYPES);
const SHOW = 40;

/** Lọc các sự kiện vĩ mô / toàn thị trường từ danh sách Radar (mới nhất trước). */
export function macroEvents(events: EventRadarEvent[]): EventRadarEvent[] {
  const t = (e: EventRadarEvent) => Date.parse(e.publishedAt ?? e.firstSeenAt) || 0;
  return events.filter((e) => MACRO.has(e.eventType)).sort((a, b) => t(b) - t(a));
}

/**
 * Sự kiện vĩ mô — thay "Sự Kiện Vĩ Mô" cũ của Siêu quét AI (nguồn QMS/Neon, lỗi từ ~17/10/2026). Dữ liệu: Event Radar trên Gateway
 * (chuyên mục vĩ mô Vietstock/CafeF + tin chính sách), phân loại tự động theo tiêu đề. Chỉ để theo dõi bối cảnh — không vào điểm số.
 */
export default function MacroEventsPanel() {
  const { data, error, isLoading, enabled } = useEventRadar({ limit: 250 });
  const [type, setType] = useState<string>("");
  const all = useMemo(() => macroEvents(data?.events ?? []), [data?.events]);
  const counts = useMemo(() => all.reduce<Record<string, number>>((m, e) => ({ ...m, [e.eventType]: (m[e.eventType] ?? 0) + 1 }), {}), [all]);
  const shown = (type ? all.filter((e) => e.eventType === type) : all).slice(0, SHOW);
  const chip = (active: boolean) => `rounded border px-2 py-1 text-[10px] ${active ? "border-amber-600/70 bg-amber-950/40 text-amber-200" : "border-white/10 text-slate-400 hover:text-slate-200"}`;

  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4" data-testid="macro-events">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div><h3 className="text-xs font-semibold text-amber-300">Sự kiện vĩ mô</h3>
          <p className="text-[11px] text-slate-400">Tin chính sách tiền tệ, tài khóa, dữ liệu vĩ mô và hạ tầng thị trường từ các nguồn của Event Radar (Gateway).</p></div>
        {data && <span className="text-[10px] text-slate-500">Cập nhật nguồn {vnDateTime(data.generatedAt)}</span>}
      </div>
      {!enabled && <p className="text-[11px] text-amber-200">Cần Market Gateway được bật.</p>}
      {error && <p role="alert" className="text-[11px] text-rose-300">Không tải được sự kiện vĩ mô: {error.message}</p>}
      {isLoading && !data && <p className="text-[11px] text-slate-400">Đang tải…</p>}
      {data && <>
        <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Lọc nhóm sự kiện vĩ mô">
          <button type="button" className={chip(type === "")} aria-pressed={type === ""} onClick={() => setType("")}>Tất cả · {all.length}</button>
          {MACRO_EVENT_TYPES.filter((k) => counts[k]).map((k) =>
            <button key={k} type="button" className={chip(type === k)} aria-pressed={type === k} onClick={() => setType(k)}>{MACRO_LABEL[k]} · {counts[k]}</button>)}
        </div>
        {shown.length === 0
          ? <p className="text-[11px] text-slate-400">Chưa có sự kiện vĩ mô trong cửa sổ hiện tại của Radar.</p>
          : <ul className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
            {shown.map((e) => <li key={e.eventId} className="rounded border border-white/5 bg-white/[0.02] px-2.5 py-2" data-testid="macro-event">
              <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
                <span className="rounded bg-amber-950/50 px-1.5 py-0.5 text-amber-200">{MACRO_LABEL[e.eventType as keyof typeof MACRO_LABEL] ?? e.eventLabel}</span>
                <span className="text-slate-500">{vnDateTime(e.publishedAt ?? e.firstSeenAt)}</span>
                {e.corroborationCount > 1 && <span className="text-emerald-300">{e.corroborationCount} nguồn</span>}
                {e.tickers.length > 0 && <span className="font-mono text-slate-300">{e.tickers.slice(0, 4).join(" ")}</span>}
                {isTrustedUrl(e.url) && <a href={e.url!} target="_blank" rel="noopener noreferrer" className="ml-auto text-sky-300 underline">{e.sourceLabel}</a>}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-100">{e.title}</p>
            </li>)}
          </ul>}
        <p className="mt-2 text-[9px] leading-relaxed text-slate-500">Phân loại tự động theo tiêu đề (có thể nhầm); chưa đối chiếu nguồn gốc. Thay cho mục "Sự Kiện Vĩ Mô" cũ (AI Discovery + xác nhận tay trên Project A — nguồn đó ngừng từ khi Neon hết hạn mức). Không phải dự báo hay khuyến nghị.</p>
      </>}
    </div>
  );
}
