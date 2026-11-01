// Elite 10 — trung tâm ra quyết định (E4–E6 2026-10-17). Tab con:
//   1. Bảng quyết định hôm nay — danh mục Elite 10, trọng số tín hiệu theo bằng chứng, sổ theo dõi tiến (Gateway /api/elite/*).
//   2. Hồ sơ 360° — mọi tín hiệu của một mã từ 7 tab; chart kỹ thuật ở tab Phân tích kỹ thuật; chế độ 🔎 Bộ lọc Elite lọc cả vũ trụ (30/10).
//   3. Phòng họp AI — tranh luận Claude ↔ Gemini có trọng tài, bản tin phiên, hỏi đáp (E5).
//   4. Bằng chứng & sổ theo dõi — IC từng tín hiệu theo kỳ hạn, bậc, sổ theo dõi tiến (E6).
//   5. Rủi ro danh mục — Ledoit–Wolf, đóng góp rủi ro, VaR/CVaR, căng thẳng (E6).
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import DecisionBoard from "./center/DecisionBoard";
import SignalProfileCard from "./center/SignalProfileCard";
import EliteScreener from "./center/EliteScreener";
import TimingSimPanel from "./timing/TimingSimPanel";
import EliteNewsPanel from "./news/EliteNewsPanel";
import EliteAiRoom from "./center/EliteAiRoom";
import EvidenceLedgerTab from "./center/EvidenceLedgerTab";
import RiskTab from "./center/RiskTab";
import { useTabNavigation } from "../../lib/TabNavigationContext";
import { useAppStore } from "../../store/useAppStore";

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
  const refs = useRef<Record<Sub, HTMLButtonElement | null>>({ board: null, profile: null, ai: null, evidence: null, risk: null });
  const current = ticker ?? globalTicker ?? "VNINDEX";
  const open = (t: string) => { setTicker(t); setSub("profile"); setMode("profile"); };
  const goTab = useTabNavigation();
  const selectGlobal = useAppStore((s) => s.selectTicker);
  const [pick, setPick] = useState("");
  const pickTicker = (e: FormEvent) => {
    e.preventDefault();
    const t = pick.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,12}$/.test(t)) return;
    setTicker(t);
    setPick("");
  };
  const openChart = () => { selectGlobal(current); goTab?.("TA VN-Index"); };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = SUBS.findIndex((s) => s.id === sub);
    const n = e.key === "ArrowRight" ? (i + 1) % SUBS.length : e.key === "ArrowLeft" ? (i - 1 + SUBS.length) % SUBS.length : -1;
    if (n < 0) return;
    e.preventDefault();
    setSub(SUBS[n].id);
    refs.current[SUBS[n].id]?.focus();
  };

  return (
    <div className="flex flex-col gap-3" data-testid="elite10-hub">
      <div role="tablist" aria-label="Elite 10" style={{ display: "flex", gap: 8, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {SUBS.map((s) => (
          <button
            key={s.id} type="button" role="tab" id={`elite10-${s.id}-tab`} aria-selected={sub === s.id} aria-controls={`elite10-${s.id}-panel`}
            tabIndex={sub === s.id ? 0 : -1} ref={(el) => { refs.current[s.id] = el; }} onKeyDown={onKey} onClick={() => setSub(s.id)}
            style={{
              padding: "9px 14px", border: 0, borderBottom: sub === s.id ? "2px solid var(--gold-bright)" : "2px solid transparent",
              background: "transparent", color: sub === s.id ? "var(--gold-bright)" : "var(--text-secondary)",
              fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
            }}
          >{s.label}</button>
        ))}
      </div>
      <section id={`elite10-${sub}-panel`} role="tabpanel" aria-labelledby={`elite10-${sub}-tab`} className="flex flex-col gap-3">
        {sub === "board" && <DecisionBoard onOpenTicker={open} />}
        {sub === "ai" && <EliteAiRoom defaultTicker={ticker} />}
        {sub === "evidence" && <EvidenceLedgerTab />}
        {sub === "risk" && <RiskTab />}
        {sub === "profile" && (
          <>
            <div className="tw-scope flex flex-wrap items-center gap-1 text-[11px]" role="group" aria-label="Chế độ hồ sơ">
              {([["profile", `Hồ sơ ${current}`], ["screener", "🔎 Bộ lọc Elite"]] as const).map(([m, l]) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} data-testid={`elite-mode-${m}`}
                  className={`min-h-[28px] rounded border px-3 font-bold ${mode === m ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-white/10 text-slate-400 hover:border-white/25"}`}>{l}</button>
              ))}
              {mode === "profile" && <>
                <form onSubmit={pickTicker} className="flex items-center gap-1" data-testid="elite-pick-form">
                  <input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Đổi mã, ví dụ FPT" aria-label="Đổi mã trong hồ sơ" maxLength={12} data-testid="elite-pick"
                    className="min-h-[28px] w-32 rounded border border-white/10 bg-black/30 px-2 uppercase text-slate-200 placeholder:normal-case placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none" />
                </form>
                <button type="button" onClick={openChart} data-testid="elite-open-chart" className="min-h-[28px] rounded border border-amber-400/40 px-3 font-bold text-amber-200 hover:bg-amber-400/10">Mở chart {current} trong Phân tích kỹ thuật →</button>
              </>}
            </div>
            {mode === "screener" ? (
              <section className="tw-scope rounded-lg border border-cyan-500/20 bg-slate-950/60 p-3 text-slate-200">
                <EliteScreener onOpenTicker={open} refTicker={ticker} />
              </section>
            ) : (
              <>
                <SignalProfileCard ticker={current} />
                {/* CH2: mô phỏng thời điểm vào cổ tức / KQKD. */}
                <TimingSimPanel ticker={current} />
                <EliteNewsPanel ticker={current} onTicker={open} />
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
