// QĐ-R (20/11/2026) — dựng lại ở tab "4. Bằng chứng & sổ theo dõi" hai phần đã gỡ khỏi Bảng quyết định ở đợt G1–G2 (18/11/2026),
// theo quyết định của chủ dự án. Mã lấy nguyên văn từ DecisionBoard trước commit 1b827fae; chỉ đổi câu dẫn cho đúng bối cảnh Elite HL:
//  - "Tín hiệu có trọng số (bậc A/B)" [elite-weights]: trọng số của Điểm Elite Z — dùng cho danh mục ĐỐI CHỨNG dòng tiền (E3) và bối
//    cảnh Hồ sơ 360°; Elite HL không chọn mã theo Z.
//  - Ghi chú "⏱ Điểm mua" [elite-buy-note]: trạng thái nguồn Timeline điểm mua + chú giải ký hiệu dùng ở khối Mô phỏng thời điểm.
// Dữ liệu: /api/elite/decision và /api/elite/buy-timing qua cùng hook SWR với các tab khác (không gọi API thêm).
import { useEliteDecision } from "../../../hooks/elite10/useEliteCenter";
import { useEliteTiming } from "../../../hooks/elite10/useEliteTiming";
import { buyTimingFreshness } from "../../../hooks/useGatewayBuyTimeline";
import { ELITE_HOLD_SESSIONS } from "../../../lib/elite10/buyTimingCell";
import { TierChip } from "./DecisionBoard";
import { num, signed } from "./boardParts";
import { Panel } from "./HlRulesLedger";

export function EliteWeightsCard() {
  const { data: d } = useEliteDecision();
  if (!d?.weights?.length) return null;
  return (
    <Panel title="Tín hiệu có trọng số (bậc A/B)" testId="elite-weights" right={<span className="text-[10px] text-slate-500" title="IC của tổ hợp = Σw·IC / √(wᵀC̃w) — ước tính mô hình; IC thực đo nằm ở sổ theo dõi">IC tổng (mô hình) ≈ {num(d.icComb, 4)}</span>}>
      <p className="mb-1 text-[10.5px] text-slate-400" data-testid="elite-weights-scope">
        Trọng số của <b className="text-slate-200">Điểm Elite Z</b> — dùng cho danh mục đối chứng Elite dòng tiền (E3) và làm bối cảnh trong Hồ sơ 360°. Danh mục chính thức Elite HL <b className="text-slate-200">không</b> chọn mã theo Z.
      </p>
      <div tabIndex={0} role="group" aria-label="Bảng cuộn ngang" className="overflow-x-auto">
        <table className="w-full text-[11px]" style={{ borderCollapse: "collapse", minWidth: 420 }}>
          <thead><tr className="text-slate-500"><th className="text-left font-normal">Tín hiệu</th><th className="font-normal">Bậc</th><th className="font-normal" title="IC đo được ở kỳ hạn chính (số ngày)">IC đo</th><th className="font-normal" title="(n·IC đo + 60·tiên nghiệm)/(n + 60)">IC hậu nghiệm</th><th className="font-normal" title="Trọng số nếu chỉ ∝ IC (bỏ qua tương quan giữa tín hiệu)">∝ IC</th><th className="text-left font-normal" title="Trọng số theo tương quan: C̃⁻¹·IC, C̃ = 0,5·C + 0,5·I">Trọng số</th></tr></thead>
          <tbody>
            {d.weights.map((w) => (
              <tr key={w.id} className="border-t border-white/5">
                <td className="py-1"><span className="text-slate-100">{w.labelVi}</span> <span className="text-slate-500">· {w.tab}</span></td>
                <td className="text-center"><TierChip tier={w.tier} /></td>
                <td className="whitespace-nowrap text-center font-mono" title={w.icPrior === 0 ? "Tiên nghiệm 0: tín hiệu nhắm phiên VN ngay sau phiên Mỹ, đã qua khi danh mục vào lệnh (E3-v3)" : undefined}>{w.n ? `${signed(w.icMeas, 4)} (${w.n} ngày)` : w.icPrior === 0 ? "chưa đo · tiên nghiệm 0" : "chưa đo"}</td>
                <td className="whitespace-nowrap px-1 text-center font-mono">{num(w.icPost, 4)}</td>
                <td className="whitespace-nowrap px-1 text-center font-mono text-slate-500">{w.wNaive != null ? `${num(w.wNaive * 100, 0)}%` : "—"}</td>
                <td className="whitespace-nowrap"><span aria-hidden="true" className="mr-1.5 inline-block h-1.5 rounded bg-emerald-400/70 align-middle" style={{ width: `${w.w * 80}px` }} />{num(w.w * 100)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.signalWeighting?.method === "correlation" && (
        <p className="text-[10px] text-slate-400" data-testid="elite-weighting-note">
          Trọng số tính đến tương quan giữa các tín hiệu trên {d.signalWeighting.corr?.names} mã (co rút {num((d.signalWeighting.corr?.shrink ?? 0) * 100, 0)}% về độc lập): tín hiệu trùng thông tin (VD Stealth 5 và Stealth 20) không bị đếm hai lần.
        </p>
      )}
      <p className="text-[10px] text-slate-500">Tín hiệu bậc C (Smart Score, bộ lọc kỹ thuật, RRG, xúc tác…) chỉ làm bối cảnh trong Hồ sơ 360°, không có trọng số — theo E2/E3 đăng ký trước.</p>
    </Panel>
  );
}

export function BuyTimingNote() {
  const buy = useEliteTiming();
  const buyAge = buy.meta?.fetchedAt ? new Date(buy.meta.fetchedAt).toLocaleString("vi-VN", { hour12: false }) : null;
  return (
    <Panel title="⏱ Điểm mua — nguồn Timeline và chú giải" testId="elite-buy-timing-card">
      <p className="text-[10px] leading-relaxed text-slate-500" data-testid="elite-buy-note">
        ⏱ Điểm mua: <span className="text-emerald-300">● trong vùng mua</span> / <span className="text-amber-300">⏱ ≤ 5 phiên</span> / <span className="text-q-text-2">⏱ trong {ELITE_HOLD_SESSIONS} phiên</span> = vùng mùa vụ cổ tức · KQKD ĐẠT KIỂM ĐỊNH
        (Timeline điểm mua, tab Cổ tức); <span className="text-slate-300">→ Mở cửa dd/mm</span> = quy tắc danh mục khi không có vùng phù hợp; ◌ = vùng gần đạt (chưa qua kiểm định).
        Timeline này là nguồn của dải "Lịch 10 phiên tới" và khối "Mô phỏng thời điểm" ở Bảng quyết định.{" "}
        {buy.data ? <>Timeline: {buyTimingFreshness(buy.meta)?.text ?? "—"}, lấy lúc {buyAge}{buy.meta?.stale ? <b className="text-amber-300"> · đang dùng bản gần nhất (số phiên đã tính lại theo hôm nay)</b> : ""}.</>
          : buy.loading ? "Đang tải Timeline…" : <b className="text-amber-300">Timeline điểm mua tạm không có ({buy.meta?.lastError ?? buy.error ?? "lỗi"}).</b>}
      </p>
    </Panel>
  );
}
