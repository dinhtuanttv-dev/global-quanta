import type { CaseItem } from '../../../hooks/elite10/useAiInsight';

const STATUS_LABEL: Record<string, string> = { VALID: 'VALID', STALE: 'STALE', SUSPECT: 'SUSPECT', MISSING: 'MISSING' };
const STATUS_COLOR: Record<string, string> = {
  VALID: 'text-emerald-400 border-emerald-700 bg-emerald-950/40',
  STALE: 'text-amber-400 border-amber-700 bg-amber-950/40',
  SUSPECT: 'text-rose-400 border-rose-700 bg-rose-950/40',
  MISSING: 'text-slate-500 border-slate-700 bg-slate-800/40',
};

/**
 * Vung 4 - "Ma tran doi khang": moi luan diem PHAI trich dan nguon that
 * (Validation Layer da loai bo luan diem khong trich dan duoc o Backend -
 * xem lib/elite10/ai-pipeline.ts computePenalty/validateAiOutput).
 */
function CaseColumn({ title, items, tone }: { title: string; items: CaseItem[]; tone: 'pos' | 'neg' }) {
  return (
    <div>
      <h3 className={`mb-2 text-[11px] font-bold ${tone === 'pos' ? 'text-emerald-400' : 'text-rose-400'}`}>{title}</h3>
      {items.length === 0 && <p className="text-[10px] text-slate-500">Không có luận điểm nào trích dẫn được nguồn thật.</p>}
      {items.map((it, i) => (
        <div key={i} className="border-b border-white/5 py-2 text-[11px] last:border-b-0">
          <p className="mb-1.5 text-slate-300">{it.point}</p>
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-slate-500">{it.sourceField}</span>
            <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold ${STATUS_COLOR[it.dataStatus] ?? STATUS_COLOR.MISSING}`}>
              {STATUS_LABEL[it.dataStatus] ?? it.dataStatus}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConfluenceCaseMatrix({ bullCase, bearCase }: { bullCase: CaseItem[]; bearCase: CaseItem[] }) {
  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-bold tracking-wide text-cyan-300">MA TRẬN ĐỐI KHÁNG</div>
        <span className="text-[9px] text-slate-500">Mỗi luận điểm gắn trích dẫn nguồn</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <CaseColumn title="Ủng hộ" items={bullCase} tone="pos" />
        <CaseColumn title="Phản biện" items={bearCase} tone="neg" />
      </div>
    </div>
  );
}
