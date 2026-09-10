import type { SectorConfidence } from "../../../hooks/useSectorConfidence";

const T = {
  positive: "var(--positive, #34d399)",
  gold: "var(--gold, #f59e0b)",
  negative: "var(--negative, #f87171)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

// MOI (2026-09-10): phan loai muc do tin cay theo |r| - nguong dua tren quy
// uoc pho bien trong thong ke (Cohen, 1988): |r|<0.2 yeu, 0.2-0.5 trung
// binh, >0.5 manh. CAN backend cung cap sampleSize toi thieu ~30 phien de
// he so co y nghia thong ke, khong chi hien thi r don thuan.
function classify(r: number, sampleSize: number): { label: string; color: string } {
  if (sampleSize < 20) return { label: "Chưa đủ dữ liệu", color: T.textTertiary };
  const abs = Math.abs(r);
  if (abs >= 0.5) return { label: "Tương quan mạnh", color: T.positive };
  if (abs >= 0.2) return { label: "Tương quan trung bình", color: T.gold };
  return { label: "Tương quan yếu", color: T.negative };
}

export default function ConfidenceBadge({ confidence }: { confidence: SectorConfidence | undefined }) {
  if (!confidence || typeof confidence.correlationR !== "number") return null;
  const { label, color } = classify(confidence.correlationR, confidence.sampleSize);
  return (
    <span
      title={`Hệ số tương quan Pearson r = ${confidence.correlationR.toFixed(2)} (${confidence.sampleSize} phiên, tính lại ${new Date(confidence.lastComputedAt).toLocaleDateString("vi-VN")})`}
      className="text-[8px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: `${color}1A`, color }}>
      {label} (r={confidence.correlationR.toFixed(2)})
    </span>
  );
}
