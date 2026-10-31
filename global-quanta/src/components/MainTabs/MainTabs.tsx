import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { mutate } from "swr";
import { ChartCandlestick, ChevronLeft, ChevronRight, FileChartColumn, Globe2, Landmark, Layers3, LayoutDashboard, RotateCw, Target, type LucideIcon } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import SectionBoundary from "../shared/SectionBoundary";
import SieuQuetAiTab from "./SieuQuetAI/SieuQuetAiTab";
import TaVnIndexTab from "./TaVnIndex/TaVnIndexTab";
import CotucTab from "./CoTuc/CotucTab";
import KetNoiTheGioiTab from "./KetNoiTheGioi/KetNoiTheGioiTab";
import LocNganhTab from "./LocNganh/LocNganhTab";
import ChatXucTacTab from "./ChatXucTac/ChatXucTacTab";
import Elite10Tab from "../elite10/Elite10Hub";
import { TabNavigationContext } from "../../lib/TabNavigationContext";
import { canGoBack, canGoForward, initialNav, isMainTab, labelOf, MAIN_TABS, parseNav, pushTab, resolvePop, slugOf, tabOfSlug, type MainTabId, type NavState } from "../../lib/mainNav";
import "./MainTabs.css";

const NAV_KEY = "gq.main.nav.v1";
const APP_TITLE = "ĐINH TUẤN";
const RELOAD_TIMEOUT_MS = 15_000;
const ICONS: Record<MainTabId, LucideIcon> = {
  "Sieu quet AI": LayoutDashboard, "Ket noi the gioi": Globe2, "Loc nganh": Layers3, "TA VN-Index": ChartCandlestick,
  "Chat xuc tac": Landmark, "Co tuc": FileChartColumn, "Elite 10": Target,
};

const readSaved = (): NavState | null => { try { return parseNav(window.sessionStorage.getItem(NAV_KEY)); } catch { return null; } };
const save = (nav: NavState) => { try { window.sessionStorage.setItem(NAV_KEY, JSON.stringify(nav)); } catch { /* chỉ nhớ trong bộ nhớ */ } };
const urlTab = () => tabOfSlug(new URLSearchParams(window.location.search).get("tab"));
const urlFor = (tab: MainTabId, search = "") => {
  const params = new URLSearchParams(search);
  params.set("tab", slugOf(tab));
  return `${window.location.pathname}?${params.toString()}${window.location.hash}`;
};
const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function MainTabs() {
  const [nav, setNav] = useState<NavState>(() => initialNav(readSaved(), window.history.state?.gqIdx, urlTab()));
  const navRef = useRef(nav);
  const update = useCallback((next: NavState) => { navRef.current = next; setNav(next); save(next); }, []);
  const activeTab = nav.stack[nav.idx];

  const go = useCallback((tabName: string) => {
    if (!isMainTab(tabName)) return;
    const cur = navRef.current;
    const next = pushTab(cur, tabName);
    if (next === cur) return;
    // Đóng dấu lại mục đang rời: bộ lọc tab Cổ tức có thể đã xoá state và tham số tab của mục này.
    window.history.replaceState({ gqIdx: cur.idx }, "", urlFor(cur.stack[cur.idx], window.location.search));
    window.history.pushState({ gqIdx: next.idx }, "", urlFor(tabName));
    update(next);
  }, [update]);

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, gqIdx: navRef.current.idx }, "", urlFor(navRef.current.stack[navRef.current.idx], window.location.search));
    save(navRef.current);
    const onPop = (e: PopStateEvent) => {
      const cur = navRef.current;
      const idx = resolvePop(cur, e.state?.gqIdx, urlTab());
      update({ stack: cur.stack, idx });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [update]);

  useEffect(() => { document.title = `${labelOf(activeTab)} · ${APP_TITLE}`; }, [activeTab]);

  // Tìm mã trên thanh trên -> mở tab Tổng quan (bảng tự cuộn tới mã và mở chi tiết).
  const scannerFocus = useAppStore((s) => s.scannerFocus);
  useEffect(() => { if (scannerFocus) go("Sieu quet AI"); }, [scannerFocus, go]);

  // Làm mới: nạp lại dữ liệu trang đang xem, không tải lại cả web. Giữ Shift khi bấm để tải lại toàn trang.
  const [reloadKey, setReloadKey] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [reloadedAt, setReloadedAt] = useState<number | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const reload = useCallback(async (e: MouseEvent) => {
    if (e.shiftKey) { window.location.reload(); return; }
    if (reloading) return;
    setReloading(true);
    setReloadKey((k) => k + 1);
    const timeout = new Promise((resolve) => { setTimeout(resolve, RELOAD_TIMEOUT_MS); });
    const revalidate = Promise.resolve(mutate(() => true, undefined, { revalidate: true, populateCache: false })).catch(() => undefined);
    const minSpin = new Promise((resolve) => { setTimeout(resolve, 700); });
    await Promise.all([Promise.race([revalidate, timeout]), minSpin]);
    if (!alive.current) return;
    setReloading(false);
    setReloadedAt(Date.now());
  }, [reloading]);

  const tabRefs = useRef<Partial<Record<MainTabId, HTMLButtonElement | null>>>({});
  useEffect(() => { tabRefs.current[activeTab]?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [activeTab]);
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = MAIN_TABS.findIndex((t) => t.id === activeTab);
    const n = e.key === "ArrowRight" ? (i + 1) % MAIN_TABS.length : e.key === "ArrowLeft" ? (i - 1 + MAIN_TABS.length) % MAIN_TABS.length : e.key === "Home" ? 0 : e.key === "End" ? MAIN_TABS.length - 1 : -1;
    if (n < 0 || e.altKey) return;
    e.preventDefault();
    go(MAIN_TABS[n].id);
    tabRefs.current[MAIN_TABS[n].id]?.focus();
  };
  const prev = canGoBack(nav) ? labelOf(nav.stack[nav.idx - 1]) : null;
  const next = canGoForward(nav) ? labelOf(nav.stack[nav.idx + 1]) : null;

  return (
    <TabNavigationContext.Provider value={go}>
      <div className="main">
        <div className="main-nav" data-testid="main-nav">
          <div className="nav-ctl" role="group" aria-label="Điều hướng trang">
            <button type="button" className="nav-btn" onClick={() => window.history.back()} disabled={!prev} aria-label={prev ? `Quay lại ${prev}` : "Quay lại"} title={prev ? `Quay lại: ${prev} (Alt + ←)` : "Chưa có trang trước"} data-testid="nav-back"><ChevronLeft aria-hidden /></button>
            <button type="button" className="nav-btn" onClick={() => window.history.forward()} disabled={!next} aria-label={next ? `Đi tới ${next}` : "Đi tới"} title={next ? `Đi tới: ${next} (Alt + →)` : "Chưa có trang kế tiếp"} data-testid="nav-forward"><ChevronRight aria-hidden /></button>
            <span className="nav-sep" aria-hidden />
            <button type="button" className={`nav-btn${reloading ? " spinning" : ""}`} onClick={reload} aria-busy={reloading} aria-label={`Làm mới dữ liệu ${labelOf(activeTab)}`} title="Làm mới dữ liệu trang này. Giữ Shift khi bấm để tải lại toàn trang." data-testid="nav-reload"><RotateCw aria-hidden /></button>
          </div>
          <div className="main-tabs" role="tablist" aria-label="Các trang phân tích">
            {MAIN_TABS.map((t) => {
              const Icon = ICONS[t.id];
              const on = t.id === activeTab;
              return (
                <button key={t.id} ref={(el) => { tabRefs.current[t.id] = el; }} type="button" role="tab" id={`main-tab-${t.slug}`} aria-selected={on} aria-controls="main-tab-panel" tabIndex={on ? 0 : -1}
                  className={`m-tab${on ? " active" : ""}`} data-tab={t.id} onClick={() => go(t.id)} onKeyDown={onTabKey}>
                  <Icon className="m-tab-icon" aria-hidden />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
          <span className="nav-status" role="status" data-testid="nav-status">{reloading ? "Đang làm mới…" : reloadedAt ? `Làm mới ${fmtTime(reloadedAt)}` : ""}</span>
        </div>
        {/* Lỗi vẽ trong một tab chỉ hiện thẻ lỗi tại chỗ; đổi tab là tự thử lại. */}
        <div id="main-tab-panel" role="tabpanel" aria-labelledby={`main-tab-${slugOf(activeTab)}`} key={reloadKey}>
          <SectionBoundary label={`trang ${labelOf(activeTab)}`} resetKey={activeTab}>
            {activeTab === "Sieu quet AI" && <SieuQuetAiTab />}
            {activeTab === "TA VN-Index" && <TaVnIndexTab />}
            {activeTab === "Chat xuc tac" && <ChatXucTacTab />}
            {activeTab === "Co tuc" && <CotucTab />}
            {activeTab === "Ket noi the gioi" && <KetNoiTheGioiTab />}
            {activeTab === "Loc nganh" && <LocNganhTab />}
            {activeTab === "Elite 10" && <Elite10Tab />}
          </SectionBoundary>
        </div>
      </div>
    </TabNavigationContext.Provider>
  );
}
