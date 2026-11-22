// Elite 10 E5 (2026-10-17) — "Phòng họp AI": AI giải thích và phản biện, KHÔNG đặt điểm.
//   - Tranh luận có trọng tài: Claude (phe mua) và Gemini (phe bán) lập luận song song bằng cùng bộ công cụ (elite_*, ws_*, macro_*,
//     world_*, catalyst_*) — hai mô hình khác nhau thật, không phải một mô hình đóng hai vai; sau đó Claude làm trọng tài, gọi công cụ
//     để kiểm chứng từng luận điểm và kết luận cân bằng. Mọi câu trả lời đều qua bước đối chiếu con số với kết quả công cụ.
//   - Bản tin phiên: tạo khi bấm (không chạy định kỳ — tránh chi phí API không cần thiết).
//   - Hỏi đáp tự do: cùng khung Hỏi đáp xúc tác, gợi ý theo Elite 10.
import { useCallback, useEffect, useRef, useState } from "react";
import { Gavel, Newspaper, Play, Square } from "lucide-react";
import { ChatHttpError, streamCatalystChat, type ChatProvider, type ChatRole } from "../../../services/catalystChat";
import CatalystChatPanel, { LaneView, laneReducer, newLane, type Lane } from "../../MainTabs/ChatXucTac/CatalystChatPanel";
// Bàn nghiên cứu Obsidian (O2, 21/11/2026) — CHỈ THÊM: bản vết song song + thanh Obsidian + menu Lưu; logic tranh luận / bản tin không đổi.
import { tracedStream, type LaneTraceMap } from "../../../lib/obsidian/trace";
import ObsidianBar from "./obsidian/ObsidianBar";
import { BriefExport, DebateExport, briefKey, debateKey } from "./obsidian/RoomExports";
import type { MenuItem } from "./obsidian/ExportMenu";
import { useObsidianDesk } from "./obsidian/useObsidianDesk";
import { QaTapContext, type QaMeta } from "../../../lib/obsidian/qaTap";
import type { QaTurn } from "../../../lib/obsidian/types";
import { QaExport, qaKey } from "./obsidian/RoomExports";
import EvidenceBrainWorkspace from "./EvidenceBrainWorkspace";
import { markClaimsWithExternalTools, parseAndValidateClaims, structuredClaimsInstruction, validationForJudge } from "../../../lib/evidenceBrain/claims";
import { sourceReadiness } from "../../../lib/evidenceBrain/snapshot";
import { buildEvidenceBrainCanvas, buildEvidenceBrainMarkdown, evidenceBrainFileStem } from "../../../lib/evidenceBrain/export";
import type { ClaimParseResult, EvidenceSnapshot } from "../../../lib/evidenceBrain/types";

export const ELITE_SUGGESTIONS = [
  "Danh mục chính thức hôm nay gồm những mã nào, vì sao được chọn, tỷ lệ tiền mặt bao nhiêu và độ tin cậy đến đâu?",
  "Tín hiệu nào đang có trọng số trong Điểm Elite và vì sao các tín hiệu khác không có?",
  "Phân tích định lượng HPG: hạng Elite, tín hiệu bậc A/B, bối cảnh ngành thế giới và rủi ro.",
  "Sổ theo dõi tiến của danh mục chính thức đang cho kết quả thế nào, và cách chấm có giới hạn gì?",
  "Vì sao RVOL cao lại là tín hiệu ngược chiều theo engine bằng chứng?",
];

const JUDGE_MAX = 6000;
const clip = (s: string) => (s.length > JUDGE_MAX ? `${s.slice(0, JUDGE_MAX)}…[cắt bớt]` : s);

/** Câu hỏi cho từng vai trong tranh luận. `subject` = mã cổ phiếu hoặc null (cả danh mục). */
export function debateQuestions(subject: string | null) {
  const target = subject ? `mã ${subject}` : "danh mục chính thức của phiên mới nhất (xem portfolioKind trong elite_decision)";
  return {
    bull: `Chủ đề tranh luận: ${target}, kỳ hạn 5–10 phiên. Trình bày lập luận phe MUA (nghiêng tỷ trọng tăng). Dùng elite_${subject ? "ticker" : "decision"} trước, sau đó bối cảnh ngành thế giới / vĩ mô / xúc tác nếu cần.`,
    bear: `Chủ đề tranh luận: ${target}, kỳ hạn 5–10 phiên. Trình bày lập luận phe BÁN / thận trọng (không tăng hoặc giảm tỷ trọng). Dùng elite_${subject ? "ticker" : "decision"} và elite_evidence trước, sau đó rủi ro vĩ mô / ngành / xúc tác nếu cần.`,
    judge: (bull: string, bear: string) =>
      `Chủ đề: ${target}, kỳ hạn 5–10 phiên.\n\n=== LẬP LUẬN PHE MUA (Claude) ===\n${clip(bull)}\n\n=== LẬP LUẬN PHE BÁN (Gemini) ===\n${clip(bear)}\n\nHãy làm trọng tài: kiểm chứng bằng công cụ, chấm từng luận điểm và kết luận.`,
    brief: "Viết bản tin quyết định cho phiên mới nhất của trung tâm Elite 10: (1) bối cảnh thị trường Việt Nam và thế giới, (2) danh mục chính thức (đọc portfolioKind: Elite HL hay Elite dòng tiền), tỷ lệ tiền mặt, thay đổi trong phiên và lý do, (3) tín hiệu có trọng số và độ tin cậy (IC, bậc), (4) rủi ro chính và điều kiện làm thay đổi đánh giá, (5) nhãn bằng chứng và trạng thái sổ theo dõi. Ngắn gọn, có số liệu từ công cụ.",
  };
}

type Phase = "idle" | "arguing" | "judging" | "done";

export default function EliteAiRoom({ defaultTicker }: { defaultTicker?: string | null }) {
  const [subject, setSubject] = useState<string>(defaultTicker && defaultTicker !== "VNINDEX" ? defaultTicker : "");
  const [bull, setBull] = useState<Lane | null>(null);
  const [bear, setBear] = useState<Lane | null>(null);
  const [judge, setJudge] = useState<Lane | null>(null);
  const [brief, setBrief] = useState<Lane | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [briefBusy, setBriefBusy] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);
  const briefCtrlRef = useRef<AbortController | null>(null);
  const [trace, setTrace] = useState<LaneTraceMap>({});
  const [debateSubject, setDebateSubject] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<EvidenceSnapshot | null>(null);
  const snapshotRef = useRef<EvidenceSnapshot | null>(null);
  const [reviewSnapshot, setReviewSnapshot] = useState<EvidenceSnapshot | null>(null);
  const [bullClaims, setBullClaims] = useState<ClaimParseResult | null>(null);
  const [bearClaims, setBearClaims] = useState<ClaimParseResult | null>(null);
  const [judgeClaims, setJudgeClaims] = useState<ClaimParseResult | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const traceStream = tracedStream(streamCatalystChat, (key, fn) => setTrace((s) => ({ ...s, [key]: fn(s[key]) })));
  const desk = useObsidianDesk();
  // O3: lịch sử Hỏi đáp (nhận từ khung hỏi đáp qua context) để xuất ghi chú.
  const [qa, setQa] = useState<{ turns: QaTurn[]; meta: QaMeta | null }>({ turns: [], meta: null });
  const [qaTap] = useState(() => (turns: QaTurn[], meta: QaMeta | null) => setQa({ turns, meta }));
  useEffect(() => () => { ctrlRef.current?.abort(); briefCtrlRef.current?.abort(); }, []);

  async function run(provider: ChatProvider, role: ChatRole | null, q: string, set: (fn: (l: Lane | null) => Lane | null) => void, signal: AbortSignal): Promise<Lane> {
    let lane = newLane(provider);
    set(() => lane);
    const apply = (fn: (l: Lane) => Lane) => { lane = fn(lane); set(() => lane); };
    // Obsidian: bọc luồng để ghi vết (thời gian, máy chủ, công cụ); mọi sự kiện vẫn đi nguyên vào laneReducer như cũ.
    const streamCatalystChat = traceStream(role ?? "brief");
    try {
      await streamCatalystChat([{ role: "user", content: q }], (e) => apply((l) => laneReducer(l, e)), signal, provider, role);
    } catch (err) {
      apply((l) => ({ ...l, error: signal.aborted ? "Đã dừng." : err instanceof ChatHttpError ? err.message : "Không kết nối được dịch vụ AI." }));
    } finally {
      apply((l) => ({ ...l, done: true }));
    }
    return lane;
  }

  const handleSnapshotChange = useCallback((next: EvidenceSnapshot | null) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  async function startDebate(lockedSnapshot?: EvidenceSnapshot) {
    if (phase === "arguing" || phase === "judging") return;
    const t = subject.trim().toUpperCase();
    const ticker = /^[A-Z0-9]{3,10}$/.test(t) ? t : null;
    const frozen = lockedSnapshot ?? snapshotRef.current;
    if (lockedSnapshot && (lockedSnapshot.ticker !== ticker || !lockedSnapshot.decisionSession)) {
      setReviewMessage("Snapshot không khớp mã hoặc thiếu phiên quyết định; hãy tải lại dữ liệu trước khi tranh luận.");
      return;
    }
    if (lockedSnapshot && frozen?.ticker !== ticker) return;
    if (frozen) {
      const readiness = sourceReadiness(frozen);
      if (!readiness.canDebate) {
        setReviewMessage(`Không chạy review: ${readiness.blockers.join(" ")}`);
        return;
      }
    }
    setDebateSubject(ticker);
    setReviewSnapshot(frozen ?? null);
    setReviewMessage(lockedSnapshot ? `Đang tranh luận trên snapshot ${lockedSnapshot.snapshotId}.` : frozen ? `Đang dùng snapshot ${frozen.snapshotId}.` : "Tranh luận nhanh chưa khóa snapshot; các claim sẽ không được coi là đã kiểm chứng.");
    setBullClaims(null); setBearClaims(null); setJudgeClaims(null);
    setTrace((s) => ({ brief: s.brief }));
    const q = debateQuestions(ticker);
    const bullPrompt = frozen ? `${q.bull}\n\n${structuredClaimsInstruction(frozen, "BULL")}` : q.bull;
    const bearPrompt = frozen ? `${q.bear}\n\n${structuredClaimsInstruction(frozen, "BEAR")}` : q.bear;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setJudge(null);
    setPhase("arguing");
    const [b, s] = await Promise.all([run("claude", "bull", bullPrompt, setBull, ctrl.signal), run("gemini", "bear", bearPrompt, setBear, ctrl.signal)]);
    const parsedBull = frozen ? markClaimsWithExternalTools(parseAndValidateClaims(b.text, frozen, "BULL"), b.tools.map((tool) => tool.name), b.untraceable) : null;
    const parsedBear = frozen ? markClaimsWithExternalTools(parseAndValidateClaims(s.text, frozen, "BEAR"), s.tools.map((tool) => tool.name), s.untraceable) : null;
    if (parsedBull) setBullClaims(parsedBull);
    if (parsedBear) setBearClaims(parsedBear);
    if (ctrl.signal.aborted || (!b.text.trim() && !s.text.trim())) { setPhase("done"); return; }
    setPhase("judging");
    const judgePrompt = frozen && parsedBull && parsedBear
      ? `${q.judge(b.text || "(phe mua không trả lời được)", s.text || "(phe bán không trả lời được)")}\n\n${structuredClaimsInstruction(frozen, "JUDGE")}\n\nValidator deterministic của hai phía (tham khảo để phản biện, không được nâng claim unsupported thành verified):\n${validationForJudge(parsedBull, parsedBear)}`
      : q.judge(b.text || "(phe mua không trả lời được)", s.text || "(phe bán không trả lời được)");
    const j = await run("claude", "judge", judgePrompt, setJudge, ctrl.signal);
    if (frozen) setJudgeClaims(markClaimsWithExternalTools(parseAndValidateClaims(j.text, frozen, "JUDGE"), j.tools.map((tool) => tool.name), j.untraceable));
    setPhase("done");
  }

  async function makeBrief() {
    if (briefBusy) return;
    setBriefBusy(true);
    const ctrl = new AbortController();
    briefCtrlRef.current = ctrl;
    await run("claude", null, debateQuestions(null).brief, setBrief, ctrl.signal);
    setBriefBusy(false);
  }

  const busy = phase === "arguing" || phase === "judging";
  const unsaved = [
    debateKey(trace) && phase === "done" && (bull?.text.trim() || bear?.text.trim()) && !desk.isSaved(debateKey(trace)) ? "tranh luận" : null,
    briefKey(trace) && !briefBusy && brief?.text.trim() && !desk.isSaved(briefKey(trace)) ? "bản tin" : null,
    qaKey(qa.turns) && !qa.turns.some((t) => t.role === "assistant" && t.lanes.some((l) => !l.done)) && !desk.isSaved(qaKey(qa.turns)) ? "hỏi đáp" : null,
  ].filter((x): x is string => Boolean(x));
  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="elite-ai-room">
      <ObsidianBar desk={desk} unsaved={unsaved} />
      <EvidenceBrainWorkspace ticker={subject} onTickerChange={setSubject} bull={bull} bear={bear} judge={judge}
        bullClaims={bullClaims}
        bearClaims={bearClaims}
        judgeClaims={judgeClaims}
        reviewSnapshot={reviewSnapshot}
        reviewMessage={reviewMessage}
        onSnapshotChange={handleSnapshotChange} onRunReview={(next) => void startDebate(next)} />
      <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">Tranh luận có trọng tài</h4>
          <span className="text-[10px] text-slate-500">Claude phe mua · Gemini phe bán · Claude trọng tài — tính 3 câu vào hạn mức hỏi đáp</span>
          <DebateExport desk={desk} subject={debateSubject} bull={bull} bear={bear} judge={judge} trace={trace} busy={busy} extra={(() => {
            if (!reviewSnapshot) return [];
            const exportedClaims = [...(bullClaims?.claims ?? []), ...(bearClaims?.claims ?? []), ...(judgeClaims?.claims ?? [])];
            const stem = evidenceBrainFileStem(reviewSnapshot);
            const notePath = `${desk.prefs.folder ? `${desk.prefs.folder}/` : ""}${stem}.md`;
            const markdown: MenuItem = { id: "evidence-brain-md", label: "Tải hồ sơ Evidence Brain (.md)", hint: `Snapshot ${reviewSnapshot.snapshotId}`, separatorBefore: true, onSelect: () => desk.download(`${stem}.md`, buildEvidenceBrainMarkdown(reviewSnapshot, exportedClaims), "text/markdown;charset=utf-8", `evidence-brain:${reviewSnapshot.snapshotId}`) };
            const canvas: MenuItem = { id: "evidence-brain-canvas", label: "Tải bản đồ Evidence Brain (.canvas)", hint: "JSON Canvas tương thích Obsidian; liên kết claim, ref và snapshot", onSelect: () => desk.download(`${stem}.canvas`, JSON.stringify(buildEvidenceBrainCanvas(reviewSnapshot, exportedClaims, notePath), null, 2), "application/json;charset=utf-8", `evidence-brain-canvas:${reviewSnapshot.snapshotId}`) };
            return [markdown, canvas];
          })()} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-[10px] text-slate-500">Mã phân tích được chọn trong Evidence Brain.</span>
          {busy
            ? <button type="button" onClick={() => ctrlRef.current?.abort()} className="inline-flex items-center gap-1 rounded-md border border-rose-400/50 px-3 py-1.5 text-[11px] font-bold text-rose-300"><Square className="h-3 w-3" />Dừng</button>
            : <button type="button" onClick={() => void startDebate()} data-testid="elite-debate-start" className="inline-flex items-center gap-1 rounded-md bg-[#E8B84B]/20 px-3 py-1.5 text-[11px] font-bold text-[#F5CE72] hover:bg-[#E8B84B]/30"><Play className="h-3 w-3" />Bắt đầu tranh luận</button>}
        </div>
        {(bull || bear) && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="min-w-0 rounded-md border border-emerald-400/20 bg-emerald-500/[0.03] p-2">{bull && <LaneView t={bull} showHeader headerLabel="Phe mua · Claude" />}</div>
            <div className="min-w-0 rounded-md border border-rose-400/20 bg-rose-500/[0.03] p-2">{bear && <LaneView t={bear} showHeader headerLabel="Phe bán · Gemini" />}</div>
          </div>
        )}
        {phase === "judging" && !judge?.text && <p className="text-[11px] italic text-slate-400"><Gavel className="mr-1 inline h-3 w-3" />Trọng tài đang kiểm chứng hai lập luận…</p>}
        {judge && <div className="rounded-md border border-amber-400/30 bg-amber-500/[0.04] p-2" data-testid="elite-judge"><LaneView t={judge} showHeader headerLabel="Trọng tài · Claude" /></div>}
        <p className="text-[10px] text-slate-500">Mỗi bên chỉ được dùng số liệu từ công cụ; con số không truy được tới công cụ sẽ bị đánh dấu. Trọng tài gọi lại công cụ để kiểm chứng thay vì tin lời hai bên.</p>
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">Bản tin phiên</h4>
          <BriefExport desk={desk} brief={brief} trace={trace} busy={briefBusy} />
          {briefBusy
            ? <button type="button" onClick={() => briefCtrlRef.current?.abort()} data-testid="elite-brief-stop" className="inline-flex items-center gap-1 rounded-md border border-rose-400/50 px-3 py-1.5 text-[11px] font-bold text-rose-300"><Square className="h-3 w-3" />Dừng viết</button>
            : <button type="button" onClick={() => void makeBrief()} data-testid="elite-brief-start"
                className="inline-flex items-center gap-1 rounded-md bg-[#E8B84B]/20 px-3 py-1.5 text-[11px] font-bold text-[#F5CE72] hover:bg-[#E8B84B]/30">
                <Newspaper className="h-3 w-3" />{brief ? "Viết lại bản tin" : "Tạo bản tin phiên"}
              </button>}
        </div>
        {brief ? <LaneView t={brief} showHeader headerLabel="Bản tin · Claude" /> : <p className="text-[11px] text-slate-500">Claude tổng hợp bối cảnh, danh mục, tín hiệu có trọng số, rủi ro và nhãn bằng chứng của phiên mới nhất — chỉ chạy khi bấm.</p>}
      </section>

      <section className="rounded-lg border border-white/10 bg-[#0E131F] p-3">
        {qa.turns.length > 0 && <div className="mb-2 flex justify-end"><QaExport desk={desk} turns={qa.turns} meta={qa.meta} /></div>}
        <QaTapContext.Provider value={qaTap}>
        <CatalystChatPanel title="Hỏi đáp Elite 10" suggestions={ELITE_SUGGESTIONS} />
        </QaTapContext.Provider>
      </section>
      <p className="text-[10px] text-slate-400" data-testid="elite-ai-disclaimer">AI chỉ giải thích và phản biện số liệu từ công cụ; lập luận "phe mua" / "phe bán" là bài tập tranh luận. Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
