// CH3 (29/10/2026) — thẻ "Quạt dự phóng có điều kiện" dưới chart mô phỏng: từ HÔM NAY tới phiên thoát của cửa sổ đang xem —
// trung vị + dải 80% (Harrell–Davis có trọng số analog, nới theo CQR bỏ-một-đợt), xác suất lãi ròng (hậu nghiệm Beta theo n hiệu dụng),
// độ phủ LOO trước / sau hiệu chỉnh và các đợt tương tự nặng nhất. Phân phối lịch sử có điều kiện, không phải dự báo đã kiểm định.
import type { AnalogFan } from "../../../lib/elite10/analogFan";
import type { EventStudyWindow } from "../../../lib/elite10/timingSim";

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : ""}${(x * 100).toFixed(d)}%`);
const p0 = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

export default function AnalogFanCard({ fan, window: win, eventWord, loading }: { fan: AnalogFan | null; window: EventStudyWindow | null; eventWord: string; loading: boolean }) {
  if (!fan) {
    return (
      <p className="mt-2 text-[10.5px] text-slate-500" data-testid="analog-fan-empty">
        🔭 Quạt dự phóng: {loading ? "đang tải nến ngày…" : `chỉ dựng TRƯỚC ${eventWord} khi có ≥ 4 đợt đủ nến ngày (sau sự kiện, giá đóng cửa đã có cổ tức xen giữa).`}
      </p>
    );
  }
  const exit = win ? fan.points.find((p) => p.offset === win.exitOffset) ?? null : null;
  const now = Math.expm1(fan.anchorCar);
  const fwd = (v: number | null | undefined) => (v == null ? null : (1 + v) / (1 + now) - 1); // từ hôm nay tới mốc (lợi suất vượt)
  const lo = exit ? exit.loAdj ?? exit.lo : null, hi = exit ? exit.hiAdj ?? exit.hi : null;
  const top = [...fan.weights].sort((a, b) => b.weight - a.weight).slice(0, 3);
  const level = Math.round(fan.level * 100);
  return (
    <div className="mt-2 rounded border border-amber-300/25 bg-amber-400/5 px-2.5 py-2 text-[10.5px] text-slate-300" data-testid="analog-fan-card">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <b className="text-amber-200">🔭 Quạt dự phóng có điều kiện</b>
        <span className="text-slate-400">từ hôm nay (phiên {fan.todayOff}) · {fan.weights.length} đợt tương tự · n hiệu dụng {fan.nEff.toFixed(1)}</span>
      </div>
      {exit && win ? (
        <div className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2" data-testid="analog-fan-exit">
          <span>Tới THOÁT (phiên {win.exitOffset > 0 ? "+" : ""}{win.exitOffset}): trung vị <b className="text-slate-100">{pct(fwd(exit.mid))}</b> · dải {level}% <b className="text-slate-100">{pct(fwd(lo))} … {pct(fwd(hi))}</b>{exit.loAdj == null ? " (chưa hiệu chỉnh — thiếu mẫu)" : ""}</span>
          {fan.pWin && <span>P(lãi ròng &gt; 0 nếu mua hôm nay): <b className={fan.pWin.mean >= 0.6 ? "text-emerald-300" : fan.pWin.mean <= 0.4 ? "text-rose-300" : "text-slate-100"}>{p0(fan.pWin.mean)}</b> <span className="text-slate-500">(khoảng 90%: {p0(fan.pWin.lo)}–{p0(fan.pWin.hi)})</span></span>}
          {fan.coverage && <span>Độ phủ dải {level}% kiểm tra bỏ-một-đợt: thô <b>{p0(fan.coverage.raw)}</b> → sau hiệu chỉnh CQR <b>{p0(fan.coverage.adjusted)}</b> <span className="text-slate-500">(n = {fan.coverage.n})</span></span>}
          <span className="text-slate-400">Giống nhất: {top.map((w) => `${eventWord} ${dmy(w.eventDate)} (${Math.round(w.weight * 100)}%)`).join(" · ")}</span>
        </div>
      ) : (
        <p className="mt-1 text-slate-500">Cửa sổ đang xem thoát trước hôm nay — chọn cửa sổ có phiên thoát sau phiên {fan.todayOff} để xem dự phóng.</p>
      )}
      <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
        Trọng số = nhân Gauss trên khoảng cách đường lợi suất từ phiên đầu tới hôm nay (băng thông = trung vị khoảng cách) × bán rã 3 năm; phân vị Harrell–Davis có trọng số;
        dải ngoài nới theo hiệu chỉnh phù hợp CQR bỏ-một-đợt (độ phủ sau hiệu chỉnh đo ngoài mẫu). Xác suất: hậu nghiệm Beta với n hiệu dụng. Phân phối lịch sử có điều kiện — <b>chưa kiểm định</b> khả năng dự báo, mẫu nhỏ.
      </p>
    </div>
  );
}
