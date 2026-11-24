import { useLayoutEffect, useRef, useState } from "react";
import type { EvidenceRef, ValidatedClaim } from "../../../../lib/evidenceBrain/types";
import { GraphViewport, type Box } from "./roomView";

export type NodeId = "snapshot" | "bull" | "bear" | "decision" | "events" | "priceAction" | "volume" | "judge";
export type Tone = "good" | "warn" | "neutral" | "bad";
export interface RoomNode {
  id: NodeId;
  label: string;
  badge: string;
  tone: Tone;
  title: string;
  meta?: string;
  ref?: string;
}

type Relation = "support" | "risk" | "context" | "ai";
type Edge = { from: NodeId; to: NodeId; relation: Relation; preliminary?: boolean };
const nodeStyle: Record<NodeId, string> = {
  snapshot: "root", bull: "bull", bear: "bear", decision: "evidence", events: "catalyst", priceAction: "evidence", volume: "evidence", judge: "judge",
};
const position: Record<NodeId, [number, number, number]> = {
  snapshot: [137, 184, 138], bull: [348, 66, 150], bear: [348, 270, 150],
  decision: [568, 42, 150], events: [568, 133, 150], priceAction: [568, 224, 150], volume: [568, 315, 150], judge: [730, 183, 188],
};
const domainNode: Partial<Record<EvidenceRef["domain"], NodeId>> = {
  decision: "decision", catalyst: "events", price_action: "priceAction", volume: "volume",
};
const relationLabel: Record<Relation, string> = {
  support: "AI dẫn nguồn để hỗ trợ", risk: "AI dẫn nguồn để phản biện", context: "Cùng snapshot hoặc có dẫn chiếu", ai: "Trọng tài dẫn nguồn",
};

export function graphEdges(refs: EvidenceRef[], claims: ValidatedClaim[]): Edge[] {
  const refGroups = new Map(refs.map((ref) => [ref.id, domainNode[ref.domain]]));
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

function pathBetween(a: Box, b: Box, lane: number) {
  const x0 = a.x + a.width;
  const x1 = b.x;
  const y0 = a.y + a.height / 2 + lane;
  const y1 = b.y + b.height / 2 + lane;
  const bend = Math.min(64, (x1 - x0) * .6);
  return `M${x0} ${y0} C${x0 + bend} ${y0} ${x1 - bend} ${y1} ${x1} ${y1}`;
}

export default function LiveEvidenceGraph({ nodes, refs, claims, onSelect }: {
  nodes: RoomNode[]; refs: EvidenceRef[]; claims: ValidatedClaim[]; onSelect: (id: NodeId) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Partial<Record<NodeId, number>>>({});
  const [focus, setFocus] = useState<NodeId | null>(null);
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

  const boxes = new Map<NodeId, Box>();
  let sourceBottom = 0;
  for (const node of nodes) {
    const [x, anchorY, width] = position[node.id];
    const stacked = x === 568;
    const height = heights[node.id] || 78;
    const y = stacked ? Math.max(anchorY, sourceBottom + 9) : anchorY;
    boxes.set(node.id, { x, y, width, height });
    if (stacked) sourceBottom = y + height;
  }
  const visible = [...boxes.values()];
  const x = Math.min(...visible.map((b) => b.x));
  const y = Math.min(...visible.map((b) => b.y));
  const bounds = { x, y, width: Math.max(...visible.map((b) => b.x + b.width)) - x, height: Math.max(...visible.map((b) => b.y + b.height)) - y };
  const edges = graphEdges(refs, claims).filter((edge) => boxes.has(edge.from) && boxes.has(edge.to));
  const select = (id: NodeId) => { setFocus(id); onSelect(id); };
  return <GraphViewport bounds={bounds} visibleCount={nodes.length} edgeCount={edges.length}
    world={<div className="canvas-world" ref={ref}>
      <svg className="edges" viewBox="0 0 920 430" aria-hidden="true">
        {edges.map((edge) => {
          const inactive = focus && edge.from !== focus && edge.to !== focus;
          const lane = edge.relation === "support" ? -4 : edge.relation === "risk" ? 4 : 0;
          return <path key={`${edge.from}:${edge.to}:${edge.relation}`} className={`edge ${edge.relation}`}
            style={{ opacity: inactive ? .18 : undefined, strokeDasharray: edge.preliminary ? "3 5" : undefined }}
            d={pathBetween(boxes.get(edge.from)!, boxes.get(edge.to)!, lane)}>
            <title>{relationLabel[edge.relation]}{edge.preliminary ? " · chỉ kiểm tra cấu trúc" : ""}</title>
          </path>;
        })}
      </svg>
      {nodes.map((node) => {
        const box = boxes.get(node.id)!;
        return <button key={node.id} type="button" data-eb-node={node.id} className={`node eb-live-node ${nodeStyle[node.id]}`}
          aria-current={focus === node.id || undefined} style={{ left: box.x, top: box.y, width: box.width }}
          onClick={() => select(node.id)}>
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
      <ul>{edges.map((edge) => <li key={`${edge.from}:${edge.to}:${edge.relation}`}>{nodes.find((node) => node.id === edge.from)?.label} → {nodes.find((node) => node.id === edge.to)?.label} · {relationLabel[edge.relation]}</li>)}</ul>
    </details>} />;
}
