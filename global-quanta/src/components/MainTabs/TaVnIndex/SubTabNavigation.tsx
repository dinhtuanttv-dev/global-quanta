import { Search, GitMerge, Star } from "lucide-react";

export type SubTabKey = "pattern" | "convergence" | "golden";

interface SubTabNavigationProps {
  activeTab: SubTabKey;
  onTabChange: (tab: SubTabKey) => void;
}

const TABS: { key: SubTabKey; label: string; icon: React.ReactNode }[] = [
  { key: "pattern", label: "Pattern Scanner", icon: <Search className="w-3.5 h-3.5" /> },
  { key: "convergence", label: "Bộ lọc Hợp lưu Nâng Cao", icon: <GitMerge className="w-3.5 h-3.5" /> },
  { key: "golden", label: "Golden Filter x Top 20", icon: <Star className="w-3.5 h-3.5" /> },
];

export default function SubTabNavigation({ activeTab, onTabChange }: SubTabNavigationProps) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-2 rounded-lg" style={{ background: "rgba(15,23,42,0.8)", borderTop: "1px solid rgba(148,163,184,0.1)" }}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold transition-all duration-200"
          style={{
            background: activeTab === tab.key
              ? "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.1))"
              : "rgba(30,41,59,0.5)",
            color: activeTab === tab.key ? "#fbbf24" : "#94a3b8",
            border: activeTab === tab.key
              ? "1px solid rgba(245,158,11,0.4)"
              : "1px solid rgba(148,163,184,0.1)",
          }}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
          <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
        </button>
      ))}
    </div>
  );
}