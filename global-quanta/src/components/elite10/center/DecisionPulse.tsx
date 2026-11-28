// NHỊP QUYẾT ĐỊNH HÔM NAY (20/11/2026, docs/elite-hl-pulse) — một panel thay hai nơi đọc "Hôm nay" (TodayRibbon) và "Thay đổi hôm nay"
// (hl-changes) khi lớp "pulse" bật. Chỉ hiển thị mô hình thuần pulseModel(); không logic quyết định, không gọi API. Một cấu trúc DOM
// cho mọi khổ: lưới 4 cột từ md, khối dọc trên điện thoại (không cuộn ngang). Không dùng chữ khuyến nghị.
import { useMemo, useState, type ReactNode } from "react";
import type { EliteDecision, PzState } from "../../../lib/elite10/decisionTypes";
import { pulseModel, PULSE_STATUS_VI, PZ_ORDER, type PulseHistSession, type PulseRow, type PulseStatus } from "../../../lib/elite10/decisionPulse";
import { PZ_VI } from "./HlPricePosition";
import { fmtDate, num } from "./boardParts";

const pct = (v: number | string | null | undefined, d = 1) => (typeof v !== "number" || !Number.isFinite(v) ? "—" : `${num(v * 100, d)}%`);
const STATUS_CLS: Record<PulseStatus, string> = {
  FROZEN: "border-rose-400/60 text-rose-200", STALE: "border-rose-400/50 text-rose-200", NO_BASELINE: "border-slate-400/50 text-slate-300",
  CHANGED: "border-white/25 text-q-text", STABLE: "border-emerald-400/40 text-emerald-200", PARTIAL: "border-amber-400/50 text-amber-200",
};
const GROUP_VI = { DECISION: "Quyết định danh mục", PRICE_POSITION: "Vị trí giá", CAPITAL_EVENTS: "Vốn & sự kiện" } as const;
const TICKER_CAP = 6;

function Chip({ s, id }: { s: PulseStatus; id: string }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-px text-[10px] font-bold ${STATUS_CLS[s]}`} data-testid={`pulse-chip-${id}`}>{PULSE_STATUS_VI[s]}</span>;
}

function Tickers({ list, onOpen, id }: { list: string[]; onOpen: (t: string) => void; id: string }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, TICKER_CAP);
  return (
    <>
      {shown.map((t, i) => <span key={t}>{i ? " · " : ""}<button type="button" onClick={() => onOpen(t)} className="font-bold text-q-text hover:underline">{t}</button></span>)}
      {list.length > TICKER_CAP && <button type="button" onClick={() => setAll(!all)} aria-expanded={all} data-testid={`pulse-more-${id}`} className="ml-1 text-[10px] text-slate-400 underline">{all ? "Thu gọn" : `Xem tất cả (${list.length})`}</button>}
    </>
  );
}

function Cell({ head, children, testId, className = "" }: { head: string; children: ReactNode; testId?: string; className?: string }) {
  return (
    <div role="cell" className={`min-w-0 py-0.5 ${className}`} data-testid={testId}>
      <span className="mr-1 text-[10px] uppercase text-slate-500 md:hidden">{head}:</span>{children}
    </div>
  );
}

function current(r: PulseRow, d: EliteDecision): ReactNode {
  const c = r.current;
  switch (r.id) {
    case "schedule":
      return c.frozen ? <b className="text-rose-300">Đóng băng — không vào, không ra</b> : c.rebalance ? <b className="text-emerald-300">Phiên vào lệnh · tuần {String(c.week ?? "—").replace(/^\d{4}-/, "")}</b> : <b className="text-slate-100">Chỉ xét ra</b>;
    case "portfolio":
      return (<>
        <b className="num text-slate-100">{c.held} / {c.slots}</b> mã{c.core != null && <span className="text-slate-400"> · {c.core} chính · {c.runner} chạy lãi</span>}
        <span className="block text-[10px] text-slate-400">cổ phiếu {pct(c.invested)} · tiền mặt {pct(c.cash)}</span>
      </>);
    case "queue":
      return <><b className="num text-slate-100">{c.queue}</b> mã chờ{Number(c.illiquid) > 0 && <span className="text-slate-400"> · {c.illiquid} chưa giao dịch được</span>}</>;
    case "pz": {
      if (c.total == null) return <span className="text-slate-500">—</span>;
      const vi = d.hl?.pz?.stateVi ?? PZ_VI;
      return (<>
        <span className="flex flex-wrap gap-x-2">{PZ_ORDER.map((s) => <span key={s} data-testid={`pulse-pz-${s}`}><span className="text-slate-400">{vi[s as PzState] ?? s}</span> <b className="num text-slate-100">{c[s]}</b></span>)}</span>
        <span className="block text-[10px] text-slate-400" data-testid="pulse-pz-coverage">tổng {c.total}/{c.tracked} mã theo dõi{c.priced != null ? ` · ${c.priced} đã định giá` : ""}{c.withBase != null ? ` · ${c.withBase} có nền` : ""}</span>
      </>);
    }
    case "turnover":
      return (<>
        Xoay vòng <b className="num text-slate-100">{c.turnover == null ? "—" : pct(c.turnover, 0)}</b> · phí ước tính <b className="num text-slate-100">{pct(c.costEst, 2)}</b> <span className="text-slate-400">NAV</span>
        <span className="block text-[10px] text-slate-400">phí giả định: mua {pct(c.costBuy, 2)}, bán {pct(c.costSell, 2)}</span>
      </>);
    case "dilution":
      if (c.total == null) return <span className="text-slate-500">—</span>;
      return (<>
        <b className="num text-slate-100">{c.total}</b> mã toàn thị trường: <b className="num text-slate-100">{c.pending}</b> chưa giao dịch CP mới{c.pendingList ? <span className="text-slate-400"> ({c.pendingList})</span> : null}
        {Number(c.listed) > 0 && <span className="block text-[10px] text-slate-400">{c.listed} đã giao dịch CP mới ({c.listedList})</span>}
      </>);
  }
}

function delta(r: PulseRow, onOpen: (t: string) => void, vi: Record<string, string>): ReactNode {
  const dl = r.delta, c = r.current;
  if (r.id === "schedule") return <span className="text-slate-500">—</span>;
  if (r.id === "turnover") return <span className="text-slate-500">{r.baselineKind === "NONE" ? "Chưa có phiên đối chiếu" : "—"}</span>;
  if (r.id === "dilution") return <span className="text-slate-400">{c.mine ? <>Trong danh mục / hàng chờ: <b className="text-slate-200">{c.mine}</b></> : "Không mã nào trong danh mục / hàng chờ"}</span>;
  if (!dl) return <span className="text-slate-500" data-testid={`pulse-nobase-${r.id}`}>Chưa có phiên đối chiếu</span>;
  if (r.id === "portfolio") {
    const none = !dl.added?.length && !dl.exits?.length;
    return (<>
      {none ? <span className="text-slate-300">Không vào, không ra · giữ {String(c.kept)} mã</span> : (<>
        {dl.added?.length ? <span className="block" data-testid="pulse-added"><b className="text-emerald-300">Vào mới ({dl.added.length}):</b> <Tickers list={dl.added} onOpen={onOpen} id="added" /></span> : null}
        {dl.exits?.map((x) => <span key={x.t} className="block" data-testid={`pulse-exit-${x.t}`}><b className="text-rose-300">Ra {x.t}</b> <span className="text-slate-400">({pct(x.weight)}{x.since ? `, giữ từ ${fmtDate(x.since)}` : ""}) — {x.reasonVi}</span></span>)}
        <span className="block text-[10px] text-slate-400">Giữ {String(c.kept)} mã.</span>
      </>)}
      {c.prevCash != null && c.prevCash !== c.cash && <span className="block text-[10px] text-slate-400">tiền mặt phiên {fmtDate(String(c.prevCashDate))}: {pct(c.prevCash)}</span>}
    </>);
  }
  if (r.id === "queue") {
    const none = !dl.added?.length && !dl.removed?.length;
    return (<>
      <span className="text-[10px] text-slate-400">phiên {fmtDate(r.baselineDate ?? "")}: {String(c.prevQueue)} mã</span>
      {none ? <span className="block text-slate-300">Không mã nào vào hay rời hàng chờ</span> : (<>
        {dl.added?.length ? <span className="block" data-testid="pulse-queue-in"><b className="text-q-text">Mới vào ({dl.added.length}):</b> <Tickers list={dl.added} onOpen={onOpen} id="queue-in" /></span> : null}
        {dl.removed?.length ? <span className="block" data-testid="pulse-queue-out"><b className="text-slate-300">Rời ({dl.removed.length}):</b> <Tickers list={dl.removed} onOpen={onOpen} id="queue-out" /></span> : null}
      </>)}
    </>);
  }
  // pz
  return (<>
    <span className="block" data-testid="pulse-pz-moves">
      <span className="text-[10px] text-slate-400">so với ảnh chụp vị trí giá trước: </span>
      <b className="text-violet-200">sang theo dõi {dl.removed?.length ?? 0}</b>{dl.removed?.length ? <span className="text-slate-400"> (<Tickers list={dl.removed} onOpen={onOpen} id="to-watch" />)</span> : null}
      {" · "}<b className="text-emerald-300">về vùng mua {dl.added?.length ?? 0}</b>{dl.added?.length ? <span className="text-slate-400"> (<Tickers list={dl.added} onOpen={onOpen} id="back-zone" />)</span> : null}
    </span>
    {dl.moved?.length ? <span className="block text-[10px] text-slate-300" data-testid="pulse-pz-held">Mã đang giữ đổi vùng: {dl.moved.map((m) => `${m.t} ${vi[m.from] ?? m.from} → ${vi[m.to] ?? m.to}`).join(" · ")}</span> : null}
  </>);
}

export default function DecisionPulse({ d, history, onOpenTicker }: { d: EliteDecision; history?: readonly PulseHistSession[] | null; onOpenTicker: (t: string) => void }) {
  const vm = useMemo(() => pulseModel(d, history ?? null), [d, history]);
  const vi = (d.hl?.pz?.stateVi ?? PZ_VI) as Record<string, string>;
  let lastGroup = "";
  return (
    <section id="decision-pulse" className="rounded-lg border border-white/10 border-l-[3px] border-l-white/20 bg-q-surface px-3 py-2.5 text-[11.5px]" aria-label="Nhịp quyết định hôm nay" data-hl-layer="pulse" data-testid="decision-pulse">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-100" style={{ fontFamily: "var(--q-font-sans)" }}>Nhịp quyết định hôm nay</h4>
        <span className="text-[10.5px] text-slate-400" data-testid="pulse-baseline">{vm.session.prevDate ? `so với phiên ${fmtDate(vm.session.prevDate)}` : "phiên dựng đầu tiên"}</span>
        <Chip s={vm.overall} id="overall" />
        {vm.overallWhy.length > 0 && <span className="text-[10.5px] text-slate-400" data-testid="pulse-why">· {vm.overallWhy.join(" · ")}</span>}
      </div>
      <div role="table" aria-label="Nhịp quyết định hôm nay" className="w-full">
        <div role="row" className="hidden border-b border-white/10 pb-1 text-[10px] uppercase text-slate-500 md:grid md:grid-cols-[18%_30%_32%_20%] md:gap-2">
          <span role="columnheader">Chỉ số</span><span role="columnheader">Hiện tại</span><span role="columnheader">So với phiên trước</span><span role="columnheader">Trạng thái</span>
        </div>
        {vm.rows.map((r) => {
          const g = r.group !== lastGroup ? GROUP_VI[r.group] : null; lastGroup = r.group;
          return (
            <div key={r.id}>
              {g && <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500" data-testid={`pulse-group-${r.group}`}>{g}</p>}
              <div role="row" className="grid grid-cols-1 gap-x-2 border-t border-white/5 py-1 md:grid-cols-[18%_30%_32%_20%]" data-testid={`pulse-row-${r.id}`}>
                <Cell head="Chỉ số"><span role="rowheader" className="font-semibold text-slate-200">{r.label}</span></Cell>
                <Cell head="Hiện tại" testId={`pulse-cur-${r.id}`}>{current(r, d)}</Cell>
                <Cell head="So với phiên trước" testId={`pulse-delta-${r.id}`}>{delta(r, onOpenTicker, vi)}</Cell>
                <Cell head="Trạng thái"><Chip s={r.status} id={r.id} />{r.reason && <span className="block text-[10px] text-slate-400">{r.reason}</span>}</Cell>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500" data-testid="pulse-note">
        Danh mục và hàng chờ so với phiên trước; vị trí giá so với ảnh chụp vị trí giá trước. Xoay vòng và phí tính trên toàn danh mục (NAV) theo phí giả định — không phải phí đã khớp.
        "Về vùng mua" là trạng thái vị trí giá, không phải lệnh. Chỉ hiển thị — không đổi quy tắc chọn, giữ hay thoát mã.
      </p>
    </section>
  );
}
