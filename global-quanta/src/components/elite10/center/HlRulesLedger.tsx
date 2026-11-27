// QĐ-R (20/11/2026) — hai khối "Quy tắc vào · giữ · ra" (kèm K0, HL-r2) và "Sổ theo dõi tiến" của Elite HL, TÁCH NGUYÊN VĂN từ
// Bảng quyết định (EliteHlBoard) để đặt ở tab con "4. Bằng chứng & sổ theo dõi". Không đổi số, câu chữ hay data-testid.
// Bảng quyết định chỉ còn thẻ tóm tắt (HlEvidenceLink) với nút sang tab 4. Mọi số đến từ /api/elite/decision (cùng cache SWR).
import { type EliteDecision, type LedgerSummary } from "../../../lib/elite10/decisionTypes";
import { fmtDate, num, signed } from "./boardParts";
import HlLedgerNote from "./HlLedgerNote";
import { DEFAULT_PZ_RULES, PzRulesItems } from "./HlPricePosition";
import { hlCadenceVi } from "../../../lib/elite10/hlCadence";
import { useEvidenceEvolution } from "../../../hooks/elite10/useEvidenceEvolution";
import { REGIME_VI } from "./EvidenceEvolution";

const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${num(v * 100, d)}%`);

export function Panel({ title, right, children, testId }: { title: string; right?: React.ReactNode; children: React.ReactNode; testId: string }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-white/10 bg-[#0E131F] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-100">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

export const ledgerLine = (s: LedgerSummary | null | undefined, h: "5" | "10") => {
  const x = s?.horizons?.[h];
  return x && x.n > 0 ? <>{x.n} phiên · vượt rổ đều <b className={x.meanExcess != null && x.meanExcess > 0 ? "text-emerald-300" : "text-rose-300"}>{signed((x.meanExcess ?? 0) * 100, 2)}%</b> · thắng {num((x.hitRate ?? 0) * 100, 0)}%</> : <span className="text-slate-500">chưa có phiên nào đủ kỳ hạn</span>;
};

/** Ngưỡng tầng 1 của Gateway; mặc định chỉ dùng khi Gateway bản cũ chưa gửi (giống Bảng quyết định). */
const tier1Of = (d: EliteDecision) => d.hl?.tier1 ?? { lsLeaderPct: 80, taMin: 2, taModels: 7, maxScore: 10 };

export function HlRulesPanel({ d }: { d: EliteDecision }) {
  const hl = d.hl!;
  const r = hl.rule, t1 = tier1Of(d), lsTop = 100 - t1.lsLeaderPct;
  const pz = hl.pz ?? null;
  return (
    <Panel title="Quy tắc vào · giữ · ra" testId="hl-rules">
      <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-300">
        <li><b>Chọn:</b> tầng 1 (LS-v1 top {lsTop}% và ≥ {t1.taMin}/{t1.taModels} mô hình TA) → RRG ngành Cải thiện / Dẫn dắt → tích điểm các tab.</li>
        <li><b>Vào:</b> {hlCadenceVi(hl).rule}, theo thứ tự xếp hạng; GTGD TB20 ≥ {r.minAdvBn} tỷ; tối đa {r.slots} mã, {r.maxPerSector} mã và {pct(r.sectorCap, 0)} tỷ trọng mỗi ngành.</li>
        <li><b>Giữ:</b> không cân lại tỷ trọng; ngành chuyển sang Suy yếu chỉ là cảnh báo.</li>
        <li><b>Ra (xét mỗi phiên):</b> LS-v1 dưới phân vị {r.exitLsPct}, hoặc không còn mô hình TA nào đạt, hoặc ngành rơi vào Tụt hậu.</li>
        {pz && <PzRulesItems meta={pz} />}
      </ul>
      <p className="mt-1.5 rounded border border-amber-400/30 bg-amber-500/[0.06] p-1.5 text-[10.5px] leading-relaxed text-amber-200" data-testid="hl-k0">{hl.k0.noteVi}</p>
      {hl.k0.hlR2 && (
        <table className="mt-1 w-full text-[10.5px]" data-testid="hl-k0-r2" style={{ borderCollapse: "collapse" }}>
          <caption className="pb-0.5 text-left text-[10px] text-slate-400">Kiểm định đăng ký trước HL-r2 ({fmtDate(hl.k0.hlR2.ranAt)}) — G2r so với bình quân đều sau phí</caption>
          <thead><tr className="text-left text-[10px] text-slate-500"><th className="font-normal">Giai đoạn</th><th className="font-normal">Lợi suất/năm</th><th className="font-normal">Sụt giảm lớn nhất</th><th className="font-normal">Vượt / 20 phiên (t)</th></tr></thead>
          <tbody>
            {([["Quyết định", hl.k0.hlR2.decision], ["Ngoài mẫu", hl.k0.hlR2.outOfSample]] as const).map(([label, x]) => (
              <tr key={label} className="border-t border-white/5"><td className="py-0.5 text-slate-300">{label} <span className="text-slate-500">{x.period}</span></td><td>{signed(x.cagr * 100, 1)}%</td><td>{signed(x.maxDd * 100, 1)}%</td>
                <td className={x.t >= 2 ? "text-emerald-300" : x.t <= -1 ? "text-rose-300" : "text-slate-300"}>{signed(x.excess20 * 100, 2)}% ({signed(x.t, 2)})</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export function HlLedgerPanel({ d }: { d: EliteDecision }) {
  const ledgerCost = d.display?.ledgerCostRoundTrip ?? 0.004;
  return (
    <Panel title="Sổ theo dõi tiến — Elite HL so với Elite dòng tiền (cũ)" testId="elite-ledger">
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 380 }}>
          <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 font-normal">Kỳ hạn</th><th className="font-normal">Elite HL (chính thức)</th><th className="font-normal">Elite dòng tiền (cũ)</th></tr></thead>
          <tbody>
            {(["5", "10"] as const).map((h) => {
              const ci = d.ledgerSummary?.horizons?.[h]?.cashIncl;
              return (
                <tr key={h} className="border-t border-white/5 align-top"><td className="py-1 text-slate-400">{h} phiên</td>
                  <td data-testid={`hl-ledger-hl-${h}`}>{ledgerLine(d.ledgerSummary, h)}
                    {ci && <span className="block text-[10px] text-slate-400" data-testid={`hl-ledger-cash-${h}`}>Tính cả tiền mặt ({ci.n} phiên, cổ phiếu TB {num(ci.meanInvested * 100, 0)}%): danh mục <b className="text-slate-200">{signed(ci.meanPortfolio * 100, 2)}%</b>{ci.meanVnIndex != null ? <> · VN-Index {signed(ci.meanVnIndex * 100, 2)}%</> : ""} — trước phí</span>}</td>
                  <td data-testid={`hl-ledger-flow-${h}`}>{ledgerLine(d.flowLedgerSummary, h)}</td></tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">Sổ Elite HL bắt đầu từ phiên chuyển đổi; sổ dòng tiền tiếp nối sổ cũ. Cả hai khoá danh mục lúc dựng, chấm ở giá đóng cửa phiên kế tiếp, chi phí giả định {pct(ledgerCost, 2)}/vòng.</p>
      <p className="mt-1 rounded border border-amber-400/30 bg-amber-500/[0.06] p-1.5 text-[10px] leading-relaxed text-amber-200" data-testid="hl-ledger-basis">{d.ledgerSummary?.basisVi ?? "Cột Elite HL chấm rổ mã đang giữ quy về 100% cổ phiếu (không tính phần tiền mặt), kỳ hạn cố định 5 và 10 phiên — chưa phải lãi / lỗ của danh mục thật (có tiền mặt, giữ tới khi chạm ngưỡng ra)."}</p>
      <HlLedgerNote />
    </Panel>
  );
}

/**
 * Thẻ tóm tắt ở Bảng quyết định (thay hai khối đã chuyển): số chính của sổ theo dõi + câu K0, và nút sang tab 4.
 * `onNavigate` không có (VD nhúng ngoài Hub) -> không hiện nút, chỉ còn chỉ dẫn bằng chữ.
 */
export function HlEvidenceLink({ d, onNavigate }: { d: EliteDecision; onNavigate?: () => void }) {
  const hl = d.hl!;
  // EV-4: tóm tắt tiến hoá bằng chứng (chỉ mô tả; không có dữ liệu -> không hiện dòng này).
  const { data: evo } = useEvidenceEvolution();
  return (
    <Panel title="Bằng chứng · sổ theo dõi · quy tắc" testId="hl-evidence-link">
      <ul className="space-y-0.5 text-[11px] text-slate-300">
        <li data-testid="hl-evidence-link-ledger">Sổ theo dõi tiến Elite HL — 5 phiên: {ledgerLine(d.ledgerSummary, "5")} · 10 phiên: {ledgerLine(d.ledgerSummary, "10")}</li>
        {evo && (
          <li data-hl-layer="evidence" data-testid="hl-evidence-evo" className="text-slate-300">
            Tab 4: thị trường {REGIME_VI[evo.currentRegime].toLowerCase()} · SQS TB {evo.scorecard.signalHealth.meanSqs}/100 · {evo.scorecard.signalHealth.provenCount} tín hiệu đã chứng minh, {evo.scorecard.signalHealth.invertedCount} ngược chiều · <b className={evo.proposals.some((p) => p.priority === "HIGH") ? "text-amber-200" : "text-slate-200"}>{evo.proposals.length} đề xuất cần duyệt</b>
          </li>
        )}
        <li className="text-slate-400">Bằng chứng của từng lớp (kiểm định đăng ký trước, công bố cả khi không đạt), quy tắc, Cổng tiền mặt, trọng số: ở tab 4.</li>
        <li className="text-slate-400">Quy tắc: tối đa {hl.rule.slots} mã, {hlCadenceVi(hl).short}, ra khi LS-v1 dưới phân vị {hl.rule.exitLsPct}, hết mô hình TA hoặc ngành Tụt hậu.</li>
      </ul>
      {onNavigate ? (
        <button type="button" onClick={onNavigate} data-touch data-testid="hl-goto-evidence"
          className="mt-2 min-h-[28px] rounded border border-[#E8B84B]/50 bg-[#E8B84B]/10 px-3 text-[11px] font-bold text-[#F5CE72] hover:bg-[#E8B84B]/20">
          Xem Bằng chứng · Trọng số · Quy tắc chi tiết →
        </button>
      ) : <p className="mt-1 text-[10px] text-slate-500">Chi tiết ở tab con "4. Bằng chứng & sổ theo dõi".</p>}
    </Panel>
  );
}
