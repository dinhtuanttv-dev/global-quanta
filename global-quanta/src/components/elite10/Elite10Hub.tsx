// Elite 10 — trung tâm ra quyết định (E4–E6 2026-10-17). Tab con:
//   1. Bảng quyết định hôm nay — danh mục Elite HL + khung "Mã đang chọn" (cổ tức, mô phỏng thời điểm, tin tức) + thẻ tóm tắt -> tab 4 (QĐ-R 20/11/2026).
//   2. Hồ sơ 360° — mọi tín hiệu của một mã từ 7 tab; chart kỹ thuật ở tab Phân tích kỹ thuật; chế độ 🔎 Bộ lọc Elite lọc cả vũ trụ (30/10).
//   3. Phòng họp AI — tranh luận Claude ↔ Gemini có trọng tài, bản tin phiên, hỏi đáp (E5).
//   4. Bằng chứng & sổ theo dõi — quy tắc vào·giữ·ra, Cổng tiền mặt, sổ theo dõi tiến, trọng số tín hiệu, IC từng tín hiệu (E6).
//   5. Rủi ro danh mục — Ledoit–Wolf, đóng góp rủi ro, VaR/CVaR, căng thẳng (E6).
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import DecisionBoard from "./center/DecisionBoard";
import SignalProfileCard from "./center/SignalProfileCard";
import EliteScreener from "./center/EliteScreener";
import EliteAiRoom from "./center/EliteAiRoom";
import EvidenceLedgerTab from "./center/EvidenceLedgerTab";
import AiBrainCard from "./center/AiBrainCard";
import RiskTab from "./center/RiskTab";
import ProfileHeader, { type ProfileView } from "./profile/ProfileHeader";
import CompanyProfileCard from "./profile/CompanyProfileCard";
import EventsProfileCard from "./profile/EventsProfileCard";
import { useTabNavigation } from "../../lib/TabNavigationContext";
import { useAppStore } from "../../store/useAppStore";
import { useEliteDecision, useElitePanel } from "../../hooks/elite10/useEliteCenter";
import { sortedPicks } from "./center/evidenceRoom/PortfolioRail";
import { defaultProfileTicker } from "../../lib/elite10/profileDefault";
import "./elite10.css";

type Sub = "board" | "profile" | "ai" | "evidence" | "risk";
const SUBS: { id: Sub; label: string }[] = [
  { id: "board", label: "1. Bảng quyết định hôm nay" },
  { id: "profile", label: "2. Hồ sơ 360°" },
  { id: "ai", label: "3. Phòng họp AI" },
  { id: "evidence", label: "4. Bằng chứng & sổ theo dõi" },
  { id: "risk", label: "5. Rủi ro danh mục" },
];

export default function Elite10Hub() {
  const globalTicker = useAppStore((s) => s.selectedTicker);
  const fromLink = typeof window !== "undefined" && window.location.hash.includes("elite-filter=");
  const [sub, setSub] = useState<Sub>(fromLink ? "profile" : "board");
  const [mode, setMode] = useState<"profile" | "screener">(fromLink ? "screener" : "profile");
  const [ticker, setTicker] = useState<string | null>(null);
  // PFA-v1 (17/11/2026): góc nhìn của Hồ sơ — "Tổng hợp" là trang hiện có (giữ nguyên), hai góc nhìn mới chỉ bổ sung.
  const [pview, setPview] = useState<ProfileView>("summary");
  // Phòng họp AI: dựng khi mở lần đầu rồi GIỮ trong cây (ẩn khi sang tab khác) — rời tab giữa chừng không huỷ tranh luận đang chạy
  // và không mất kết quả đã tính vào hạn mức hỏi đáp.
  const [aiOpened, setAiOpened] = useState(false);
  useEffect(() => { if (sub === "ai") setAiOpened(true); }, [sub]);
  const refs = useRef<Record<Sub, HTMLButtonElement | null>>({ board: null, profile: null, ai: null, evidence: null, risk: null });

  // HS360-v3 H1 (Q6): mã mặc định — mã đang chọn toàn trang nếu thuộc vũ trụ bảng E1, không thì mã hạng 1 Elite HL (trước đây luôn VNINDEX).
  const { data: panelDoc } = useElitePanel();
  const { data: decisionDoc } = useEliteDecision();
  const universe = useMemo(() => (panelDoc?.rows ? new Set(panelDoc.rows.map((r) => r.ticker)) : null), [panelDoc]);
  const hlFirst = useMemo(() => sortedPicks(decisionDoc)[0]?.ticker ?? null, [decisionDoc]);
  const current = defaultProfileTicker({ local: ticker, global: globalTicker, universe, hlFirst });
  const open = (t: string) => { setTicker(t); setSub("profile"); setMode("profile"); };
  // QĐ-R (20/11/2026): thẻ tóm tắt ở Bảng quyết định -> tab 4 (quy tắc, sổ theo dõi, trọng số đã chuyển sang đó).
  const goToEvidence = () => { setSub("evidence"); refs.current.evidence?.focus(); };
  const goTab = useTabNavigation();
  const selectGlobal = useAppStore((s) => s.selectTicker);
  const [pick, setPick] = useState("");
  const pickTicker = (e: FormEvent) => {
    e.preventDefault();
    const t = pick.trim().toUpperCase();
    if (!/^[A-Z0-9]{3,10}$/.test(t)) return; // cùng quy ước với Gateway (/api/elite/panel/:ticker)
    setTicker(t);
    setPick("");
  };
  const openChart = () => { selectGlobal(current); goTab?.("TA VN-Index"); };
  // HS360-v3 H1: nút ở thanh đầu hồ sơ — Phòng họp AI đúng mã (tab 3), Chu kỳ (tab Ngành › Cycle Fingerprint, focusCycle #403).
  const focusCycle = useAppStore((s) => s.focusCycle);
  const openAi = () => { setTicker(current); setSub("ai"); refs.current.ai?.focus(); };
  const openCycle = () => { focusCycle(current); goTab?.("Loc nganh"); };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SUBS.findIndex((s) => s.id === sub);
    const n = e.key === "ArrowRight" ? (i + 1) % SUBS.length : e.key === "ArrowLeft" ? (i - 1 + SUBS.length) % SUBS.length : -1;
    if (n < 0) return;
    e.preventDefault();
    setSub(SUBS[n].id);
    refs.current[SUBS[n].id]?.focus();
  };

  return (
    <div className="elite10-hub flex flex-col gap-3" data-testid="elite10-hub">
      <div role="tablist" aria-label="Elite 10" style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {SUBS.map((s) => (
          <button
            key={s.id} type="button" role="tab" id={`elite10-${s.id}-tab`} aria-selected={sub === s.id} aria-controls={`elite10-${s.id}-panel`}
            tabIndex={sub === s.id ? 0 : -1} ref={(el) => { refs.current[s.id] = el; }} onKeyDown={onKey} onClick={() => setSub(s.id)}
            style={{
              padding: "9px 14px", border: 0, borderBottom: sub === s.id ? "2px solid var(--gold-bright)" : "2px solid transparent",
              background: "transparent", color: sub === s.id ? "var(--q-accent-strong)" : "var(--text-secondary)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >{s.label}</button>
        ))}
      </div>
      <section id={`elite10-${sub}-panel`} role="tabpanel" aria-labelledby={`elite10-${sub}-tab`} className="flex flex-col gap-3">
        {sub === "board" && <DecisionBoard onOpenTicker={open} onNavigateToEvidence={goToEvidence} />}
        {(aiOpened || sub === "ai") && <div hidden={sub !== "ai"} data-testid="elite10-ai-keepalive">
          <EliteAiRoom defaultTicker={ticker ?? globalTicker} active={sub === "ai"} />
        </div>}
        {sub === "evidence" && <EvidenceLedgerTab />}
        {sub === "risk" && <RiskTab />}
        {sub === "profile" && (
          <>
            <div className="tw-scope flex flex-wrap items-center gap-1 text-[11px]" role="group" aria-label="Chế độ hồ sơ">
              {([["profile", `Hồ sơ ${current}`], ["screener", "🔎 Bộ lọc Elite"]] as const).map(([m, l]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`elite-mode-${m}`}
                  className={`min-h-[28px] rounded border px-3 font-bold ${mode === m ? "border-q-accent/60 bg-q-accent/15 text-q-accent-strong" : "border-white/10 text-slate-400 hover:border-white/25"}`}>{l}</button>
              ))}
              {mode === "profile" && <>
                <form onSubmit={pickTicker} className="flex items-center gap-1" data-testid="elite-pick-form">
                  <input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Đổi mã, ví dụ FPT" aria-label="Đổi mã trong hồ sơ" maxLength={10} data-testid="elite-pick"
                    className="min-h-[28px] w-32 rounded border border-white/10 bg-black/30 px-2 uppercase text-slate-200 placeholder:normal-case placeholder:text-slate-500 focus:border-[#E8B84B]/60 focus:outline-none" />
                </form>
              </>}
            </div>
            {mode === "screener" ? (
              <section className="tw-scope rounded-lg border border-white/10 bg-[#0E131F] p-3 text-slate-200">
                <EliteScreener onOpenTicker={open} refTicker={ticker} />
              </section>
            ) : (
              <>
                <ProfileHeader ticker={current} view={pview} onView={setPview} actions={{ onOpenChart: openChart, onOpenAi: openAi, onOpenCycle: openCycle }} />
                {pview === "summary" && (
                  <>
                    <SignalProfileCard ticker={current} />
                    {/* ARL-v1 (26/11/2026): lịch sử Phòng họp AI của mã — sổ phán quyết chấm theo thị trường thật. */}
                    <div className="rounded-lg border border-white/10 bg-[#0E131F] p-3"><AiBrainCard ticker={current} compact testId="ai-brain-profile" /></div>
                    {/* QĐ-R (20/11/2026): Sự kiện cổ tức, Mô phỏng thời điểm và Tin tức Elite 10 chuyển sang Bảng quyết định (khung "Mã đang chọn"). */}
                  </>
                )}
                {pview === "company" && <CompanyProfileCard ticker={current} />}
                {pview === "events" && <EventsProfileCard ticker={current} />}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
