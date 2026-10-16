// Nguồn & độ phủ dữ liệu của "Truyền dẫn & bằng chứng" (Gateway /api/world/source) — người dùng biết mọi con số dựa trên gì,
// yếu tố nào CHƯA có nguồn, và thị trường nào là đại diện (proxy).
import useSWR from "swr";
import { fetchMarketJson } from "../../../services/marketDataClient";

interface CoverageRow { id: string; nameVi: string; role: "factor" | "sector"; n: number; first: string | null; last: string | null; stale: boolean; sources: string[]; usable: boolean }
interface WorldSource {
  mode: "real" | "synthetic";
  notice: string | null;
  minMonths: number;
  coverage: CoverageRow[];
  events: { accepted: number; rejected: { id: string; errors: string[] }[] };
  meta: null | {
    builtAt: string;
    complete: boolean;
    report: {
      markets: Record<string, { source: string; labelVi?: string; lagOneDay?: boolean; flatDays?: number }>;
      sectors: Record<string, { members: string[]; missing: string[]; from: string | null; source?: { kind: "icb" | "icb+basket" | "basket"; icb: string | null; icbName: string | null; icbFrom: string | null; survivorshipBias: boolean } }>;
      missingFactors: Record<string, string>;
      notes: string[];
    };
  };
}

const MARKET_VI: Record<string, string> = { US: "Mỹ", CN: "Trung Quốc", JP: "Nhật", KR: "Hàn Quốc", TH: "Thái Lan", VN: "Việt Nam" };
const muted = { color: "var(--text-tertiary)" };

export default function WorldSourcePanel() {
  const { data, error } = useSWR<WorldSource>("world-source", () => fetchMarketJson<WorldSource>("/api/world/source"), { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  if (error) return <p className="text-[10px]" style={{ color: "var(--negative)" }}>Không tải được nguồn dữ liệu Kết nối thế giới: {error.message}</p>;
  if (!data) return <p className="text-[10px]" style={muted}>Đang tải nguồn dữ liệu…</p>;
  const r = data.meta?.report;
  const factors = data.coverage.filter((c) => c.role === "factor");
  const sectors = data.coverage.filter((c) => c.role === "sector");
  return (
    <div className="rounded-xl p-3 text-[10.5px] space-y-2" style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)", color: "var(--text-secondary)" }}>
      <p>
        Chế độ dữ liệu:{" "}
        <b style={{ color: data.mode === "real" ? "var(--positive)" : "var(--warning, #f59e0b)" }}>{data.mode === "real" ? "SỐ LIỆU THẬT" : "MÔ PHỎNG"}</b>
        {data.meta && <> · dựng lúc {new Date(data.meta.builtAt).toLocaleString("vi-VN")}</>}
        {data.mode === "real" && <> · biến thế giới đủ {data.minMonths} tháng: {factors.filter((f) => f.usable).map((f) => f.id).join(", ") || "—"}</>}
        {data.mode === "synthetic" && <> · đang dựng dữ liệu thật lần đầu (lịch sử 6 năm cho rổ ngành) — tự cập nhật khi xong.</>}
      </p>
      {r && Object.keys(r.missingFactors).length > 0 && (
        <p>
          <b>Chưa có nguồn mở (không có dữ liệu, không ước lượng):</b> {Object.values(r.missingFactors).join("; ")}. Kịch bản dùng các yếu tố này sẽ báo “bỏ qua”.
        </p>
      )}
      {r && (
        <details>
          <summary style={{ cursor: "pointer" }}>Chi tiết nguồn: thị trường, rổ ngành, yếu tố tháng, sự kiện</summary>
          <div className="space-y-2 mt-2">
            <div>
              <b>Thị trường (lợi suất ngày trên lịch phiên VN):</b>
              <ul className="list-disc pl-4">
                {Object.entries(r.markets).map(([id, m]) => (
                  <li key={id}>
                    {MARKET_VI[id] ?? id}: {m.labelVi ?? m.source}
                    {m.lagOneDay ? " — dùng phiên ngày trước (sàn đóng cửa sau giờ VN)" : ""}
                    {m.flatDays ? ` · ${m.flatDays} phiên sàn nghỉ tính 0%` : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <b>Ngành = chỉ số ngành ICB toàn ngành (khi khớp sát), đoạn trước đó / ngành không có ICB = rổ chọn tay cân bằng tỷ trọng (giá điều chỉnh):</b>
              <ul className="list-disc pl-4">
                {sectors.map((s) => (
                  <li key={s.id}>
                    {s.nameVi}:{" "}
                    {r.sectors[s.id]?.source?.icbFrom
                      ? <>ICB {r.sectors[s.id].source!.icb} {r.sectors[s.id].source!.icbName} từ {r.sectors[s.id].source!.icbFrom}{r.sectors[s.id].source!.kind === "icb+basket" ? <span style={muted}> · trước đó rổ: {r.sectors[s.id].members.join(", ")}</span> : null}</>
                      : <>rổ chọn tay: {r.sectors[s.id]?.members.join(", ") || "—"}</>}
                    {r.sectors[s.id]?.missing.length ? <span style={muted}> (thiếu: {r.sectors[s.id].missing.join(", ")})</span> : null}
                    {r.sectors[s.id]?.source?.survivorshipBias
                      ? <span title="Rổ chọn tay gồm các mã còn niêm yết & thanh khoản hôm nay — lợi suất quá khứ có xu hướng thiên cao (thiên lệch sống sót)" style={{ color: "var(--gold, #e8b84b)" }}> · thiên lệch sống sót</span>
                      : null}
                    {" · "}{s.n} tháng{s.stale ? " · ngừng cập nhật — đã loại" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <b>Yếu tố thế giới (tháng đã đóng):</b>
              <ul className="list-disc pl-4">
                {factors.map((f) => (
                  <li key={f.id}>
                    {f.nameVi} ({f.id}): {f.n ? `${f.first} → ${f.last}, ${f.n} tháng · ${f.sources.join(", ")}` : <span style={muted}>chưa có dữ liệu</span>}
                    {f.stale ? " · ngừng cập nhật — đã loại" : ""}
                  </li>
                ))}
              </ul>
            </div>
            <p>
              <b>Sự kiện:</b> {data.events.accepted} sự kiện thật đã kiểm duyệt (lịch họp FOMC, thuế đối ứng Mỹ 02/04/2025 và lệnh hoãn 09/04/2025, FTSE nâng hạng 07/10/2025)
              {data.events.rejected.length ? ` · ${data.events.rejected.length} bản ghi bị validator từ chối` : ""}. Ngành “dự kiến” chịu tác động chỉ là giả thuyết; kết quả là event study.
            </p>
            {r.notes.map((n) => <p key={n} style={{ color: "var(--warning, #f59e0b)" }}>{n}</p>)}
          </div>
        </details>
      )}
    </div>
  );
}
