// E4-HL (12/11/2026) — BẢNG QUYẾT ĐỊNH ELITE HL: danh mục chính thức dựng trên quy tắc Hợp lưu đa yếu tố HL-v1 (cấu trúc G2r).
// Bố cục: dải chỉ số -> phễu chọn lọc -> thay đổi hôm nay -> danh mục (ba tầng, ngưỡng ra) -> phân bổ ngành + hàng chờ -> quy tắc,
// kết quả K0 và sổ theo dõi tiến so với danh mục dòng tiền (cũ). Mọi số đến từ Gateway /api/elite/decision; nhãn THĂM DÒ luôn hiện.
import { Fragment, useMemo, useState } from "react";
import { HL_TA_LABELS, HL_VOTE_LABELS } from "../../../lib/elite10/confluence";
import { useWorldStrategy } from "../../../hooks/useWorldStrategy";
import type { EliteDecision, HlClassCode, LedgerSummary, PortfolioPick } from "../../../lib/elite10/decisionTypes";
import { fmtDate, num, price, signed } from "./boardParts";
import HlLedgerNote from "./HlLedgerNote";

const CLS_VI: Record<HlClassCode, string> = { STRONG: "Hợp lưu mạnh", CONFLUENCE: "Hợp lưu", T1_SECTOR_AGAINST: "Ngành phản đối", T1_SECTOR_NA: "Chưa có RRG", NOT_T1: "Đã rời tầng 1" };
const CLS_TONE: Record<HlClassCode, string> = {
  STRONG: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200", CONFLUENCE: "border-emerald-400/40 text-emerald-300",
  T1_SECTOR_AGAINST: "border-amber-400/50 text-amber-300", T1_SECTOR_NA: "border-amber-400/30 text-amber-200", NOT_T1: "border-slate-500/50 text-slate-300",
};
const RRG_VI: Record<string, string> = { "2": "Dẫn dắt", "1": "Cải thiện", "-1": "Suy yếu", "-2": "Tụt hậu" };
const RRG_TONE: Record<string, string> = { "2": "text-emerald-300", "1": "text-emerald-200", "-1": "text-amber-300", "-2": "text-rose-300" };
const pct = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : `${num(v * 100, d)}%`);
const pts = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

function Tile({ label, children, sub, testId }: { label: string; children: React.ReactNode; sub?: React.ReactNode; testId: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0E131F] px-3 py-2" data-testid={testId}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-[17px] font-bold leading-tight text-slate-100">{children}</p>
      {sub && <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{sub}</p>}
    </div>
  );
}
function Panel({ title, right, children, testId }: { title: string; right?: React.ReactNode; children: React.ReactNode; testId: string }) {
  return (
    <section data-testid={testId} className="rounded-lg border border-white/10 bg-[#0E131F] p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-[#F5CE72]">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}
/** Thanh ngang: phần tô = value / max; `mark` = vạch ngưỡng (0–1). */
function Bar({ value, max, tone = "bg-emerald-400/70", mark, width = 64 }: { value: number; max: number; tone?: string; mark?: number; width?: number }) {
  return (
    <span aria-hidden="true" className="relative inline-block h-1.5 overflow-hidden rounded bg-white/10 align-middle" style={{ width }}>
      <span className={`absolute inset-y-0 left-0 rounded ${tone}`} style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%` }} />
      {mark != null && <span className="absolute inset-y-0 w-px bg-rose-300" style={{ left: `${mark * 100}%` }} />}
    </span>
  );
}
/** N2 — thẻ "Vì sao": điều kiện tầng 1, phiếu tầng 3, ba ngưỡng ra và lãi/lỗ từ phiên khoá của một vị thế. */
function HlWhy({ p, exitLsPct, mobile = false }: { p: PortfolioPick; exitLsPct: number; mobile?: boolean }) {
  const h = p.hl!;
  const ta = Object.entries(h.ta ?? {}), votes = Object.entries(h.votes ?? {});
  const voteTone = (v: number | null) => (v == null ? "border-white/10 text-slate-500" : v > 0 ? "border-emerald-400/40 text-emerald-300" : v < 0 ? "border-rose-400/40 text-rose-300" : "border-white/15 text-slate-400");
  return (
    <div className="grid grid-cols-1 gap-2 rounded-md border border-[#E8B84B]/25 bg-[#E8B84B]/[0.04] p-2 text-[11px] md:grid-cols-4" data-testid={`hl-why${mobile ? "-m" : ""}-${p.ticker}`}>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Tầng 1 · dẫn dắt + mô hình TA</p>
        <p className="text-slate-300">LS-v1 phân vị <b className="text-slate-100">{num(h.lsPct, 0)}</b> <span className="text-slate-500">· {h.lsPts} điểm</span></p>
        {ta.length === 0 ? <p className="text-slate-500">Chưa có chi tiết mô hình TA cho phiên này.</p> : (
          <ul className="mt-0.5 space-y-0.5">
            {ta.map(([sig, ok]) => <li key={sig} className={ok === true ? "text-emerald-300" : ok === false ? "text-slate-500" : "text-slate-600"}>{ok === true ? "✓" : ok === false ? "✗" : "·"} {HL_TA_LABELS[sig] ?? sig}{ok === null ? " — chưa có dữ liệu" : ""}</li>)}
          </ul>
        )}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Tầng 3 · từng phiếu của các tab</p>
        {votes.length === 0 ? <p className="text-slate-500">Chưa có chi tiết phiếu cho phiên này.</p> : (
          <p className="flex flex-wrap gap-1">
            {votes.map(([id, v]) => <span key={id} title={HL_VOTE_LABELS[id]?.tab} className={`rounded border px-1 py-px text-[10px] ${voteTone(v)}`}>{v == null ? "·" : pts(v)} {HL_VOTE_LABELS[id]?.label ?? id}</span>)}
          </p>
        )}
        <p className="mt-1 text-[10px] text-slate-500">"·" = tab đó chưa có dữ liệu cho mã, không tính điểm.</p>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Ba ngưỡng ra</p>
        <ul className="space-y-0.5 text-slate-300">
          <li>LS-v1: {h.exitBufferLs == null ? "—" : <>còn cách <b className="text-slate-100">{num(h.exitBufferLs, 0)}</b> điểm phân vị</>} <span className="text-slate-500">(ra khi &lt; {exitLsPct})</span></li>
          <li>Mô hình TA: đang đạt <b className="text-slate-100">{h.taCount}</b> <span className="text-slate-500">(ra khi còn 0)</span></li>
          <li>Ngành: <b className={RRG_TONE[String(h.rrg)] ?? "text-slate-300"}>{h.rrg == null ? "chưa có RRG" : RRG_VI[String(h.rrg)]}</b> <span className="text-slate-500">(ra khi Tụt hậu)</span></li>
        </ul>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-500">Từ phiên khoá</p>
        <p className="text-slate-300">Vào danh mục: <b className="text-slate-100">{fmtDate(h.since)}</b></p>
        <p className="text-slate-300">Giá tham chiếu: <span className="font-mono">{price(h.ref)}</span> → <span className="font-mono">{price(p.close)}</span></p>
        <p className="text-slate-300">Thay đổi: {h.sinceRet == null ? "—" : <b className={h.sinceRet > 0 ? "text-emerald-300" : h.sinceRet < 0 ? "text-rose-300" : "text-slate-100"}>{signed(h.sinceRet * 100, 1)}%</b>} <span className="text-[10px] text-slate-500">(đóng cửa điều chỉnh; khớp thật ở phiên kế tiếp)</span></p>
      </div>
    </div>
  );
}
const ledgerLine = (s: LedgerSummary | null | undefined, h: "5" | "10") => {
  const x = s?.horizons?.[h];
  return x && x.n > 0 ? <>{x.n} phiên · vượt rổ đều <b className={x.meanExcess != null && x.meanExcess > 0 ? "text-emerald-300" : "text-rose-300"}>{signed((x.meanExcess ?? 0) * 100, 2)}%</b> · thắng {num((x.hitRate ?? 0) * 100, 0)}%</> : <span className="text-slate-500">chưa có phiên nào đủ kỳ hạn</span>;
};

export default function EliteHlBoard({ d, onOpenTicker, switcher, refreshError = null }: { d: EliteDecision; onOpenTicker: (ticker: string) => void; switcher?: React.ReactNode; refreshError?: string | null }) {
  const hl = d.hl!;
  const { data: ws } = useWorldStrategy();
  const sectorName = useMemo(() => new Map((ws?.short.rows ?? []).map((r) => [r.icb, r.nameVi])), [ws]);
  const secName = (k: string | null | undefined) => (k ? sectorName.get(k) ?? k : "—");
  const f = hl.funnel, r = hl.rule, ch = hl.changes;
  const [why, setWhy] = useState<string | null>(null);
  const whyBtn = (t: string, mobile = false) => <button type="button" aria-expanded={why === t} onClick={() => setWhy(why === t ? null : t)} data-testid={`hl-why-btn${mobile ? "-m" : ""}-${t}`} className="ml-1 min-h-[22px] rounded border border-white/15 px-1.5 text-[10px] text-slate-300 hover:border-[#E8B84B]/50 hover:text-[#F5CE72]">{why === t ? "▾ Vì sao" : "▸ Vì sao"}</button>;
  const steps: [string, number, string][] = [
    ["Bảng tín hiệu", f.panel, "mã có tín hiệu trong phiên"],
    ["Giao dịch được", f.tradable, `GTGD TB20 ≥ ${r.minAdvBn} tỷ, giá ≥ 5.000đ, giá không bị neo`],
    ["Đạt tầng 1", f.tier1, "LS-v1 top 20% và ≥ 2 mô hình TA"],
    ["Hợp lưu", f.selected, "tầng 1 + RRG ngành Cải thiện / Dẫn dắt"],
    ["Hợp lưu giao dịch được", f.selectedTradable, "đủ thanh khoản để vào danh mục"],
    ["Danh mục", f.held, `tối đa ${r.slots} mã, ${r.maxPerSector} mã / ngành`],
  ];
  const openBtn = (t: string) => <button type="button" onClick={() => onOpenTicker(t)} data-testid={`hl-open-${t}`} className="font-bold text-[#F5CE72] hover:underline">{t}</button>;

  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="elite-hl-board">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-bold text-[#F5CE72]">Bảng quyết định Elite HL — phiên {fmtDate(d.date)}</p>
          <p className="text-[10.5px] text-slate-400">Danh mục chính thức dựng trên Hợp lưu đa yếu tố · {hl.version} · khoá lúc {new Date(d.builtAt).toLocaleString("vi-VN", { hour12: false })} · khớp tham chiếu ở giá đóng cửa phiên kế tiếp</p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          {switcher}
          <span title={hl.labelVi} className="rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300" data-testid="elite-label">THĂM DÒ</span>
        </span>
      </div>

      {refreshError && (
        <div role="alert" className="rounded-lg border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-[11.5px] text-amber-100" data-testid="hl-refresh-error">
          <b>Không làm mới được dữ liệu</b> ({refreshError}). Bảng đang hiện bản của phiên {fmtDate(d.date)}, dựng lúc {new Date(d.builtAt).toLocaleString("vi-VN", { hour12: false })} — có thể chưa phải phiên mới nhất.
        </div>
      )}
      {hl.dataGuard?.frozen ? (
        <div role="alert" className="rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-200" data-testid="hl-data-guard">
          <b>Dữ liệu phiên không đủ — danh mục giữ nguyên, không vào và không ra.</b> {hl.dataGuard.reasonsVi.join(" · ")}. Quy tắc sẽ được áp lại ở phiên có đủ dữ liệu.
        </div>
      ) : (
        <p className="text-[10.5px] text-slate-400" data-testid="hl-data-ok"><span className="mr-1 text-emerald-300">●</span>Dữ liệu phiên đủ nguồn: LS-v1, mô hình TA, RRG ngành.</p>
      )}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5" data-testid="hl-kpis">
        <Tile label="Số mã" testId="hl-kpi-names" sub={ch.added.length || ch.exits.length ? `vào ${ch.added.length} · ra ${ch.exits.length} · giữ ${ch.kept}` : `giữ nguyên ${ch.kept} mã`}>{f.held}<span className="text-[12px] font-normal text-slate-500"> / {r.slots}</span></Tile>
        <Tile label="Tỷ lệ cổ phiếu" testId="hl-kpi-invested" sub={<>Tiền mặt <b className="text-slate-200">{pct(hl.cash)}</b> — ô trống không lấy mã yếu cho đủ số</>}>
          {pct(hl.invested)} <Bar value={hl.invested} max={1} tone="bg-[#E8B84B]/80" width={56} />
        </Tile>
        <Tile label="Thị trường" testId="hl-kpi-market" sub={hl.market ? <>Độ rộng {num(hl.market.breadth, 0)}%{hl.market.guard ? <b className="text-rose-300"> · chốt chặn sụp đổ đang bật</b> : ""} — chỉ là bối cảnh, không đổi quy tắc</> : "Chưa có trạng thái thị trường của phiên"}>
          <span className={hl.market?.regime === "UP" ? "text-emerald-300" : hl.market?.regime === "WEAK" ? "text-rose-300" : "text-slate-100"}>{hl.market?.regimeVi ?? "—"}</span>
        </Tile>
        <Tile label="Nhịp cân bằng" testId="hl-kpi-rebalance" sub={hl.dataGuard?.frozen ? "Chốt dữ liệu đang bật: không vào, không ra" : hl.rebalance ? "Phiên đầu tuần: được nhận mã mới vào ô trống" : "Mã mới chỉ vào ở phiên đầu tuần kế tiếp; hôm nay chỉ xét ra"}>
          <span className={hl.dataGuard?.frozen ? "text-rose-300" : hl.rebalance ? "text-emerald-300" : "text-slate-100"}>{hl.dataGuard?.frozen ? "Giữ nguyên" : hl.rebalance ? "Phiên cân bằng" : "Chỉ xét ra"}</span>
        </Tile>
        <Tile label="Xoay vòng phiên" testId="hl-kpi-turnover" sub={<>Phí ước tính <b className="text-slate-200">{pct(ch.costEst, 2)}</b> giá trị danh mục (mua {pct(r.costBuy, 2)}, bán {pct(r.costSell, 2)})</>}>{ch.turnover == null ? "—" : pct(ch.turnover, 0)}</Tile>
      </div>

      <Panel title="Phễu chọn lọc" testId="hl-funnel" right={<span className="text-[10px] text-slate-500">Thứ tự ưu tiên: tầng 1 → RRG ngành → tích điểm các tab</span>}>
        <ol className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
          {steps.map(([label, n, tip], i) => (
            <li key={label} title={tip} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5" data-testid={`hl-funnel-${i}`} data-n={n}>
              <p className="text-[10px] text-slate-500">{i + 1}. {label}</p>
              <p className="text-[15px] font-bold text-slate-100">{n}</p>
              <Bar value={n} max={f.panel || 1} tone={i === steps.length - 1 ? "bg-[#E8B84B]/80" : "bg-emerald-400/60"} width={96} />
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title={`Thay đổi hôm nay${hl.prevDate ? ` · so với phiên ${fmtDate(hl.prevDate)}` : " · phiên dựng đầu tiên"}`} testId="hl-changes">
        {!ch.added.length && !ch.exits.length ? <p className="text-[11px] text-slate-400">Danh mục giữ nguyên {ch.kept} mã. Tỷ trọng mã đang giữ không bị cân lại.</p> : (
          <ul className="space-y-1 text-[11px]">
            {ch.added.length > 0 && <li data-testid="hl-added"><b className="text-emerald-300">Vào mới ({ch.added.length}):</b> {ch.added.map((t, i) => <span key={t}>{i ? " · " : ""}{openBtn(t)}</span>)}</li>}
            {ch.exits.map((x) => <li key={x.ticker} data-testid={`hl-exit-${x.ticker}`}><b className="text-rose-300">Ra {x.ticker}</b> <span className="text-slate-400">({pct(x.weight)}{x.since ? `, giữ từ ${fmtDate(x.since)}` : ""}) — {x.reasonVi}</span></li>)}
            <li className="text-[10px] text-slate-500">Giữ {ch.kept} mã. Mã tăng sát trần ở phiên khớp thì không vào đuổi.</li>
          </ul>
        )}
      </Panel>

      <Panel title={`Danh mục Elite HL (${f.held}/${r.slots})`} testId="elite-portfolio" right={<span className="text-[10px] text-slate-500">Bấm mã để mở Hồ sơ 360°</span>}>
        {d.portfolio.length === 0 ? <p className="text-[11px] text-slate-400" data-testid="hl-empty">Không có mã nào đạt Hợp lưu và giao dịch được — danh mục đang 100% tiền mặt.</p> : (
          <>
          <ul className="space-y-1.5 md:hidden" data-testid="hl-cards">
            {d.portfolio.map((p: PortfolioPick) => {
              const h = p.hl!;
              return (
                <li key={p.ticker} className="rounded-md border border-white/10 bg-white/[0.02] p-2 text-[11px]" data-testid={`hl-card-${p.ticker}`}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span><span className="mr-1 font-mono text-slate-500">{h.rank}</span><button type="button" onClick={() => onOpenTicker(p.ticker)} className="text-[13px] font-bold text-[#F5CE72]">{p.ticker}</button> <span className={`ml-1 rounded border px-1 py-px text-[10px] font-bold ${CLS_TONE[h.cls]}`}>{CLS_VI[h.cls]}</span></span>
                    <span><b className="text-[13px] text-slate-100">{pct(p.weight)}</b> <span className={h.status === "NEW" ? "font-bold text-emerald-300" : "text-slate-400"}>{h.status === "NEW" ? "Vào mới" : `Giữ${h.since ? ` từ ${fmtDate(h.since).slice(0, 5)}` : ""}`}</span></span>
                  </div>
                  <p className="text-[10px] text-slate-500">{secName(p.sectorKey)} · GTGD {num(h.advBn, 0)} tỷ · giá {price(p.close)}</p>
                  <p className="mt-1 text-slate-300">Tầng 1 <b className="text-slate-100">{h.t1}/10</b> <span className="text-slate-500">(LS {num(h.lsPct, 0)} · TA {h.taCount}/7)</span> · <span className={RRG_TONE[String(h.rrg)] ?? "text-slate-400"}>{h.rrg == null ? "chưa có RRG" : RRG_VI[String(h.rrg)]}</span> · Tầng 3 <b className={h.t3 > 0 ? "text-emerald-300" : h.t3 < 0 ? "text-rose-300" : "text-slate-400"}>{pts(h.t3)}</b></p>
                  <p className="text-slate-400">Cách ngưỡng ra {h.exitBufferLs == null ? "—" : <b className={h.exitBufferLs < r.warnLsPct - r.exitLsPct ? "text-amber-300" : "text-slate-100"}>{signed(h.exitBufferLs, 0)}</b>} <Bar value={h.lsPct ?? 0} max={100} mark={r.exitLsPct / 100} width={72} /></p>
                  {h.warnings.map((w) => <p key={w} className="text-[10px] text-amber-300">⚠ {w}</p>)}
                  <div className="mt-1">{whyBtn(p.ticker, true)}</div>
                  {why === p.ticker && <div className="mt-1"><HlWhy p={p} exitLsPct={r.exitLsPct} mobile /></div>}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 860 }}>
              <thead>
                <tr className="text-left text-[10px] text-slate-500">
                  <th className="py-1 font-normal">Hạng</th><th className="font-normal">Mã · ngành</th><th className="font-normal">Trạng thái</th><th className="font-normal">Tỷ trọng</th>
                  <th className="font-normal" title="Tầng 1 = điểm LS-v1 (0–5) + số mô hình TA đạt (tối đa 5)">Tầng 1 · dẫn dắt + TA</th>
                  <th className="font-normal" title="Góc phần tư RRG của ngành">Tầng 2 · RRG</th><th className="font-normal" title="Tổng điểm +1 / −1 từ các tab khác">Tầng 3</th>
                  <th className="font-normal" title={`Ra khi LS-v1 xuống dưới phân vị ${r.exitLsPct}, không còn mô hình TA, hoặc ngành Tụt hậu`}>Cách ngưỡng ra</th>
                  <th className="text-right font-normal" title={`Dải tham chiếu ${r.bandSessions} phiên theo biến động — không phải lệnh`}>Giá · dải tham chiếu</th>
                </tr>
              </thead>
              <tbody>
                {d.portfolio.map((p: PortfolioPick) => {
                  const h = p.hl!;
                  return (
                    <Fragment key={p.ticker}>
                    <tr className="border-t border-white/5 align-top" data-testid={`hl-row-${p.ticker}`}>
                      <td className="py-1.5 pr-2 font-mono text-slate-400">{h.rank}</td>
                      <td className="pr-2">{openBtn(p.ticker)} <span className={`ml-1 rounded border px-1 py-px text-[10px] font-bold ${CLS_TONE[h.cls]}`}>{CLS_VI[h.cls]}</span>
                        <span className="block text-[10px] text-slate-500">{secName(p.sectorKey)} · GTGD {num(h.advBn, 0)} tỷ{whyBtn(p.ticker)}</span></td>
                      <td className="pr-2">{h.status === "NEW" ? <b className="text-emerald-300">Vào mới</b> : <span className="text-slate-300">Giữ{h.since ? <span className="text-slate-500"> từ {fmtDate(h.since).slice(0, 5)}</span> : ""}</span>}</td>
                      <td className="whitespace-nowrap pr-2"><b className="text-slate-100">{pct(p.weight)}</b> <Bar value={p.weight} max={r.wMax} tone="bg-[#E8B84B]/80" width={48} />
                        <span className="block text-[10px] text-slate-500">rủi ro {pct(p.riskContribution, 0)}</span></td>
                      <td className="whitespace-nowrap pr-2"><b className="text-slate-100">{h.t1}</b><span className="text-slate-500">/10</span> <Bar value={h.t1} max={10} width={56} />
                        <span className="block text-[10px] text-slate-500">LS phân vị {num(h.lsPct, 0)} · TA {h.taCount}/7</span></td>
                      <td className="whitespace-nowrap pr-2"><span className={RRG_TONE[String(h.rrg)] ?? "text-slate-400"}>{h.rrg == null ? "—" : RRG_VI[String(h.rrg)]}</span>
                        <span className="block text-[10px] text-slate-500">{h.t2 > 0 ? "ủng hộ" : h.t2 < 0 ? "phản đối" : "trung tính"}</span></td>
                      <td className="pr-2"><b className={h.t3 > 0 ? "text-emerald-300" : h.t3 < 0 ? "text-rose-300" : "text-slate-400"}>{pts(h.t3)}</b></td>
                      <td className="pr-2">
                        <span className="whitespace-nowrap">{h.exitBufferLs == null ? "—" : <><b className={h.exitBufferLs < r.warnLsPct - r.exitLsPct ? "text-amber-300" : "text-slate-100"}>{signed(h.exitBufferLs, 0)}</b> <Bar value={h.lsPct ?? 0} max={100} mark={r.exitLsPct / 100} tone={h.exitBufferLs < r.warnLsPct - r.exitLsPct ? "bg-amber-400/70" : "bg-emerald-400/60"} width={56} /></>}</span>
                        {h.warnings.map((w) => <span key={w} className="block text-[10px] text-amber-300" data-testid={`hl-warn-${p.ticker}`}>⚠ {w}</span>)}
                      </td>
                      <td className="whitespace-nowrap text-right font-mono">{price(p.close)}<span className="block text-[10px] text-slate-500">{price(p.stop)} – {price(p.target)}</span></td>
                    </tr>
                    {why === p.ticker && <tr><td colSpan={9} className="pb-2"><HlWhy p={p} exitLsPct={r.exitLsPct} /></td></tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500" data-testid="hl-sizing-note">
          Tỷ trọng đặt lúc vào = {pct(r.slotW, 0)} × biến động trung vị / biến động của mã, kẹp {pct(r.wMin, 0)}–{pct(r.wMax, 0)} (có thể nhỏ hơn khi tiền mặt hoặc trần ngành không còn đủ chỗ), và không cân lại khi đang giữ — tỷ trọng và tỷ lệ cổ phiếu trên bảng là số lúc vào, không trôi theo giá. "Cách ngưỡng ra" = phân vị LS-v1 trừ {r.exitLsPct}; vạch đỏ trên thanh là ngưỡng.
        </p>
      </Panel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Phân bổ ngành" testId="hl-sectors" right={<span className="text-[10px] text-slate-500">Trần {pct(r.sectorCap, 0)} mỗi ngành</span>}>
          {hl.sectors.length === 0 ? <p className="text-[11px] text-slate-500">Chưa có vị thế.</p> : (
            <ul className="space-y-1 text-[11px]">
              {hl.sectors.map((s) => (
                <li key={s.sectorKey} className="flex items-center gap-2" data-testid={`hl-sector-${s.sectorKey}`}>
                  <span className="w-28 shrink-0 truncate text-slate-300 sm:w-40" title={secName(s.sectorKey)}>{secName(s.sectorKey)}</span>
                  <Bar value={s.weight} max={r.sectorCap} tone={s.weight >= r.sectorCap - 0.005 ? "bg-amber-400/70" : "bg-emerald-400/60"} width={120} />
                  <b className="w-12 text-right text-slate-100">{pct(s.weight, 0)}</b><span className="whitespace-nowrap text-slate-500">{s.names} mã</span>
                </li>
              ))}
              <li className="flex items-center gap-2"><span className="w-28 shrink-0 text-slate-400 sm:w-40">Tiền mặt</span><Bar value={hl.cash} max={r.sectorCap} tone="bg-slate-400/60" width={120} /><b className="w-12 text-right text-slate-100">{pct(hl.cash, 0)}</b></li>
            </ul>
          )}
        </Panel>
        <Panel title="Hàng chờ — mã Hợp lưu chưa vào danh mục" testId="hl-queue">
          {hl.queue.length === 0 ? <p className="text-[11px] text-slate-500">Không còn mã Hợp lưu nào ngoài danh mục.</p> : (
            <ul className="space-y-0.5 text-[11px]">
              {hl.queue.map((q) => (
                <li key={q.ticker} data-testid={`hl-queue-${q.ticker}`}><span className="mr-1 font-mono text-slate-500">{q.hlRank}</span>{openBtn(q.ticker)} <span className="text-slate-500">T1 {q.t1} · {q.rrg == null ? "—" : RRG_VI[String(q.rrg)]} · T3 {pts(q.t3)}</span> — <span className={q.code === "illiquid" ? "text-amber-300" : "text-slate-300"}>{q.reasonVi}</span></li>
              ))}
            </ul>
          )}
          {hl.against.length > 0 && <p className="mt-1.5 text-[10px] text-slate-500" data-testid="hl-against">Đạt tầng 1 nhưng ngành phản đối (không vào): {hl.against.map((x) => `${x.ticker} (${x.rrgVi ?? "—"})`).join(" · ")}</p>}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Quy tắc vào · giữ · ra" testId="hl-rules">
          <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-slate-300">
            <li><b>Chọn:</b> tầng 1 (LS-v1 top 20% và ≥ 2/7 mô hình TA) → RRG ngành Cải thiện / Dẫn dắt → tích điểm các tab.</li>
            <li><b>Vào:</b> chỉ ở phiên đầu mỗi tuần, theo thứ tự xếp hạng; GTGD TB20 ≥ {r.minAdvBn} tỷ; tối đa {r.slots} mã, {r.maxPerSector} mã và {pct(r.sectorCap, 0)} tỷ trọng mỗi ngành.</li>
            <li><b>Giữ:</b> không cân lại tỷ trọng; ngành chuyển sang Suy yếu chỉ là cảnh báo.</li>
            <li><b>Ra (xét mỗi phiên):</b> LS-v1 dưới phân vị {r.exitLsPct}, hoặc không còn mô hình TA nào đạt, hoặc ngành rơi vào Tụt hậu.</li>
          </ul>
          <p className="mt-1.5 rounded border border-amber-400/30 bg-amber-500/[0.06] p-1.5 text-[10.5px] leading-relaxed text-amber-200" data-testid="hl-k0">{hl.k0.noteVi}</p>
        </Panel>
        <Panel title="Sổ theo dõi tiến — Elite HL so với Elite dòng tiền (cũ)" testId="elite-ledger">
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 380 }}>
              <thead><tr className="text-left text-[10px] text-slate-500"><th className="py-1 font-normal">Kỳ hạn</th><th className="font-normal">Elite HL (chính thức)</th><th className="font-normal">Elite dòng tiền (cũ)</th></tr></thead>
              <tbody>
                {(["5", "10"] as const).map((h) => (
                  <tr key={h} className="border-t border-white/5"><td className="py-1 text-slate-400">{h} phiên</td><td data-testid={`hl-ledger-hl-${h}`}>{ledgerLine(d.ledgerSummary, h)}</td><td data-testid={`hl-ledger-flow-${h}`}>{ledgerLine(d.flowLedgerSummary, h)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Sổ Elite HL bắt đầu từ phiên chuyển đổi; sổ dòng tiền tiếp nối sổ cũ. Cả hai khoá danh mục lúc dựng, chấm ở giá đóng cửa phiên kế tiếp, chi phí giả định 0,40%/vòng.</p>
          <p className="mt-1 rounded border border-amber-400/30 bg-amber-500/[0.06] p-1.5 text-[10px] leading-relaxed text-amber-200" data-testid="hl-ledger-basis">{d.ledgerSummary?.basisVi ?? "Cột Elite HL chấm rổ mã đang giữ quy về 100% cổ phiếu (không tính phần tiền mặt), kỳ hạn cố định 5 và 10 phiên — chưa phải lãi / lỗ của danh mục thật (có tiền mặt, giữ tới khi chạm ngưỡng ra)."}</p>
          <HlLedgerNote />
        </Panel>
      </div>
      <p className="text-[10px] text-slate-500">Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
