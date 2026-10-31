// Siêu Quét v2 — nhãn bằng chứng của Smart Score theo kiểm định đặt trước (backend/src/market/scanner/SQ-prereg.md).
import type { ScannerValidation } from "../../../hooks/useSieuQuetScanner";

const pct3 = (x: number | null | undefined) => (x === null || x === undefined ? "—" : x.toLocaleString("vi-VN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }));

/** Nhãn bằng chứng của Smart Score theo kiểm định đặt trước (SQ-prereg.md): hiện công khai, không ẩn bảng. */
export function ScannerEvidence({ validation }: { validation: ScannerValidation | null }) {
  if (!validation || validation.status !== "DONE") {
    return <div className="text-[9px] text-amber-300/90" data-testid="sq-evidence">Smart Score chưa kiểm định — chỉ là xếp hạng mô tả.</div>;
  }
  const h = String(validation.primaryHorizon ?? 20);
  const ic = validation.ic?.smartScore?.[h]?.oos;
  const pass = validation.verdicts.smartScore === "PASS";
  const s = validation.sample;
  return (
    <div className={`text-[9px] ${pass ? "text-emerald-300" : "text-amber-300/90"}`} data-testid="sq-evidence"
      title={`Kiểm định ${validation.prereg} (${validation.ranAt}): engine production chạy lại theo ngày với BCTC đúng thời điểm, IC hạng Spearman ${h} phiên; trong mẫu tới ${validation.isEnd}, ngoài mẫu sau đó. Mẫu VN100 hiện tại (có thiên lệch sống sót).`}>
      {pass ? "Smart Score ĐÃ KIỂM ĐỊNH" : "Smart Score CHƯA ĐẠT KIỂM ĐỊNH — chỉ là xếp hạng mô tả, không phải tín hiệu dự báo"}
      {" · "}IC ngoài mẫu {h} phiên {pct3(ic?.mean)} (CI 95% {pct3(ic?.lo)} … {pct3(ic?.hi)}, {ic?.dates ?? 0} ngày)
      {s ? ` · VN100 ${s.from?.slice(0, 4)}–${s.to?.slice(0, 4)}` : ""}
    </div>
  );
}
