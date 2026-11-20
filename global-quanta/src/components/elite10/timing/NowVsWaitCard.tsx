// MP-b / MP-c (20/11/2026, tài liệu 19 mục 3–4) — hai thẻ dưới quạt dự phóng của Mô phỏng thời điểm.
//  - ExecRefCard: giờ vào lệnh (mở cửa / đóng cửa) KHÔNG mô phỏng được theo mã (CAR tính từ giá đóng cửa, kho không có giá mở cửa) ->
//    hiện kết quả EX-r1 đọc từ sổ bằng chứng của Gateway (một nguồn, không chép số vào mã).
//  - NowVsWaitCard: "vào hôm nay" (quạt kịch bản) cạnh "chờ vùng Timeline" (mô phỏng cửa sổ) — hai phương pháp khác nhau, mẫu nhỏ:
//    không tô màu thắng / thua, không có câu "nên chờ" / "nên vào".
import { useEvidenceRegistry } from "../../../hooks/elite10/useDeckData";
import type { NowVsWait } from "../../../lib/elite10/nowVsWait";

const pct = (x: number | null | undefined, d = 1) => (x == null || !Number.isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d).replace(".", ",")}%`);
const p0 = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);
const fee = (c: number) => `${(c * 100).toFixed(2).replace(/0$/, "").replace(".", ",")}%`;
const off = (o: number) => (o > 0 ? `+${o}` : `${o}`);

export function ExecRefCard() {
  const { data: reg } = useEvidenceRegistry();
  const ex = reg?.entries?.find((e) => e.id === "EX") ?? null;
  return (
    <div className="mt-2 rounded border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[10.5px] text-slate-300" data-testid="timing-exec-ref">
      <b className="text-slate-200">Giờ vào lệnh: mở cửa (ATO) hay đóng cửa (ATC)</b>
      <p className="mt-0.5 text-slate-400">Mô phỏng này tính từ giá đóng cửa (vào lệnh ATC). Kho dữ liệu không có giá mở cửa nên không mô phỏng ATO theo từng mã; dưới đây là kết quả kiểm định chung đã đăng ký trước.</p>
      {ex ? (
        <p className="mt-1" data-testid="timing-exec-ref-ex"><span className="rounded border border-rose-400/40 px-1 text-[10px] font-bold text-rose-300">{ex.test} · {ex.verdict}</span> {ex.detail} <span className="font-mono text-[10px] text-slate-500">{ex.src}</span></p>
      ) : <p className="mt-1 text-slate-500">Chưa tải được kết quả EX-r1 từ sổ bằng chứng.</p>}
    </div>
  );
}

export function NowVsWaitCard({ r, eventWord }: { r: NowVsWait; eventWord: string }) {
  if (!r.ok) return <p className="mt-2 text-[10.5px] text-slate-500" data-testid="timing-now-vs-wait-off">⚖ So "vào hôm nay" với "chờ vùng Timeline": {r.reason}.</p>;
  const { now, wait } = r;
  const small = (n: number) => (n < 10 ? <b className="text-amber-300"> · mẫu rất nhỏ</b> : null);
  return (
    <div className="mt-2 rounded border border-white/10 bg-white/[0.02] px-2.5 py-2 text-[10.5px] text-slate-300" data-testid="timing-now-vs-wait">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <b className="text-slate-200">⚖ Vào hôm nay so với chờ vùng Timeline · thoát cùng phiên {off(wait.exit)} · phí {fee(r.cost)}/vòng</b>
        <span className="rounded border border-amber-400/40 px-1.5 text-[10px] font-bold text-amber-200">THĂM DÒ</span>
      </div>
      <p className="mt-0.5 rounded border border-amber-400/25 bg-amber-500/[0.05] px-1.5 py-1 text-amber-100" data-testid="timing-now-vs-wait-warn">
        Hai cột dùng <b>hai phương pháp khác nhau</b> trên cùng {wait.n} đợt {eventWord.toLowerCase()} lịch sử. Chênh lệch giữa hai cột <b>không phải</b> bằng chứng rằng cách nào tốt hơn — muốn biết phải có kiểm định đăng ký trước riêng.
      </p>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        <div data-testid="timing-now">
          <p className="text-[10px] font-bold uppercase text-slate-500">Vào hôm nay (phiên {off(now.fromOffset)})</p>
          <p>Nguồn: quạt kịch bản — đợt có đường đi giống hiện tại, có trọng số.</p>
          <p>P(lãi ròng &gt; 0): <b className="text-slate-100">{p0(now.pWin.mean)}</b> <span className="text-slate-400">(khoảng 90% {p0(now.pWin.lo)}–{p0(now.pWin.hi)})</span></p>
          <p>Tới phiên thoát: trung vị <b className="text-slate-100">{pct(now.median)}</b> · dải {Math.round(now.level * 100)}% {pct(now.lo)} … {pct(now.hi)} <span className="text-slate-400">(vượt VN-Index, trước phí)</span></p>
          <p className="text-slate-400">{now.events} đợt · n hiệu dụng {now.nEff.toFixed(1).replace(".", ",")}{small(now.nEff)}
            {now.conformalFeasible ? (now.coverageAdjusted != null ? ` · độ phủ dải sau hiệu chỉnh ${p0(now.coverageAdjusted)}` : "") : " · dải chưa hiệu chỉnh được — mẫu nhỏ"}</p>
        </div>
        <div data-testid="timing-wait">
          <p className="text-[10px] font-bold uppercase text-slate-500">Chờ vùng Timeline (vào phiên {off(wait.entry)})</p>
          <p>Nguồn: mô phỏng cửa sổ Timeline trên mọi đợt lịch sử.</p>
          <p>Tỷ lệ lãi ròng: <b className="text-slate-100">{wait.wins}/{wait.n}</b>{wait.prob && <span className="text-slate-400"> (hậu nghiệm {p0(wait.prob.mean)}, khoảng 90% {p0(wait.prob.ci[0])}–{p0(wait.prob.ci[1])})</span>}</p>
          <p>Lãi ròng mỗi đợt: trung vị <b className="text-slate-100">{pct(wait.median)}</b> · trung bình {pct(wait.mean)} · thấp nhất {pct(wait.min)} · cao nhất {pct(wait.max)} <span className="text-slate-400">(sau phí)</span></p>
          <p className="text-slate-400">{wait.n} đợt{small(wait.n)}</p>
        </div>
      </div>
    </div>
  );
}
