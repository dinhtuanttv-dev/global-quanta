// Trading Matrix — Index Impact (spec §6.8): điểm đóng góp của từng mã vào biến động VN-Index phiên đã chốt.
// Luôn hiện phần kiểm tra Σ đóng góp so với biến động thật; lệch > 0,05 điểm % thì ghi rõ, không che.
// Bấm mã -> chọn mã toàn trang; bấm ngành -> lọc bảng Siêu Quét theo ngành.
import type { IndexImpactDoc, ImpactItem } from "../../../../hooks/useTradingMatrix";
import { vn, when } from "./MatrixCards";

const UP = "#34d399", DOWN = "#fb7185";

function Bars({ title, rows, max, onSelect }: { title: string; rows: ImpactItem[]; max: number; onSelect: (t: string) => void }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[10px] font-bold text-slate-300 mb-1">{title}</h4>
      {rows.length ? (
        <ul className="space-y-0.5">
          {rows.map((x) => {
            const w = max > 0 ? Math.max(2, (Math.abs(x.points) / max) * 100) : 0, pos = x.points >= 0;
            return (
              <li key={x.symbol} className="grid grid-cols-[3.2rem_1fr_3.6rem] items-center gap-1.5 text-[10px]" title={`${x.symbol} · ${x.industry} · tỷ trọng ${vn(x.weightPct, 2)}% · giá ${vn(x.changePct, 2)}%${x.adjusted ? ` · tham chiếu điều chỉnh ${x.adjusted.label}` : ""}`}>
                <button type="button" onClick={() => onSelect(x.symbol)} className="text-left font-bold text-amber-300 hover:text-amber-200 truncate" aria-label={`Chọn ${x.symbol}`}>{x.symbol}</button>
                <span className="h-2.5 rounded-sm bg-white/5 relative overflow-hidden" aria-hidden>
                  <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${w}%`, background: pos ? UP : DOWN, opacity: 0.85 }} />
                </span>
                <span className={`text-right font-mono ${pos ? "text-emerald-300" : "text-rose-300"}`}>{pos ? "+" : ""}{vn(x.points, 2)}</span>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[10px] text-slate-500">Không có mã.</p>}
    </div>
  );
}

export default function IndexImpactTable({ data, onSelect, onIndustry }: { data: IndexImpactDoc; onSelect: (t: string) => void; onIndustry: (n: string | null) => void }) {
  if (data.live === false || data.pending) return <p className="text-[10px] text-slate-400" data-testid="mx-impact-pending">{data.reason}</p>;
  const up = data.items.filter((x) => x.points > 0).slice(0, 10);
  const down = [...data.items].reverse().filter((x) => x.points < 0).slice(0, 10);
  const max = Math.max(0, ...up.map((x) => x.points), ...down.map((x) => -x.points));
  const c = data.check;
  const ok = c?.status === "MATCH";
  const sectors = data.sectors.filter((s) => Math.abs(s.points) >= 0.01);
  return (
    <div className="space-y-2" data-testid="mx-impact">
      <p className="text-[10px] text-slate-300">
        {data.horizon === "intraday"
          ? <>Trong phiên {when(data.date)} · giá lúc {new Date(data.asOf ?? "").toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}{data.refreshing ? " (đang làm mới)" : ""} · so đóng cửa {when(data.prevSession ?? null)}{data.lastError ? <span className="text-amber-300"> · đang dùng bản {Math.round((data.ageSec ?? 0) / 60)} phút trước ({data.lastError})</span> : null}</>
          : <>Phiên {when(data.date)}</>} · Σ đóng góp <b className="font-mono">{c ? `${c.predictedPoints >= 0 ? "+" : ""}${vn(c.predictedPoints, 2)}` : "—"}</b> điểm
        {c?.actualPoints != null && <> · VN-Index thật <b className="font-mono">{c.actualPoints >= 0 ? "+" : ""}{vn(c.actualPoints, 2)}</b> điểm</>}
        {c && <span className={`ml-1 text-[9px] px-1 rounded ${ok ? "text-emerald-300 bg-emerald-500/10" : "text-amber-300 bg-amber-500/10"}`} data-testid="mx-impact-check">
          {ok ? `✓ khớp (lệch ${vn(c.diffPp, 3)} điểm %)` : c.status === "NO_INDEX" ? "chưa có VN-Index phiên này" : `⚠ lệch ${vn(c.diffPp, 3)} điểm % — có thể thiếu sự kiện quyền / mã mới`}
        </span>}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Bars title="Kéo chỉ số tăng (điểm)" rows={up} max={max} onSelect={onSelect} />
        <Bars title="Đè chỉ số giảm (điểm)" rows={down} max={max} onSelect={onSelect} />
      </div>
      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Đóng góp theo ngành">
          {sectors.map((s) => (
            <button key={s.industry} type="button" onClick={() => onIndustry(s.industry)} title={`Lọc bảng theo ${s.industry} · ${s.n} mã (${s.up} tăng / ${s.down} giảm)`}
              className={`text-[9.5px] px-1.5 py-0.5 rounded border ${s.points >= 0 ? "border-emerald-500/30 text-emerald-200" : "border-rose-500/30 text-rose-200"} hover:bg-white/5`}>
              {s.industry} {s.points >= 0 ? "▲ +" : "▼ "}{vn(s.points, 2)}
            </button>
          ))}
        </div>
      )}
      <p className="text-[9px] text-slate-500">
        {data.coverage.symbols}/{data.coverage.of} mã HOSE có số cổ phiếu ({data.sharesSource}{data.sharesAsOf ? `, ${when(data.sharesAsOf.slice(0, 10))}` : ""}){data.coverage.missing.length ? ` · thiếu: ${data.coverage.missing.slice(0, 6).join(", ")}${data.coverage.missing.length > 6 ? "…" : ""}` : ""}
        {data.sharesWarning ? ` · dùng bản lưu (${data.sharesWarning})` : ""}
      </p>
      <p className="text-[9px] text-slate-500">{data.method} {data.vn30Note}</p>
    </div>
  );
}
