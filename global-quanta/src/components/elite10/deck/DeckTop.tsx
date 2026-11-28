// Command Deck — Z1 thanh lệnh, Z2 bốn đồng hồ bối cảnh, Z3 dải "Hôm nay". Chỉ trình bày trường có sẵn (tài liệu Apex-HL/04 §2).
// Giữ các data-testid của khối KPI / bối cảnh cũ (hl-kpi-*, hl-context-global, hl-alloc, elite-label) trên phần tử tương ứng.
import type { ReactNode } from "react";
import type { EliteDecision, EliteRisk } from "../../../lib/elite10/decisionTypes";
import { breadthTone, ledgerSeal, REGIME_BREADTH, VIX_SCALE, vixPos } from "../../../lib/elite10/deckModel";
import type { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import { AllocationBar } from "../center/HlPricePosition";
import { fmtDate, num, signed } from "../center/boardParts";
import { DeckLabel, EvidenceSeal, Scale } from "./parts";
import { hlCadenceVi } from "../../../lib/elite10/hlCadence";

type WS = ReturnType<typeof useWorldStrategy>["data"];
const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${num(v * 100, d)}%`);

export function CommandBar({ d }: { d: EliteDecision }) {
  const hl = d.hl!, live = d.freshness?.sessionsBehind === 0, seal = ledgerSeal(d.ledgerSummary);
  return (
    <header className="deck-cmd flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3" data-testid="deck-command">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-q-accent/30 bg-[#1E273D]" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 1 L19 10 L10 19 L1 10 Z" fill="none" stroke="#4f8ef7" strokeWidth="1.5" /><circle cx="10" cy="10" r="2.6" fill="#4f8ef7" /></svg>
        </span>
        <div>
          <p className="text-[17px] font-bold tracking-wide text-slate-50" style={{ fontFamily: "var(--q-font-sans)" }}>Bảng quyết định Elite HL — phiên {fmtDate(d.date)}</p>
          <p className="text-[11px] text-slate-400">Danh mục chính thức dựng trên Hợp lưu đa yếu tố · {hl.version} · khoá lúc {new Date(d.builtAt).toLocaleString("vi-VN", { hour12: false })} · khớp tham chiếu ở giá đóng cửa phiên kế tiếp</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-slate-400" title={live ? "Dữ liệu của phiên mới nhất" : `Chậm ${d.freshness?.sessionsBehind ?? "?"} phiên so với lịch giao dịch`} data-testid="deck-live">
          <span className={`inline-block h-[7px] w-[7px] rounded-full ${live ? "deck-live" : "bg-slate-500"}`} />{live ? "Phiên mới nhất" : `Chậm ${d.freshness?.sessionsBehind ?? "?"} phiên`}
        </span>
        <EvidenceSeal seal={seal} testId="elite-label" />
      </div>
    </header>
  );
}

function Meter({ label, big, tone, children, testId }: { label: string; big: ReactNode; tone?: string; children: ReactNode; testId: string }) {
  return (
    <div className="deck-panel rounded-xl p-3" data-testid={testId}>
      <DeckLabel>{label}</DeckLabel>
      <p className="mt-1 text-[22px] font-bold leading-tight" style={{ fontFamily: "var(--q-font-sans)", color: tone ?? "var(--text-primary)" }}>{big}</p>
      {children}
    </div>
  );
}

export function MissionMeters({ d, ws, risk }: { d: EliteDecision; ws: WS; risk: EliteRisk | null | undefined }) {
  const hl = d.hl!, m = hl.market, pz = hl.pz ?? null, b = m?.breadth ?? null, bt = breadthTone(b);
  const v95 = risk?.available ? risk.var?.["0.95"]?.historical : undefined;
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Bối cảnh" data-testid="deck-meters">
      <Meter label="Thị trường Việt Nam" testId="hl-kpi-market" big={m?.regimeVi ?? "—"} tone={m?.regime === "UP" ? "#10B981" : m?.regime === "WEAK" ? "#F43F5E" : undefined}>
        <p className="text-[11px] text-slate-400">{m ? <>Độ rộng {num(m.breadth, 0)}% mã trên MA20{m.guard ? <b className="text-rose-300"> · chốt chặn sụp động lượng đang bật</b> : ""} — chỉ là bối cảnh, không đổi quy tắc</> : "Chưa có trạng thái thị trường của phiên"}</p>
        <Scale value={(b ?? 0) / 100} fill={bt === "neg" ? "#F43F5E" : bt === "pos" ? "#10B981" : "#F59E0B"} ticks={[{ at: REGIME_BREADTH.down / 100, label: String(REGIME_BREADTH.down) }, { at: REGIME_BREADTH.up / 100, label: String(REGIME_BREADTH.up) }]} title="Độ rộng = % mã có giá trên MA20. Vạch 35 / 65 = ngưỡng phân loại thị trường (kèm điều kiện MA của VN-Index)." />
      </Meter>
      <Meter label="Rủi ro toàn cầu" testId="hl-context-global" big={ws ? <span className="num">VIX {num(ws.regime.vix, 2)}</span> : "—"} tone={ws?.regime.stressed ? "#F59E0B" : undefined}>
        <p className="text-[11px] text-slate-400">{ws ? <>{ws.regime.stressed ? <b className="text-amber-300">Căng thẳng</b> : <b className="text-slate-100">Bình thường</b>} · phiên {signed(ws.regime.vixChg, 1)}% <span className="text-slate-500">— Rủi ro toàn cầu là bối cảnh, không đổi quy tắc</span></> : "Rủi ro toàn cầu: chưa có dữ liệu"}</p>
        <Scale value={vixPos(ws?.regime.vix)} fill="linear-gradient(90deg,#10B981,#F59E0B 40%,#F43F5E)" ticks={[{ at: (VIX_SCALE.stress - VIX_SCALE.min) / (VIX_SCALE.max - VIX_SCALE.min), label: String(VIX_SCALE.stress) }, { at: (VIX_SCALE.high - VIX_SCALE.min) / (VIX_SCALE.max - VIX_SCALE.min), label: String(VIX_SCALE.high) }]} title="Căng thẳng khi VIX ≥ 20 hoặc tăng ≥ 15% trong phiên" />
      </Meter>
      <Meter label="Triển khai vốn" testId="hl-kpi-invested" big={<span className="num">{pct(hl.invested)}<span className="ml-1 text-[12px] font-normal text-slate-400" style={{ fontFamily: "var(--font-body)" }}>cổ phiếu</span></span>}>
        {pz ? <p className="mt-1 text-[11px] text-slate-400" data-testid="hl-kpi-split">Chính <b className="text-q-accent-strong">{pct(pz.coreWeight)}</b> · Chạy lãi <b className="text-violet-200">{pct(pz.runnerWeight)}</b> · Tiền mặt <b className="text-slate-200">{pct(hl.cash)}</b><AllocationBar core={pz.coreWeight ?? 0} runner={pz.runnerWeight ?? 0} cash={hl.cash} testId="hl-alloc" /></p>
          : <p className="mt-1 text-[11px] text-slate-400">Tiền mặt <b className="text-slate-200">{pct(hl.cash)}</b> — ô trống không lấy mã yếu cho đủ số</p>}
      </Meter>
      <Meter label={`Rủi ro danh mục${risk?.available && risk.sessions ? ` · ${risk.sessions} phiên` : ""}`} testId="deck-risk" big={risk?.available && risk.volatility ? <span className="num">{pct(risk.volatility.annual)}<span className="ml-1 text-[12px] font-normal text-slate-400" style={{ fontFamily: "var(--font-body)" }}>biến động năm</span></span> : "—"}>
        {risk?.available ? (
          <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
            <dt>VaR 95% 1 phiên (lịch sử)</dt><dd className="num text-right text-slate-100">{pct(v95?.var, 2)}</dd>
            <dt>CVaR 95%</dt><dd className="num text-right text-slate-100">{pct(v95?.cvar, 2)}</dd>
            <dt>Beta với VN-Index</dt><dd className="num text-right text-slate-100">{num(risk.beta, 2)}</dd>
            <dt>Số mã hiệu dụng</dt><dd className="num text-right text-slate-100">{num(risk.diversification?.effectiveN, 1)}</dd>
            <dt>Sụt giảm lớn nhất</dt><dd className="num text-right text-rose-300">{risk.maxDrawdown?.value == null ? "—" : `${signed(risk.maxDrawdown.value * 100, 1)}%`}</dd>
          </dl>
        ) : <p className="mt-1 text-[11px] text-slate-500">{risk?.reasonVi ?? "Chưa tính được rủi ro danh mục."}</p>}
      </Meter>
    </section>
  );
}

export function TodayRibbon({ d }: { d: EliteDecision }) {
  const hl = d.hl!, ch = hl.changes, r = hl.rule, f = hl.funnel, pz = hl.pz ?? null, cnt = pz?.counts, dil = Object.keys(d.dilution?.byTicker ?? {});
  const total = cnt ? Object.values(cnt).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const item = "flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-slate-400";
  return (
    <section className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-white/10 border-l-[3px] border-l-[#4f8ef7] bg-[#0E131F] px-4 py-2.5" aria-label="Hôm nay" data-testid="deck-today">
      <span className="text-[10px] font-semibold uppercase tracking-[.12em] text-q-accent-strong" style={{ fontFamily: "var(--q-font-sans)" }}>Hôm nay</span>
      <span className={item} data-testid="hl-kpi-rebalance"><b className={hl.dataGuard?.frozen ? "text-rose-300" : hl.rebalance ? "text-emerald-300" : "text-slate-100"}>{hl.dataGuard?.frozen ? "Giữ nguyên" : hl.rebalance ? "Phiên cân bằng" : "Chỉ xét ra"}</b>
        <span>— {hl.dataGuard?.frozen ? "Chốt dữ liệu đang bật: không vào, không ra" : hl.rebalance ? `${hlCadenceVi(hl).v11 ? "phiên vào lệnh" : "phiên đầu tuần"}: được nhận mã mới vào ô trống` : `mã mới chỉ vào ở ${hlCadenceVi(hl).next}`}</span></span>
      <span className={item} data-testid="hl-kpi-names"><b className="num text-slate-100">{f.held} / {r.slots}</b> mã · {ch.added.length || ch.exits.length ? `vào ${ch.added.length} · ra ${ch.exits.length} · giữ ${ch.kept}` : `giữ nguyên ${ch.kept} mã`}
        {pz && <span className="text-slate-500">(<span data-testid="hl-kpi-lanes">{pz.coreNames} chính · {pz.runnerNames} chạy lãi</span>)</span>}</span>
      {cnt && <span className={item} title={`Trạng thái vị trí giá PZ-v2 của ${total} mã: các mã đạt tầng 1 cộng mã đang giữ — mô tả (PZ-r2 KHÔNG ĐẠT)`} data-testid="deck-pz-counts">Vị trí giá ({total} mã): Vùng mua <b className="num text-slate-100">{cnt.BUY_ZONE ?? 0}</b> · Trong nền <b className="num text-slate-100">{cnt.IN_BASE ?? 0}</b> · Tăng nóng <b className="num text-slate-100">{cnt.EXTENDED ?? 0}</b> · Hạ nhiệt <b className="num text-slate-100">{cnt.COOLING ?? 0}</b></span>}
      <span className={item}>Pha loãng đang theo dõi <b className="num text-slate-100">{dil.length}</b>{dil.length ? ` (${dil.join(", ")})` : ""}</span>
      <span className={item} data-testid="hl-kpi-turnover">Xoay vòng <b className="num text-slate-100">{ch.turnover == null ? "—" : pct(ch.turnover, 0)}</b> · phí ước tính <b className="num text-slate-100">{pct(ch.costEst, 2)}</b> <span className="text-slate-500">(mua {pct(r.costBuy, 2)}, bán {pct(r.costSell, 2)})</span></span>
    </section>
  );
}
