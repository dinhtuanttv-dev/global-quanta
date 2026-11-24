import { useState } from "react";
import type { EventRadarEvent } from "../../../../hooks/useEventRadar";
import type { VolumeAnalysis } from "../../../../hooks/useVolumeAnalysis";
import type { PriceActionEvidence, TimelinePriceEvidence } from "../../../../lib/evidenceBrain/snapshot";
import { revisionKnownAt } from "../../../../lib/evidenceBrain/research";
import { dateVi, numberVi, sessionDay, TimelinePanel } from "./roomView";

const X0 = 44, X1 = 890, Y0 = 22, Y1 = 137;
const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const isVolume = (v: unknown): v is number => v === 0 || positive(v);

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

export function LiveTimeline({ price, volume, events, pa, scenario = false, onEvent, onPriceAction }: {
  price: TimelinePriceEvidence | null; volume: VolumeAnalysis | null; events: EventRadarEvent[]; pa: PriceActionEvidence | null;
  scenario?: boolean;
  onEvent: (event: EventRadarEvent) => void; onPriceAction: () => void;
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const [byPublication, setByPublication] = useState(false);
  const eventTime = (event: EventRadarEvent) => byPublication ? event.publishedAt : revisionKnownAt(event);
  const switches = <div className="chart-notes eb-research-timeline-mode" role="group" aria-label="Trục thời gian xúc tác">
    <button type="button" className="meta-chip" aria-pressed={!byPublication} onClick={() => setByPublication(false)}>Đã biết lúc đó</button>
    <button type="button" className="meta-chip" aria-pressed={byPublication} onClick={() => setByPublication(true)}>Theo công bố</button>
    {scenario && <span className="tiny-chip gold">Mô phỏng · đã loại một cụm xúc tác</span>}
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
  const marketDates = [...new Set([...adjusted.keys(), ...traded.keys()])].sort().slice(-30);
  const eventDates = [...groups.keys()].filter((day) => !marketDates.length || day >= marketDates[0]);
  const sessions = [...new Set([...marketDates, ...eventDates])].sort();
  const hasAdjusted = sessions.some((day) => adjusted.has(day));
  const sameBasis = hasAdjusted && Boolean(price?.priceBasis && !/unknown/i.test(price.priceBasis) && pa?.priceBasis === price.priceBasis);
  const invalidation = sameBasis && positive(pa?.setup?.invalidationLevel) ? pa.setup.invalidationLevel : null;
  const triggerDay = sameBasis && pa?.state === "TRIGGERED" && pa.barClosed && pa.confirmed ? sessionDay(pa.setup?.stateDate) : null;
  const offChart = [...groups].filter(([day]) => !sessions.includes(day)).flatMap(([, items]) => items);
  const points = sessions.map((day) => {
    const bar = traded.get(day);
    const value = hasAdjusted ? adjusted.get(day) : bar?.close;
    return { day, close: positive(value) ? value : null, volume: isVolume(bar?.volume) ? bar.volume : null };
  });
  const prices = points.flatMap((p) => p.close === null ? [] : [p.close]);
  if (invalidation !== null) prices.push(invalidation);
  const lo = prices.length ? Math.min(...prices) : 0;
  const hi = prices.length ? Math.max(...prices) : 1;
  const padding = Math.max((hi - lo) * .08, hi * .001, .01);
  const maxVolume = Math.max(1, ...points.map((p) => p.volume ?? 0));
  const x = (i: number) => points.length === 1 ? (X0 + X1) / 2 : X0 + 8 + i * (X1 - X0 - 16) / Math.max(points.length - 1, 1);
  const y = (value: number) => Y0 + (hi + padding - value) / (hi - lo + 2 * padding) * (Y1 - Y0 - 8);
  let continued = false;
  const path = points.map(({ close }, i) => {
    if (close === null) { continued = false; return ""; }
    const op = continued ? "L" : "M";
    continued = true;
    return `${op}${x(i)} ${y(close)}`;
  }).join(" ");
  if (!points.length) return <TimelinePanel period="Chưa có chuỗi phiên"
    chart={<>{switches}<div className="eb-empty">Đang chờ chuỗi giá hoặc khối lượng theo phiên của mã.</div></>} />;

  const focusIndex = points.findIndex((p) => p.day === focused);
  const selected = points[focusIndex];
  const visibleGroups = [...groups].filter(([day]) => sessions.includes(day));
  return <TimelinePanel period={`${dateVi(sessions[0])} → ${dateVi(sessions[sessions.length - 1])} · daily`}
    chart={<>{switches}<div className="chart-wrap">
      <svg viewBox="0 0 920 190" role="group" aria-label="Giá, khối lượng và sự kiện cùng trục phiên giao dịch" onMouseLeave={() => setFocused(null)}>
        {[25, 65, 105].map((line) => <line key={line} className="gridline" x1={X0} y1={line} x2={X1} y2={line} />)}
        <line className="chart-axis" x1={X0} y1={18} x2={X0} y2={Y1} />
        <line className="chart-axis" x1={X0} y1={Y1} x2={X1} y2={Y1} />
        {points.map((p, i) => {
          if (p.volume === null) return null;
          const height = p.volume / maxVolume * 74;
          const width = Math.min(11, (X1 - X0) / points.length / 2);
          const partial = volume?.partialToday && p.day === sessionDay(volume.today.date);
          return <rect key={p.day} className="volume-bar" x={x(i) - width / 2} y={Y1 - height} width={width} height={height}
            style={{ opacity: partial ? .38 : undefined, fill: p.day === triggerDay ? "#48c99d" : groups.has(p.day) ? "#c18443" : undefined }} />;
        })}
        <path className="price-line" d={path} />
        {points.length === 1 && points[0].close !== null && <circle cx={x(0)} cy={y(points[0].close)} r={3} fill="#61d8e9" />}
        {invalidation !== null && <g>
          <line className="invalidation-line" x1={X0} y1={y(invalidation)} x2={X1} y2={y(invalidation)} />
          <text className="chart-label" x={X1 - 4} y={y(invalidation) - 4} textAnchor="end" style={{ fill: "#ff9aaa" }}>Mức vô hiệu {numberVi(invalidation)}</text>
        </g>}
        {points.map((point, i) => {
          const catalysts = groups.get(point.day) ?? [];
          const eventOnly = !adjusted.has(point.day) && !traded.has(point.day);
          const trigger = point.day === triggerDay;
          const anchor = i > points.length * .78 ? "end" : "start";
          const labelX = x(i) + (anchor === "end" ? -5 : 5);
          return <g key={point.day}>
            {catalysts.length > 0 && <g><line className="event-line" x1={x(i)} x2={x(i)} y1={20} y2={Y1} />
              <circle cx={x(i)} cy={point.close === null ? 28 : y(point.close)} r={4} fill="#f3a95f" />
              <text className="chart-tag" x={labelX} y={37} textAnchor={anchor}>{eventOnly ? "Tin · chưa có nến" : catalysts.length > 1 ? `${catalysts.length} tin` : "Tin"}</text>
            </g>}
            {trigger && <g><line className="trigger-line" x1={x(i)} x2={x(i)} y1={20} y2={Y1} />
              <circle cx={x(i)} cy={point.close === null ? 20 : y(point.close)} r={4} fill="#47d6a0" />
              <text className="chart-tag" x={labelX} y={25} textAnchor={anchor} style={{ fill: "#66ddb0" }}>PA trigger</text>
            </g>}
            <rect className="eb-chart-point" tabIndex={catalysts.length || trigger ? 0 : -1}
              role={catalysts.length || trigger ? "button" : undefined}
              aria-label={eventOnly ? `Tin ${dateVi(point.day, true)} · chưa có nến` : `Phiên ${dateVi(point.day, true)}, giá ${numberVi(point.close)}, khối lượng ${numberVi(point.volume, 0)}`}
              x={x(i) - 9} width={18} y={18} height={Y1 - 18} onMouseEnter={() => setFocused(point.day)} onFocus={() => setFocused(point.day)} onBlur={() => setFocused(null)}
              onClick={() => { if (catalysts[0]) onEvent(catalysts[0]); else if (trigger) onPriceAction(); }}
              onKeyDown={(e) => { if (e.key !== " " && e.key !== "Enter") return; e.preventDefault(); if (catalysts[0]) onEvent(catalysts[0]); else if (trigger) onPriceAction(); }} />
          </g>;
        })}
        {focusIndex >= 0 && <line className="eb-chart-focus" x1={x(focusIndex)} x2={x(focusIndex)} y1={18} y2={Y1} />}
        {[...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])].map((i) => <text key={i} className="chart-label" x={x(i)} y={157} textAnchor={i === points.length - 1 && i > 0 ? "end" : "start"}>{dateVi(points[i].day)}</text>)}
        <text className="chart-label" x={X0 + 6} y={177}>{selected
          ? `${dateVi(selected.day)} · Giá ${numberVi(selected.close)} · KL ${numberVi(selected.volume, 0)}`
          : `Khối lượng ngày · cột  /  Giá đóng cửa · ${hasAdjusted ? price?.priceBasis ?? "chuỗi PA" : "nguồn volume"}`}</text>
      </svg>
    </div></>}
    notes={<div className="chart-notes">
      {visibleGroups.slice(-3).flatMap(([, items]) => items.map((event) => <button key={event.eventId} type="button" className="tiny-chip gold" onClick={() => onEvent(event)}>◇ {event.eventLabel || "Sự kiện"} · r{event.revision} · {dateVi(eventTime(event))}</button>))}
      {pa?.setup && <button type="button" className={`tiny-chip ${triggerDay ? "green" : ""}`} onClick={onPriceAction}>▲ Trigger {numberVi(pa.setup.entryReference)} · {triggerDay ? "nến đóng" : "cần đối chiếu nến và cơ sở giá"}</button>}
      {positive(pa?.setup?.invalidationLevel) && <button type="button" className="tiny-chip red" onClick={onPriceAction}>— Vô hiệu {numberVi(pa.setup.invalidationLevel)}{sameBasis ? "" : " · chưa đối chiếu cơ sở giá"}</button>}
      <span className="tiny-chip">{volume?.partialToday ? "RVOL intraday · cùng thời điểm" : "Khối lượng · snapshot ngày"}</span>
      {offChart.length > 0 && <span className="tiny-chip">{offChart.length} tin ngoài chuỗi · xem cột Xúc tác</span>}
      {eventDates.some((day) => !adjusted.has(day) && !traded.has(day)) && <span className="tiny-chip">Mốc chỉ có tin · chưa có giá/khối lượng</span>}
    </div>} />;
}
