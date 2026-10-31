// Trading Matrix M2 — "Mã biến động đáng chú ý" (spec §6.8): KHÔNG gọi là "tác động chỉ số" vì không có trọng số chỉ số theo
// ngày hiệu lực. Tăng / giảm mạnh nhất trong nhóm thanh khoản ≥ trung vị phạm vi + GTGD đột biến. Bấm mã -> chọn mã toàn trang.
import type { MatrixMovers, Mover } from "../../../../hooks/useTradingMatrix";
import { vn } from "./MatrixCards";

function List({ title, rows, onSelect, kind }: { title: string; rows: Mover[]; onSelect: (t: string) => void; kind: "up" | "down" | "spike" }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[10px] font-bold text-slate-300 mb-1">{title}</h4>
      {rows.length ? (
        <table className="w-full text-[10px] font-mono">
          <tbody>
            {rows.map((m) => (
              <tr key={m.symbol} className="border-b border-white/5">
                <td className="py-0.5">
                  <button type="button" onClick={() => onSelect(m.symbol)} className="font-sans font-bold text-amber-300 hover:text-amber-200" aria-label={`Chọn ${m.symbol}`}>{m.symbol}</button>
                  {m.atCeiling && <span className="ml-1 text-[8px] text-violet-300 font-sans">trần</span>}
                  {m.atFloor && <span className="ml-1 text-[8px] text-cyan-300 font-sans">sàn</span>}
                  <span className="block text-[8px] text-slate-500 font-sans truncate">{m.industry ?? "—"}</span>
                </td>
                <td className={`text-right ${m.ret >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{m.ret >= 0 ? "▲ +" : "▼ "}{vn(m.ret, 2)}%</td>
                <td className="text-right text-slate-400">{kind === "spike" ? `×${vn(m.valueRatio, 1)}` : m.value != null ? `${vn(m.value / 1e9, 0)} tỷ` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-[10px] text-slate-500">Không có mã.</p>}
    </div>
  );
}

export default function NotableMovers({ data, onSelect }: { data: MatrixMovers; onSelect: (ticker: string) => void }) {
  return (
    <div className="space-y-2" data-testid="mx-movers">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <List title="Tăng mạnh nhất" rows={data.gainers} onSelect={onSelect} kind="up" />
        <List title="Giảm mạnh nhất" rows={data.losers} onSelect={onSelect} kind="down" />
        <List title="GTGD đột biến (≥ 2× TB20)" rows={data.valueSpikes} onSelect={onSelect} kind="spike" />
      </div>
      <p className="text-[9px] text-slate-500">{data.scope.label} · phiên đã chốt {data.asOf.slice(8, 10)}/{data.asOf.slice(5, 7)} · {data.eligible} mã · lọc thanh khoản ≥ {data.liquidityFloor ? `${vn(data.liquidityFloor / 1e9, 0)} tỷ/phiên` : "—"}</p>
    </div>
  );
}
