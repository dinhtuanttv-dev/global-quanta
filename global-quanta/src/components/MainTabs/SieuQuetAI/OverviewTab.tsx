// OV-1 (27/11/2026) — tầng chứa tab TỔNG QUAN: 2 tab con "Bảng giao dịch" và "Thị trường".
// Giữ ở đây những gì hai tab con dùng chung: bộ lọc ngành, nonce đã xử lý của lệnh tìm mã / chọn ngành, chuyển tab con.
// Tab con đang ẩn được gỡ khỏi trang -> không mở thêm luồng giá realtime; dữ liệu dùng chung SWR nên không gọi thêm API.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SectorLadderRow } from "../../../lib/locnganh/types";
import { useAppStore } from "../../../store/useAppStore";
import { useSieuQuetScanner } from "../../../hooks/useSieuQuetScanner";
import { usePreopen } from "../../../hooks/usePreopen";
import SieuQuetAiTab from "./SieuQuetAiTab";
import MarketView from "./MarketView";
import { OVERVIEW_VIEWS, overviewShortcut, readOverviewView, writeOverviewView, type OverviewFilters, type OverviewView, type SectorScope } from "./overviewNav";
import "./ScannerTables.css";

// Nonce của lệnh tìm mã / chọn ngành đã đưa người dùng về tab Bảng giao dịch (giữ qua các lần gắn lại tab TỔNG QUAN):
// mở lại TỔNG QUAN không bị kéo về tab 1 bởi một lệnh cũ.
const switched = { focus: null as number | null, sector: null as number | null };
/** Chỉ dùng trong kiểm thử. */
export const resetOverviewSwitches = () => { switched.focus = null; switched.sector = null; };

export default function OverviewTab() {
  const scannerFocus = useAppStore((s) => s.scannerFocus);
  const scanSectorFocus = useAppStore((s) => s.scanSectorFocus);
  const pendingFocus = (scannerFocus && scannerFocus.nonce !== switched.focus) || (scanSectorFocus && scanSectorFocus.nonce !== switched.sector);
  const [view, setViewState] = useState<OverviewView>(() => (pendingFocus ? "bang" : readOverviewView()));
  const setView = useCallback((v: OverviewView) => { setViewState(v); writeOverviewView(v); }, []);
  useEffect(() => { writeOverviewView(view); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- ghi tab con ban đầu lên URL

  // Lệnh tìm mã trên thanh trên / "Chọn ngành cho Siêu quét" -> về tab Bảng giao dịch (bảng tự xử lý cuộn / lọc như trước).
  useEffect(() => {
    if (scannerFocus && scannerFocus.nonce !== switched.focus) { switched.focus = scannerFocus.nonce; setView("bang"); }
  }, [scannerFocus, setView]);
  useEffect(() => {
    if (scanSectorFocus && scanSectorFocus.nonce !== switched.sector) { switched.sector = scanSectorFocus.nonce; setView("bang"); }
  }, [scanSectorFocus, setView]);

  // Bộ lọc ngành dùng chung — đúng ngữ nghĩa cũ: lọc ICB và lọc ngành của thanh công cụ loại trừ nhau.
  const [industries, setIndustriesState] = useState<Set<string>>(() => new Set());
  const [sectorScope, setSectorScope] = useState<SectorScope | null>(null);
  const setIndustries = useCallback((next: Set<string>) => { setIndustriesState(next); if (next.size) setSectorScope(null); }, []);
  const pickSector = useCallback((s: SectorLadderRow | null) => { setSectorScope(s ? { code: s.code, name: s.name, tickers: new Set(s.tickers) } : null); if (s) setIndustriesState(new Set()); }, []);
  const filters = useMemo<OverviewFilters>(() => ({ industries, setIndustries, sectorScope, setSectorScope, pickSector }), [industries, setIndustries, sectorScope, pickSector]);
  const handledFocus = useRef<number | null>(null);
  const handledSector = useRef<number | null>(null);

  // Từ tab Thị trường: bấm ngành / nhóm ngành -> áp bộ lọc rồi chuyển sang Bảng giao dịch (quyết định 27/11). Bỏ chọn -> ở lại.
  const sectorFromMarket = useCallback((s: SectorLadderRow | null) => { pickSector(s); if (s) setView("bang"); }, [pickSector, setView]);
  const industryFromMarket = useCallback((name: string | null) => { setIndustries(name ? new Set([name]) : new Set()); if (name) setView("bang"); }, [setIndustries, setView]);
  const openMarket = useCallback(() => setView("thi-truong"), [setView]);

  // Phím 1 / 2 đổi tab con (không khi đang gõ).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const v = overviewShortcut(e); if (v) setView(v); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setView]);

  // Nhãn trạng thái của từng tab con (dữ liệu SWR dùng chung, không gọi thêm).
  const { items, isLoading } = useSieuQuetScanner();
  const { data: preopen } = usePreopen();
  const lead = preopen?.scenarios?.find((s) => s.id === preopen.lead)?.name ?? null;
  const badge: Record<OverviewView, string | null> = {
    bang: isLoading ? null : `${items.length} mã`,
    "thi-truong": lead,
  };
  const tabRefs = useRef<Partial<Record<OverviewView, HTMLButtonElement | null>>>({});
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = OVERVIEW_VIEWS.findIndex((v) => v.id === view);
    const n = e.key === "ArrowRight" || e.key === "ArrowLeft" ? (i + 1) % OVERVIEW_VIEWS.length : e.key === "Home" ? 0 : e.key === "End" ? OVERVIEW_VIEWS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    setView(OVERVIEW_VIEWS[n].id);
    tabRefs.current[OVERVIEW_VIEWS[n].id]?.focus();
  };

  return (
    <div className="tw-scope flex flex-col gap-3 py-1" data-testid="overview-tab">
      <div className="ov-tabs" role="tablist" aria-label="Tab con của Tổng quan" data-testid="overview-tabs">
        {OVERVIEW_VIEWS.map((v) => {
          const on = v.id === view;
          return (
            <button key={v.id} ref={(el) => { tabRefs.current[v.id] = el; }} type="button" role="tab" id={`overview-tab-${v.id}`} aria-selected={on}
              aria-controls="overview-panel" tabIndex={on ? 0 : -1} data-testid={`overview-view-${v.id}`} className={`ov-tab${on ? " is-active" : ""}`}
              onClick={() => setView(v.id)} onKeyDown={onTabKey} title={`${v.label} (phím ${v.key})`}>
              <span>{v.label}</span>
              {badge[v.id] && <small className="ov-badge">{badge[v.id]}</small>}
            </button>
          );
        })}
        {sectorScope && view === "thi-truong" && <span className="ov-note" role="status">Bảng giao dịch đang lọc ngành {sectorScope.name}</span>}
      </div>
      <div id="overview-panel" role="tabpanel" aria-labelledby={`overview-tab-${view}`}>
        {view === "bang"
          ? <SieuQuetAiTab filters={filters} onOpenMarket={openMarket} handledFocus={handledFocus} handledSector={handledSector} />
          : <MarketView activeSector={sectorScope?.code ?? null} onSector={sectorFromMarket} onIndustry={industryFromMarket} />}
      </div>
    </div>
  );
}
