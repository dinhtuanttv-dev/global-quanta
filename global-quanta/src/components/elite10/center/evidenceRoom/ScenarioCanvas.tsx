import { useEffect, useMemo, useRef, useState } from "react";
import { buildEvidenceBrainCanvas } from "../../../../lib/evidenceBrain/export";
import { evaluateConfirmation, formatObservation, sourceManifest, type Confirmation, type ResearchProjection } from "../../../../lib/evidenceBrain/research";
import { lockResearchSnapshot, scenarioGateway } from "../../../../lib/evidenceBrain/researchGateway";
import { SCENARIO_VERSION, scenarioComparison, scenarioTargets, type ParentRef, type ScenarioKind, type ScenarioParent, type ScenarioRecord, type ScenarioSummary, type ScenarioTarget } from "../../../../lib/evidenceBrain/scenario";
import { canonicalJson } from "../../../../lib/evidenceBrain/snapshot";
import { cleanLine, frontmatter } from "../../../../lib/obsidian/yaml";
import type { ObsidianDesk } from "../obsidian/useObsidianDesk";
import LiveEvidenceGraph, { type NodeId, type RoomNode } from "./LiveEvidenceGraph";
import { LiveTimeline } from "./LiveTimeline";
import { confirmationLabel } from "./ResearchDesk";
import { assertResearchAccount } from "./researchAccount";
import { DetailDialog } from "./roomView";

const labels = { snapshot: "Snapshot", decision: "Tư cách Phễu", events: "Tin & xúc tác", priceAction: "Price Action", volume: "Khối lượng", liquidity: "Thanh khoản", seasonal: "Mùa vụ", bull: "GPT · phe thuận", bear: "Gemini · phản biện", judge: "GPT · trọng tài" };
const states = { PASS: "Đạt", FAIL: "Chưa đạt", WAIT: "Đang chờ", MISSING: "Thiếu căn cứ", EXCLUDED: "Tạm loại", CONTEXT: "Bối cảnh" };
const kindOf = { events: "EVENT_CLUSTER", priceAction: "PA_TRIGGER", volume: "VOLUME_LAYER" } as const;
type FocusKind = keyof typeof kindOf;
export type ScenarioEntry = { node?: FocusKind; key?: string; source?: ParentRef };
const choiceId = (choice: ScenarioTarget) => JSON.stringify([choice.kind, choice.key]);
const refDomain = { decision: "decision", events: "catalyst", priceAction: "price_action", volume: "volume" } as const;

function CompareTable({ base, branch }: { base: Confirmation; branch: Confirmation }) {
  return <div className="eb-scenario-table"><table><caption>Phiếu kỹ thuật trên cùng snapshot</caption>
    <thead><tr><th>Lớp</th><th>Bản gốc</th><th>Mô phỏng</th></tr></thead>
    <tbody><tr><th>Kết quả</th><td>{confirmationLabel[base.result]}</td><td>{confirmationLabel[branch.result]}</td></tr>
      {base.checks.map((check) => {
        const after = branch.checks.find((item) => item.id === check.id);
        return <tr key={check.id}><th>{labels[check.id]}</th><td>{states[check.state]}</td><td>{after && <><b>{states[after.state]}</b> · {after.reason}</>}</td></tr>;
      })}</tbody></table></div>;
}

function exportScenario(record: ScenarioRecord, desk: ObsidianDesk, format: "Markdown" | "Canvas" | "Obsidian") {
  const diff = scenarioComparison(record.parent, record.target);
  const { snap } = diff.projection;
  const fileName = "Canvas phan chung - " + snap.ticker + " - " + record.id + ".md";
  const escape = (s: string) => cleanLine(s).replace(/[<>\[\]\\`*_!~{}#|]/g, "\\$&");
  const summary = "MÔ PHỎNG · " + labels[record.target.kind === "VOLUME_LAYER" ? "volume" : record.target.kind === "PA_TRIGGER" ? "priceAction" : "events"];
  if (format === "Canvas") {
    const graph = buildEvidenceBrainCanvas({ ...snap, snapshotId: record.id }, diff.supported, "Inbox/" + fileName);
    graph.nodes[0].text = [summary, "Snapshot cha " + snap.snapshotId, "Bản gốc · " + confirmationLabel[record.baseline.result], "Mô phỏng · " + confirmationLabel[record.confirmation.result], record.confirmation.reason].join("\n\n");
    desk.download(fileName.replace(/\.md$/, ".canvas"), JSON.stringify(graph, null, 2), "application/json;charset=utf-8");
    return;
  }
  const markdown = [frontmatter([["note_kind", "scenario"], ["is_scenario", true], ["scenario_id", record.id], ["parent_snapshot_id", snap.snapshotId],
    ["cutoff_utc", snap.createdAt], ["target_kind", record.target.kind], ["target_key", record.target.key], ["policy_version", record.version],
    ["base_result", record.baseline.result], ["scenario_result", record.confirmation.result], ["review_status", record.approvedAt ? "APPROVED_GATEWAY" : "DRAFT"], ["reviewed_at", record.approvedAt ?? null]]),
    "# " + summary, "Bằng chứng tạm loại · " + escape(record.target.label), "## Phiếu kỹ thuật", escape(record.confirmation.reason),
    ...record.confirmation.checks.map((c) => "- " + labels[c.id] + " · " + states[c.state] + " · " + escape(c.reason)),
    "## Căn cứ còn lại", ...snap.refs.map((r) => "- " + escape(r.id) + " · " + escape(r.source) + " · " + escape(r.asOf ?? "—")),
    "## Đối chiếu căn cứ đã loại", ...diff.removedRefs.map((r) => "- " + escape(r.id)),
    ...diff.claims.filter((c) => c.lost.length).map((c) => "- " + c.claim.side + " · " + escape(c.claim.id) + " · " + c.lost.map(escape).join(", "))].join("\n\n");
  void desk.run({ fileName, markdown, folder: "Inbox" }, format === "Obsidian" ? "obsidian" : "download");
}

export default function ScenarioCanvas({ account, ticker, entry, observation, desk, onClose }: {
  account: string; ticker: string; entry: ScenarioEntry; observation: ResearchProjection | null; desk: ObsidianDesk; onClose: () => void;
}) {
  const [source, setSource] = useState<ParentRef | null>(null);
  const [initialObservation] = useState(observation);
  const [parent, setParent] = useState<ScenarioParent | null>(null);
  const [record, setRecord] = useState<ScenarioRecord | null>(null);
  const [selection, setSelection] = useState("");
  const [branch, setBranch] = useState(false);
  const [focus, setFocus] = useState<NodeId>(entry.node ?? "snapshot");
  const [history, setHistory] = useState<ScenarioSummary[]>([]);
  const [historyError, setHistoryError] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const targets = useMemo(() => parent ? scenarioTargets(parent.projection) : [], [parent]);
  const chosen = targets.find((item) => choiceId(item) === selection);
  const diff = useMemo(() => record ? scenarioComparison(record.parent, record.target) : null, [record]);
  const view = branch && diff ? diff.projection : parent?.projection;
  const verdict = branch && record ? record.confirmation : parent ? evaluateConfirmation(parent.projection) : null;

  useEffect(() => {
    const controller = new AbortController();
    void scenarioGateway.list(ticker, controller.signal).then((items) => {
      if (!controller.signal.aborted) setHistory((current) => [...new Map([...items, ...current].map((row) => [row.id, row])).values()]);
    }).catch(() => { if (!controller.signal.aborted) setHistoryError(true); });
    return () => { controller.abort(); active.current?.abort(); };
  }, [ticker, account]);

  async function request<T>(load: (signal: AbortSignal) => Promise<T>, accept: (value: T) => void) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setStatus("");
    try {
      assertResearchAccount(account);
      const value = await load(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (controller.signal.aborted) return;
      assertResearchAccount(account);
      accept(value);
    } catch (err) {
      if (!controller.signal.aborted) setStatus(err instanceof Error ? err.message : "Chưa đọc được dữ liệu trên Gateway.");
    } finally { if (active.current === controller) { active.current = null; setBusy(false); } }
  }
  function lock(useObservation: boolean) {
    void request(async (signal) => {
      const anchor = useObservation && entry.source ? entry.source : { kind: "lock" as const, id: (await lockResearchSnapshot(ticker, signal)).snap.snapshotId };
      return { anchor, data: await scenarioGateway.parent(anchor, signal) };
    }, ({ anchor, data }) => {
      if (data.projection.snap.ticker !== ticker) throw new Error("Snapshot khóa sai mã.");
      const changed = initialObservation && sourceManifest(initialObservation) !== sourceManifest(data.projection);
      const match = !changed && entry.node && scenarioTargets(data.projection).find((item) => item.kind === kindOf[entry.node!] && (!entry.key || item.key === entry.key));
      setParent(data); setSource(anchor); setRecord(null); setBranch(false); setSelection(match ? choiceId(match) : "");
      setStatus(changed ? "Nguồn đã đổi từ " + formatObservation.format(new Date(initialObservation.snap.createdAt)) + ". Chọn lại bằng chứng trên snapshot vừa khóa." : "Đã mở bản gốc trên Gateway.");
    });
  }
  function acceptRecord(next: ScenarioRecord) {
    if (next.version !== SCENARIO_VERSION || next.parent.projection.snap.ticker !== ticker) throw new Error("Phiên bản hoặc mã kịch bản chưa tương thích.");
    const checked = scenarioComparison(next.parent, next.target);
    if (canonicalJson(checked.confirmation) !== canonicalJson(next.confirmation) || canonicalJson(checked.baseline) !== canonicalJson(next.baseline))
      throw new Error("Phiếu Gateway khác kết quả đối chiếu. Hãy tải lại ứng dụng.");
    setParent(next.parent); setRecord(next); setSelection(choiceId(next.target));
  }
  function select(choice?: ScenarioTarget) {
    setSelection(choice ? choiceId(choice) : ""); setRecord(null); setBranch(false); setStatus("");
  }
  function selectNode(node: NodeId) {
    setFocus(node);
    const kind: ScenarioKind | undefined = kindOf[node as FocusKind];
    const items = targets.filter((t) => t.kind === kind);
    if (!record && items.length === 1) select(items[0]);
  }
  const graphClaims = branch && diff ? diff.supported : parent?.claims ?? [];
  const nodes: RoomNode[] = (["snapshot", "bull", "bear", "decision", "events", "priceAction", "volume", "judge"] as NodeId[]).map((id) => {
    const check = verdict?.checks.find((c) => c.id === id);
    if (check) return { id, label: labels[id], title: check.reason, badge: states[check.state], tone: check.state === "PASS" ? "good" : check.state === "FAIL" ? "bad" : "neutral" };
    if (id === "snapshot") return { id, label: labels[id], title: ticker + " · " + view?.snap.decisionSession, badge: branch ? "MÔ PHỎNG" : "GỐC", tone: "neutral" };
    const lane = graphClaims.filter((c) => c.side === id.toUpperCase());
    const missing = branch && diff?.claims.some((c) => c.claim.side === id.toUpperCase() && c.lost.length);
    return { id, label: labels[id], title: lane[0]?.text ?? (missing ? "Mở đối chiếu căn cứ" : "Chưa có luận điểm"), badge: missing ? "MẤT CĂN CỨ" : lane.length ? "BẢN GỐC" : "—", tone: missing ? "warn" : "neutral" };
  });
  const focusedRefs = view?.snap.refs.filter((r) => r.domain === refDomain[focus as keyof typeof refDomain]) ?? [];
  return <DetailDialog title="Canvas phản chứng" onClose={onClose}><div className="eb-scenario">
    <div className="eb-research-actions">
      <b>{ticker}</b>
      {parent && <span className="meta-chip">{branch ? "MÔ PHỎNG" : "BẢN GỐC"} · {formatObservation.format(new Date(parent.projection.snap.createdAt))}</span>}
      <button type="button" className="meta-chip" disabled={busy} onClick={() => lock(!parent)}>{parent ? "Khóa snapshot mới" : entry.source ? "Mở snapshot đang xem" : "Khóa snapshot để mô phỏng"}</button>
      {entry.source && !parent && <button type="button" className="small-link" disabled={busy} onClick={() => lock(false)}>Khóa nguồn hiện tại</button>}
    </div>
    {busy && <p role="status">Đang đối chiếu với Gateway…</p>}
    {status && <p role="status">{status}</p>}
    {parent && view && <><label className="eb-research-select">Bằng chứng tạm loại
      <select value={selection} disabled={busy} onChange={(e) => select(targets.find((item) => choiceId(item) === e.target.value))}>
        <option value="">Chọn một bằng chứng</option>
        {targets.map((t) => <option key={choiceId(t)} value={choiceId(t)}>{t.label}</option>)}</select></label>
      {!targets.length && <p>Snapshot chưa có cụm tin, lớp khối lượng hoặc điểm kích hoạt đã định danh.</p>}
      {parent.projection.data.pa?.state === "TRIGGERED" && !parent.projection.data.pa.setup?.id && <p>Bản gốc có tín hiệu Price Action. Cần snapshot có mã setup để thử riêng điểm kích hoạt.</p>}
      <div className="eb-research-actions">
        <button type="button" className="primary-btn" disabled={busy || !chosen || !source} onClick={() => {
          if (source && chosen) void request((s) => scenarioGateway.preview(source, chosen, s), (value) => {
            if (canonicalJson(parent) !== canonicalJson(value.parent)) {
              setParent(value.parent); select(); setStatus("Luận điểm hoặc dữ liệu của phiên đã đổi. Hãy chọn lại bằng chứng trên bản vừa đối chiếu."); return;
            }
            acceptRecord(value); setBranch(true);
          });
        }}>Thử trên canvas</button>
        {record && <button type="button" className="meta-chip" aria-pressed={!branch} onClick={() => setBranch(!branch)}>{branch ? "Về bản gốc" : "Xem mô phỏng"}</button>}
      </div>
      {record && diff && <section aria-label="Kết quả mô phỏng"><h3>Mô phỏng · {record.target.label}</h3>
        <p role="status">{record.baseline.result === record.confirmation.result ? "Kết luận giữ nguyên" : "Kết luận thay đổi"} · {confirmationLabel[record.confirmation.result]}</p>
        <CompareTable base={record.baseline} branch={record.confirmation} />
        {record.confirmation.result !== "BLOCKED" && record.confirmation.result !== "CONTEXT" && <p>
          {record.confirmation.checks.filter((c) => c.id !== "events" && c.state === "PASS").length}/4 lớp bắt buộc đạt · {record.confirmation.reason}
        </p>}
        <details><summary>Căn cứ bị ảnh hưởng · {diff.removedRefs.length}</summary>{diff.removedRefs.map((r) =>
          <p key={r.id}>{r.fieldPath} · {r.id}{diff.lostDependencies.has(r.id) && " · phụ thuộc " + (diff.lostDependencies.get(r.id)!.join(", ") || "setup đã loại")}</p>)}</details>
        <details><summary>Luận điểm cần đối chiếu · {diff.claims.filter((c) => c.lost.length).length}</summary>
          {diff.claims.filter((c) => c.lost.length).map(({ claim, lost, kept }) => <p key={claim.side + claim.id}>{claim.side} · {claim.id} · {kept.length ? "Mất một phần căn cứ" : "Mất căn cứ"} · {lost.join(", ")}</p>)}
          <p>{parent.claimCoverage === "partial" ? "Bản gốc chỉ lưu một phần luận điểm." : parent.claimCoverage === "none" ? "Bản gốc chưa có luận điểm đã ghi nhận." : "Đã đối chiếu các luận điểm đã ghi nhận."}</p>
        </details></section>}
      <LiveEvidenceGraph nodes={nodes} refs={view.snap.refs.filter((r) => r.domain !== "catalyst" || r.fieldPath.startsWith("events."))} claims={graphClaims} onSelect={selectNode} />
      <details open key={focus}><summary>{labels[focus]} · Căn cứ đang xem</summary>
        {nodes.find((n) => n.id === focus)?.title}
        {focusedRefs.map((r) => <p key={r.id}>{r.fieldPath} · {JSON.stringify(r.value)} · {r.asOf} · {r.source}</p>)}
        {targets.filter((t) => t.kind === kindOf[focus as FocusKind]).map((t) => <button key={choiceId(t)} type="button" className="small-link" disabled={busy} onClick={() => select(t)}>Chọn thử · {t.label}</button>)}
      </details>
      <LiveTimeline price={view.data.price} volume={view.data.volume} events={view.data.events} pa={view.data.pa} comparisonBase={parent.projection.data}
        scenario={branch && record ? "Mô phỏng · " + record.target.label : false} onPriceAction={() => selectNode("priceAction")}
        onEvent={(event) => { selectNode("events"); if (!record) select(targets.find((t) => t.kind === "EVENT_CLUSTER" && t.key === (event.clusterId || event.eventId))); }} />
      {record && <div className="eb-research-actions">
        <button type="button" className="primary-btn" disabled={busy || !!record.savedAt} onClick={() => {
          if (source) void request((s) => scenarioGateway.save(source, record, s), (value) => {
            acceptRecord(value); setSource({ kind: "scenario", id: value.id }); setStatus("Đã lưu kịch bản trên tài khoản.");
            setHistory((old) => [{ id: value.id, ticker, target: value.target, savedAt: value.savedAt!, observedAt: value.parent.projection.snap.createdAt }, ...old.filter((r) => r.id !== value.id)]);
          });
        }}>{record.savedAt ? "Đã lưu kịch bản" : "Lưu kịch bản"}</button>
        {record.savedAt && <button type="button" className="meta-chip" disabled={busy || !!record.approvedAt} onClick={() => {
          if (source) void request((s) => scenarioGateway.save(source, record, s, true), acceptRecord);
        }}>{record.approvedAt ? "Ghi chú đã duyệt" : "Duyệt ghi chú"}</button>}
        {(["Markdown", "Canvas", "Obsidian"] as const).filter((f) => f !== "Obsidian" || record.approvedAt && desk.prefs.vault).map((format) => <button type="button" key={format} className="meta-chip" onClick={() => {
          try { assertResearchAccount(account); exportScenario(record, desk, format); } catch { setStatus("Không thể xuất kịch bản của tài khoản này."); }
        }}>{format === "Obsidian" ? "Mở trong Obsidian" : "Tải " + format}</button>)}</div>}
    </>}
    <details open={!parent}><summary>Kịch bản đã lưu · {history.length}</summary>
      {historyError && <p>Chưa đọc được kho kịch bản.</p>}
      {history.map((row) => <p key={row.id}><button type="button" className="small-link" disabled={busy} onClick={() =>
        void request((s) => scenarioGateway.get(row.id, s), (value) => { acceptRecord(value); setSource({ kind: "scenario", id: value.id }); setBranch(true); })}>
        {row.target.label} · {formatObservation.format(new Date(row.observedAt))}</button></p>)}
    </details>
  </div></DetailDialog>;
}
