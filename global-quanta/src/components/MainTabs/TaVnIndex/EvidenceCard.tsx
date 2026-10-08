// Thẻ bằng chứng (Screener Engine v2 / S2): backtest gộp toàn universe theo luật VN, tách trong/ngoài mẫu.
// Nhãn VALIDATED chỉ khi phần NGOÀI MẪU đạt; còn lại EXPERIMENTAL — hiển thị trung thực cả khi kết quả xấu.
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { TechnicalFilterEvidence, TradeStats } from "../../../hooks/useTechnicalFilter";

const pct = (v?: number | null, sign = true) =>
  v == null || !Number.isFinite(v) ? "—" : `${sign && v > 0 ? "+" : ""}${v.toFixed(2).replace(".", ",")}%`;
const num = (v?: number | null) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(2).replace(".", ","));
const tone = (v?: number | null) => (v == null ? "text-slate-400" : v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-slate-300");
const pfTone = (v?: number | null) => (v == null ? "text-slate-400" : v >= 1.1 ? "text-emerald-400" : v >= 1 ? "text-amber-300" : "text-rose-400");

function Cell({ title, s, base }: { title: string; s?: TradeStats; base?: number | null }) {
  return (
    <div className="rounded-lg bg-slate-900/60 border border-slate-800/70 p-2 min-w-0">
      <div className="text-[8px] uppercase tracking-wide text-slate-500">{title}</div>
      {s?.n ? (
        <>
          <div className={`text-sm font-black font-mono ${pfTone(s.profitFactor)}`}>PF {num(s.profitFactor)}</div>
          <div className="text-[9px] text-slate-400 leading-snug">
            {s.n} lệnh · thắng {num(s.winRate)}%
            <br />
            TB <span className={tone(s.avgNetPct)}>{pct(s.avgNetPct)}</span> · trung vị <span className={tone(s.medianNetPct)}>{pct(s.medianNetPct)}</span>
            {base !== undefined && (
              <>
                <br />
                nền 10 phiên <span className={tone(base)}>{pct(base)}</span>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="text-[10px] text-slate-500 py-1">Chưa có lệnh</div>
      )}
    </div>
  );
}

export default function EvidenceCard({ evidence, marketUp }: { evidence: TechnicalFilterEvidence; marketUp: boolean | null | undefined }) {
  const validated = evidence.label === "VALIDATED";
  return (
    <details className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-2 text-[10px]" data-testid="evidence-card">
      <summary className="cursor-pointer flex flex-wrap items-center gap-1.5 list-none">
        {validated ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> : <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />}
        <span className="font-bold text-slate-300">Bằng chứng lịch sử</span>
        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold ${validated ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-300"}`} data-testid="evidence-label">
          {evidence.label}
        </span>
        <span className="text-slate-500">
          {evidence.outOfSample?.n ? `Ngoài mẫu PF ${num(evidence.outOfSample.profitFactor)} · ${evidence.outOfSample.n} lệnh` : evidence.reason}
        </span>
        {marketUp === false && <span className="text-[8px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 font-bold">M chưa thuận</span>}
      </summary>
      <div className="pt-2 space-y-2">
        <p className="text-slate-400 leading-relaxed">{evidence.reason}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          <Cell title={`Trong mẫu${evidence.period ? ` ${evidence.period.from.slice(0, 7)}→` : ""}`} s={evidence.inSample} />
          <Cell title={`Ngoài mẫu${evidence.period ? ` từ ${evidence.period.oosFrom.slice(0, 7)}` : ""}`} s={evidence.outOfSample} base={evidence.baseline?.outOfSample ?? null} />
          <Cell title="Toàn bộ" s={evidence.all} base={evidence.baseline?.all ?? null} />
        </div>
        {evidence.byGrade && (
          <div className="grid grid-cols-3 gap-1.5">
            {(["A", "B", "C"] as const).map((g) => (
              <Cell key={g} title={`Hạng ${g}${evidence.byGradeOutOfSample?.[g]?.n ? ` · ngoài mẫu PF ${num(evidence.byGradeOutOfSample[g].profitFactor)}` : ""}`} s={evidence.byGrade?.[g]} />
            ))}
          </div>
        )}
        {evidence.byMarket && (
          <div className="grid grid-cols-2 gap-1.5">
            <Cell title="VN-Index trên MA20 (M thuận)" s={evidence.byMarket.up} />
            <Cell title="VN-Index dưới MA20 (M chưa thuận)" s={evidence.byMarket.down} />
          </div>
        )}
        {evidence.rules && <p className="text-[9px] text-slate-500 leading-relaxed">{evidence.rules}</p>}
      </div>
    </details>
  );
}
