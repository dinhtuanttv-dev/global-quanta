import { useDebateSession, type DebateRound, type JudgeVote } from '../../../hooks/elite10/useDebateSession';

/**
 * Elite 10 - Muc A/B (Tech Spec v2) Giai doan 4/4: Multi-Agent Debate
 * Arena. Hien thi debate GAN NHAT (tu dong doc, khong ton chi phi) +
 * nut "Chay Debate AI" (on-demand, ton chi phi AI that moi lan bam).
 *
 * MINH BACH: Bull/Bear/Judge deu dung Gemini (khong phai multi-model
 * nhu thiet ke ban dau Claude vs Gemini) - hien ro dieu nay qua badge,
 * khong ngu nhan nguoi dung.
 */

function RoundBubble({ round }: { round: DebateRound }) {
  const isBull = round.side === 'bull';
  return (
    <div className={isBull ? 'ml-0 mr-8 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] p-3' : 'ml-8 mr-0 rounded-lg border border-rose-500/25 bg-rose-500/[0.04] p-3'}>
      <div className="mb-1.5 flex items-center justify-between text-[10px]">
        <span className={isBull ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>
          {isBull ? '▲ BULL' : '▼ BEAR'} · Lượt {round.round}
        </span>
        <span className="text-slate-500">Tin cậy: {round.confidencePct}%</span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-300">{round.argument}</p>
      {round.citedFields.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {round.citedFields.map((f) => (
            <span key={f} className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] text-slate-500">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function JuryVoteCard({ vote }: { vote: JudgeVote }) {
  const color = vote.verdict === 'bullish' ? 'text-emerald-400' : vote.verdict === 'bearish' ? 'text-rose-400' : 'text-amber-400';
  const label = vote.verdict === 'bullish' ? 'TĂNG' : vote.verdict === 'bearish' ? 'GIẢM' : 'TRUNG LẬP';
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="font-bold text-slate-300">{vote.judge}</span>
        <span className={`font-bold ${color}`}>{label} · {vote.confidencePct}%</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">{vote.reasoning}</p>
    </div>
  );
}

export function DebateArenaPanel({ ticker }: { ticker: string | null }) {
  const { debate, hasExistingDebate, isLoadingExisting, isRunning, runError, runDebate } = useDebateSession(ticker);

  return (
    <div className="rounded-md border border-purple-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(168,85,247,0.06)]">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-purple-300">MULTI-AGENT DEBATE ARENA</div>
        <button
          type="button"
          onClick={runDebate}
          disabled={isRunning || !ticker}
          className={isRunning
            ? 'cursor-not-allowed rounded px-3 py-1.5 text-[10px] font-bold text-slate-500 bg-white/5'
            : 'rounded px-3 py-1.5 text-[10px] font-bold text-slate-950 bg-purple-400 hover:bg-purple-300'}
        >
          {isRunning ? 'Đang tranh luận...' : hasExistingDebate ? 'Chạy lại Debate AI' : 'Chạy Debate AI'}
        </button>
      </div>

      {runError && (
        <div className="mb-2.5 rounded bg-rose-500/10 p-2.5 text-[10px] text-rose-400">{runError}</div>
      )}

      {isLoadingExisting && !debate && (
        <div className="py-6 text-center text-[10px] text-slate-500">Đang tải debate gần nhất...</div>
      )}

      {!isLoadingExisting && !debate && !isRunning && (
        <div className="py-6 text-center text-[10px] text-slate-500">
          Chưa có debate nào cho mã này. Bấm "Chạy Debate AI" để Bull và Bear Agent tranh luận dựa trên dữ liệu thật hiện có.
        </div>
      )}

      {debate && debate.status === 'completed' && (
        <>
          <div className="mb-3 space-y-2">
            {debate.rounds.map((r, i) => <RoundBubble key={i} round={r} />)}
          </div>

          <div className="mb-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-1.5 flex items-center justify-between text-[10px]">
              <span className="font-bold text-slate-300">XÁC SUẤT THỊ TRƯỜNG NỘI BỘ (LMSR)</span>
              <span className="font-mono text-slate-200">{debate.lmsrFinalPricePct.toFixed(1)}% nghiêng Tăng</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-rose-500/20">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${debate.lmsrFinalPricePct}%` }} />
            </div>
          </div>

          {debate.judgeVotes && debate.judgeVotes.length > 0 && (
            <div className="mb-3">
              <div className="mb-1.5 text-[10px] font-bold text-slate-300">
                PHÁN QUYẾT JURY {debate.finalVerdict && <span className="ml-1.5 rounded bg-purple-500/15 px-1.5 py-0.5 text-[9px] font-bold text-purple-300">
                  {debate.finalVerdict === 'bullish' ? 'TĂNG' : debate.finalVerdict === 'bearish' ? 'GIẢM' : 'TRUNG LẬP'}
                </span>}
                {debate.isTieBreak && <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold text-amber-400">2 Judge bất đồng — đã chọn theo Judge tự tin hơn</span>}
              </div>
              <div className="space-y-1.5">
                {debate.judgeVotes.map((v, i) => <JuryVoteCard key={i} vote={v} />)}
              </div>
            </div>
          )}

          <div className="rounded bg-white/[0.02] p-2.5 text-[9px] text-slate-500">
            {debate.isSingleProviderDebate && '⚠ Bull/Bear/Judge đều dùng cùng 1 nhà cung cấp AI (Gemini, vai trò khác nhau qua system prompt) — không phải các model độc lập hoàn toàn. '}
            Không phải khuyến nghị đầu tư — đây là công cụ tổng hợp lập luận dựa trên dữ liệu định lượng đã có.
          </div>
        </>
      )}

      {debate && debate.status === 'failed' && (
        <div className="py-4 text-center text-[10px] text-rose-400">
          Debate gần nhất thất bại{debate.errorMessage ? `: ${debate.errorMessage}` : '.'} Thử bấm "Chạy Debate AI" lại.
        </div>
      )}
    </div>
  );
}
