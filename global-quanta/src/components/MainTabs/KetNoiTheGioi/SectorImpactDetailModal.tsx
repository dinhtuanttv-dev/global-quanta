import { useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";
import { lookupSectorMapping } from "../../../lib/macro-mapping";

const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  gold: "var(--gold, #f59e0b)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

export interface SectorImpact {
  id: string;
  sectorKey: string;
  direction: "bullish" | "bearish" | "neutral";
  confidence: number;
  impactScore: number;
  reasoningVi: string | null;
  evidenceRefs: string[];
  vnTickers: string[];
  sourceCategory: string;
}

interface Props {
  sector: SectorImpact | null;
  onClose: () => void;
}

function directionMeta(direction: SectorImpact["direction"]) {
  if (direction === "bullish") return { color: T.positive, label: "Bullish", Icon: TrendingUp };
  if (direction === "bearish") return { color: T.negative, label: "Bearish", Icon: TrendingDown };
  return { color: T.textTertiary, label: "Neutral", Icon: Minus };
}

// Modal drill-down - bam ra ngoai hoac Esc de dong (dung pattern da co san
// o StockDetailModal.tsx cua tab Sieu Quet AI, nhung dung Tailwind + inline
// style token thay vi CSS class rieng, de nhat quan voi cac component
// khac trong thu muc KetNoiTheGioi/).
export default function SectorImpactDetailModal({ sector, onClose }: Props) {
  const modalRef = useRef<HTMLDivElement>(null);
  const selectTicker = useAppStore((s) => s.selectTicker);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  if (!sector) return null;
  const meta = directionMeta(sector.direction);
  const mapping = lookupSectorMapping(sector.sectorKey);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(2,6,15,0.75)" }}>
      <div ref={modalRef} className="w-full max-w-md rounded-xl p-4"
        style={{ background: "#0B0F19", border: "1px solid rgba(148,163,184,0.15)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-bold" style={{ color: "#f1f5f9" }}>{mapping?.sectorLabelVi ?? sector.sectorKey}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <meta.Icon className="w-3.5 h-3.5" style={{ color: meta.color }} />
              <span className="text-xs font-bold" style={{ color: meta.color }}>{meta.label}</span>
              <span className="text-xs" style={{ color: T.textTertiary }}>· {Math.round(sector.confidence * 100)}% tin cậy</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="p-1 rounded hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: T.textTertiary }} />
          </button>
        </div>

        {sector.reasoningVi && (
          <p className="text-xs leading-relaxed mb-3" style={{ color: "#cbd5e1" }}>{sector.reasoningVi}</p>
        )}

        {mapping?.transmissionNote && (
          <p className="text-[10px] leading-relaxed mb-3 italic" style={{ color: T.textTertiary }}>{mapping.transmissionNote}</p>
        )}

        {sector.evidenceRefs.length > 0 && (
          <div className="mb-3">
            <p className="text-[9px] font-bold uppercase mb-1" style={{ color: T.textTertiary }}>Bằng chứng đã dùng</p>
            <div className="flex flex-wrap gap-1">
              {sector.evidenceRefs.map((ref) => (
                <span key={ref} className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(148,163,184,0.08)", color: T.textSecondary }}>
                  {ref}
                </span>
              ))}
            </div>
          </div>
        )}

        {sector.vnTickers.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase mb-1" style={{ color: T.textTertiary }}>Mã cổ phiếu liên quan</p>
            <div className="flex flex-wrap gap-1.5">
              {sector.vnTickers.map((ticker) => (
                <button key={ticker} onClick={() => { selectTicker(ticker); onClose(); }}
                  className="text-xs font-black px-2 py-1 rounded"
                  style={{ background: "rgba(2,6,15,0.6)", color: meta.color, border: `1px solid ${meta.color}33` }}>
                  {ticker}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="text-[9px] italic mt-3 pt-3" style={{ color: T.textTertiary, borderTop: "1px solid rgba(148,163,184,0.08)" }}>
          Kết luận từ AI, không phải khuyến nghị đầu tư. Đã qua kiểm chứng chéo (Evidence Agent){sector.sourceCategory ? "." : "."}
        </p>
      </div>
    </div>
  );
}
