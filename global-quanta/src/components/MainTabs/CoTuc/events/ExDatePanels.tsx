// LSK5 + LSK3 (07/11/2026) — hành vi giá quanh ngày GDKHQ (XD-v1) và tin phương án cổ tức. Tất cả MÔ TẢ, không phải tín hiệu.
import { useExStudyMarket, useExStudyTicker, usePlanNews, type CiX, type ExBlock } from "../../../../hooks/useCorpEvents";
import { dmy, pct, pctPlain } from "../../../../lib/kqkd/format";

const ci = (c: CiX | undefined) => (!c || c.mean == null ? "—" : `${pct(c.mean, 1)}${c.lo != null && c.hi != null ? ` [${pct(c.lo, 1)}; ${pct(c.hi, 1)}]` : ""}`);
const tone = (c: CiX | undefined) => (!c || c.lo == null || c.hi == null ? "text-slate-300" : c.lo > 0 ? "text-emerald-300" : c.hi < 0 ? "text-rose-300" : "text-slate-300");
const ratio = (x: number | null | undefined) => (x == null ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: 2 }));
const signCls = (x: number | null) => (x == null ? "text-slate-500" : x >= 0 ? "text-emerald-300" : "text-rose-300");

function BlockRow({ label, b }: { label: string; b: ExBlock }) {
  return (
    <tr className="border-t border-white/[0.04] text-right font-mono tabular-nums">
      <td className="px-1 py-0.5 text-left font-sans text-slate-300">{label}</td>
      <td className="px-1 py-0.5 text-slate-400">{b.n}</td>
      <td className="px-1 py-0.5 text-slate-200">{ratio(b.dropRatioMedian)}</td>
      <td className="px-1 py-0.5 text-slate-200">{b.fillWithin20 != null ? pctPlain(b.fillWithin20, 0) : "—"}{b.fillDaysMedian != null ? <span className="font-sans text-[10px] text-slate-500"> · {b.fillDaysMedian} phiên</span> : null}</td>
      <td className={`px-1 py-0.5 ${tone(b.carPre)}`}>{ci(b.carPre)}</td>
      <td className={`px-1 py-0.5 ${tone(b.carAnn)}`}>{ci(b.carAnn)}</td>
      <td className={`px-1 py-0.5 ${tone(b.carPost)}`}>{ci(b.carPost)}</td>
    </tr>
  );
}

/** Thẻ toàn danh mục (Lịch sự kiện). */
export function ExStudyMarket() {
  const d = useExStudyMarket(true);
  if (!d) return null;
  const a = d.aggregate;
  return (
    <details className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px]" data-testid="ce-exstudy">
      <summary className="cursor-pointer text-slate-300"><b className="text-slate-100">Giá quanh ngày GDKHQ — toàn danh mục</b> · {a.all.n} lần trả tiền mặt · giá giảm trung vị {ratio(a.all.dropRatioMedian)} lần cổ tức · {a.all.fillWithin20 != null ? pctPlain(a.all.fillWithin20, 0) : "—"} lấp lại trong 20 phiên <span className="ml-1 rounded border border-sky-400/40 px-1 text-[10px] text-sky-300">MÔ TẢ</span></summary>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead><tr className="text-right text-[10px] uppercase text-slate-500"><th className="px-1 py-1 text-left">Nhóm</th><th className="px-1 py-1">Số đợt</th><th className="px-1 py-1" title="(giá trước GDKHQ − giá ngày GDKHQ) / cổ tức, giá chưa điều chỉnh">Giảm / cổ tức</th><th className="px-1 py-1" title="Tỷ lệ đợt giá lấp lại khoảng cổ tức trong 20 phiên · trung vị số phiên">Lấp trong 20 phiên</th><th className="px-1 py-1">CAR trước (−10…−1)</th><th className="px-1 py-1">Quanh (0…+2)</th><th className="px-1 py-1">Sau (+3…+60)</th></tr></thead>
          <tbody>
            <BlockRow label="Tất cả" b={a.all} />
            {Object.entries(a.byYield).map(([k, b]) => <BlockRow key={k} label={`Lợi suất ${k}`} b={b} />)}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">"Giảm / cổ tức" = 1 nghĩa là giá giảm đúng bằng cổ tức (giá chưa điều chỉnh). CAR = lợi nhuận vượt VN-Index theo mô hình thị trường ES-v1 trên giá đã điều chỉnh (đã loại phần giảm do cổ tức); xanh / đỏ = khoảng tin cậy 95% không chứa 0. Bỏ đợt trùng ngày cổ tức cổ phiếu / thưởng. Dựng {dmy(d.builtAt)}.</p>
    </details>
  );
}

const ST: Record<string, { t: string; cls: string }> = {
  APPROVED: { t: "Đã thông qua", cls: "text-emerald-300 border-emerald-400/40" },
  PROPOSED: { t: "Trình / dự kiến", cls: "text-amber-300 border-amber-400/40" },
  RECORD: { t: "Chốt quyền / GDKHQ", cls: "text-sky-300 border-sky-400/40" },
};

/** Ngăn chi tiết mã: giá quanh GDKHQ của chính mã + tin phương án cổ tức. */
export function ExStudyTicker({ ticker }: { ticker: string }) {
  const d = useExStudyTicker(ticker);
  const n = usePlanNews(ticker);
  const s = d?.summary;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 p-2" data-testid="ce-ex-ticker">
        <p className="mb-1 text-[11px] font-bold text-slate-200">Giá quanh ngày GDKHQ của {ticker} <span className="ml-1 rounded border border-sky-400/40 px-1 text-[10px] font-normal text-sky-300">MÔ TẢ</span></p>
        {!s ? <p className="text-[10.5px] text-slate-500">Chưa có đợt trả tiền mặt đủ dữ liệu giá (từ 2022).</p> : (
          <>
            <p className="text-[10.5px] text-slate-400">{s.n} đợt · giá giảm trung vị <b className="text-slate-200">{ratio(s.dropRatioMedian)}</b> lần cổ tức{d?.market ? ` (toàn danh mục ${ratio(d.market.dropRatioMedian)})` : ""} · lấp lại trong 20 phiên <b className="text-slate-200">{s.fillWithin20 != null ? pctPlain(s.fillWithin20, 0) : "—"}</b>{s.fillDaysMedian != null ? `, trung vị ${s.fillDaysMedian} phiên` : ""}</p>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-[560px] text-[11px]">
                <thead><tr className="text-right text-[10px] uppercase text-slate-500"><th className="px-1 py-0.5 text-left">GDKHQ</th><th className="px-1 py-0.5">Cổ tức · lợi suất</th><th className="px-1 py-0.5">Giảm / cổ tức</th><th className="px-1 py-0.5">Lấp khoảng</th><th className="px-1 py-0.5">CAR trước</th><th className="px-1 py-0.5">Quanh</th><th className="px-1 py-0.5">Sau</th></tr></thead>
                <tbody>{[...s.events].reverse().map((e) => (
                  <tr key={e.ex} className="border-t border-white/[0.04] text-right font-mono tabular-nums">
                    <td className="px-1 py-0.5 text-left text-slate-300">{dmy(e.ex)}</td>
                    <td className="px-1 py-0.5 text-slate-300">{e.cash.toLocaleString("vi-VN")} đ · {e.yieldCum != null ? pctPlain(e.yieldCum, 1) : "—"}</td>
                    <td className="px-1 py-0.5 text-slate-200">{ratio(e.dropRatio)}</td>
                    <td className="px-1 py-0.5 text-slate-300">{e.fillDays != null ? `${e.fillDays} phiên` : e.pending ? "đang chờ" : "> 60 phiên"}</td>
                    <td className={`px-1 py-0.5 ${signCls(e.carPre)}`}>{pct(e.carPre, 1)}</td>
                    <td className={`px-1 py-0.5 ${signCls(e.carAnn)}`}>{pct(e.carAnn, 1)}</td>
                    <td className={`px-1 py-0.5 ${signCls(e.carPost)}`}>{pct(e.carPost, 1)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <div className="rounded-lg border border-white/10 p-2" data-testid="ce-plan-news">
        <p className="mb-1 text-[11px] font-bold text-slate-200">Tin về phương án cổ tức (24 tháng) <span className="ml-1 rounded border border-sky-400/40 px-1 text-[10px] font-normal text-sky-300">MÔ TẢ</span></p>
        {!n?.rows.length ? <p className="text-[10.5px] text-slate-500">Chưa thấy tin phương án / kế hoạch cổ tức có số liệu.</p> : (
          <ul className="space-y-0.5 text-[10.5px]">{n.rows.slice(0, 12).map((r) => (
            <li key={r.date + r.title} className="text-slate-400"><span className="font-mono text-slate-500">{dmy(r.date)}</span> <span className={`rounded border px-1 text-[10px] ${ST[r.status].cls}`}>{ST[r.status].t}</span>{r.pct != null || r.dps != null ? <b className="ml-1 font-mono text-slate-200">{r.pct != null ? `${r.pct.toLocaleString("vi-VN")}%` : `${(r.dps ?? 0).toLocaleString("vi-VN")} đ/cp`}</b> : null} · {r.title}</li>
          ))}</ul>
        )}
        <p className="mt-1 text-[10px] text-slate-500">Trích nguyên tiêu đề tin CafeF. Không tự tính phần "đã duyệt nhưng chưa trả": tiêu đề thường không ghi rõ năm tài chính và lẫn đề xuất / thông qua / chốt quyền. % theo mệnh giá 10.000 đ.</p>
      </div>
    </div>
  );
}
