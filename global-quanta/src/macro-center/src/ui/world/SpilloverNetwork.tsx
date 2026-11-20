// G5 (20/11/2026) — mạng lan truyền dạng vòng (Giao-dien-KNTG/04 mục 3). Vẽ ĐÚNG bảng lan truyền Diebold–Yilmaz đã có
// (recent.table[i][j] = % phương sai dự báo của thị trường i đến từ cú sốc của j; net = phát ra − nhận). Không tính chỉ số mới.
// • Việt Nam ở tâm, các thị trường khác trên vòng tròn. Mũi tên j → i: i nhận x% từ j; độ dày theo x. Ẩn cạnh dưới ngưỡng.
// • Chiều VÀO Việt Nam tô vàng (câu hỏi của tab: thế giới truyền gì sang VN). Viền liền = phát ra ròng, viền đứt = nhận ròng.
// • Rê chuột / focus một nút: chỉ sáng các cạnh của nút đó. Bảng lan truyền đầy đủ nằm ngay dưới (bảng thay thế).
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtNum } from '../../macro-filter';

export const EDGE_MIN_PCT = 5;
const W = 560, H = 400, CX = W / 2, CY = H / 2, RING = 148, NODE = 33;

export interface NetEdge { from: number; to: number; pct: number }
/** Cạnh có hướng j → i cho mọi ô ngoài đường chéo ≥ ngưỡng, sắp giảm dần. */
export function spillEdges(table: number[][], min = EDGE_MIN_PCT): NetEdge[] {
  const out: NetEdge[] = [];
  table.forEach((row, i) => row.forEach((v, j) => { if (i !== j && Number.isFinite(v) && v >= min) out.push({ from: j, to: i, pct: v }); }));
  return out.sort((a, b) => b.pct - a.pct);
}

const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), d)}`;

export function SpilloverNetwork({ names, table, net, vnIndex }: { names: string[]; table: number[][]; net: number[]; vnIndex: number }) {
  const [focus, setFocus] = useState<number | null>(null);
  // điện thoại: khung cuộn ngang mở ở GIỮA (Việt Nam ở tâm), không ở mép trái
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { const el = box.current; if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; }, []);
  const pos = useMemo(() => {
    const others = names.map((_, i) => i).filter((i) => i !== vnIndex);
    const p: Record<number, { x: number; y: number }> = { [vnIndex]: { x: CX, y: CY } };
    others.forEach((idx, k) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / others.length; p[idx] = { x: CX + RING * Math.cos(a), y: CY + RING * Math.sin(a) }; });
    return p;
  }, [names, vnIndex]);
  const edges = useMemo(() => spillEdges(table), [table]);
  const maxPct = Math.max(1, ...edges.map((e) => e.pct));
  const hidden = table.reduce((n, row, i) => n + row.filter((v, j) => i !== j && v < EDGE_MIN_PCT).length, 0);

  const path = (e: NetEdge) => {
    const a = pos[e.from], b = pos[e.to];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const sx = a.x + ux * NODE, sy = a.y + uy * NODE, ex = b.x - ux * (NODE + 6), ey = b.y - uy * (NODE + 6);
    // lệch sang trái chiều đi để hai chiều ngược nhau không chồng lên nhau
    const mx = (sx + ex) / 2 - uy * 18, my = (sy + ey) / 2 + ux * 18;
    return { d: `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`, lx: (sx + 2 * mx + ex) / 4, ly: (sy + 2 * my + ey) / 4 };
  };

  return (
    <figure className="spill-net" data-testid="spill-network">
      <p className="sn-hint muted">Vuốt ngang trong khung để xem hết đồ thị.</p>
      <div className="scroll" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W, maxWidth: 720, width: '100%', display: 'block', margin: '0 auto' }} role="group"
          aria-label={`Mạng lan truyền gần đây giữa ${names.length} thị trường: ${edges.length} chiều từ ${EDGE_MIN_PCT}% trở lên. Bảng đầy đủ ở dưới.`}
          onMouseLeave={() => setFocus(null)}>
          <defs>
            <marker id="sn-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="sn-head" /></marker>
            <marker id="sn-arrow-vn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="sn-head vn" /></marker>
          </defs>
          {edges.map((e) => {
            const g = path(e), toVn = e.to === vnIndex;
            const on = focus == null || focus === e.from || focus === e.to;
            const label = `${names[e.from]} → ${names[e.to]}: ${names[e.to]} nhận ${fmtNum(e.pct, 1)}% từ ${names[e.from]}`;
            return (
              <g key={`${e.from}-${e.to}`} className={`sn-edge${toVn ? ' vn' : ''}${on ? '' : ' dim'}`} data-testid={`sn-edge-${e.from}-${e.to}`}>
                <title>{label}</title>
                <path d={g.d} strokeWidth={1 + (e.pct / maxPct) * 5} markerEnd={`url(#${toVn ? 'sn-arrow-vn' : 'sn-arrow'})`} fill="none" />
                {(focus === e.from || focus === e.to || toVn) && <text x={g.lx} y={g.ly} className="sn-pct" textAnchor="middle">{fmtNum(e.pct, 0)}%</text>}
              </g>
            );
          })}
          {names.map((n, i) => {
            const p = pos[i]; if (!p) return null;
            const isVn = i === vnIndex, giver = net[i] > 0;
            return (
              <g key={n} className={`sn-node${isVn ? ' vn' : ''}${giver ? ' giver' : ' taker'}${focus != null && focus !== i ? ' dim' : ''}`} tabIndex={0} role="button"
                aria-label={`${n}: lan truyền ròng ${signed(net[i])} điểm % (${giver ? 'phát ra ròng' : 'nhận ròng'})`} data-testid={`sn-node-${i}`}
                onMouseEnter={() => setFocus(i)} onFocus={() => setFocus(i)} onBlur={() => setFocus(null)}>
                <title>{`${n}: ròng ${signed(net[i])} (${giver ? 'phát ra ròng' : 'nhận ròng'})`}</title>
                <circle cx={p.x} cy={p.y} r={NODE} />
                <text x={p.x} y={p.y - 2} textAnchor="middle" className="sn-name">{n}</text>
                <text x={p.x} y={p.y + 12} textAnchor="middle" className="sn-net">ròng {signed(net[i])}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="muted">
        Mũi tên A → B: B nhận x% phương sai dự báo từ cú sốc của A (cửa sổ gần đây). Độ dày theo %. Vàng: chiều vào Việt Nam. Viền liền: phát ra ròng; viền đứt: nhận ròng.
        Ẩn {hidden} chiều dưới {EDGE_MIN_PCT}%; bảng đầy đủ ở ngay dưới. Đo trạng thái, không dự báo hướng đi.
      </figcaption>
    </figure>
  );
}
