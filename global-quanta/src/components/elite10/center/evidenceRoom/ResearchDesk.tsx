import { useEffect, useState } from "react";
import {
  buildResearchNote, compareResearchRuns, evaluateConfirmation, eventKey, formatObservation, makeResearchRun, withoutCatalyst,
  type Confirmation, type ResearchProjection, type ResearchRun,
} from "../../../../lib/evidenceBrain/research";
import { approveResearchNote, getResearchApproval, listResearchRuns, storeResearchRun } from "../../../../lib/evidenceBrain/researchStore";
import { buildEvidenceBrainCanvas } from "../../../../lib/evidenceBrain/export";
import { type ValidatedClaim } from "../../../../lib/evidenceBrain/types";
import type { ObsidianDesk } from "../obsidian/useObsidianDesk";
import { DetailDialog } from "./roomView";
import { assertResearchAccount } from "./researchAccount";

export type ResearchView = "sessions" | "scenario" | "obsidian";
export const confirmationLabel: Record<Confirmation["result"], string> = {
  BLOCKED: "Dữ liệu đang chặn", NO_CONFIRMATION: "Có lớp xác nhận chưa đạt", INDETERMINATE: "Chưa đủ căn cứ",
  PENDING: "Chờ điều kiện xác nhận", CRITERIA_MET: "Đủ điều kiện kiểm tra", CONTEXT: "Đối chiếu bối cảnh",
};
const checkLabels = { decision: "Tư cách Phễu", priceAction: "Price Action", volume: "Khối lượng", liquidity: "Thanh khoản", events: "Xúc tác" };
const checkStates = { PASS: "Đạt", FAIL: "Chưa đạt", MISSING: "Thiếu căn cứ", WAIT: "Đang chờ", CONTEXT: "Bối cảnh", EXCLUDED: "Loại khỏi mô phỏng" };

function ConfirmationRows({ confirmation }: { confirmation: Confirmation }) {
  return <><p><b>{confirmationLabel[confirmation.result]}</b> · {confirmation.reason}</p>
    {confirmation.checks.map((check) => <article key={check.id}>
      <p><b>{checkLabels[check.id]}</b> · {checkStates[check.state]}</p>
      <p>{check.reason}</p>
    </article>)}</>;
}

function Sessions({ account, ticker, projection, replay, omitted, claims, onReplay }: {
  account: string; ticker: string | null; projection: ResearchProjection | null; replay: ResearchRun | null; omitted: string | null;
  claims: ValidatedClaim[]; onReplay: (run: ResearchRun) => void;
}) {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [selection, setSelection] = useState({ first: "", second: "" });
  useEffect(() => {
    let active = true;
    void listResearchRuns(account, ticker).then(({ runs, rejected }) => {
      if (!active) return;
      assertResearchAccount(account);
      setRuns(runs);
      if (rejected) setStatus(`Đã bỏ qua ${rejected} bản lưu không qua kiểm tra toàn vẹn.`);
    }).catch(() => {
      if (active) setStatus("Không mở được lịch sử tại trình duyệt này.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [account, ticker]);

  async function save() {
    if (!projection || saving) return;
    setSaving(true);
    setStatus("");
    try {
      assertResearchAccount(account);
      const run = await makeResearchRun(account, projection, claims, omitted);
      assertResearchAccount(account);
      await storeResearchRun(run);
      assertResearchAccount(account);
      setRuns((rows) => [run, ...rows]);
      setStatus("Đã lưu bản quan sát trong trình duyệt.");
    } catch {
      setStatus("Chưa lưu được phiên. Kiểm tra quyền lưu trữ và dung lượng trình duyệt.");
    } finally { setSaving(false); }
  }

  const first = runs.find((run) => run.id === selection.first);
  const second = runs.find((run) => run.id === selection.second);
  const differences = first && second && first.id !== second.id ? compareResearchRuns(first, second) : null;
  return <>
    <p>Phạm vi {ticker ?? "Danh mục"} · lưu riêng trong trình duyệt của tài khoản này. Mốc quan sát là lúc Phòng họp nhận dữ liệu.</p>
    <div className="eb-research-actions">
      <button type="button" className="primary-btn" onClick={() => void save()} disabled={loading || saving || !projection?.snap.decisionSession || Boolean(replay)}>{saving ? "Đang lưu…" : omitted ? "Lưu nhánh mô phỏng" : "Lưu phiên đang xem"}</button>
    </div>
    {status && <p role="status">{status}</p>}
    {loading ? <p>Đang tải phiên đã lưu…</p> : runs.length === 0 ? <p>Chưa có phiên đã lưu cho phạm vi này.</p> : <div className="eb-research-runs">
      {runs.map((run) => <article key={run.id}>
        <p><b>{formatObservation.format(new Date(run.observedAt))}</b> · {confirmationLabel[run.confirmation.result]}{run.omittedCluster ? " · Mô phỏng" : ""}</p>
        <p>Lưu lúc {formatObservation.format(new Date(run.savedAt))} · {run.contentId.slice(-12)} · {run.claims.length} luận điểm</p>
        <button type="button" className="small-link" onClick={() => {
          try { assertResearchAccount(account); onReplay(run); }
          catch { setStatus("Tài khoản hiện tại đã đổi. Mở lại Phòng họp AI."); }
        }}>{run.id === replay?.id ? "Mở lại phiên này" : "Mở bản đã lưu"}</button>
      </article>)}
    </div>}
    {runs.length >= 2 && <div className="eb-research-compare">
      <h3>Đối chiếu hai phiên</h3>
      {(["first", "second"] as const).map((key, index) => <label key={key}>
        {index === 0 ? "Phiên A" : "Phiên B"}
        <select value={selection[key]} onChange={(event) => setSelection((previous) => ({ ...previous, [key]: event.target.value }))}>
          <option value="">Chọn bản đã lưu</option>
          {runs.map((run) => <option key={run.id} value={run.id}>{formatObservation.format(new Date(run.savedAt))} · {run.contentId.slice(-8)} · {run.id.slice(0, 6)}{run.omittedCluster ? " · Mô phỏng" : ""}</option>)}
        </select>
      </label>)}
      {first && second && differences && <>
        <article><p><b>Trạng thái</b> · {confirmationLabel[first.confirmation.result]} → {confirmationLabel[second.confirmation.result]}</p>
          <p>{first.confirmation.reason} → {second.confirmation.reason}</p>
          {first.omittedCluster !== second.omittedCluster && <p>Phạm vi mô phỏng khác nhau giữa hai bản.</p>}</article>
        {differences.length === 0 && <p>Hai phiên có cùng giá trị và phiên bản nguồn được đối chiếu.</p>}
        {differences.map((row, index) => <article key={`${row.label}:${index}`}><p><b>{row.label}</b></p><p>A · {row.before}</p><p>B · {row.after}</p></article>)}
      </>}
    </div>}
  </>;
}

function Scenario({ projection, omitted, onOmit }: { projection: ResearchProjection; omitted: string | null; onOmit: (key: string | null) => void }) {
  const [key, setKey] = useState(omitted ?? "");
  const event = projection.data.events.find((item) => eventKey(item) === key);
  const base = evaluateConfirmation(projection);
  const branch = event ? evaluateConfirmation(withoutCatalyst(projection, key), true) : base;
  return <>
    <p>Chọn cụm tin cần loại để xem điều kiện xác nhận nào thay đổi bên cạnh nguồn xúc tác.</p>
    <label className="eb-research-select">Cụm xúc tác
      <select value={key} onChange={(e) => setKey(e.target.value)}>
        <option value="">Giữ tất cả cụm tin</option>
        {projection.data.events.map((item) => <option key={eventKey(item)} value={eventKey(item)}>{item.title} · r{item.revision}</option>)}
      </select>
    </label>
    <article><p>Bản gốc · {confirmationLabel[base.result]}</p><p>Mô phỏng · {confirmationLabel[branch.result]}</p></article>
    <ConfirmationRows confirmation={branch} />
    <button type="button" className="primary-btn" onClick={() => onOmit(event ? key : null)}>Áp dụng trên canvas</button>
  </>;
}

function Note({ projection, replay, omitted, account, claims, desk }: {
  projection: ResearchProjection; replay: ResearchRun | null; omitted: string | null; account: string; claims: ValidatedClaim[]; desk: ObsidianDesk;
}) {
  const [run, setRun] = useState<ResearchRun | null>(replay);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [raw, setRaw] = useState(false);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [frozenProps] = useState(() => ({ projection, replay, omitted, account, claims }));
  useEffect(() => {
    let active = true;
    const load = async () => {
      const capture = frozenProps;
      assertResearchAccount(capture.account);
      const value = capture.replay ?? await makeResearchRun(capture.account, capture.projection, capture.claims, capture.omitted);
      const approval = capture.replay ? await getResearchApproval(value) : null;
      assertResearchAccount(capture.account);
      if (active) { setRun(value); setApprovedAt(approval); setPrepared(true); }
    };
    void load().catch(() => { if (active) setStatus("Không chuẩn bị được ghi chú cho phiên này."); });
    return () => { active = false; };
  }, [frozenProps]);
  if (!run || !prepared) return <p role="status">{status || "Đang dựng ghi chú…"}</p>;

  const note = buildResearchNote(run, approvedAt);
  const isScenario = Boolean(run.omittedCluster);
  const source = run.omittedCluster ? withoutCatalyst(run.projection, run.omittedCluster) : run.projection;
  async function approve(runToSave: ResearchRun) {
    if (saving || approvedAt) return;
    setSaving(true);
    setStatus("");
    try {
      assertResearchAccount(account);
      const result = await approveResearchNote(runToSave);
      assertResearchAccount(account);
      setApprovedAt(result);
      setStatus("Đã duyệt trên trình duyệt.");
    } catch {
      setStatus("Chưa ghi được kết quả duyệt. Tệp Markdown vẫn có thể tải dưới dạng nháp.");
    } finally { setSaving(false); }
  }
  function exportForAccount(action: () => unknown) {
    try { assertResearchAccount(account); action(); }
    catch { setStatus("Tài khoản hiện tại đã đổi. Mở lại Phòng họp AI."); }
  }
  return <>
    <p><b>{approvedAt ? "Đã duyệt cục bộ" : "Nháp chờ duyệt"}</b>{isScenario ? " · Mô phỏng" : ""} · {note.folder}/{note.fileName}</p>
    <div className="eb-research-actions">
      <button type="button" className="meta-chip" aria-pressed={!raw} onClick={() => setRaw(false)}>Bản đọc</button>
      <button type="button" className="meta-chip" aria-pressed={raw} onClick={() => setRaw(true)}>YAML / Markdown</button>
    </div>
    {raw ? <pre className="eb-research-markdown" tabIndex={0} aria-label="Bản Markdown">{note.markdown}</pre> : <ConfirmationRows confirmation={run.confirmation} />}
    <div className="eb-research-actions">
      <button type="button" className="primary-btn" onClick={() => void approve(run)} disabled={saving || Boolean(approvedAt)}>Duyệt ghi chú</button>
      <button type="button" className="meta-chip" onClick={() => exportForAccount(() => desk.run(note, "download"))}>Tải Markdown</button>
      <button type="button" className="meta-chip" onClick={() => exportForAccount(() => {
        const snapshot = { ...source.snap, snapshotId: run.contentId,
          limitations: isScenario ? ["Nhánh mô phỏng đã loại một cụm xúc tác.", `Snapshot cha ${run.parentContentId}`, ...source.snap.limitations] : source.snap.limitations };
        desk.download(note.fileName.replace(/\.md$/, ".canvas"), JSON.stringify(buildEvidenceBrainCanvas(snapshot, run.claims, `Inbox/${note.fileName}`), null, 2), "application/json;charset=utf-8");
      })}>Tải Canvas</button>
      {desk.prefs.vault && <button type="button" className="meta-chip" onClick={() => exportForAccount(() => desk.run(note, "obsidian"))}>Mở trong Obsidian</button>}
    </div>
    {(status || desk.status) && <p role="status">{status || desk.status?.text}</p>}
  </>;
}

export function ResearchDialog({ view, account, ticker, projection, replay, omitted, claims, desk, onClose, onReplay, onOmit }: {
  view: ResearchView; account: string; ticker: string | null; projection: ResearchProjection | null; replay: ResearchRun | null; omitted: string | null;
  claims: ValidatedClaim[]; desk: ObsidianDesk; onClose: () => void; onReplay: (run: ResearchRun) => void; onOmit: (key: string | null) => void;
}) {
  const titles = { sessions: "Phiên đã lưu", scenario: "Thử phản chứng", obsidian: "Bàn nghiên cứu Obsidian" };
  return <DetailDialog title={titles[view]} onClose={onClose}>
    {view === "sessions" ? <Sessions account={account} ticker={ticker} projection={projection} replay={replay} omitted={omitted} claims={claims} onReplay={onReplay} />
      : !projection ? <p>Nạp dữ liệu trước khi mở công cụ này.</p>
        : view === "scenario" ? <Scenario projection={projection} omitted={omitted} onOmit={onOmit} />
          : <Note projection={projection} replay={replay} omitted={omitted} account={account} claims={claims} desk={desk} />}
  </DetailDialog>;
}
