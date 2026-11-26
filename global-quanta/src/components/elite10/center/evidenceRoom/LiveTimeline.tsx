// 27/11/2026 — Timeline đồng bộ v2 (Phòng họp AI). Giữ nguyên mọi tính năng cũ (trục "Đã biết lúc đó / Theo công bố", nhánh mô phỏng,
// mốc chỉ có tin, tin ngoài chuỗi, nến trong phiên mờ, bấm tin / trigger để mở chi tiết, so sánh với bản gốc) và nâng cấp:
//  • hai khung tách riêng: GIÁ (đường + vùng tô, trục giá bên phải) và KHỐI LƯỢNG (cột tăng / giảm theo giá đóng, đường trung bình) —
//    trước đây cột khối lượng đè lên đường giá;
//  • đủ ba mức của setup trên cùng cơ sở giá: kích hoạt, vô hiệu, mục tiêu (trước đây chỉ có vô hiệu); giá làm tròn theo đồng;
//  • phiên kích hoạt hiện cả khi setup đã kích hoạt nhưng CHƯA đủ điều kiện xác nhận (màu hổ phách), xác nhận = màu xanh;
//  • thẻ chi tiết khi rê: giá, % so phiên trước, khối lượng, × trung bình, số tin; nhãn ngày đều theo tuần.
import { useState } from "react";
import type { EventRadarEvent } from "../../../../hooks/useEventRadar";
import type { VolumeAnalysis } from "../../../../hooks/useVolumeAnalysis";
import type { PriceActionEvidence, TimelinePriceEvidence } from "../../../../lib/evidenceBrain/snapshot";
import { revisionKnownAt } from "../../../../lib/evidenceBrain/research";
import { dateVi, numberVi, sessionDay, TimelinePanel } from "./roomView";

const X0 = 44, X1 = 852, P0 = 24, P1 = 116, V0 = 128, V1 = 166;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isVolume = (v: unknown): v is number => v === 0 || positive(v);
/** Giá cổ phiếu: đồng nguyên khi ≥ 1.000 (giá điều chỉnh có lẻ thập phân không mang nghĩa). */
export const pxVi = (v: number | null | undefined) => numberVi(v, typeof v === "number" && Math.abs(v) >= 1000 ? 0 : 2);
const compact = (v: number) => v >= 1e9 ? `${numberVi(v / 1e9, 1)} tỷ` : v >= 1e6 ? `${numberVi(v / 1e6, 1)} tr` : v >= 1e3 ? `${numberVi(v / 1e3, 0)} k` : numberVi(v, 0);

export function groupEvents(events: EventRadarEvent[]) {
  const clusters = new Map<string, EventRadarEvent>();
  const latestFirst = (a: EventRadarEvent, b: EventRadarEvent) =>
    (b.firstSeenAt ?? b.publishedAt ?? "").localeCompare(a.firstSeenAt ?? a.publishedAt ?? "") || a.eventId.localeCompare(b.eventId);
  for (const event of events) {
    const key = event.clusterId || event.eventId;
    const previous = clusters.get(key);
    if (!previous || event.corroborationCount > previous.corroborationCount ||
      event.corroborationCount === previous.corroborationCount && latestFirst(event, previous) < 0) clusters.set(key, event);
  }
  return [...clusters.values()].sort(latestFirst);
}

/** Phiên kích hoạt của setup: xác nhận (đủ điều kiện, nến đóng) hoặc kích hoạt nhưng chưa đủ điều kiện. Gateway bản cũ không gửi setup.state. */
export function triggerInfo(pa: PriceActionEvidence | null, sameBasis: boolean): { day: string | null; confirmed: boolean } {
  if (!sameBasis || !pa?.setup) return { day: null, confirmed: false };
  const confirmed = pa.state === "TRIGGERED" && pa.barClosed === true && pa.confirmed;
  const triggered = confirmed || pa.setup.state === "triggered";
  return { day: triggered ? sessionDay(pa.setup.stateDate) : null, confirmed };
}

export function LiveTimeline({ price, volume, events, pa, scenario = false, comparisonBase, onEvent, onPriceAction }: {
  price: TimelinePriceEvidence | null; volume: VolumeAnalysis | null; events: EventRadarEvent[]; pa: PriceActionEvidence | null;
  scenario?: boolean | string;
  comparisonBase?: import("../../../../lib/evidenceBrain/research").ResearchData;
  onEvent: (event: EventRadarEvent) => void; onPriceAction: () => void;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const [byPublication, setByPublication] = useState(false);
  const eventTime = (event: EventRadarEvent) => byPublication ? event.publishedAt : revisionKnownAt(event);
  const switches = <div className="chart-notes eb-research-timeline-mode" role="group" aria-label="Trục thời gian xúc tác">
    <button type="button" className="meta-chip" aria-pressed={!byPublication} onClick={() => setByPublication(false)}>Đã biết lúc đó</button>
    <button type="button" className="meta-chip" aria-pressed={byPublication} onClick={() => setByPublication(true)}>Theo công bố</button>
    {scenario && <span className="tiny-chip gold">{typeof scenario === "string" ? scenario : "Mô phỏng · đã loại một cụm xúc tác"}</span>}
  </div>;
  const adjusted = new Map<string, number>();
  for (const bar of price?.bars ?? []) {
    const day = sessionDay(bar.date);
    if (day && positive(bar.close)) adjusted.set(day, bar.close);
  }
  const traded = new Map<string, { close: number; volume: number }>();
  for (const bar of volume?.trend.bars30 ?? []) {
    const day = sessionDay(bar.date);
    if (day) traded.set(day, bar);
  }
  const groups = new Map<string, EventRadarEvent[]>();
  for (const event of groupEvents(events)) {
    const day = sessionDay(eventTime(event));
    if (day) groups.set(day, [...(groups.get(day) ?? []), event]);
  }
  const anchorDays = comparisonBase?.volume?.trend.bars30.map((bar) => sessionDay(bar.date)).filter((day): day is string => Boolean(day)) ?? [];
  const marketDates = [...new Set([...adjusted.keys(), ...traded.keys(), ...anchorDays])].sort().slice(-30);
  const eventDates = [...groups.keys()].filter((day) => !marketDates.length || day >= marketDates[0]);
  const anchorEvents = comparisonBase?.events.map((event) => sessionDay(eventTime(event))).filter((day): day is string => Boolean(day && (!marketDates.length || day >= marketDates[0]))) ?? [];
  const sessions = [...new Set([...marketDates, ...eventDates, ...anchorEvents])].sort();
  const hasAdjusted = sessions.some((day) => adjusted.has(day));
  const sameBasis = hasAdjusted && Boolean(price?.priceBasis && !/unknown/i.test(price.priceBasis) && pa?.priceBasis === price.priceBasis);
  const setup = pa?.setup ?? null;
  const invalidation = sameBasis && positive(setup?.invalidationLevel) ? setup!.invalidationLevel : null;
  const entry = sameBasis && positive(setup?.entryReference) ? setup!.entryReference : null;
  const target = sameBasis && positive(setup?.target) ? setup!.target : null;
  const { day: triggerDay, confirmed: triggerConfirmed } = triggerInfo(pa, sameBasis);
  const offChart = [...groups].filter(([day]) => !sessions.includes(day)).flatMap(([, items]) => items);
  const partialDay = volume?.partialToday ? sessionDay(volume.today.date) : null;
  const points = sessions.map((day) => {
    const bar = traded.get(day);
    const value = hasAdjusted ? adjusted.get(day) : day === partialDay ? null : bar?.close;
    return { day, close: positive(value) ? value : null, volume: isVolume(bar?.volume) ? bar.volume : null };
  });
  const closes = points.flatMap((p) => p.close === null ? [] : [p.close]);
  const prices = [...closes];
  if (invalidation !== null) prices.push(invalidation);
  const anchorLevel = comparisonBase?.pa?.setup?.invalidationLevel;
  if (hasAdjusted && comparisonBase?.price?.priceBasis === comparisonBase?.pa?.priceBasis && positive(anchorLevel)) prices.push(anchorLevel);
  // Kích hoạt / mục tiêu chỉ mở rộng trục khi ở gần vùng giá (≤ 15% ngoài biên) — tránh ép dẹt đường giá vì một mục tiêu xa.
  const near = (v: number | null) => v !== null && closes.length > 0 && v >= Math.min(...closes) * .85 && v <= Math.max(...closes) * 1.15;
  if (near(entry)) prices.push(entry!);
  if (near(target)) prices.push(target!);
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 1;
  const padding = Math.max((hi - lo) * .08, hi * .001, .01);
  const volumes = points.flatMap((p) => p.volume === null || p.day === partialDay ? [] : [p.volume]);
  const avgVolume = volumes.length ? volumes.reduce((a, v) => a + v, 0) / volumes.length : null;
  const maxVolume = Math.max(1, ...points.map((p) => p.volume ?? 0));
  const x = (i: number) => points.length === 1 ? (X0 + X1) / 2 : X0 + 8 + i * (X1 - X0 - 16) / Math.max(points.length - 1, 1);
  const y = (value: number) => P0 + (hi + padding - value) / (hi - lo + 2 * padding) * (P1 - P0);
  const vy = (value: number) => V1 - value / maxVolume * (V1 - V0);
  let continued = false;
  const path = points.map(({ close }, i) => {
    if (close === null) { continued = false; return ""; }
    const op = continued ? "L" : "M";
    continued = true;
    return `${op}${x(i)} ${y(close)}`;
  }).join(" ");
  const lastIdx = points.map((p) => p.close !== null).lastIndexOf(true), firstIdx = points.findIndex((p) => p.close !== null);
  const area = firstIdx >= 0 && points.slice(firstIdx, lastIdx + 1).every((p) => p.close !== null)
    ? `${path} L${x(lastIdx)} ${P1} L${x(firstIdx)} ${P1} Z` : null;
  if (!points.length) return <TimelinePanel period="Chưa có chuỗi phiên"
    chart={<>{switches}<div className="eb-empty">Đang chờ chuỗi giá hoặc khối lượng theo phiên của mã.</div></>} />;

  const focusIndex = points.findIndex((p) => p.day === focused);
  const selected = points[focusIndex];
  const prevClose = (i: number) => { for (let j = i - 1; j >= 0; j--) if (points[j].close !== null) return points[j].close; return null; };
  const visibleGroups = [...groups].filter(([day]) => sessions.includes(day));
  const ticks = [hi + padding * .5, (hi + lo) / 2, lo - padding * .5].filter((v) => v > 0);
  const step = Math.max(1, Math.ceil(points.length / 6));
  const dateTicks = [...new Set([...points.map((_, i) => i).filter((i) => i % step === 0), points.length - 1])];
  const levels = [
    target !== null && near(target) ? { v: target, cls: "eb-level-target", label: `Mục tiêu ${pxVi(target)}` } : null,
    entry !== null && near(entry) ? { v: entry, cls: "eb-level-entry", label: `Kích hoạt ${pxVi(entry)}` } : null,
    invalidation !== null ? { v: invalidation, cls: "invalidation-line", label: `Vô hiệu ${pxVi(invalidation)}` } : null,
  ].filter((l): l is { v: number; cls: string; label: string } => Boolean(l));
  const tip = selected ? (() => {
    const pc = prevClose(focusIndex);
    const chg = selected.close !== null && pc ? selected.close / pc - 1 : null;
    const cat = groups.get(selected.day)?.length ?? 0;
    const rows = [
      dateVi(selected.day, true),
      `Giá ${pxVi(selected.close)}${chg === null ? "" : ` (${chg >= 0 ? "+" : "−"}${numberVi(Math.abs(chg * 100), 2)}%)`}`,
      `KL ${selected.volume === null ? "—" : compact(selected.volume)}${selected.volume !== null && avgVolume ? ` · ${numberVi(selected.volume / avgVolume, 2)}× TB` : ""}`,
      ...(cat ? [`${cat} tin`] : []), ...(selected.day === triggerDay ? [triggerConfirmed ? "PA kích hoạt · xác nhận" : "PA kích hoạt · chưa đủ điều kiện"] : []),
      ...(selected.day === partialDay ? ["Trong phiên · chưa chốt"] : []),
    ];
    const w = 150, h = 14 + rows.length * 12, left = x(focusIndex) + (focusIndex > points.length * .6 ? -w - 10 : 10);
    return { rows, w, h, left };
  })() : null;
  return <TimelinePanel period={`${dateVi(sessions[0])} → ${dateVi(sessions[sessions.length - 1])} · daily`}
    chart={<>{switches}<div className="chart-wrap eb-timeline-v2">
      <svg viewBox="0 0 920 212" role="group" aria-label="Giá, khối lượng và sự kiện cùng trục phiên giao dịch" onMouseLeave={() => setFocused(null)}>
        <defs>
          <linearGradient id="eb-price-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#61d8e9" stopOpacity=".28" /><stop offset="1" stopColor="#61d8e9" stopOpacity="0" /></linearGradient>
        </defs>
        {ticks.map((v) => <g key={v}><line className="gridline" x1={X0} y1={y(v)} x2={X1} y2={y(v)} />
          <text className="chart-label eb-axis-price" x={X1 + 6} y={y(v) + 3}>{pxVi(v)}</text></g>)}
        <line className="chart-axis" x1={X0} y1={P0 - 4} x2={X0} y2={V1} />
        <line className="chart-axis" x1={X0} y1={V1} x2={X1} y2={V1} />
        <line className="eb-pane-sep" x1={X0} y1={(P1 + V0) / 2} x2={X1} y2={(P1 + V0) / 2} />
        <text className="chart-label eb-axis-price" x={X1 + 6} y={V0 + 6}>{compact(maxVolume)}</text>
        {area && <path d={area} fill="url(#eb-price-fill)" />}
        {levels.map((l) => <g key={l.cls}>
          <line className={l.cls} x1={X0} y1={y(l.v)} x2={X1} y2={y(l.v)} />
          <text className={`chart-label ${l.cls}-label`} x={X0 + 6} y={y(l.v) - 3}>{l.label}</text>
        </g>)}
        {points.map((p, i) => {
          if (p.volume === null) return null;
          const width = Math.max(2, Math.min(12, (X1 - X0) / points.length * .62));
          const partial = p.day === partialDay;
          const pc = prevClose(i);
          const dir = p.close !== null && pc ? (p.close >= pc ? "up" : "down") : "flat";
          const cls = p.day === triggerDay ? (triggerConfirmed ? "trigger" : "trigger-pending") : dir;
          return <rect key={p.day} className={`volume-bar eb-vol-${cls}${groups.has(p.day) ? " eb-vol-event" : ""}`} x={x(i) - width / 2} y={vy(p.volume)} width={width}
            height={V1 - vy(p.volume)} rx={1} style={{ opacity: partial ? .38 : undefined }} />;
        })}
        {avgVolume !== null && <g><line className="eb-vol-avg" x1={X0} x2={X1} y1={vy(avgVolume)} y2={vy(avgVolume)} />
          <text className="chart-label" x={X0 + 6} y={vy(avgVolume) - 3}>TB {volumes.length} phiên</text></g>}
        <path className="price-line" d={path} />
        {points.length === 1 && points[0].close !== null && <circle cx={x(0)} cy={y(points[0].close)} r={3} fill="#61d8e9" />}
        {lastIdx >= 0 && <circle className="eb-last-dot" cx={x(lastIdx)} cy={y(points[lastIdx].close!)} r={3.2} />}
        {points.map((point, i) => {
          const catalysts = groups.get(point.day) ?? [];
          const eventOnly = point.close === null && (point.day === partialDay || !traded.has(point.day));
          const trigger = point.day === triggerDay;
          const anchor = i > points.length * .78 ? "end" : "start";
          const labelX = x(i) + (anchor === "end" ? -5 : 5);
          return <g key={point.day}>
            {catalysts.length > 0 && <g><line className="event-line" x1={x(i)} x2={x(i)} y1={P0 - 4} y2={V1} />
              <path d={`M${x(i)} ${P0 - 10} l4 4 l-4 4 l-4 -4 z`} fill="#f3a95f" />
              {point.close !== null && <circle cx={x(i)} cy={y(point.close)} r={3.4} fill="#f3a95f" />}
              <text className="chart-tag" x={labelX} y={P0 - 3} textAnchor={anchor}>{eventOnly ? "Tin · chưa có nến" : catalysts.length > 1 ? `${catalysts.length} tin` : "Tin"}</text>
            </g>}
            {trigger && <g><line className={triggerConfirmed ? "trigger-line" : "trigger-line eb-trigger-pending"} x1={x(i)} x2={x(i)} y1={P0 - 4} y2={V1} />
              <path d={point.close === null ? `M${x(i)} ${P0 + 2} l4 6 h-8 z` : `M${x(i)} ${y(point.close) + 5} l4 7 h-8 z`} fill={triggerConfirmed ? "#47d6a0" : "#f3a95f"} />
              <text className="chart-tag" x={labelX} y={P0 + 8} textAnchor={anchor} style={{ fill: triggerConfirmed ? "#66ddb0" : "#f5c47d" }}>{triggerConfirmed ? "PA kích hoạt" : "PA kích hoạt · chưa đủ ĐK"}</text>
            </g>}
            <rect className="eb-chart-point" tabIndex={catalysts.length || trigger ? 0 : -1}
              role={catalysts.length || trigger ? "button" : undefined}
              aria-label={eventOnly ? `Tin ${dateVi(point.day, true)} · chưa có nến` : `Phiên ${dateVi(point.day, true)}, giá ${pxVi(point.close)}, khối lượng ${numberVi(point.volume, 0)}`}
              x={x(i) - 9} width={18} y={P0 - 12} height={V1 - P0 + 12} onMouseEnter={() => setFocused(point.day)} onFocus={() => setFocused(point.day)} onBlur={() => setFocused(null)}
              onClick={() => { if (catalysts[0]) onEvent(catalysts[0]); else if (trigger) onPriceAction(); }}
              onKeyDown={(e) => { if (e.key !== " " && e.key !== "Enter") return; e.preventDefault(); if (catalysts[0]) onEvent(catalysts[0]); else if (trigger) onPriceAction(); }} />
          </g>;
        })}
        {focusIndex >= 0 && <line className="eb-chart-focus" x1={x(focusIndex)} x2={x(focusIndex)} y1={P0 - 4} y2={V1} />}
        {focusIndex >= 0 && selected?.close != null && <circle className="eb-focus-dot" cx={x(focusIndex)} cy={y(selected.close)} r={3.6} />}
        {tip && <g className="eb-chart-tip" pointerEvents="none">
          <rect x={tip.left} y={P0} width={tip.w} height={tip.h} rx={6} />
          {tip.rows.map((r, k) => <text key={k} x={tip.left + 8} y={P0 + 14 + k * 12} className={k === 0 ? "eb-tip-head" : "eb-tip-row"}>{r}</text>)}
        </g>}
        {dateTicks.map((i) => <text key={i} className="chart-label" x={x(i)} y={182} textAnchor={i === points.length - 1 && i > 0 ? "end" : i === 0 ? "start" : "middle"}>{dateVi(points[i].day)}</text>)}
        <text className="chart-label" x={X0 + 6} y={202}>{`Giá đóng cửa · ${hasAdjusted ? price?.priceBasis ?? "chuỗi PA" : "nguồn volume"}  ·  Khối lượng ngày: xanh = phiên tăng, đỏ = phiên giảm, viền cam = có tin`}</text>
      </svg>
    </div></>}
    notes={<div className="chart-notes">
      {visibleGroups.slice(-3).flatMap(([, items]) => items.map((event) => <button key={event.eventId} type="button" className="tiny-chip gold" onClick={() => onEvent(event)}>◇ {event.eventLabel || "Sự kiện"} · r{event.revision} · {dateVi(eventTime(event))}</button>))}
      {setup && <button type="button" className={`tiny-chip ${triggerDay && triggerConfirmed ? "green" : ""}`} onClick={onPriceAction}>
        ▲ {positive(setup.entryReference) ? `Kích hoạt ${pxVi(setup.entryReference)}` : "Chưa có giá kích hoạt"} · {triggerDay
          ? `${triggerConfirmed ? "đã kích hoạt, nến đóng" : "đã kích hoạt, chưa đủ điều kiện"} ${dateVi(triggerDay)}`
          : sameBasis ? "chờ giá đóng cửa vượt" : "cần đối chiếu nến và cơ sở giá"}</button>}
      {positive(setup?.invalidationLevel) && <button type="button" className="tiny-chip red" onClick={onPriceAction}>— Vô hiệu {pxVi(setup!.invalidationLevel)}{sameBasis ? "" : " · chưa đối chiếu cơ sở giá"}</button>}
      {positive(setup?.target) && <button type="button" className="tiny-chip" onClick={onPriceAction}>◎ Mục tiêu {pxVi(setup!.target)}{typeof setup?.rewardRisk === "number" ? ` · lời:lỗ ${numberVi(setup.rewardRisk, 1)}` : ""}</button>}
      <span className="tiny-chip">{!volume && scenario ? "Khối lượng · chưa có trong nhánh" : volume?.partialToday ? "RVOL intraday · cùng thời điểm" : "Khối lượng · snapshot ngày"}</span>
      {offChart.length > 0 && <span className="tiny-chip">{offChart.length} tin ngoài chuỗi · xem cột Xúc tác</span>}
      {eventDates.some((day) => !adjusted.has(day) && !traded.has(day)) && <span className="tiny-chip">Mốc chỉ có tin · chưa có giá/khối lượng</span>}
    </div>} />;
}
