import { useRef } from "react";
import { Search, GitMerge, Star, Cpu, Coffee, TrendingUp, Trophy } from "lucide-react";

export type SubTabKey = "pattern" | "convergence" | "golden" | "camslim" | "base-breakout" | "sepa" | "aichart";

interface SubTabNavigationProps {
  activeTab: SubTabKey;
  onTabChange: (tab: SubTabKey) => void;
}

const TABS: { key: SubTabKey; label: string; icon: React.ReactNode }[] = [
  { key: "pattern", label: "Pattern Scanner", icon: <Search className="w-3.5 h-3.5" /> },
  { key: "convergence", label: "Bộ lọc Hợp lưu Nâng Cao", icon: <GitMerge className="w-3.5 h-3.5" /> },
  { key: "golden", label: "Golden SEPA", icon: <Star className="w-3.5 h-3.5" /> },
  { key: "camslim", label: "CAMSLIM Cup & Handle", icon: <Coffee className="w-3.5 h-3.5" /> },
  { key: "base-breakout", label: "Base Breakout", icon: <TrendingUp className="w-3.5 h-3.5" /> },
  { key: "sepa", label: "SEPA Minervini", icon: <Trophy className="w-3.5 h-3.5" /> },
  { key: "aichart", label: "AI Chart Vision", icon: <Cpu className="w-3.5 h-3.5" /> },
];

/**
 * TA-T7 (28/11/2026, docs/ta-tradingview D1): thanh chọn 7 bộ lọc theo chuẩn tab con của dự án (.q-subtabs / .q-subtab —
 * như Tổng quan, Ngành, Vĩ mô, Cơ bản): gạch chân màu nhấn cho tab đang chọn, thay viên thuốc vàng 10px.
 * Chỉ đổi kiểu: 7 khoá, 7 nhãn, thứ tự và onTabChange giữ nguyên; thêm phím ← → Home End như các thanh tab con khác.
 */
export default function SubTabNavigation({ activeTab, onTabChange }: SubTabNavigationProps) {
  const refs = useRef<Partial<Record<SubTabKey, HTMLButtonElement | null>>>({});
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.findIndex((t) => t.key === activeTab);
    const j = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length
      : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    onTabChange(TABS[j].key);
    refs.current[TABS[j].key]?.focus();
  };
  return (
    <div role="tablist" aria-label="Bộ lọc kỹ thuật" className="q-subtabs" data-testid="ta-filter-tabs" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.key}
          tabIndex={activeTab === tab.key ? 0 : -1}
          data-subtab={tab.key}
          ref={(el) => { refs.current[tab.key] = el; }}
          onKeyDown={onKey}
          onClick={() => onTabChange(tab.key)}
          className="q-subtab"
          style={{ flexShrink: 0 }}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
        </button>
      ))}
    </div>
  );
}
