import { useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { CyclePathsV3, CycleStatsV3, TimelineMarkers } from '../../../lib/cotuc/timing-types';
import {
  POSITION_TEXT,
  buildCurve,
  describeOffset,
  formatPct,
  niceTicks,
  positionOf,
  selectedWindow,
  shadeOpacity,
  xDomain,
  yDomain,
} from '../../../lib/cotuc/cycle-timeline.utils';

/**
 * Timeline chu kỳ cổ tức: đường CAR trung bình, dải phân vị giữa các đợt, vùng mua,
 * mốc sự kiện và marker "hôm nay".
 *
 * Màu tuỳ biến bằng CSS variables: --ct-line, --ct-buy, --ct-warn, --ct-today, --ct-gap, --ct-muted, --ct-grid, --ct-fg.
 */
export interface CycleTimelineProps {
  stats: CycleStatsV3 | null;
  /** Dữ liệu đường CAR từng đợt. Thiếu thì chỉ hiện bảng cửa sổ. */
  paths?: CyclePathsV3 | null;
  /** k = -tdToEx (ngày giao dịch so với GDKHQ). null nếu chưa có ngày GDKHQ. */
  todayOffset: number | null;
  markers?: TimelineMarkers;
  className?: string;
}

const W = 700;
const H = 360;
const ML = 46;
const MR = 12;
const MT = 26;
const MB = 34;
const PW = W - ML - MR;
const PH = H - MT - MB;

const C = {
  line: 'var(--ct-line, #0d6b8f)',
  buy: 'var(--ct-buy, #1e9e5a)',
  warn: 'var(--ct-warn, #c47a00)',
  today: 'var(--ct-today, #d6336c)',
  gap: 'var(--ct-gap, #7a5cc7)',
  muted: 'var(--ct-muted, #5d6b78)',
  grid: 'var(--ct-grid, #dde3e9)',
  fg: 'var(--ct-fg, currentColor)',
};

type Num = number | null | undefined;

export function CycleTimeline({ stats, paths = null, todayOffset, markers, className }: CycleTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [showPaths, setShowPaths] = useState(true);
  const [showBands, setShowBands] = useState(true);

  const win = useMemo(() => selectedWindow(stats), [stats]);
  const curve = useMemo(() => (paths ? buildCurve(paths) : []), [paths]);
  const [x0, x1] = useMemo(() => xDomain(paths, win, todayOffset), [paths, win, todayOffset]);
  const [y0, y1] = useMemo(() => yDomain(curve, paths?.currentPath ?? null), [curve, paths]);

  if (!stats) {
    return (
      <div className={className} role="status" data-testid="timeline-empty">
        Chưa có dữ liệu backtest cho mã này.
      </div>
    );
  }

  const X = (t: number) => ML + ((t - x0) / (x1 - x0)) * PW;
  const Y = (v: number) => MT + ((y1 - v) / (y1 - y0)) * PH;
  const inX = (t: number) => t >= x0 && t <= x1;

  const position = positionOf(todayOffset, win);
  const active = hover ?? todayOffset;

  function linePath(offsets: number[], values: Num[], maxOffset = Infinity): string {
    let d = '';
    let pen = false;
    offsets.forEach((t, i) => {
      const v = values[i];
      if (t > maxOffset || typeof v !== 'number' || !Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  function bandPath(hiKey: 'p95' | 'p75', loKey: 'p5' | 'p25'): string {
    const pts = curve.filter((p) => p[hiKey] !== null && p[loKey] !== null);
    if (pts.length < 2) return '';
    const up = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.offset).toFixed(1)} ${Y(p[hiKey] as number).toFixed(1)}`);
    const down = [...pts].reverse().map((p) => `L${X(p.offset).toFixed(1)} ${Y(p[loKey] as number).toFixed(1)}`);
    return up.join('') + down.join('') + 'Z';
  }

  function offsetFromPointer(e: PointerEvent<SVGSVGElement>): number | null {
    const el = svgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = Math.round(x0 + ((x - ML) / PW) * (x1 - x0));
    return Math.max(x0, Math.min(x1, t));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const base = hover ?? todayOffset ?? 0;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover(Math.max(x0, base - 1));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHover(Math.min(x1, base + 1));
    } else if (e.key === 'Escape') {
      setHover(null);
    }
  }

  const idx = active !== null && paths ? paths.offsets.indexOf(active) : -1;
  const currentValue = idx >= 0 ? paths?.currentPath?.[idx] ?? null : null;
  const infoText =
    active === null
      ? 'Di chuột, chạm hoặc dùng phím mũi tên để xem số liệu từng ngày.'
      : describeOffset(curve.find((p) => p.offset === active), active, currentValue, win);

  const fixedMarks: { key: string; offset: number | null | undefined; label: string; color: string; dashed: boolean }[] = [
    { key: 'agm', offset: markers?.agm, label: 'ĐHCĐ', color: C.muted, dashed: true },
    { key: 'ex', offset: 0, label: 'GDKHQ', color: C.gap, dashed: false },
    { key: 'pay', offset: markers?.payment, label: 'Thanh toán', color: C.muted, dashed: true },
  ];
  const earn = markers?.earnings ?? null;

  return (
    <section className={className} aria-label={`Chu kỳ cổ tức ${stats.ticker}`}>
      <p data-testid="timeline-status" style={{ margin: '0 0 4px', fontWeight: 600 }}>
        {POSITION_TEXT[position]}
      </p>
      {win ? (
        <p style={{ margin: '0 0 8px', fontSize: 13 }}>
          Vùng mua [{win.entryFrom}, {win.entryTo}] ngày GD trước GDKHQ, thoát tại {win.exitOffset}. Kỳ vọng ròng (cận dưới 90%){' '}
          {formatPct(win.netExpectancyLcb)}, {win.nEvents} đợt.
        </p>
      ) : (
        <p data-testid="timeline-nosignal" style={{ margin: '0 0 8px', fontSize: 13 }}>
          Không có cửa sổ nào vượt cổng thống kê (số đợt, kỳ vọng ròng, hiệu chỉnh đa so sánh). Không chọn đại một vùng mua.
        </p>
      )}

      {paths ? (
        <div role="group" aria-label="Biểu đồ CAR, dùng phím mũi tên để duyệt" tabIndex={0} onKeyDown={onKeyDown}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Đường CAR trung bình theo ngày giao dịch quanh GDKHQ"
            style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'pan-y' }}
            onPointerMove={(e) => {
              const t = offsetFromPointer(e);
              if (t !== null) setHover(t);
            }}
            onPointerDown={(e) => {
              const t = offsetFromPointer(e);
              if (t !== null) setHover(t);
            }}
            onPointerLeave={() => setHover(null)}
          >
            {niceTicks(y0, y1).map((v) => (
              <g key={`y${v}`}>
                <line x1={ML} x2={W - MR} y1={Y(v)} y2={Y(v)} style={{ stroke: C.grid }} />
                <text x={ML - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} style={{ fill: C.muted }}>
                  {(v * 100).toFixed(0)}%
                </text>
              </g>
            ))}
            {Array.from({ length: Math.floor((x1 - Math.ceil(x0 / 5) * 5) / 5) + 1 }, (_, i) => Math.ceil(x0 / 5) * 5 + i * 5).map((t) => (
              <text key={`x${t}`} x={X(t)} y={H - 14} textAnchor="middle" fontSize={11} style={{ fill: C.muted }}>
                {t}
              </text>
            ))}
            <text x={ML + PW / 2} y={H - 2} textAnchor="middle" fontSize={11} style={{ fill: C.muted }}>
              ngày giao dịch so với GDKHQ
            </text>

            {win && (
              <g data-testid="buy-window">
                <rect
                  x={X(Math.max(x0, win.entryFrom))}
                  y={MT}
                  width={Math.max(0, X(Math.min(x1, win.entryTo)) - X(Math.max(x0, win.entryFrom)))}
                  height={PH}
                  style={{ fill: C.buy }}
                  opacity={shadeOpacity(win.netExpectancyLcb)}
                />
                <text
                  x={(X(Math.max(x0, win.entryFrom)) + X(Math.min(x1, win.entryTo))) / 2}
                  y={MT + PH - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  style={{ fill: C.buy }}
                >
                  Vùng mua
                </text>
              </g>
            )}

            {earn && (
              <rect
                data-testid="earnings-band"
                x={X(Math.max(x0, earn.offset - earn.halfWidth))}
                y={MT}
                width={Math.max(0, X(Math.min(x1, earn.offset + earn.halfWidth)) - X(Math.max(x0, earn.offset - earn.halfWidth)))}
                height={PH}
                style={{ fill: C.warn }}
                opacity={0.16}
              />
            )}

            {showBands && (
              <g data-testid="bands">
                <path d={bandPath('p95', 'p5')} style={{ fill: C.line }} opacity={0.12} />
                <path d={bandPath('p75', 'p25')} style={{ fill: C.line }} opacity={0.22} />
              </g>
            )}

            {showPaths &&
              paths.eventPaths.map((e) => (
                <path
                  key={e.exDate}
                  data-testid="event-path"
                  d={linePath(paths.offsets, e.car)}
                  fill="none"
                  strokeWidth={1}
                  opacity={0.16}
                  style={{ stroke: C.line }}
                />
              ))}

            <line x1={ML} x2={W - MR} y1={Y(0)} y2={Y(0)} strokeDasharray="2 3" opacity={0.6} style={{ stroke: C.muted }} />
            <path
              data-testid="mean-line"
              d={linePath(curve.map((p) => p.offset), curve.map((p) => p.mean))}
              fill="none"
              strokeWidth={2.6}
              strokeLinejoin="round"
              style={{ stroke: C.line }}
            />
            {paths.currentPath && (
              <path
                data-testid="current-path"
                d={linePath(paths.offsets, paths.currentPath, todayOffset ?? Infinity)}
                fill="none"
                strokeWidth={2.2}
                strokeDasharray="5 3"
                style={{ stroke: C.today }}
              />
            )}

            {earn && inX(earn.offset) && (
              <g>
                <line x1={X(earn.offset)} x2={X(earn.offset)} y1={MT} y2={MT + PH} strokeDasharray="3 3" style={{ stroke: C.warn }} />
                <text x={X(earn.offset)} y={MT - 8} textAnchor="middle" fontSize={11} style={{ fill: C.warn }}>
                  KQKD (dự kiến)
                </text>
              </g>
            )}
            {fixedMarks.map(
              (m) =>
                typeof m.offset === 'number' &&
                inX(m.offset) && (
                  <g key={m.key} data-testid={`mark-${m.key}`}>
                    <line
                      x1={X(m.offset)}
                      x2={X(m.offset)}
                      y1={MT}
                      y2={MT + PH}
                      strokeDasharray={m.dashed ? '3 3' : undefined}
                      style={{ stroke: m.color }}
                    />
                    <text x={X(m.offset)} y={MT - 8} textAnchor="middle" fontSize={11} style={{ fill: m.color }}>
                      {m.label}
                    </text>
                  </g>
                ),
            )}

            {todayOffset !== null && inX(todayOffset) && (
              <g data-testid="today-marker">
                <line x1={X(todayOffset)} x2={X(todayOffset)} y1={MT} y2={MT + PH} strokeWidth={2} style={{ stroke: C.today }} />
                <text x={X(todayOffset) + 6} y={MT + 14} fontSize={11} fontWeight={600} style={{ fill: C.today }}>
                  Hôm nay (k={todayOffset})
                </text>
              </g>
            )}
            {hover !== null && inX(hover) && (
              <line x1={X(hover)} x2={X(hover)} y1={MT} y2={MT + PH} opacity={0.5} style={{ stroke: C.fg }} />
            )}
          </svg>

          <div data-testid="timeline-info" aria-live="polite" style={{ minHeight: 40, padding: '6px 2px', fontSize: 13 }}>
            {infoText}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
            <label>
              <input type="checkbox" checked={showPaths} onChange={(e) => setShowPaths(e.target.checked)} /> Từng đợt lịch sử
            </label>
            <label>
              <input type="checkbox" checked={showBands} onChange={(e) => setShowBands(e.target.checked)} /> Dải phân vị
            </label>
          </div>
          <p style={{ fontSize: 12, margin: '6px 0 0', color: C.muted }}>
            Dải phân vị mô tả mức phân tán giữa các đợt lịch sử, không phải khoảng tin cậy của giá trị trung bình.
          </p>
        </div>
      ) : (
        <p data-testid="timeline-no-paths" style={{ fontSize: 13 }}>
          Chưa có dữ liệu đường CAR cho mã này. Bảng dưới là các cửa sổ đã kiểm định.
        </p>
      )}

      <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginTop: 8 }}>
        <caption style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 4 }}>Các cửa sổ đã kiểm định</caption>
        <thead>
          <tr>
            <th align="left">Cửa sổ</th>
            <th align="left">Mua</th>
            <th align="left">Thoát</th>
            <th align="right">Kỳ vọng ròng (LCB)</th>
            <th align="right">q</th>
            <th align="right">Đợt</th>
            <th align="left">Chọn</th>
          </tr>
        </thead>
        <tbody>
          {stats.windows.map((w) => (
            <tr key={w.id} data-testid="window-row">
              <td>{w.label}</td>
              <td>
                [{w.entryFrom}, {w.entryTo}]
              </td>
              <td>{w.exitOffset}</td>
              <td align="right">{formatPct(w.netExpectancyLcb)}</td>
              <td align="right">{w.fdrQValue.toFixed(2).replace('.', ',')}</td>
              <td align="right">{w.nEvents}</td>
              <td>{w.selected && w.id === stats.selectedWindowId ? '✓ Được chọn' : 'Không qua cổng'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontSize: 12, color: C.muted, margin: '8px 0 0' }}>
        Dữ liệu {stats.version} · {stats.asOf} · benchmark {stats.benchmark} · giá điều chỉnh. Không phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}

export default CycleTimeline;
