// Sổ bằng chứng (S3): mọi kiểm định ĐẶT TRƯỚC của tab Kết nối thế giới ở một chỗ + theo dõi tiến (S2) của xếp hạng ngắn hạn.
import { useWorldStrategy } from "../../../../hooks/useWorldStrategy";
import { fmtZ } from "../../../../lib/worldSectors/types";
import EvidenceTag from "../EvidenceTag";
import LineChart, { SERIES_COLORS } from "../commodity/LineChart";

const muted = { color: "var(--text-tertiary)" };
type Verdict = "pass" | "fail" | "partial";
const VERDICT: Record<Verdict, { vi: string; bg: string; fg: string }> = {
  pass: { vi: "ĐẠT", bg: "rgba(52,211,153,0.12)", fg: "var(--positive, #34d399)" },
  partial: { vi: "ĐẠT MỘT PHẦN", bg: "rgba(245,158,11,0.12)", fg: "var(--gold, #f59e0b)" },
  fail: { vi: "KHÔNG ĐẠT", bg: "rgba(248,113,113,0.12)", fg: "var(--negative, #f87171)" },
};

/** Kết quả đã công bố trong repo (docs đăng ký trước + kết quả). Cập nhật khi chạy lại kiểm định. */
export const PREREG_TESTS: { id: string; nameVi: string; date: string; verdict: Verdict; resultVi: string; useVi: string; doc: string }[] = [
  { id: "WS-H3", nameVi: "Xếp hạng ngành thuận/ngược gió ngắn hạn (ngành thế giới → ngành VN)", date: "17/10/2026", verdict: "pass", resultVi: "IC cắt ngang TB +0,020, t 2,53, p 0,006, hai nửa dương (942 phiên)", useVi: "Dùng trong α ngắn hạn — lợi thế nhỏ", doc: "backend/src/market/worldSectors/WS-results.md" },
  { id: "WS-H2", nameVi: "Từng ngành (tương đối, BY/22)", date: "17/10/2026", verdict: "partial", resultVi: "Chỉ Dầu khí đạt (IC +0,182, q 0,016); 21 ngành không", useVi: "IC riêng Dầu khí (co 50/50 về IC danh sách)", doc: "backend/src/market/worldSectors/WS-results.md" },
  { id: "WS-H4", nameVi: "Xếp hạng trung hạn (3 tháng → tháng sau)", date: "17/10/2026", verdict: "fail", resultVi: "IC TB −0,007, t −0,21 (45 tháng)", useVi: "Không dự báo trung hạn — chỉ bối cảnh", doc: "backend/src/market/worldSectors/WS-results.md" },
  { id: "W3", nameVi: "Cổng xác nhận truyền dẫn: 12 cặp yếu tố → ngành", date: "16/10/2026", verdict: "fail", resultVi: "0/12 cặp; ngoài mẫu chưa đủ điểm (~68 tháng)", useVi: "Lọc ngành không nhận trọng số thế giới", doc: "src/macro-center/docs/WORLD-W3-results.md" },
  { id: "W5", nameVi: "Phản ứng sự kiện (ngành định trước)", date: "16/10/2026", verdict: "fail", resultVi: "Bậc B 1 · C 34; không nhân rộng được", useVi: "Chỉ mô tả", doc: "src/macro-center/docs/WORLD-W5-results.md" },
  { id: "RON", nameVi: "Risk-On Index (DXY/VIX/US10Y) → VN-Index 20 phiên", date: "16/10/2026", verdict: "fail", resultVi: "IC +0,049, KTC95 [−0,10; +0,22] (124 mẫu, 10 năm)", useVi: "Không dùng trong quyết định; chỉ hiển thị", doc: "backend/src/market/riskOnValidation/RON-results.md" },
  { id: "L3", nameVi: "Lọc ngành: ngành vào \"Cải thiện\" (RRG)", date: "10/10/2026", verdict: "fail", resultVi: "Ngoài mẫu kém VN-Index (−2,02%/20 phiên)", useVi: "RRG chỉ là một phiếu bối cảnh trung hạn", doc: "backend/src/market/sectors/L3-prereg.md" },
];

export default function EvidenceLedgerPanel() {
  const { data } = useWorldStrategy();
  const f = data?.forward;
  return (
    <section className="tw-scope rounded-xl p-3 space-y-2" data-testid="evidence-ledger" style={{ background: "rgba(2,6,15,0.55)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Sổ bằng chứng — mọi kiểm định đặt trước</h4>
        <EvidenceTag kind="evidence" title="Giả thuyết và luật được commit trước khi tính kết quả; không chỉnh sau khi xem" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10.5px]" style={{ borderCollapse: "collapse", minWidth: 620 }}>
          <thead><tr style={muted}><th className="text-left font-normal">Kiểm định</th><th className="font-normal">Kết quả</th><th className="text-left font-normal">Số liệu</th><th className="text-left font-normal">Đang dùng như thế nào</th></tr></thead>
          <tbody>
            {PREREG_TESTS.map((t) => (
              <tr key={t.id} style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }} title={`${t.doc} · ${t.date}`}>
                <td className="py-1.5" style={{ color: "#f1f5f9" }}><span style={muted}>{t.id}</span> {t.nameVi}</td>
                <td className="text-center"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: VERDICT[t.verdict].bg, color: VERDICT[t.verdict].fg }}>{VERDICT[t.verdict].vi}</span></td>
                <td style={{ color: "var(--text-secondary)" }}>{t.resultVi}</td>
                <td style={muted}>{t.useVi}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-2 border-t space-y-1.5" style={{ borderColor: "rgba(148,163,184,0.1)" }}>
        <p className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Theo dõi tiến — xếp hạng ngắn hạn sau khi lên live</p>
        {!f ? <p className="text-[10px] italic" style={muted}>Đang tải…</p> : (
          <>
            <p className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
              {f.statusVi} Bắt đầu ghi {f.since ? f.since.split("-").reverse().join("/") : "—"} · {f.recorded} phiên đã ghi · {f.evaluated} phiên đã chấm
              {f.evaluated > 0 && <> · IC TB {fmtZ(f.meanIc, 3)}{f.t != null ? ` (t ${fmtZ(f.t, 2)})` : ""} · nhóm đầu thắng nhóm cuối {f.hitRate == null ? "—" : `${Math.round(f.hitRate * 100)}%`} số phiên · cộng dồn {fmtZ(f.cumSpreadPct, 2)}%</>}
            </p>
            {f.curve.length > 1 && (
              <LineChart series={[{ key: "fw", label: "Nhóm đầu − nhóm cuối, cộng dồn (%)", color: SERIES_COLORS.s1, points: f.curve }]} height={120} refLines={[{ y: 0, label: "0" }]}
                ariaLabel="Lợi suất cộng dồn danh mục nhóm đầu trừ nhóm cuối theo xếp hạng ngắn hạn, theo dõi tiến" directLabels={false} />
            )}
            <p className="text-[9px]" style={muted}>{f.methodVi}</p>
          </>
        )}
      </div>
    </section>
  );
}
