// Elite 10 — trung tâm ra quyết định (E4–E6 2026-10-17). Tab con:
//   1. Bảng quyết định hôm nay — danh mục Elite 10, trọng số tín hiệu theo bằng chứng, sổ theo dõi tiến (Gateway /api/elite/*).
//   2. Hồ sơ 360° — mọi tín hiệu của một mã từ 7 tab + phân tích kỹ thuật thật (E0).
//   3. Phòng họp AI — tranh luận Claude ↔ Gemini có trọng tài, bản tin phiên, hỏi đáp (E5).
//   4. Bằng chứng & sổ theo dõi — IC từng tín hiệu theo kỳ hạn, bậc, sổ theo dõi tiến (E6).
//   5. Rủi ro danh mục — Ledoit–Wolf, đóng góp rủi ro, VaR/CVaR, căng thẳng (E6).
import { useRef, useState, type KeyboardEvent } from "react";
import DecisionBoard from "./center/DecisionBoard";
import SignalProfileCard from "./center/SignalProfileCard";
import TimingSimPanel from "./timing/TimingSimPanel";
import EliteAiRoom from "./center/EliteAiRoom";
import EvidenceLedgerTab from "./center/EvidenceLedgerTab";
import RiskTab from "./center/RiskTab";
import { TaVnIndexTab } from "./TaVnIndexTab";
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
  const [sub, setSub] = useState<Sub>("board");
  const [ticker, setTicker] = useState<string | null>(null);
  const refs = useRef<Record<Sub, HTMLButtonElement | null>>({ board: null, profile: null, ai: null, evidence: null, risk: null });
  const current = ticker ?? globalTicker ?? "VNINDEX";
  const open = (t: string) => { setTicker(t); setSub("profile"); };
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
            <SignalProfileCard ticker={current} />
            {/* CH2: mô phỏng thời điểm vào cổ tức / KQKD (chart chính mới; chart kỹ thuật cũ chuyển sau nút tạm ở CH6). */}
            <TimingSimPanel ticker={current} />
            <TaVnIndexTab ticker={current} onTickerChange={setTicker} />
          </>
        )}
      </section>
    </div>
  );
}
