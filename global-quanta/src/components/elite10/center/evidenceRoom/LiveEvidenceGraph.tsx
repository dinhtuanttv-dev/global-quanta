// 27/11/2026 — Evidence Brain v2: bố cục cân theo dòng chảy (Snapshot → Tranh luận AI → Nguồn & engine → Phán quyết), mọi khối căn
// giữa theo cột nguồn đo thật; đường nối phát sáng theo loại quan hệ, có "xung sáng" chạy dọc đường theo hướng dữ liệu (tắt khi người dùng
// chọn giảm chuyển động); chọn / rê một khối làm sáng các đường của khối đó, mờ phần còn lại. Logic bằng chứng (graphEdges) không đổi;
// đường "luồng phiên" (Snapshot → hai phe AI) chỉ là cấu trúc phiên, KHÔNG phải trích dẫn, vẽ khác hẳn và ghi rõ trong chú thích.
import { useLayoutEffect, useRef, useState } from "react";
import type { EvidenceRef, ValidatedClaim } from "../../../../lib/evidenceBrain/types";
import { GraphViewport, type Box } from "./roomView";

export type NodeId = "snapshot" | "bull" | "bear" | "decision" | "events" | "priceAction" | "volume" | "seasonal" | "judge";
export type Tone = "good" | "warn" | "neutral" | "bad";
export interface RoomNode {
  id: NodeId;
  label: string;
  badge: string;
  tone: Tone;
  title: string;
  meta?: string;
  ref?: string;
  /** Nút không có dữ liệu cho mã đang xem (VD không có cửa sổ mùa vụ) — hiển thị mờ, vẫn bấm được. */
  muted?: boolean;
}

type Relation = "support" | "risk" | "context" | "ai" | "flow";
type Edge = { from: NodeId; to: NodeId; relation: Relation; preliminary?: boolean };
const nodeStyle: Record<NodeId, string> = {
  snapshot: "root", bull: "bull", bear: "bear", decision: "evidence", events: "catalyst", priceAction: "evidence", volume: "evidence", seasonal: "evidence", judge: "judge",
};
const SOURCE_IDS: NodeId[] = ["decision", "events", "priceAction", "volume", "seasonal"];
/** Cột: x trái, độ rộng. Cột nguồn xếp chồng; các cột còn lại căn giữa theo chiều cao THẬT của cột nguồn. */
const COL = { snapshot: [24, 140], ai: [232, 158], source: [454, 176], judge: [708, 188] } as const;
const GAP = 10;
const domainNode: Partial<Record<EvidenceRef["domain"], NodeId>> = {
  decision: "decision", catalyst: "events", price_action: "priceAction", volume: "volume",
};
const relationLabel: Record<Relation, string> = {
  support: "AI dẫn nguồn để hỗ trợ", risk: "AI dẫn nguồn để phản biện", context: "Snapshot chứa bằng chứng của nguồn", ai: "Trọng tài dẫn nguồn",
  flow: "Luồng phiên: snapshot được giao cho hai phe AI (không phải trích dẫn)",
};

export function graphEdges(refs: EvidenceRef[], claims: ValidatedClaim[]): Edge[] {
  // 27/11/2026: bằng chứng mùa vụ (catalyst · timing.*) có nút riêng "Mùa vụ · Timeline", không gộp vào Event Radar.
  const refGroups = new Map(refs.map((ref) => [ref.id, ref.domain === "catalyst" && ref.fieldPath.startsWith("timing.") ? "seasonal" as NodeId : domainNode[ref.domain]]));
  const edges = new Map<string, Edge>();
  const add = (edge: Edge) => {
    const key = `${edge.from}|${edge.to}|${edge.relation}`;
    if (!edges.has(key) || !edge.preliminary) edges.set(key, edge);
  };
  for (const to of new Set(refGroups.values())) if (to) add({ from: "snapshot", to, relation: "context" });
  for (const claim of claims) {
    if (claim.validation !== "REFS_MATCHED" && claim.validation !== "STRUCTURAL_ONLY") continue;
    const role = claim.side === "JUDGE" ? "judge" : claim.side === "BULL" ? "bull" : "bear";
    const preliminary = claim.validation === "STRUCTURAL_ONLY";
    const directional = new Set([...claim.supports, ...claim.invalidates]);
    const refsWithRelation = [
      ...claim.refs.filter((id) => !directional.has(id)).map((id) => [id, "context"] as const),
      ...claim.supports.map((id) => [id, "support"] as const),
      ...claim.invalidates.map((id) => [id, "risk"] as const),
    ];
    for (const [id, relation] of refsWithRelation) {
      const source = refGroups.get(id);
      if (!source) continue;
      if (role === "judge") add({ from: source, to: role, relation: relation === "context" ? "ai" : relation, preliminary });
      else add({ from: role, to: source, relation, preliminary });
    }
  }
  return [...edges.values()];
}

/** Bố cục theo cột; cột nguồn xếp chồng theo chiều cao đo được, các khối khác căn theo tâm cột nguồn. */
export function layoutBoxes(nodes: Pick<RoomNode, "id">[], heights: Partial<Record<NodeId, number>>): Map<NodeId, Box> {
  const h = (id: NodeId) => heights[id] || 78;
  const boxes = new Map<NodeId, Box>();
  const ids = new Set(nodes.map((n) => n.id));
  let y = 0;
  for (const id of SOURCE_IDS) {
    if (!ids.has(id)) continue;
    boxes.set(id, { x: COL.source[0], y, width: COL.source[1], height: h(id) });
    y += h(id) + GAP;
  }
  const total = y > 0 ? y - GAP : 300;
  const mid = total / 2;
  const spread = Math.max(64, total * 0.2);
  const place = (id: NodeId, [x, width]: readonly [number, number], center: number) => {
    if (ids.has(id)) boxes.set(id, { x, y: center - h(id) / 2, width, height: h(id) });
  };
  place("snapshot", COL.snapshot, mid);
  place("bull", COL.ai, mid - spread);
  place("bear", COL.ai, mid + spread);
  place("judge", COL.judge, mid);
  return boxes;
}

function pathBetween(a: Box, b: Box, lane: number) {
  const x0 = a.x + a.width;
  const x1 = b.x;
  const y0 = a.y + a.height / 2 + lane;
  const y1 = b.y + b.height / 2 + lane;
  const bend = Math.max(28, Math.min(92, (x1 - x0) * .55));
  return { d: `M${x0} ${y0} C${x0 + bend} ${y0} ${x1 - bend} ${y1} ${x1} ${y1}`, x0, y0, x1, y1 };
}

const COLUMN_TITLES: { id: NodeId | "source"; text: string }[] = [
  { id: "snapshot", text: "Snapshot" }, { id: "bull", text: "Tranh luận AI" }, { id: "source", text: "Nguồn & engine" }, { id: "judge", text: "Phán quyết" },
];

export default function LiveEvidenceGraph({ nodes, refs, claims, onSelect }: {
  nodes: RoomNode[]; refs: EvidenceRef[]; claims: ValidatedClaim[]; onSelect: (id: NodeId) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Partial<Record<NodeId, number>>>({});
  const [focus, setFocus] = useState<NodeId | null>(null);
  const [hover, setHover] = useState<NodeId | null>(null);
  useLayoutEffect(() => {
    const cards = ref.current?.querySelectorAll<HTMLElement>("[data-eb-node]");
    if (!cards) return;
    const measure = () => {
      const next = Object.fromEntries(Array.from(cards, (card) => [card.dataset.ebNode, card.offsetHeight]));
      setHeights((current) => nodes.every(({ id }) => current[id] === next[id]) ? current : next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [nodes.map(({ id }) => id).join("|")]);

  const boxes = layoutBoxes(nodes, heights);
  const visible = [...boxes.values()];
  const top = Math.min(...visible.map((b) => b.y));
  const titleY = top - 26;
  const x = Math.min(...visible.map((b) => b.x));
  const bounds = { x, y: titleY, width: Math.max(...visible.map((b) => b.x + b.width)) - x, height: Math.max(...visible.map((b) => b.y + b.height)) - titleY };
  const evidence = graphEdges(refs, claims).filter((edge) => boxes.has(edge.from) && boxes.has(edge.to));
  const flow: Edge[] = (["bull", "bear"] as NodeId[]).filter((id) => boxes.has(id) && boxes.has("snapshot")).map((to) => ({ from: "snapshot", to, relation: "flow" }));
  const edges = [...flow, ...evidence];
  const lit = hover ?? focus;
  const select = (id: NodeId) => { setFocus(id); onSelect(id); };
  const colX: Record<string, number> = { snapshot: COL.snapshot[0], bull: COL.ai[0], source: COL.source[0], judge: COL.judge[0] };
  return <GraphViewport bounds={bounds} visibleCount={nodes.length} edgeCount={evidence.length}
    world={<div className="canvas-world eb-graph-v2" ref={ref}>
      {COLUMN_TITLES.filter((c) => c.id === "source" ? SOURCE_IDS.some((id) => boxes.has(id)) : boxes.has(c.id as NodeId)).map((c) =>
        <span key={c.id} className="eb-col-title" style={{ left: colX[c.id], top: titleY }} aria-hidden="true">{c.text}</span>)}
      <svg className="edges eb-edges-v2" viewBox="0 0 920 430" aria-hidden="true">
        <defs>
          <filter id="eb-glow" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {edges.map((edge) => {
          const active = Boolean(lit && (edge.from === lit || edge.to === lit));
          const dim = Boolean(lit && !active);
          const lane = edge.relation === "support" ? -4 : edge.relation === "risk" ? 4 : 0;
          const p = pathBetween(boxes.get(edge.from)!, boxes.get(edge.to)!, lane);
          const cls = `eb-edge ${edge.relation}${active ? " lit" : ""}${dim ? " dim" : ""}${edge.preliminary ? " prelim" : ""}`;
          return <g key={`${edge.from}:${edge.to}:${edge.relation}`} className={cls} data-edge={`${edge.from}>${edge.to}`}>
            <path className="eb-edge-halo" d={p.d} />
            <path className="eb-edge-line" d={p.d} filter="url(#eb-glow)"><title>{relationLabel[edge.relation]}{edge.preliminary ? " · chỉ kiểm tra cấu trúc" : ""}</title></path>
            {edge.relation !== "flow" && <path className="eb-edge-pulse" d={p.d} pathLength={100} />}
            <circle className="eb-port" cx={p.x0} cy={p.y0} r={2.4} />
            <circle className="eb-port" cx={p.x1} cy={p.y1} r={2.4} />
          </g>;
        })}
      </svg>
      {nodes.map((node) => {
        const box = boxes.get(node.id)!;
        const running = /ĐANG CHẠY/.test(node.badge);
        return <button key={node.id} type="button" data-eb-node={node.id}
          className={`node eb-live-node ${nodeStyle[node.id]} tone-${node.tone}${node.muted ? " eb-node-muted" : ""}${running ? " eb-node-running" : ""}${lit === node.id ? " eb-node-lit" : ""}`}
          aria-current={focus === node.id || undefined} style={{ left: box.x, top: box.y, width: box.width }}
          onClick={() => select(node.id)} onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(node.id)} onBlur={() => setHover(null)}>
          <span className="node-label"><span>{node.label}</span><span className={`mini-badge ${node.tone === "bad" ? "red" : node.tone === "warn" ? "warn" : node.tone === "neutral" ? "eb-badge-neutral" : ""}`}>{node.badge}</span></span>
          <span className="node-title">{node.title}</span>
          {node.meta && <span className="node-meta">{node.meta}</span>}
          {node.ref && <span className="node-ref">{node.ref}</span>}
        </button>;
      })}
    </div>}
    details={<details className="eb-graph-list">
      <summary>Danh sách nút và liên kết</summary>
      <ul>{nodes.map((node) => <li key={node.id}><button type="button" className="small-link" onClick={() => select(node.id)}>{node.label} · {node.badge}</button> {node.title}</li>)}</ul>
      <ul>{evidence.map((edge) => <li key={`${edge.from}:${edge.to}:${edge.relation}`}>{nodes.find((node) => node.id === edge.from)?.label} → {nodes.find((node) => node.id === edge.to)?.label} · {relationLabel[edge.relation]}</li>)}</ul>
    </details>} />;
}
