// Elite 10 E5 (2026-10-17) — "Phòng họp AI": AI giải thích và phản biện, KHÔNG đặt điểm.
//   - Tranh luận có trọng tài: Claude (phe mua) và Gemini (phe bán) lập luận song song bằng cùng bộ công cụ (elite_*, ws_*, macro_*,
//     world_*, catalyst_*) — hai mô hình khác nhau thật, không phải một mô hình đóng hai vai; sau đó Claude làm trọng tài, gọi công cụ
//     để kiểm chứng từng luận điểm và kết luận cân bằng. Mọi câu trả lời đều qua bước đối chiếu con số với kết quả công cụ.
//   - Bản tin phiên: tạo khi bấm (không chạy định kỳ — tránh chi phí API không cần thiết).
//   - Hỏi đáp tự do: cùng khung Hỏi đáp xúc tác, gợi ý theo Elite 10.
import { useEffect, useRef, useState } from "react";
import { Gavel, Newspaper, Play, Square } from "lucide-react";
import { ChatHttpError, streamCatalystChat, type ChatProvider, type ChatRole } from "../../../services/catalystChat";
import CatalystChatPanel, { LaneView, laneReducer, newLane, type Lane } from "../../MainTabs/ChatXucTac/CatalystChatPanel";

export const ELITE_SUGGESTIONS = [
  "Danh mục Elite 10 hôm nay gồm những mã nào, động lực chính là gì và độ tin cậy đến đâu?",
  "Tín hiệu nào đang có trọng số trong Điểm Elite và vì sao các tín hiệu khác không có?",
  "Phân tích định lượng HPG: hạng Elite, tín hiệu bậc A/B, bối cảnh ngành thế giới và rủi ro.",
  "Sổ theo dõi tiến của Elite 10 đang cho kết quả thế nào so với rổ đều và VN-Index?",
  "Vì sao RVOL cao lại là tín hiệu ngược chiều theo engine bằng chứng?",
];

const JUDGE_MAX = 6000;
const clip = (s: string) => (s.length > JUDGE_MAX ? `${s.slice(0, JUDGE_MAX)}…[cắt bớt]` : s);

/** Câu hỏi cho từng vai trong tranh luận. `subject` = mã cổ phiếu hoặc null (cả danh mục). */
export function debateQuestions(subject: string | null) {
  const target = subject ? `mã ${subject}` : "danh mục Elite 10 của phiên mới nhất";
  return {
    bull: `Chủ đề tranh luận: ${target}, kỳ hạn 5–10 phiên. Trình bày lập luận phe MUA (nghiêng tỷ trọng tăng). Dùng elite_${subject ? "ticker" : "decision"} trước, sau đó bối cảnh ngành thế giới / vĩ mô / xúc tác nếu cần.`,
    bear: `Chủ đề tranh luận: ${target}, kỳ hạn 5–10 phiên. Trình bày lập luận phe BÁN / thận trọng (không tăng hoặc giảm tỷ trọng). Dùng elite_${subject ? "ticker" : "decision"} và elite_evidence trước, sau đó rủi ro vĩ mô / ngành / xúc tác nếu cần.`,
    judge: (bull: string, bear: string) =>
      `Chủ đề: ${target}, kỳ hạn 5–10 phiên.\n\n=== LẬP LUẬN PHE MUA (Claude) ===\n${clip(bull)}\n\n=== LẬP LUẬN PHE BÁN (Gemini) ===\n${clip(bear)}\n\nHãy làm trọng tài: kiểm chứng bằng công cụ, chấm từng luận điểm và kết luận.`,
    brief: "Viết bản tin quyết định cho phiên mới nhất của trung tâm Elite 10: (1) bối cảnh thị trường Việt Nam và thế giới, (2) danh mục Elite 10 và động lực chính của từng nhóm, (3) tín hiệu có trọng số và độ tin cậy (IC, bậc), (4) rủi ro chính và điều kiện làm thay đổi đánh giá, (5) nhãn bằng chứng và trạng thái sổ theo dõi. Ngắn gọn, có số liệu từ công cụ.",
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
  useEffect(() => () => ctrlRef.current?.abort(), []);

  async function run(provider: ChatProvider, role: ChatRole | null, q: string, set: (fn: (l: Lane | null) => Lane | null) => void, signal: AbortSignal): Promise<Lane> {
    let lane = newLane(provider);
    set(() => lane);
    const apply = (fn: (l: Lane) => Lane) => { lane = fn(lane); set(() => lane); };
    try {
      await streamCatalystChat([{ role: "user", content: q }], (e) => apply((l) => laneReducer(l, e)), signal, provider, role);
    } catch (err) {
      apply((l) => ({ ...l, error: signal.aborted ? "Đã dừng." : err instanceof ChatHttpError ? err.message : "Không kết nối được dịch vụ AI." }));
    } finally {
      apply((l) => ({ ...l, done: true }));
    }
    return lane;
  }

  async function startDebate() {
    if (phase === "arguing" || phase === "judging") return;
    const t = subject.trim().toUpperCase();
    const ticker = /^[A-Z0-9]{3,10}$/.test(t) ? t : null;
    const q = debateQuestions(ticker);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setJudge(null);
    setPhase("arguing");
    const [b, s] = await Promise.all([run("claude", "bull", q.bull, setBull, ctrl.signal), run("gemini", "bear", q.bear, setBear, ctrl.signal)]);
    if (ctrl.signal.aborted || (!b.text.trim() && !s.text.trim())) { setPhase("done"); return; }
    setPhase("judging");
    await run("claude", "judge", q.judge(b.text || "(phe mua không trả lời được)", s.text || "(phe bán không trả lời được)"), setJudge, ctrl.signal);
    setPhase("done");
  }

  async function makeBrief() {
    if (briefBusy) return;
    setBriefBusy(true);
    const ctrl = new AbortController();
    await run("claude", null, debateQuestions(null).brief, setBrief, ctrl.signal);
    setBriefBusy(false);
  }

  const busy = phase === "arguing" || phase === "judging";
  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="elite-ai-room">
      <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Tranh luận có trọng tài</h4>
          <span className="text-[10px] text-slate-500">Claude phe mua · Gemini phe bán · Claude trọng tài — tính 3 câu vào hạn mức hỏi đáp</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input id="elite-debate-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={busy} maxLength={10}
            placeholder="Mã cổ phiếu (để trống = cả danh mục Elite 10)" aria-label="Chủ đề tranh luận"
            className="min-w-0 flex-1 rounded-md border border-white/15 bg-slate-900 px-2.5 py-1.5 text-[11.5px] uppercase text-slate-100 outline-none" />
          {busy
            ? <button type="button" onClick={() => ctrlRef.current?.abort()} className="inline-flex items-center gap-1 rounded-md border border-rose-400/50 px-3 py-1.5 text-[11px] font-bold text-rose-300"><Square className="h-3 w-3" />Dừng</button>
            : <button type="button" onClick={() => void startDebate()} data-testid="elite-debate-start" className="inline-flex items-center gap-1 rounded-md bg-cyan-500/20 px-3 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/30"><Play className="h-3 w-3" />Bắt đầu tranh luận</button>}
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

      <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">Bản tin phiên</h4>
          <button type="button" onClick={() => void makeBrief()} disabled={briefBusy} data-testid="elite-brief-start"
            className="inline-flex items-center gap-1 rounded-md bg-cyan-500/20 px-3 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/30 disabled:opacity-50">
            <Newspaper className="h-3 w-3" />{briefBusy ? "Đang viết…" : brief ? "Viết lại bản tin" : "Tạo bản tin phiên"}
          </button>
        </div>
        {brief ? <LaneView t={brief} showHeader headerLabel="Bản tin · Claude" /> : <p className="text-[11px] text-slate-500">Claude tổng hợp bối cảnh, danh mục, tín hiệu có trọng số, rủi ro và nhãn bằng chứng của phiên mới nhất — chỉ chạy khi bấm.</p>}
      </section>

      <section className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3">
        <CatalystChatPanel title="Hỏi đáp Elite 10" suggestions={ELITE_SUGGESTIONS} />
      </section>
    </div>
  );
}
