// BL2 (07/11/2026) — 🛡 Độ bền cổ tức & rủi ro (DQ-v1, MÔ TẢ): lợi suất chuẩn hoá, bảng 7 tiêu chí, Lintner (1956), rủi ro giá, cờ bẫy lợi suất.
import type { DqView } from "../../../../lib/cotuc/dsStocks";

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const p = (x: number | null | undefined, d = 1) => (fin(x) ? `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%` : "—");
const n2 = (x: number | null | undefined) => (fin(x) ? x.toLocaleString("vi-VN", { maximumFractionDigits: 2 }) : "—");
const bn = (x: number | null | undefined) => (fin(x) ? `${(x / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 0 })} tỷ` : "—");

function Tile({ label, value, sub, tone = "text-slate-100" }: { label: string; value: string; sub?: string; tone?: string }) {
  return <div className="rounded-md border border-white/[0.07] px-2 py-1.5"><p className="text-[10px] font-bold uppercase text-slate-500">{label}</p><p className={`font-mono text-[13px] font-bold ${tone}`}>{value}</p>{sub && <p className="text-[10px] text-slate-500">{sub}</p>}</div>;
}

export default function DividendQualityPanel({ dq }: { dq: DqView | null | undefined }) {
  if (!dq) return <div className="tw-scope rounded-lg border border-white/10 p-2 text-[10.5px] text-slate-500" data-testid="dq-panel">Chưa có dữ liệu độ bền cổ tức (dựng mỗi tối 20:05 từ BCTC năm và giá điều chỉnh).</div>;
  const y = dq.yield, c = dq.company, lt = dq.lintner, r = dq.risk;
  return (
    <div className="tw-scope space-y-2 rounded-lg border border-white/10 p-2" data-testid="dq-panel">
      <p className="text-[11px] font-bold text-slate-200">🛡 Độ bền cổ tức &amp; rủi ro <span className="ml-1 rounded border border-sky-400/40 px-1 text-[10px] font-normal text-sky-300">MÔ TẢ</span></p>
      {dq.trap && <p className="rounded-md border border-rose-400/40 bg-rose-400/10 px-2 py-1 text-[10.5px] text-rose-200" data-testid="dq-trap">🪤 Dấu hiệu bẫy lợi suất: {dq.trap.join("; ")}. Lợi suất cao có thể đến từ giá giảm hoặc chi trả không bền.</p>}
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <Tile label={`Lợi suất năm TC ${y.fyYear ?? ""}`} value={p(y.fy)} sub="cổ tức năm tài chính gần nhất / giá" />
        <Tile label="Lợi suất 12 tháng" value={p(y.ttm)} sub={y.catchUp ? "có trả dồn nhiều năm tài chính" : "theo ngày GDKHQ"} tone={y.catchUp ? "text-amber-300" : "text-slate-100"} />
        <Tile label="Trung vị 3 năm TC" value={p(y.median3)} sub="ít nhạy với năm bất thường" />
        <Tile label="Tổng cổ tức đã trả / vốn hoá" value={p(y.company)} sub={`năm ${c.lastYear ?? "—"} · gồm phần cổ đông thiểu số`} />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="mb-0.5 text-[10px] font-bold uppercase text-slate-500">Tiêu chí bền vững · đạt {dq.checksPassed}/{dq.checksKnown}</p>
          <ul className="space-y-0.5 text-[10.5px]" data-testid="dq-checks">{dq.checks.map((k) => (
            <li key={k.id} className={k.pass == null ? "text-slate-500" : k.pass ? "text-emerald-300" : "text-rose-300"}>{k.pass == null ? "—" : k.pass ? "✓" : "✗"} {k.label}</li>
          ))}</ul>
        </div>
        <div className="space-y-1 text-[10.5px] text-slate-400">
          <p className="text-[10px] font-bold uppercase text-slate-500">Cấp công ty · {c.years} năm BCTC</p>
          <p>Chi trả 5 năm <b className="text-slate-200">{p(c.payout5, 0)}</b> lợi nhuận · dòng tiền tự do phủ <b className="text-slate-200">{n2(c.fcfCover5)}×</b> cổ tức</p>
          <p>Chi cổ tức tiền <b className="text-slate-200">{c.streak}</b> năm liên tục · cắt &gt;10%: <b className="text-slate-200">{c.cuts10}</b> lần / 10 năm · biến động cổ tức 5 năm (CV) {n2(c.divCv5)} · năm lỗ (10 năm): {c.lossYears10}</p>
          <p className="text-[10px] font-bold uppercase text-slate-500">Mô hình Lintner (1956)</p>
          {lt.ok
            ? <p data-testid="dq-lintner">Tỷ lệ chi trả mục tiêu <b className="text-slate-200">{p(lt.targetPayout, 0)}</b> · tốc độ điều chỉnh <b className="text-slate-200">{n2(lt.speed)}</b>/năm · R² {n2(lt.r2)} · {lt.n} năm ({lt.from}–{lt.to}){fin(dq.lintnerNextD) ? <> · cổ tức năm tới theo mô hình ≈ <b className="text-slate-200">{bn(dq.lintnerNextD)}</b> ({p(dq.lintnerNextYield)} vốn hoá)</> : null}</p>
            : <p data-testid="dq-lintner">Không áp dụng: {lt.reason} ({lt.n} năm).</p>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4" data-testid="dq-risk">
        <Tile label="Lợi nhuận giá 1 năm" value={p(r?.ret1y)} tone={fin(r?.ret1y) ? (r!.ret1y! >= 0 ? "text-emerald-300" : "text-rose-300") : "text-slate-500"} />
        <Tile label="Sụt giảm lớn nhất 1 năm" value={p(r?.mdd1y)} tone="text-rose-300" />
        <Tile label="Biến động năm hoá" value={p(r?.vol1y, 0)} />
        <Tile label="Beta (VN-Index)" value={n2(r?.beta)} />
      </div>
      <p className="text-[10px] text-slate-500">Cổ tức cấp công ty = "cổ tức, lợi nhuận đã trả" trên lưu chuyển tiền tệ (VNDirect, gồm phần trả cổ đông thiểu số). Lintner: ΔD = a + b₁·E + b₂·D₍t−1₎ (E = LNST công ty mẹ), tốc độ = −b₂, mục tiêu = b₁ / tốc độ; chỉ nhận khi ≥ 8 năm và hệ số trong khoảng kinh tế. Ngân hàng / CK / BH bỏ tiêu chí dòng tiền và nợ. Chưa kiểm định dự báo.</p>
    </div>
  );
}
