// Thẻ bằng chứng (Screener Engine v2 / S2): backtest gộp toàn universe theo luật VN, tách trong/ngoài mẫu.
// Nhãn VALIDATED chỉ khi phần NGOÀI MẪU đạt; còn lại EXPERIMENTAL — hiển thị trung thực cả khi kết quả xấu.
import { ShieldAlert, ShieldCheck } from "lucide-react";
import type { LiveStat, LiveTracking, TechnicalFilterEvidence, TradeStats } from "../../../hooks/useTechnicalFilter";

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

const VERDICT: Record<LiveStat["verdict"], { text: string; cls: string }> = {
  edge: { text: "có lợi thế", cls: "text-emerald-400" },
  negative: { text: "ngược kỳ vọng", cls: "text-rose-400" },
  none: { text: "như ngẫu nhiên", cls: "text-slate-400" },
  insufficient: { text: "chưa đủ mẫu", cls: "text-slate-500" },
};
const pct0 = (v: number) => `${Math.round(v * 100)}%`;

function LiveCell({ s }: { s: LiveStat | null }) {
  if (!s) return <td className="px-1 text-right text-slate-600">—</td>;
  return (
    <td className="px-1 text-right whitespace-nowrap" title={`n=${s.n} · KTC95% ${pct0(s.hitLow)}–${pct0(s.hitHigh)} · z (cụm) ${s.z ?? "—"}`}>
      <span className="font-mono text-slate-200">{pct0(s.hitRate)}</span><span className="text-slate-500"> / {pct0(s.baseline)}</span>
      <span className={`block text-[8px] ${VERDICT[s.verdict].cls}`}>{VERDICT[s.verdict].text} · n={s.n}</span>
    </td>
  );
}

/** Theo dõi THỰC TẾ (ngoài mẫu hoàn toàn): tỷ lệ trúng T+5 / T+10 so với mốc nền cùng ngày. */
export function LiveTrackingTable({ live }: { live: LiveTracking | undefined }) {
  const rows = live?.groups ?? (live ? [{ key: "bo", label: "Breakout", ...live.breakout }, { key: "setup", label: "Setup", ...live.setup }] : []);
  const has = rows.some((g) => g.h5 || g.h10);
  return (
    <div data-testid="live-tracking">
      <div className="text-[9px] uppercase tracking-wide text-slate-500 mb-0.5">Theo dõi thực tế (từ ngày triển khai — ngoài mẫu hoàn toàn)</div>
      {!has ? (
        <p className="text-[9px] text-slate-500">Đang ghi nhận tín hiệu mỗi phiên lúc 15:45; kết quả T+5 / T+10 được chấm tự động lúc 16:40 so với VN-Index. Cần ≥ 30 tín hiệu để kết luận.</p>
      ) : (
        <table className="w-full text-[9px]">
          <thead className="text-slate-500"><tr><th className="text-left font-normal px-1">Trúng / nền</th><th className="text-right font-normal px-1">T+5</th><th className="text-right font-normal px-1">T+10</th></tr></thead>
          <tbody>
            {rows.map((g) => <tr key={g.key} className="border-t border-white/5"><td className="px-1 text-slate-300">{g.label}</td><LiveCell s={g.h5} /><LiveCell s={g.h10} /></tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function EvidenceCard({ evidence, marketUp, live, liveNote }: { evidence: TechnicalFilterEvidence; marketUp: boolean | null | undefined; live?: LiveTracking; liveNote?: string }) {
  const v = evidence.validation;
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
        {evidence.all.n > 0 && evidence.all.n < 100 && (
          <p className="text-amber-300/90 leading-relaxed" data-testid="evidence-small-sample">
            Mẫu nhỏ ({evidence.all.n} lệnh): chênh lệch giữa các hạng / nhóm chưa có ý nghĩa thống kê — chỉ tham khảo.
          </p>
        )}
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
        {v && (
          <div className="rounded-md p-2 space-y-1" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }} data-testid="evidence-validation">
            <div className="text-[9px] uppercase tracking-wide text-slate-500">Kiểm định</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[9px] text-slate-400">
              <span>KTC 95% lợi nhuận TB ngoài mẫu: <span className="font-mono text-slate-200">{v.ciOutOfSample ? `${pct(v.ciOutOfSample.mean[0])} … ${pct(v.ciOutOfSample.mean[1])}` : "chưa đủ lệnh"}</span></span>
              <span>KTC 95% PF ngoài mẫu: <span className="font-mono text-slate-200">{v.ciOutOfSample ? `${num(v.ciOutOfSample.pf[0])} … ${num(v.ciOutOfSample.pf[1])}` : "—"}</span></span>
              <span>t so với nền (toàn bộ / ngoài mẫu): <span className="font-mono text-slate-200">{num(v.tVsBaseline)} / {num(v.tVsBaselineOos)}</span></span>
              <span>Số cấu hình đã thử khi chọn tham số: <span className="font-mono text-slate-200">{v.trials}</span>{v.trials > 1 ? " — kết quả trong mẫu có thiên lệch tối ưu" : ""}</span>
            </div>
            {v.periods.length > 0 && (
              <div className="overflow-x-auto">
                <table className="text-[9px] font-mono w-full">
                  <thead className="text-slate-500"><tr><th className="text-left font-normal pr-2">Nửa năm</th>{v.periods.map((p) => <th key={p.period} className="text-right font-normal px-1">{p.period}</th>)}</tr></thead>
                  <tbody>
                    <tr><td className="text-slate-500 pr-2">PF</td>{v.periods.map((p) => <td key={p.period} className={`text-right px-1 ${pfTone(p.profitFactor)}`}>{num(p.profitFactor)}</td>)}</tr>
                    <tr><td className="text-slate-500 pr-2">Lệnh</td>{v.periods.map((p) => <td key={p.period} className="text-right px-1 text-slate-400">{p.n}</td>)}</tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {liveNote ? <p className="text-[9px] text-slate-500" data-testid="live-note">{liveNote}</p> : <LiveTrackingTable live={live} />}
        {evidence.rules && <p className="text-[9px] text-slate-500 leading-relaxed">{evidence.rules}</p>}
      </div>
    </details>
  );
}
