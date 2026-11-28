import { useEffect, useState, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useAppStore } from "../../../store/useAppStore";
import { CycleFingerprintTab } from "./CfTab";
import SectorRotationPanel from "./timing/SectorRotationPanel";
import { useSectorLadder, useSectorRrg } from "../../../hooks/useSectorRotation";
import { useSectorTimingSignals } from "../../../hooks/useSectorTimingSignals";
import { useCycleSummary } from "../../../hooks/useCycleSummary";
import type { SectorTimingSignalV2 } from "../../../lib/locnganh/types";
import { isMarketGatewayEnabled } from "../../../services/marketDataClient";
import Top20V2Panel from "./Top20V2Panel";
import { useAlphaTop20 } from "../../../hooks/useAlphaTop20";

type SubTab = "rrg" | "fingerprint";
const SUBTABS: { id: SubTab; label: string }[] = [{ id: "rrg", label: "Xoay vòng ngành & Top 20" }, { id: "fingerprint", label: "Cycle Fingerprint" }];
/** EC-1: nonce "Chu kỳ →" đã xử lý — để ở mức mô-đun để mở lại tab không tự nhảy sang Cycle Fingerprint lần nữa. */
let handledCycleNonce = 0;

export default function LocNganhTab() {
  const cycleFocus = useAppStore((s) => s.cycleFocus);
  const [subTab, setSubTab] = useState<SubTab>(() => (cycleFocus && cycleFocus.nonce > handledCycleNonce ? "fingerprint" : "rrg"));
  useEffect(() => {
    if (cycleFocus && cycleFocus.nonce > handledCycleNonce) { handledCycleNonce = cycleFocus.nonce; setSubTab("fingerprint"); }
  }, [cycleFocus]);

  const selectedSectorKey = useAppStore((s) => s.selectedSectorKey);
  const setSelectedSectorKey = useAppStore((s) => s.setSelectedSectorKey);
  const selectTicker = useAppStore((s) => s.selectTicker);

  // L5: ma trận RRG cũ (Yahoo, 1 mã đại diện, 8 ngành) đã gỡ — ngành chọn ở bảng Xoay vòng ngành ICB (mã ICB 4 số)
  const sectorRrg = useSectorRrg();
  const selectedSector = useMemo(() => {
    if (!selectedSectorKey) return null;
    const s = sectorRrg.data?.sectors.find((x) => x.code === selectedSectorKey);
    if (s?.level === 3 && s.parent) {
      const parent = sectorRrg.data?.sectors.find((x) => x.level === 2 && x.code === s.parent);
      return { code: s.parent, name: `${s.name} · lọc theo ICB cấp 2: ${parent?.name ?? s.parent}` };
    }
    return { code: selectedSectorKey, name: s?.name ?? selectedSectorKey };
  }, [selectedSectorKey, sectorRrg.data]);
  const alpha = useAlphaTop20(subTab === "rrg");
  const gateway = isMarketGatewayEnabled();
  // Giai đoạn C: bối cảnh cho từng mã Top 20 (không cộng vào điểm).
  const ladder = useSectorLadder();
  const timing = useSectorTimingSignals({ enabled: gateway && subTab === "rrg" });
  const topTickers = useMemo(() => (subTab === "rrg" ? (alpha.data?.top20 ?? []).map((s) => s.ticker) : []), [alpha.data, subTab]);
  const cycles = useCycleSummary(topTickers);
  const ctx = useMemo(() => ({
    rrgOf: new Map((sectorRrg.data?.sectors ?? []).map((s) => [s.code, s])),
    ladderOf: new Map((ladder.data?.sectors ?? []).map((s) => [s.code, s])),
    timingOf: timing.bySector as ReadonlyMap<string, SectorTimingSignalV2>,
    cycleOf: new Map((cycles.data?.rows ?? []).map((r) => [r.symbol, r])),
    cycleLoading: cycles.isLoading,
  }), [sectorRrg.data, ladder.data, timing.bySector, cycles.data, cycles.isLoading]);
  const focusSector = useAppStore((s) => s.focusSector);
  const openCycle = (ticker: string) => { selectTicker(ticker); setSubTab("fingerprint"); };
  // Phím ← → / Home / End giữa các tab con (như tab con Tổng quan).
  const tabRefs = useRef<Record<SubTab, HTMLButtonElement | null>>({ rrg: null, fingerprint: null });
  const onTabKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    const i = SUBTABS.findIndex((t) => t.id === subTab), n = SUBTABS.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault(); setSubTab(SUBTABS[j].id); tabRefs.current[SUBTABS[j].id]?.focus();
  };

  return (
    <div className="loc-nganh-tab">
      {/* Sub-tab: chỉ điều hướng hiển thị, không ảnh hưởng logic xoay vòng ngành / Top 20.
          QUANTA UI v2 (28/11): thanh tab con chuẩn dự án .q-subtabs (= tab con Tổng quan) thay viên thuốc nền xanh đặc chữ đen;
          thêm vai trò tab + phím ← → như Tổng quan. */}
      <div className="q-subtabs" role="tablist" aria-label="Tab con của Ngành" data-testid="nganh-subtabs" style={{ marginBottom: 14 }}>
        {SUBTABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`nganh-tab-${t.id}`} aria-selected={subTab === t.id} aria-controls="nganh-panel"
            tabIndex={subTab === t.id ? 0 : -1} ref={(el) => { tabRefs.current[t.id] = el; }} data-testid={`nganh-view-${t.id}`}
            className="q-subtab" onClick={() => setSubTab(t.id)} onKeyDown={onTabKey}>
            {t.label}
          </button>
        ))}
      </div>
      <div id="nganh-panel" role="tabpanel" aria-labelledby={`nganh-tab-${subTab}`}>

      {subTab === "rrg" && (
        <>
          {gateway && <SectorRotationPanel selectedSector={selectedSectorKey} onFilterSector={(code) => setSelectedSectorKey(code === selectedSectorKey ? null : code)} />}
          {alpha.data
            ? <Top20V2Panel data={alpha.data} selectedSector={selectedSector} onClearSector={() => setSelectedSectorKey(null)} onSelectTicker={selectTicker}
              onRefresh={() => { void alpha.refresh(); }} refreshing={alpha.isValidating}
              ctx={ctx} onOpenSector={focusSector} onOpenCycle={openCycle} />
            : <div className="t1-state-msg">{alpha.error ? `Không tải được Top 20: ${alpha.error.message}` : "Đang tải Top 20…"}</div>}
        </>
      )}

      {subTab === "fingerprint" && <CycleFingerprintTab />}
      </div>
    </div>
  );
}
