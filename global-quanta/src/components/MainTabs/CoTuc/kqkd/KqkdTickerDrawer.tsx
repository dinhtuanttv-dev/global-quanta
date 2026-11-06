// K6 (06/11/2026) — ngăn chi tiết KQKD của một mã: Ma trận quý & lũy kế · Phân rã lợi nhuận · Chất lượng & sức khoẻ · Mùa vụ & ước tính ·
// 3D/4D · So với ngành. Mở bằng cách bấm mã trong bảng; Esc hoặc nút ✕ để đóng.
import { useEffect, useRef, useState } from "react";
import { useKqkdTicker } from "../../../../hooks/useKqkd";
import { dmy, TPL_LABEL } from "../../../../lib/kqkd/format";
import type { KqkdRow } from "../../../../lib/kqkd/types";
import QuarterMatrix from "./QuarterMatrix";
import ProfitBridge from "./ProfitBridge";
import QualityHealth from "./QualityHealth";
import SeasonNowcast from "./SeasonNowcast";
import PeerCompare from "./PeerCompare";
import AgmPlanPanel from "./AgmPlanPanel";
import { TickerReactions } from "./EventStudyPanel";
import { ProfitSurface3D, Trajectory4D } from "./Kqkd3D";

type Tab = "matrix" | "plan" | "bridge" | "quality" | "season" | "react" | "space" | "peers";
const TABS: { id: Tab; label: string }[] = [
  { id: "matrix", label: "Ma trận quý & lũy kế" }, { id: "plan", label: "Kế hoạch ĐHCĐ" }, { id: "bridge", label: "Phân rã lợi nhuận" }, { id: "quality", label: "Chất lượng & sức khoẻ" },
  { id: "season", label: "Mùa vụ & ước tính" }, { id: "react", label: "Phản ứng giá" }, { id: "space", label: "3D / 4D" }, { id: "peers", label: "So với ngành" },
];
const FLAG_CLS: Record<string, string> = { NON_CORE: "border-sky-400/40 text-sky-300", HIGH_ACCRUAL: "border-amber-400/40 text-amber-300", NEG_CFO: "border-amber-400/40 text-amber-300",
  M_FLAG: "border-amber-400/40 text-amber-300", Z_DISTRESS: "border-rose-400/40 text-rose-300", AUDIT_DIFF: "border-amber-400/40 text-amber-300", SEASON_DEV: "border-white/20 text-slate-300" };

export default function KqkdTickerDrawer({ ticker, rows, onClose, onOpenProfile, sectorOf, nextDeadline }: {
  ticker: string; rows: KqkdRow[]; onClose: () => void; onOpenProfile?: (t: string) => void; sectorOf?: (t: string) => string | null; nextDeadline?: string | null;
}) {
  const { data: d, error, isLoading } = useKqkdTicker(ticker);
  const [tab, setTab] = useState<Tab>("matrix");
  const [space, setSpace] = useState<"surface" | "trajectory">("surface");
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/60" role="dialog" aria-modal="true" aria-label={`KQKD ${ticker}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} data-testid="kq-drawer">
      <div className="tw-scope h-full w-full max-w-[1120px] overflow-y-auto border-l border-white/10 bg-[#0B0F19] p-4 shadow-2xl">
        <header className="mb-3 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-bold text-[#F5CE72]">{ticker} <span className="text-[12px] font-normal text-slate-400">· KQKD theo quý{d?.available ? ` · ${TPL_LABEL[d.tpl]} · ${d.latest.quarter} (công bố ${dmy(d.latest.published ?? d.latest.created)}${d.latest.publishedSource === "DISCLOSURE" ? " · tin BCTC" : ""})` : ""}</span></h3>
            {d?.available && (sectorOf?.(ticker) || d.flags.length > 0) && (
              <div className="mt-1 flex flex-wrap gap-1">
                {sectorOf?.(ticker) && <span className="rounded border border-white/15 px-1.5 text-[10.5px] text-slate-300">{sectorOf(ticker)}</span>}
                {d.flags.map((f) => <span key={f.id} className={`rounded border px-1.5 text-[10.5px] font-semibold ${FLAG_CLS[f.id] ?? "border-white/15 text-slate-300"}`} data-testid={`kq-flag-${f.id}`}>{f.text}</span>)}
              </div>
            )}
          </div>
          <span className="rounded border border-slate-500/40 px-2 py-0.5 text-[10px] font-bold text-slate-300" title={d?.method.label}>{d?.version ?? "KQ-v1"} · MÔ TẢ</span>
          {onOpenProfile && <button type="button" onClick={() => onOpenProfile(ticker)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:text-slate-100">Hồ sơ cổ phiếu ↗</button>}
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Đóng" className="rounded-md border border-white/10 px-2 py-1 text-[12px] text-slate-300 hover:text-slate-100" data-testid="kq-drawer-close">✕</button>
        </header>
        {error && <p className="text-[12px] text-rose-300">Không tải được KQKD của {ticker}: {error}</p>}
        {isLoading && !d && <p className="text-[12px] italic text-slate-400">Đang tải BCTC quý của {ticker}…</p>}
        {d && !d.available && <p className="text-[12px] text-slate-400">Chưa có quý nào đã công bố trong kho.</p>}
        {d?.available && (
          <>
            <nav className="mb-3 flex flex-wrap gap-1 border-b border-white/10 pb-2" role="tablist" aria-label="Phân tích">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`kq-tab-${t.id}`}
                  className={`rounded-md border px-2.5 py-1 text-[11.5px] font-semibold ${tab === t.id ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{t.label}</button>
              ))}
            </nav>
            {tab === "matrix" && <QuarterMatrix d={d} nextDeadline={nextDeadline} />}
            {tab === "plan" && <AgmPlanPanel d={d} />}
            {tab === "bridge" && <ProfitBridge d={d} />}
            {tab === "quality" && <QualityHealth d={d} />}
            {tab === "season" && <SeasonNowcast d={d} />}
            {tab === "react" && <TickerReactions events={d.reactions} />}
            {tab === "space" && (
              <div className="space-y-2">
                <div className="flex gap-1" role="tablist" aria-label="Kiểu 3D">
                  {([["surface", "Cột 3D năm × quý (màu = biên ròng)"], ["trajectory", "Quỹ đạo 4D theo thời gian"]] as const).map(([id, t]) => (
                    <button key={id} type="button" role="tab" aria-selected={space === id} onClick={() => setSpace(id)} data-testid={`kq-space-${id}`}
                      className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${space === id ? "border-[#E8B84B]/50 bg-[#E8B84B]/10 text-[#F5CE72]" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>{t}</button>
                  ))}
                </div>
                {space === "surface" ? <ProfitSurface3D d={d} /> : <Trajectory4D d={d} />}
              </div>
            )}
            {tab === "peers" && <PeerCompare ticker={ticker} rows={rows} sectorOf={sectorOf} />}
            <p className="mt-4 text-[10px] text-slate-500">Nguồn: BCTC quý VNDirect finfo. {d.method.pit}</p>
          </>
        )}
      </div>
    </div>
  );
}
