// Cổng XÁC NHẬN đặt trước (W3, docs/WORLD-W3-prereg.md) — 12 cặp kinh tế cố định, trễ 1 tháng, BY trên 12 cặp.
// Chỉ cặp "đã xác nhận" mới vào Lọc ngành; ma trận "Ngành (thăm dò)" bên dưới chỉ để khám phá.
import useSWR from "swr";
import { fetchMarketJson } from "../../../services/marketDataClient";
import EvidenceTag from "./EvidenceTag";

interface Row {
  id: string; factor: string; sector: string; sign: 1 | -1; mechanismVi: string; factorName?: string; sectorName?: string;
  available: boolean; beta: number | null; t: number | null; pOneSided: number; q: number; signOk: boolean | null; stable: boolean | null;
  oosPass: boolean | null; oosIc: number | null; confirmed: boolean; reasonVi: string;
}
interface Doc { version: string; lag: number; family: number; confirmed: number; firstPeriod: string; lastPeriod: string; notice?: string; rows: Row[] }

const muted = { color: "var(--text-tertiary)" };
const f = (v: number | null, d = 2) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d).replace(".", ","));
const yes = (b: boolean | null) => (b == null ? "—" : b ? "có" : "không");

export default function WorldConfirmatoryPanel() {
  const { data, error } = useSWR<Doc>("world-confirmatory", () => fetchMarketJson<Doc>("/api/world/confirmatory"), { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 });
  if (error) return <p className="text-[10px]" style={{ color: "var(--negative)" }}>Không tải được cổng xác nhận: {error.message}</p>;
  if (!data) return <p className="text-[10px]" style={muted}>Đang tính cổng xác nhận…</p>;
  return (
    <div className="rounded-xl p-3 text-[10.5px] space-y-2" style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", color: "var(--text-secondary)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[10px] font-bold uppercase">Cổng xác nhận đặt trước · {data.confirmed}/{data.family} cặp đạt</p>
        <EvidenceTag kind="evidence" title="Chỉ cặp đạt ở đây mới được đưa vào quyết định Lọc ngành" />
      </div>
      <p style={muted}>
        {data.version}: {data.family} cặp chọn theo cơ chế kinh tế TRƯỚC khi chạy, trễ cố định {data.lag} tháng, p một phía theo chiều kỳ vọng,
        hiệu chỉnh BY trên đúng {data.family} cặp; đạt khi q &lt; 0,05, đúng chiều, ổn định và đạt ngoài mẫu. Dữ liệu {data.firstPeriod} → {data.lastPeriod}.
        {data.notice ? ` ${data.notice}` : ""}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse", minWidth: 560 }}>
          <thead><tr style={{ ...muted, fontSize: 9.5, textTransform: "uppercase" }}>
            <th className="text-left">Cặp</th><th className="text-left">Kỳ vọng</th><th className="text-right">β (t)</th><th className="text-right">p 1 phía</th>
            <th className="text-right">q</th><th className="text-center">Ổn định</th><th className="text-center">Ngoài mẫu</th><th className="text-left">Kết luận</th>
          </tr></thead>
          <tbody>{data.rows.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid rgba(148,163,184,0.08)" }} title={`${r.mechanismVi} — ${r.reasonVi}`}>
              <td className="py-1">{r.id} · {r.factorName ?? r.factor} → {r.sectorName ?? r.sector}</td>
              <td>{r.sign > 0 ? "+" : "−"}</td>
              <td className="text-right">{r.available ? `${f(r.beta, 3)} (${f(r.t)})` : "thiếu dữ liệu"}</td>
              <td className="text-right">{f(r.pOneSided, 3)}</td>
              <td className="text-right">{f(r.q, 3)}</td>
              <td className="text-center">{yes(r.stable)}</td>
              <td className="text-center">{r.oosIc == null && r.available ? "chưa đủ điểm" : yes(r.oosPass)}</td>
              <td style={{ color: r.confirmed ? "var(--positive)" : r.signOk === false ? "var(--negative)" : "var(--text-tertiary)" }}>
                {r.confirmed ? "Đã xác nhận" : r.signOk === false ? "Ngược chiều" : "Chưa xác nhận"}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {data.confirmed === 0 && (
        <p style={muted}>
          Chưa cặp nào đạt → Lọc ngành không dùng tín hiệu thế giới (trọng số 0). Phép thử ngoài mẫu cần chuỗi dài hơn ~68 tháng hiện có
          (giá ngành chỉ có từ 2020); mỗi tháng đóng mới được cộng thêm vào kiểm tra tiến.
        </p>
      )}
    </div>
  );
}
