// "Các nhãn đo gì" (PR-C, F-LX-1): đặt các nhãn chế độ và các thước đo biến động trên cùng một bảng,
// mỗi dòng nói rõ đo cái gì, đầu vào, khung thời gian, cấp bằng chứng, giá trị và thời điểm.
// Chỉ đọc lại dữ liệu các khối khác đã tải (cùng khoá SWR): không gọi endpoint mới, không tính lại số.
import type { ReactNode } from "react";
import type { PreopenDoc } from "../../../hooks/usePreopen";
import { useTopbar } from "../../../hooks/useTopbar";
import { useTradingMatrix } from "../../../hooks/useTradingMatrix";
import { useSieuQuetScanner } from "../../../hooks/useSieuQuetScanner";
import { REGIME_VI } from "./TradingMatrix/MatrixCards";
import { GradeBadge, type Grade } from "./marketQuality";

const nf = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d }));
const ddmm = (s: string | null | undefined) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "—");
const TOPBAR_REGIME: Record<string, string> = { RISK_ON: "Ưa rủi ro", RISK_OFF: "Né rủi ro", NEUTRAL: "Trung tính", UNKNOWN: "Chưa rõ" };
const SCN: Record<string, string> = { neg: "Tiêu cực", mid: "Trung tính", pos: "Tích cực" };

interface Row { group: "Chế độ" | "Biến động"; where: string; name: string; measures: string; input: string; window: string; grade: Grade; value: ReactNode; asOf: string | null }

export default function MarketLabelLegend({ d }: { d: PreopenDoc }) {
  const top = useTopbar(), mx = useTradingMatrix("VNINDEX"), sq = useSieuQuetScanner();
  const reg = top.data?.regime, m = mx.data, cur = m?.state?.current, ix = sq.indexState;
  const scenario = d.lead ? SCN[d.lead] : "Chưa kết luận";
  const rows: Row[] = [
    { group: "Chế độ", where: "Thanh trên cùng", name: "THẾ GIỚI", measures: "Khẩu vị rủi ro toàn cầu", input: "VIX / VIX3M (cấu trúc kỳ hạn)", window: "ngày", grade: "C",
      value: reg?.data ? `${TOPBAR_REGIME[reg.data.state] ?? reg.data.state}${reg.data.volTerm ? ` · ${reg.data.volTerm.stateVi}` : ""}` : "—", asOf: reg?.meta?.asOf ?? null },
    { group: "Chế độ", where: "Dải VN-Index", name: "Cấu trúc MA", measures: "Vị trí giá so với MA20/50/200", input: "VN-Index", window: "ngày", grade: "B",
      value: ix?.trendLabel ?? "—", asOf: ix?.asOf ?? null },
    { group: "Chế độ", where: "Trạng thái thị trường", name: "Xu hướng (quy tắc)", measures: "Xu hướng có độ rộng xác nhận", input: "Lợi suất, độ rộng, McClellan, dòng tiền", window: "ngày", grade: "B",
      value: m ? REGIME_VI[m.regime.label]?.text ?? m.regime.label : "—", asOf: m?.regime.asOf ?? cur?.date ?? null },
    { group: "Chế độ", where: "Trạng thái thị trường", name: "HMM 3 trạng thái", measures: "Trạng thái biến động giá (không phải nhãn xu hướng)", input: "Lợi suất VN-Index", window: "ngày", grade: "C",
      value: m?.regime.probabilities ? `giảm ${nf(m.regime.probabilities.bear * 100, 0)}% · ngang ${nf(m.regime.probabilities.neutral * 100, 0)}% · tăng ${nf(m.regime.probabilities.bull * 100, 0)}%` : "—", asOf: m?.regime.hmmAsOf ?? null },
    { group: "Chế độ", where: "Trung tâm thị trường", name: "MS-GARCH", measures: "Chế độ biến động (yên tĩnh / biến động)", input: "Lợi suất VN-Index", window: "đến phiên trước", grade: (d.risk?.grade as Grade) ?? "C",
      value: d.risk ? `${d.risk.label === "calm" ? "Yên tĩnh" : "Biến động"} ${nf(Math.max(d.risk.probCalm, d.risk.probVolatile) * 100, 0)}%` : "—", asOf: d.risk?.asOf ?? null },
    { group: "Chế độ", where: "Trung tâm thị trường", name: "Kịch bản mở cửa", measures: "Nhóm ES qua đêm (±1σ)", input: "ES tương lai từ lúc VN đóng cửa", window: "sáng nay", grade: "C", // nhãn kịch bản chưa qua G3; chỉ dải cả phiên đạt
      value: `${scenario}${d.es.movePct != null ? ` · ES ${d.es.movePct > 0 ? "+" : d.es.movePct < 0 ? "−" : ""}${nf(Math.abs(d.es.movePct), 2)}%` : ""}`, asOf: d.es.at },
    { group: "Biến động", where: "Trung tâm thị trường", name: "σ MS-GARCH", measures: "Biến động năm hoá cho phiên tới", input: "Lợi suất đóng cửa VN-Index", window: "phiên tới", grade: "B",
      value: d.risk ? `${nf(d.risk.volAnnualPct, 1)}%/năm` : "—", asOf: d.risk?.asOf ?? null },
    { group: "Biến động", where: "Trạng thái thị trường", name: "σ Yang–Zhang", measures: "Biến động năm hoá từ mở–cao–thấp–đóng", input: "OHLC VN-Index", window: "20 phiên", grade: "B",
      value: cur?.sigma != null ? `${nf(cur.sigma, 1)}%/năm · phân vị ${nf(cur.yzPct, 0)}` : "—", asOf: cur?.date ?? null },
    { group: "Biến động", where: "Trạng thái thị trường", name: "σ thực 20 phiên", measures: "Độ lệch chuẩn lợi suất đóng cửa, năm hoá", input: "Đóng cửa VN-Index", window: "20 phiên", grade: "B",
      value: m?.volatility?.realizedVol20 != null ? `${nf(m.volatility.realizedVol20, 1)}%/năm` : "—", asOf: m?.volatility?.asOf ?? null },
    { group: "Biến động", where: "Dải VN-Index", name: "ATR percentile", measures: "Biên độ thật 14 phiên so với 1 năm", input: "OHLC VN-Index", window: "14 phiên", grade: "B",
      // Cùng nguồn với chip "Nén–bứt phá" của dải VN-Index (bảng quét); Matrix chỉ là dự phòng.
      value: ix ? `phân vị ${nf(ix.atrPercentile, 0)}` : m?.volatility?.atrPercentile != null ? `phân vị ${nf(m.volatility.atrPercentile, 0)}` : "—", asOf: ix?.asOf ?? m?.volatility?.asOf ?? null },
  ];
  return (
    <div data-testid="mc-labels">
      <p className="text-[11px] text-slate-400">Các nhãn dưới đây đo những việc <b className="text-slate-200">khác nhau</b> nên có thể khác nhau mà không mâu thuẫn. Ví dụ: thế giới né rủi ro, VN-Index đang trong xu hướng giảm, nhưng biến động vẫn ở chế độ yên tĩnh. Ba con số "biến động %/năm" dùng ba công thức và ba cửa sổ khác nhau, nên không so trực tiếp với nhau.</p>
      {/* Điện thoại: mỗi nhãn một thẻ, giá trị luôn nhìn thấy không cần cuộn ngang. */}
      <ul className="mt-1.5 space-y-1.5 sm:hidden" data-testid="mc-labels-cards">
        {rows.map((r) => (
          <li key={r.name} className="rounded-lg border border-white/10 p-2 text-[11px]">
            <div className="flex items-start justify-between gap-2"><b className="text-[12px] text-slate-100">{r.name}</b><GradeBadge g={r.grade} /></div>
            <div className="mt-0.5 font-mono text-[12px] text-slate-100">{r.value}</div>
            <div className="mt-0.5 text-slate-300">{r.measures}</div>
            <div className="text-slate-500">{r.where} · {r.input} · {r.window}{r.asOf ? ` · ${ddmm(String(r.asOf).slice(0, 10))}` : ""}</div>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] text-[11px]" data-testid="mc-labels-table">
          <caption className="sr-only">Các nhãn chế độ và thước đo biến động trên tab Tổng quan</caption>
          <thead><tr className="text-left text-slate-500"><th className="py-1 font-normal">Nhãn</th><th className="font-normal">Ở đâu</th><th className="font-normal">Đo cái gì</th><th className="font-normal">Đầu vào · khung</th><th className="px-1 text-center font-normal">Cấp</th><th className="text-right font-normal">Hiện tại</th><th className="pl-2 text-right font-normal">Lúc</th></tr></thead>
          {(["Chế độ", "Biến động"] as const).map((g) => (
            <tbody key={g}>
              <tr><th colSpan={7} scope="colgroup" className="pt-2 text-left text-[10px] font-semibold uppercase tracking-wide text-cyan-300/80">{g}</th></tr>
              {rows.filter((r) => r.group === g).map((r) => (
                <tr key={r.name} className="border-t border-white/5 align-top" data-testid="mc-label-row">
                  <th scope="row" className="py-1 pr-2 text-left font-semibold text-slate-100">{r.name}</th>
                  <td className="pr-2 text-slate-400">{r.where}</td>
                  <td className="pr-2 text-slate-300">{r.measures}</td>
                  <td className="pr-2 text-slate-400">{r.input} · {r.window}</td>
                  <td className="px-1 text-center"><GradeBadge g={r.grade} /></td>
                  <td className="text-right font-mono text-slate-100" data-label-value={r.name}>{r.value}</td>
                  <td className="pl-2 text-right font-mono text-slate-500">{r.asOf ? ddmm(String(r.asOf).slice(0, 10)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Cấp A: đã qua kiểm định đặt trước · B: đo lường trực tiếp · C: mô tả, chưa kiểm định hoặc không đạt. "Xu hướng (quy tắc)", "HMM" và các σ của Trạng thái thị trường đọc theo phạm vi Toàn HOSE.</p>
    </div>
  );
}
