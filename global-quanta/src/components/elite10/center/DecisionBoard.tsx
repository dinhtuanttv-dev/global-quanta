// Elite 10 E4 (2026-10-17) — "Bảng quyết định hôm nay": danh mục Elite 10 (E3-prereg), trọng số tín hiệu theo bằng chứng (E2),
// bối cảnh thị trường và sổ theo dõi tiến. Mọi số đến từ Gateway /api/elite/*; nhãn bằng chứng luôn hiển thị cạnh kết quả.
import { useMemo } from "react";
import { useEliteDecision } from "../../../hooks/elite10/useEliteCenter";
import useSWR from "swr";
import type { ResearchOverview } from "../../../hooks/useResearch";
import { fetchMarketJson } from "../../../services/marketDataClient";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { TIER_TITLE, type PortfolioPick, type Tier } from "../../../lib/elite10/decisionTypes";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { buyTimingCells, ELITE_HOLD_SESSIONS } from "../../../lib/elite10/buyTimingCell";
import { BuyTimingCell, fmtDate, num, price, SectionControls, signed } from "./boardParts";
import { useBoardSection } from "./boardPrefs";
import EliteCandidates from "./EliteCandidates";

const REGIME_VI: Record<string, string> = { UPTREND: "Xu hướng tăng", DOWNTREND: "Xu hướng giảm", SIDEWAY: "Đi ngang" };

export function TierChip({ tier }: { tier: Tier }) {
  const cls = tier === "A" ? "bg-emerald-500/15 text-emerald-300 border-emerald-400/40" : tier === "B" ? "bg-sky-500/15 text-sky-300 border-sky-400/40" : "bg-slate-500/15 text-slate-400 border-slate-500/40";
  return <span title={TIER_TITLE[tier]} className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[9px] font-bold ${cls}`}>Bậc {tier}</span>;
}

function Card({ title, right, children, testId }: { title: string; right?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-cyan-300">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

export default function DecisionBoard({ onOpenTicker }: { onOpenTicker: (ticker: string) => void }) {
  const { data: d, error, isLoading } = useEliteDecision();
  // Chế độ thị trường VN: tải trực tiếp (không phụ thuộc công tắc "AI nghiên cứu" của Siêu quét); cùng khoá SWR để dùng chung bộ đệm.
  const { data: research } = useSWR<ResearchOverview>("research-overview", () => fetchMarketJson<ResearchOverview>("/api/market/research/overview"), { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  const { data: ws } = useWorldStrategy();
  const buy = useGatewayBuyTimeline();
  const sectorName = useMemo(() => new Map((ws?.short.rows ?? []).map((r) => [r.icb, r.nameVi])), [ws]);
  const byId = useMemo(() => new Map((d?.weights ?? []).map((w) => [w.id, w])), [d]);
  const pf = useBoardSection("portfolio");

  if (error) return <p className="text-xs text-rose-400">Không tải được bảng quyết định: {String(error.message ?? error)}</p>;
  if (isLoading || !d) return <p className="py-6 text-center text-xs italic text-slate-500">Đang tải bảng quyết định Elite 10…</p>;

  const lab = d.ledgerSummary;
  const regime = research?.currentRegime;
  const drivers = (ticker: string) => {
    const sc = d.scores.find((x) => x.ticker === ticker);
    return (sc?.contributions ?? []).filter((c) => c.contribution > 0.05).sort((a, b) => b.contribution - a.contribution).slice(0, 2).map((c) => byId.get(c.id)?.labelVi ?? c.id);
  };
  const maxW = Math.max(...d.portfolio.map((p) => p.weight), 0.01);
  const buyCells = buyTimingCells(d.portfolio.map((p) => p.ticker), buy.data?.rows ?? null, d.date, buy.sessions);
  const secName = (k: string | null) => (k ? sectorName.get(k) ?? k : "—");
  const buyAge = buy.meta?.fetchedAt ? new Date(buy.meta.fetchedAt).toLocaleString("vi-VN", { hour12: false }) : null;

  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="elite-decision-board">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-bold text-cyan-300">Bảng quyết định Elite 10 — phiên {fmtDate(d.date)}</p>
          <p className="text-[10.5px] text-slate-400">
            Dựng {new Date(d.builtAt).toLocaleString("vi-VN", { hour12: false })} · {d.universe.eligible}/{d.universe.panel} mã đủ điều kiện (GTGD TB20 ≥ 10 tỷ, giá ≥ 5.000đ, giá không bị neo) · {d.version}
          </p>
        </div>
        <span title={lab?.labelVi} className={`rounded border px-2 py-1 text-[10px] font-bold ${lab?.label === "EVIDENCE" ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-300" : "border-amber-400/50 bg-amber-500/10 text-amber-300"}`} data-testid="elite-label">
          {lab?.label === "EVIDENCE" ? "ĐẠT TIÊU CHÍ ĐĂNG KÝ TRƯỚC" : "THĂM DÒ"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3 text-[11px]" data-testid="elite-context">
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[9.5px] font-bold uppercase text-slate-500">Thị trường Việt Nam</p>
          <p>{regime ? <>Chế độ <b className="text-slate-100">{REGIME_VI[regime.regime] ?? regime.regime}</b> · xung lực {num(regime.impulseScore)} · độ rộng {num(regime.breadthPct)}%</> : "—"}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[9.5px] font-bold uppercase text-slate-500">Rủi ro toàn cầu</p>
          <p>{ws ? <>{ws.regime.stressed ? <b className="text-amber-300">Căng thẳng</b> : <b className="text-slate-100">Bình thường</b>} · VIX {num(ws.regime.vix, 2)} ({signed(ws.regime.vixChg, 1)}%)</> : "—"}</p>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.02] p-2">
          <p className="text-[9.5px] font-bold uppercase text-slate-500">Tỷ lệ cổ phiếu</p>
          <p>100% — chưa có tín hiệu định thời thị trường nào đạt kiểm định, nên không đề xuất tỷ lệ tiền mặt.</p>
        </div>
      </div>

      <Card title="Danh mục Elite 10" testId="elite-portfolio" right={<span className="inline-flex flex-wrap items-center gap-2"><span className="text-[10px] text-slate-500">Khoá lúc dựng · chấm sau 5 và 10 phiên trong sổ theo dõi</span>
          <SectionControls id="elite-portfolio-table" open={pf.open} compact={pf.compact} onToggleOpen={pf.toggleOpen} onToggleCompact={pf.toggleCompact} testid="elite-portfolio" /></span>}>
        {!pf.open ? (
          <p className="text-[10.5px] text-slate-400" data-testid="elite-portfolio-summary">
            {d.portfolio.map((p) => (
              <button key={p.ticker} type="button" onClick={() => onOpenTicker(p.ticker)} className="mr-2 font-bold text-cyan-300 hover:underline">
                {p.ticker} <span className="font-normal text-slate-500">{num(p.weight * 100)}% · {buyCells.get(p.ticker)?.text ?? "—"}</span>
              </button>
            ))}
          </p>
        ) : (<>
        <div className="overflow-x-auto" id="elite-portfolio-table">
          <table className="w-full text-[11px]" style={{ minWidth: pf.compact ? 0 : 900, borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-slate-500">
                <th className="text-left font-normal py-1">Mã</th><th className="text-left font-normal">Ngành</th><th className="text-left font-normal">Tỷ trọng</th>
                <th className="text-left font-normal pr-2" data-testid="elite-buy-col" title={`Thời điểm mua tốt nhất trong kỳ nắm giữ ${ELITE_HOLD_SESSIONS} phiên: vùng mua mùa vụ ĐẠT KIỂM ĐỊNH (Timeline điểm mua — cổ tức / KQKD) nếu có, ngược lại quy tắc danh mục (mở cửa phiên kế tiếp)`}>⏱ Điểm mua</th>
                <th className="font-normal" title="Điểm Elite chuẩn hoá trên toàn vũ trụ">Z</th>
                {!pf.compact && <th className="font-normal" title="Lợi suất vượt kỳ vọng 5 phiên = IC × σ5 × Z (Grinold–Kahn)">α 5 phiên</th>}
                <th className="font-normal" title="Xác suất vượt trung vị vũ trụ trong 5 phiên">P vượt</th>
                {!pf.compact && <th className="font-normal" title="Đóng góp rủi ro Euler trong danh mục (ERC: các mã bằng nhau trước khi áp trần)">Rủi ro</th>}
                <th className="text-right font-normal">Giá</th><th className="text-right font-normal">Cắt lỗ</th>
                {!pf.compact && <th className="text-right font-normal">Mục tiêu</th>}
                {!pf.compact && <th className="text-left font-normal pl-3">Động lực chính</th>}
              </tr>
            </thead>
            <tbody>
              {d.portfolio.map((p: PortfolioPick) => (
                <tr key={p.ticker} className="border-t border-white/5" data-testid={`elite-pick-${p.ticker}`}>
                  <td className="py-1.5 whitespace-nowrap"><button type="button" onClick={() => onOpenTicker(p.ticker)} className="font-bold text-cyan-300 hover:underline">{p.ticker}</button>{p.retained && <span title="Giữ từ danh mục phiên trước (vùng đệm top 20)" className="ml-1 rounded border border-white/15 px-1 text-[8.5px] text-slate-400">giữ</span>}</td>
                  <td className="text-slate-400">{secName(p.sectorKey)}</td>
                  <td className="whitespace-nowrap">
                    <span aria-hidden="true" className="mr-1.5 inline-block h-1.5 rounded bg-cyan-400/70 align-middle" style={{ width: `${(p.weight / maxW) * 48}px` }} />
                    <b>{num(p.weight * 100)}%</b>
                  </td>
                  <td className="pr-2 py-1" data-testid={`elite-buy-${p.ticker}`}><BuyTimingCell cell={buyCells.get(p.ticker)} compact={pf.compact} /></td>
                  <td className="text-center font-mono">{num(p.Z, 2)}</td>
                  {!pf.compact && <td className="text-center font-mono text-emerald-300">{signed(p.alpha5Pct, 2)}%</td>}
                  <td className="text-center font-mono">{num(p.pOutperform * 100, 1)}%</td>
                  {!pf.compact && <td className="text-center font-mono text-slate-300">{p.riskContribution != null ? `${num(p.riskContribution * 100)}%` : "—"}</td>}
                  <td className="text-right font-mono">{price(p.close)}</td>
                  <td className="text-right font-mono text-rose-300">{price(p.stop)}</td>
                  {!pf.compact && <td className="text-right font-mono text-emerald-300">{price(p.target)}</td>}
                  {!pf.compact && <td className="pl-3 text-slate-400">{drivers(p.ticker).join(" · ") || "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-500" data-testid="elite-buy-note">
          ⏱ Điểm mua: <span className="text-emerald-300">● trong vùng mua</span> / <span className="text-amber-300">⏱ ≤ 5 phiên</span> / <span className="text-sky-300">⏱ trong {ELITE_HOLD_SESSIONS} phiên</span> = vùng mùa vụ cổ tức · KQKD ĐẠT KIỂM ĐỊNH
          (Timeline điểm mua, tab Cổ tức); <span className="text-slate-300">→ Mở cửa dd/mm</span> = quy tắc danh mục khi không có vùng phù hợp; ◌ = vùng gần đạt (chưa qua kiểm định).{" "}
          {buy.data ? <>Timeline lấy lúc {buyAge}{buy.meta?.stale ? <b className="text-amber-300"> · CŨ — Project A tạm lỗi, đang dùng bản gần nhất (số phiên đã tính lại theo hôm nay)</b> : ""}.</>
            : buy.loading ? "Đang tải Timeline…" : <b className="text-amber-300">Timeline điểm mua tạm không có ({buy.meta?.lastError ?? buy.error ?? "lỗi"}) — cột dùng quy tắc danh mục.</b>}
        </p>
        <p className="text-[10px] leading-relaxed text-slate-500">
          {d.construction
            ? <>Vùng đệm: giữ mã phiên trước còn trong top 20 ({d.construction.retained}/{d.construction.previous} mã được giữ{d.construction.turnover != null ? `, vòng quay ${num(d.construction.turnover * 100, 0)}%` : ""}), lấp phần còn lại theo Z; tối đa 3 mã mỗi ngành ICB cấp 2. Tỷ trọng {d.construction.method === "erc" ? `cân bằng đóng góp rủi ro (ERC) trên hiệp phương sai Ledoit–Wolf ${d.construction.sessions} phiên` : "tỷ lệ nghịch biến động 20 phiên (chưa đủ dữ liệu cho ERC)"}, trần 20%. </>
            : <>Chọn theo Z giảm dần, tối đa 3 mã mỗi ngành ICB cấp 2; tỷ trọng tỷ lệ nghịch biến động 20 phiên (trần 20%). </>}
          Cắt lỗ / mục tiêu là dải
          2σ / 3σ của 5 phiên, nắm giữ 10 phiên — quy tắc mô tả, chưa tối ưu. Lợi thế kỳ vọng nhỏ (P vượt ≈ 51%): dùng để nghiêng tỷ trọng, không phải tín hiệu chắc thắng.
        </p>
        </>)}
        <EliteCandidates d={d} onOpenTicker={onOpenTicker} sectorName={secName} drivers={drivers} buyRows={buy.data?.rows ?? null} sessions={buy.sessions} />
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Tín hiệu có trọng số (bậc A/B)" testId="elite-weights" right={<span className="text-[10px] text-slate-500" title="IC của tổ hợp = Σw·IC / √(wᵀC̃w) — ước tính mô hình; IC thực đo nằm ở sổ theo dõi">IC tổng (mô hình) ≈ {num(d.icComb, 4)}</span>}>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 420 }}>
              <thead><tr className="text-slate-500"><th className="text-left font-normal">Tín hiệu</th><th className="font-normal">Bậc</th><th className="font-normal" title="IC đo được ở kỳ hạn chính (số ngày)">IC đo</th><th className="font-normal" title="(n·IC đo + 60·tiên nghiệm)/(n + 60)">IC hậu nghiệm</th><th className="font-normal" title="Trọng số nếu chỉ ∝ IC (bỏ qua tương quan giữa tín hiệu)">∝ IC</th><th className="text-left font-normal" title="Trọng số theo tương quan: C̃⁻¹·IC, C̃ = 0,5·C + 0,5·I">Trọng số</th></tr></thead>
              <tbody>
                {d.weights.map((w) => (
                  <tr key={w.id} className="border-t border-white/5">
                    <td className="py-1"><span className="text-slate-100">{w.labelVi}</span> <span className="text-slate-500">· {w.tab}</span></td>
                    <td className="text-center"><TierChip tier={w.tier} /></td>
                    <td className="whitespace-nowrap text-center font-mono" title={w.icPrior === 0 ? "Tiên nghiệm 0: tín hiệu nhắm phiên VN ngay sau phiên Mỹ, đã qua khi danh mục vào lệnh (E3-v3)" : undefined}>{w.n ? `${signed(w.icMeas, 4)} (${w.n} ngày)` : w.icPrior === 0 ? "chưa đo · tiên nghiệm 0" : "chưa đo"}</td>
                    <td className="text-center font-mono">{num(w.icPost, 4)}</td>
                    <td className="text-center font-mono text-slate-500">{w.wNaive != null ? `${num(w.wNaive * 100, 0)}%` : "—"}</td>
                    <td className="whitespace-nowrap"><span aria-hidden="true" className="mr-1.5 inline-block h-1.5 rounded bg-emerald-400/70 align-middle" style={{ width: `${w.w * 80}px` }} />{num(w.w * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {d.signalWeighting?.method === "correlation" && (
            <p className="text-[10px] text-slate-400" data-testid="elite-weighting-note">
              Trọng số tính đến tương quan giữa các tín hiệu trên {d.signalWeighting.corr?.names} mã (co rút {num((d.signalWeighting.corr?.shrink ?? 0) * 100, 0)}% về độc lập): tín hiệu trùng thông tin (VD Stealth 5 và Stealth 20) không bị đếm hai lần.
            </p>
          )}
          <p className="text-[10px] text-slate-500">Tín hiệu bậc C (Smart Score, bộ lọc kỹ thuật, RRG, xúc tác…) chỉ làm bối cảnh trong Hồ sơ 360°, không có trọng số — theo E2/E3 đăng ký trước.</p>
        </Card>

        <Card title="Sổ theo dõi tiến" testId="elite-ledger">
          {lab ? (
            <div className="space-y-1.5 text-[11px]">
              <p className="text-slate-300">{lab.labelVi}</p>
              {(["5", "10"] as const).map((h) => {
                const x = lab.horizons[h];
                return (
                  <p key={h} className="text-slate-400">
                    Kỳ hạn {h} phiên: {x && x.n > 0
                      ? <>{x.n} phiên đã chấm · vượt rổ đều TB <b className="text-slate-100">{signed((x.meanExcess ?? 0) * 100, 2)}%</b> · tỷ lệ thắng {num((x.hitRate ?? 0) * 100, 0)}% · IC TB {signed(x.ic.mean, 3)}</>
                      : "chưa có phiên nào đủ kỳ hạn để chấm."}
                  </p>
                );
              })}
              <p className="text-[10px] text-slate-500">
                Tiêu chí (E3-prereg): IC TB của Z ở 5 phiên &gt; 0 với t ≥ 2, và lợi suất vượt rổ đều sau phí ở 10 phiên &gt; 0 với cận dưới KTC 95% &gt; 0, sau ≥ 60 phiên tiến. Chi phí giả định 0,40%/vòng.
              </p>
            </div>
          ) : <p className="text-[11px] text-slate-500">Sổ theo dõi chưa có bản ghi.</p>}
        </Card>
      </div>
      <p className="text-[10px] text-slate-500">Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
