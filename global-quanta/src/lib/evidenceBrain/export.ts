import type { EvidenceSnapshot, ValidatedClaim } from "./types";

export interface EvidenceCanvasNode { id: string; type: "text" | "file"; x: number; y: number; width: number; height: number; color?: string; text?: string; file?: string }
export interface EvidenceCanvasEdge { id: string; fromNode: string; toNode: string; fromSide?: "top" | "right" | "bottom" | "left"; toSide?: "top" | "right" | "bottom" | "left"; toEnd?: "none" | "arrow"; label?: string }
export interface EvidenceCanvas { nodes: EvidenceCanvasNode[]; edges: EvidenceCanvasEdge[] }

const clip = (value: string, max = 900) => value.length > max ? `${value.slice(0, max)}…` : value;
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export function buildEvidenceBrainMarkdown(snapshot: EvidenceSnapshot, claims: ValidatedClaim[], exportedAt = new Date().toISOString()): string {
  const lines = [
    "---",
    "type: evidence-brain-review",
    `schema_version: ${snapshot.schemaVersion}`,
    `snapshot_id: ${snapshot.snapshotId}`,
    `ticker: ${snapshot.ticker ?? "null"}`,
    `scope: ${snapshot.scope}`,
    `decision_session: ${snapshot.decisionSession ?? "null"}`,
    `portfolio_kind: ${snapshot.portfolioKind ?? "null"}`,
    `completeness: ${snapshot.completeness}`,
    `exported_at: ${exportedAt}`,
    "tags:",
    "  - global-quanta/evidence-brain",
    "---",
    "",
    `# Evidence Brain · ${snapshot.ticker ?? "Danh mục"}`,
    "",
    `> Snapshot ${snapshot.snapshotId} · phiên ${snapshot.decisionSession ?? "—"} · trạng thái ${snapshot.completeness}. Đây là hồ sơ nghiên cứu, không phải khuyến nghị hay lệnh giao dịch.`,
    "",
    "## Tình trạng nguồn",
    "",
    ...snapshot.sources.map((source) => `- **${source.label}:** ${source.state} · as-of ${source.asOf ?? "—"} · version ${source.version ?? "—"}${source.error ? ` · lỗi ${source.error}` : ""}`),
    "",
    "## Phễu và kiểm tra phiên",
    "",
    `- PZ mode: ${snapshot.funnel.mode ?? "UNKNOWN"}; membership: ${snapshot.funnel.membership.state}; rank: ${snapshot.funnel.membership.rank ?? "—"}; lý do: ${snapshot.funnel.membership.reason ?? "—"}`,
    ...snapshot.funnel.steps.map((step) => `- Bước ${step.index}: ${step.label} — ${step.count ?? "—"} (${step.parallel ? "song song" : step.countedOn}${step.displayOnly ? "; DISPLAY" : ""})`),
    ...snapshot.funnel.checks.map((check) => `- INVARIANT: ${check}`),
    ...snapshot.funnel.frozenReasons.map((reason) => `- DATA GUARD: ${reason}`),
    "",
    "## Claims đã kiểm tra cấu trúc",
    "",
    ...(claims.length ? claims.map((claim) => `### ${claim.side} · ${claim.validation} · ${claim.classification}\n\n${clip(claim.text)}\n\n- Refs: ${claim.refs.join(", ") || "không có"}\n- Hạn định: ${claim.horizon ?? "—"}; bất định: ${claim.uncertainty}; vô hiệu hóa: ${claim.invalidation ?? "—"}\n- Ghi chú validator: ${claim.validationNotes.join("; ") || "không có"}`) : ["_Chưa có claim theo schema; nội dung AI chưa được xác thực cấu trúc._"]),
    "",
    "## Bằng chứng nguồn",
    "",
    ...snapshot.refs.map((ref) => `- **${ref.id}** · ${ref.domain}.${ref.fieldPath} = \`${JSON.stringify(ref.value)}\` ${ref.unit ?? ""} · ${ref.status}/${ref.freshness} · ${ref.source} · as-of ${ref.asOf ?? "—"} · v${ref.sourceVersion ?? ref.methodVersion ?? "—"}${ref.limitation ? ` · giới hạn: ${ref.limitation}` : ""}${ref.url ? ` · ${ref.url}` : ""}`),
    "",
    "## Thiếu dữ liệu, lệch phiên và giới hạn",
    "",
    ...[...snapshot.missing.map((value) => `- MISSING: ${value}`), ...snapshot.stale.map((value) => `- STALE: ${value}`), ...snapshot.conflicts.map((value) => `- CONFLICT: ${value}`), ...snapshot.limitations.map((value) => `- LIMITATION: ${value}`)],
    "",
    "## Point-in-time payload",
    "",
    "```json",
    JSON.stringify(snapshot, null, 2),
    "```",
  ];
  return lines.join("\n");
}

export function buildEvidenceBrainCanvas(snapshot: EvidenceSnapshot, claims: ValidatedClaim[], notePath: string): EvidenceCanvas {
  const nodes: EvidenceCanvasNode[] = [];
  const edges: EvidenceCanvasEdge[] = [];
  const snapshotNode = `snapshot-${slug(snapshot.snapshotId)}`;
  nodes.push({ id: snapshotNode, type: "text", x: 0, y: 0, width: 440, height: 240, color: snapshot.completeness === "COMPLETE" ? "4" : "3", text: `# Snapshot ${snapshot.ticker ?? "Danh mục"}\n\nID: ${snapshot.snapshotId}\nPhiên: ${snapshot.decisionSession ?? "—"}\nTrạng thái: ${snapshot.completeness}\n\n${snapshot.limitations.join("\n")}` });
  const refs = snapshot.refs.slice(0, 40);
  refs.forEach((ref, index) => {
    const id = `ref-${slug(ref.id)}`;
    nodes.push({ id, type: "text", x: -600, y: index * 160, width: 520, height: 140, color: ref.freshness === "STALE" ? "3" : ref.status === "DERIVED" ? "5" : "4", text: `## ${ref.domain} · ${ref.fieldPath}\n\n${clip(JSON.stringify(ref.value), 500)} ${ref.unit ?? ""}\n\n${ref.source} · as-of ${ref.asOf ?? "—"} · ${ref.status}/${ref.freshness}\n\n${ref.limitation ?? ""}` });
  });
  claims.slice(0, 20).forEach((claim, index) => {
    const id = `claim-${slug(claim.id || `${claim.side}-${index}`)}`;
    nodes.push({ id, type: "text", x: 600, y: index * 180, width: 560, height: 160, color: claim.validation === "SUPPORTED" ? claim.side === "BULL" ? "4" : "1" : "3", text: `## ${claim.side} · ${claim.validation}\n\n${clip(claim.text, 700)}\n\n${claim.classification} · ${claim.asOf ?? "as-of chưa rõ"} · ${claim.validationNotes.join("; ")}` });
    const linkRefs = [...claim.supports.map((refId) => [refId, "hỗ trợ"] as const), ...claim.invalidates.map((refId) => [refId, "phản chứng"] as const)];
    linkRefs.forEach(([refId, label], linkIndex) => {
      const refNode = `ref-${slug(refId)}`;
      if (!refs.some((ref) => ref.id === refId)) return;
      edges.push({ id: `edge-${slug(claim.id)}-${linkIndex}`, fromNode: refNode, fromSide: "right", toNode: id, toSide: "left", toEnd: "arrow", label });
    });
  });
  const noteId = `note-${slug(notePath)}`;
  nodes.push({ id: noteId, type: "file", x: 0, y: -280, width: 440, height: 120, file: notePath });
  edges.push({ id: "snapshot-note", fromNode: noteId, fromSide: "bottom", toNode: snapshotNode, toSide: "top", toEnd: "none", label: "ghi chú xuất chủ động" });
  return { nodes, edges };
}

export function evidenceBrainFileStem(snapshot: EvidenceSnapshot, exportedAt = new Date()): string {
  const stamp = exportedAt.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${stamp} - ${snapshot.ticker ?? "Portfolio"} - Evidence Brain - ${snapshot.snapshotId.slice(-8)}`;
}
