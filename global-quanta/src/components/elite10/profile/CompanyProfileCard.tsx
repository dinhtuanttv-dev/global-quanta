// PFA-v1 — Hồ sơ 360° · góc DOANH NGHIỆP: kết quả kinh doanh, chất lượng lợi nhuận, cổ tức. Mọi số từ engine có sẵn trên Gateway,
// khoá theo phiên; số nào chưa có / không áp dụng thì ghi rõ, không điền 0. Nhãn bằng chứng đặt cạnh từng chỉ số.
import { useProfileFa } from "../../../hooks/elite10/useProfileFa";
import type { PfaDividend, PfaEarnings } from "../../../lib/elite10/profileFaTypes";
import { FA_R1 } from "../../../lib/elite10/faR1";
import { Block, bn, Checklist, Evidence, fmtDate, num, pct, spct, Stat, tone, vnd, WarningList, YoY } from "./pfaParts";

const SRC_VI: Record<string, string> = { DISCLOSURE: "tin công bố chính thức", CAFEF: "CafeF", VND_CREATED: "ngày dữ liệu VNDirect" };
const ZONE_VI: Record<string, string> = { SAFE: "an toàn", GREY: "vùng xám", DISTRESS: "rủi ro" };

function Earnings({ e }: { e: PfaEarnings }) {
  if (!e.available) return <Block title="Kết quả kinh doanh" testId="pfa-earnings"><p className="text-[11px] text-slate-400" data-testid="pfa-earnings-na">{e.reasonVi}</p></Block>;
  return (
    <Block title={`Kết quả kinh doanh · ${e.quarter}`} testId="pfa-earnings"
      right={<span className="text-[10px] text-slate-500" data-testid="pfa-earnings-published">Công bố {fmtDate(e.published)}{e.publishedSource ? ` · ${SRC_VI[e.publishedSource] ?? e.publishedSource}` : ""}</span>}>
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <Stat label="LNST 4 quý gần nhất" testId="pfa-npat-ttm" sub={<>Tăng trưởng TTM <YoY v={e.ttmGrowth} /></>}><span className={tone(e.npatTtm)}>{bn(e.npatTtm)}</span></Stat>
        <Stat label={`LNST ${e.quarter} so cùng kỳ`} sub={<>Lợi nhuận cốt lõi <YoY v={e.coreYoY} /></>}><YoY v={e.npatYoY} /></Stat>
        <Stat label="Doanh thu quý so cùng kỳ" sub={<>Luỹ kế năm (LNST) <YoY v={e.ytd} /></>}><YoY v={e.topYoY} /></Stat>
        <Stat label="ROE · biên ròng 4 quý" sub={e.nonCoreShare != null && Math.abs(e.nonCoreShare) > 0.5 ? <span className="text-amber-300">Lợi nhuận ngoài cốt lõi {pct(e.nonCoreShare, 0)}</span> : undefined}>{pct(e.roe)} · {pct(e.netMarginTtm)}</Stat>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
        <Stat label="Dự báo LNST quý tới (nowcast)" testId="pfa-nowcast"
          sub={<>Khoảng {bn(e.nowcast?.lo)} – {bn(e.nowcast?.hi)} · đã có {pct(e.nowcast?.cumShare, 0)} luỹ kế năm{e.evidence?.nowcast && <> · KQ-r1 IC {num(e.evidence.nowcast.ic, 3)}</>}</>}>
          {e.nowcast ? <>{bn(e.nowcast.est)} <span className={`text-[11px] ${tone(e.nowcast.growth)}`}>({spct(e.nowcast.growth)})</span></> : "—"}
          {e.evidence?.nowcast && <Evidence label={e.evidence.nowcast.pass ? "THĂM DÒ" : "KHÔNG ĐẠT"} title={`Kiểm định đăng ký trước ${e.evidence.prereg ?? ""}: IC ${e.evidence.nowcast.ic}, p ${e.evidence.nowcast.p}`} />}
        </Stat>
        <Stat label="Bất ngờ lợi nhuận (SUE)" testId="pfa-sue" sub="Độ lệch so với kỳ vọng theo lịch sử của chính mã, chia độ biến động">
          LNST {num(e.surprise?.sueNpat, 2)} · cốt lõi {num(e.surprise?.sueCore, 2)}
          {e.evidence?.sue && <Evidence label={e.evidence.sue.pass ? "ĐẠT" : "MÔ TẢ"} title={`KQ-r1: IC ${e.evidence.sue.ic}, p ${e.evidence.sue.p} — không đạt tiêu chí, chỉ mô tả`} />}
        </Stat>
      </div>
    </Block>
  );
}

function Quality({ e }: { e: PfaEarnings }) {
  if (!e.available) return null;
  if (e.financial) {
    return (
      <Block title="Chất lượng lợi nhuận" testId="pfa-quality">
        <p className="text-[11px] text-slate-400" data-testid="pfa-quality-na">Tổ chức tài chính (mẫu BCTC {e.tpl === "bank" ? "ngân hàng" : e.tpl === "sec" ? "chứng khoán" : "bảo hiểm"}): Piotroski, Beneish, Altman, dồn tích và dòng tiền kinh doanh <b>không áp dụng</b> — tiền gửi, cho vay và đầu tư là hoạt động chính.</p>
      </Block>
    );
  }
  const p = e.piotroski;
  return (
    <Block title="Chất lượng lợi nhuận" testId="pfa-quality" right={<Evidence label="MÔ TẢ" title="Các chỉ số sàng lọc kế toán chuẩn. FA-r1 (2014–2019): dùng chúng để chặn mua không làm Elite HL tốt hơn." />}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <p className="text-[10px] text-slate-500">Piotroski F-Score</p>
          <p className="text-[18px] font-bold tabular-nums" data-testid="pfa-piotroski"><span className={p?.score == null ? "text-slate-400" : p.score >= 7 ? "text-emerald-300" : p.score <= 3 ? "text-rose-300" : "text-amber-200"}>{p?.score ?? "—"}</span><span className="text-[12px] text-slate-500">/{p?.of ?? 9}</span></p>
          {p ? <Checklist items={p.tests} testId="pfa-piotroski-tests" /> : <p className="text-[11px] text-slate-500">Chưa đủ dữ liệu để chấm (cần ≥ 7 phép thử).</p>}
        </div>
        <div className="space-y-1.5">
          <Stat label="Beneish M-Score" testId="pfa-beneish" sub="> −1,78 = cần soát chất lượng số liệu (sàng lọc, không phải kết luận)">
            {e.beneish ? <span className={e.beneish.flag ? "text-amber-300" : "text-slate-100"}>{num(e.beneish.m, 2)}{e.beneish.flag ? " ⚠" : ""}</span> : "—"}
          </Stat>
          <Stat label="Altman Z″" testId="pfa-altman" sub="< 1,1 rủi ro · > 2,6 an toàn">
            {e.altman ? <span className={e.altman.zone === "DISTRESS" ? "text-rose-300" : e.altman.zone === "SAFE" ? "text-emerald-300" : "text-amber-200"}>{num(e.altman.z, 2)} · {ZONE_VI[e.altman.zone ?? ""] ?? e.altman.zone}</span> : "—"}
          </Stat>
        </div>
        <div className="space-y-1.5">
          <Stat label="Dồn tích (LNST − CFO) / tài sản" testId="pfa-accrual" sub="> 10% = lợi nhuận chưa thành tiền"><span className={e.accrual != null && e.accrual > 0.1 ? "text-amber-300" : "text-slate-100"}>{pct(e.accrual)}</span></Stat>
          <Stat label="Dòng tiền KD / LNST (4 quý)" testId="pfa-cfo" sub="≥ 1 = lợi nhuận được hậu thuẫn bằng tiền"><span className={e.cfoToNpat == null ? "" : e.cfoToNpat < 0 ? "text-rose-300" : e.cfoToNpat >= 1 ? "text-emerald-300" : "text-slate-100"}>{num(e.cfoToNpat, 2)}</span></Stat>
          {e.kpi && <p className="text-[10.5px] text-slate-400">Nợ/VCSH {num(e.kpi.debtToEquity, 2)} · trả lãi {num(e.kpi.interestCover, 1)} lần · nợ ròng/EBITDA {num(e.kpi.netDebtToEbitda, 1)}</p>}
        </div>
      </div>
    </Block>
  );
}

function Dividend({ v }: { v: PfaDividend }) {
  if (!v.available) return <Block title="Cổ tức" testId="pfa-dividend"><p className="text-[11px] text-slate-400">{v.reasonVi}</p></Block>;
  const paysCash = (v.ttmCash ?? 0) > 0;
  const q = v.quality;
  return (
    <Block title="Cổ tức" testId="pfa-dividend" right={v.fm ? <span className="text-[10px] text-slate-400" data-testid="pfa-fm">Nhân tố FM-v1: hạng {v.fm.rank}/{v.fm.of} · nhóm {v.fm.quintile}/5<Evidence label="MÔ TẢ" title="FM-v1: xếp hạng nhân tố giá trị / cổ tức / chất lượng; chưa qua kiểm định trên vũ trụ đúng thời điểm" /></span> : undefined}>
      {!paysCash && <p className="mb-2 text-[11px] text-slate-400" data-testid="pfa-no-cash">Không trả cổ tức tiền trong 12 tháng gần nhất{(v.stockPct12m ?? 0) > 0 ? ` · cổ tức cổ phiếu ${num(v.stockPct12m, 0)}%` : ""}.</p>}
      <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
        <Stat label="Lợi suất tiền mặt 12 tháng" testId="pfa-yield" sub={`Sau thuế 5%: ${pct(v.yieldNet)} · ${vnd(v.ttmCash)}/cp`}>{pct(v.yieldGross)}</Stat>
        <Stat label="Tỷ lệ chi trả · FCF / cổ tức" sub="FCF / cổ tức ≥ 1 = trả bằng tiền tự làm ra">{pct(v.payout, 0)} · {num(v.fcfCover, 2)}</Stat>
        <Stat label="Chuỗi năm trả liên tiếp" sub={`Tăng bình quân 3 năm ${spct(v.cagr3)} · ${v.cuts5 ?? "—"}/${v.years5 ?? "—"} lần cắt trong 5 năm`}>{v.streak ?? "—"} năm</Stat>
        <Stat label="Sau GDKHQ (lịch sử của mã)" testId="pfa-exstudy" sub={v.exStudy ? `${v.exStudy.n} lần · lấp khoảng trong 20 phiên ${pct(v.exStudy.fillWithin20, 0)}` : "Chưa đủ lịch sử"}>
          {v.exStudy?.fillDaysMedian != null ? `${v.exStudy.fillDaysMedian} phiên để lấp` : "—"}
        </Stat>
      </div>
      {q && (
        <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <p className="text-[10px] text-slate-500">Độ bền cổ tức ({q.version ?? "DQ"}) · {q.checksPassed ?? "—"}/{q.checksKnown ?? "—"} điều kiện đạt<Evidence label="MÔ TẢ" /></p>
            <Checklist items={q.checks} testId="pfa-dq-checks" />
          </div>
          <div className="space-y-1">
            {q.lintner?.ok && <p className="text-[11px] text-slate-300" data-testid="pfa-lintner">Mô hình Lintner: tỷ lệ chi trả mục tiêu {pct(q.lintner.targetPayout, 0)}, tốc độ điều chỉnh {num(q.lintner.speed, 2)} ({q.lintner.n} năm) → lợi suất kỳ tới ước {pct(q.nextYield)}</p>}
            {q.company && <p className="text-[11px] text-slate-400">{q.company.years ?? "—"} năm lịch sử · chi trả 5 năm {pct(q.company.payout5 ?? null, 0)} lợi nhuận · FCF 5 năm phủ {num(q.company.fcfCover5 ?? null, 2)} lần cổ tức · {q.company.lossYears10 ?? 0} năm lỗ / 10</p>}
            {(v.history?.length ?? 0) > 0 && <p className="text-[10.5px] text-slate-500" data-testid="pfa-div-history">Tiền mặt theo năm: {v.history!.map(([y, c]) => `${y}: ${Math.round(c).toLocaleString("vi-VN")}đ`).join(" · ")}</p>}
          </div>
        </div>
      )}
    </Block>
  );
}

export default function CompanyProfileCard({ ticker }: { ticker: string }) {
  const { data, error, isLoading } = useProfileFa(ticker);
  if (isLoading) return <p className="tw-scope py-3 text-xs italic text-slate-500">Đang tải hồ sơ doanh nghiệp {ticker}…</p>;
  if (error) return <p className="tw-scope text-xs text-rose-400">Không tải được hồ sơ doanh nghiệp {ticker}: {String((error as Error).message ?? error)}.</p>;
  if (!data || data.missing) return <p className="tw-scope rounded-lg border border-white/10 p-3 text-[11px] text-slate-400" data-testid="pfa-missing">{ticker} không nằm trong bảng tín hiệu của phiên{data?.asOf ? ` ${fmtDate(data.asOf)}` : ""}, nên chưa có hồ sơ doanh nghiệp.</p>;
  return (
    <div className="tw-scope space-y-3 text-slate-200" data-testid="pfa-company">
      <Block title="Cảnh báo cơ bản & sự kiện" testId="pfa-warnings-block" right={<span className="text-[10px] text-slate-500">Mô tả — không đổi danh mục</span>}>
        <WarningList items={data.warnings} testId="pfa-warnings" />
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500" data-testid="pfa-far1">{FA_R1.summaryVi}<Evidence label={FA_R1.verdict} title={`FA-r1 · ${FA_R1.period} · chạy ${FA_R1.ranAt}`} /></p>
      </Block>
      {data.earnings && <Earnings e={data.earnings} />}
      {data.earnings && <Quality e={data.earnings} />}
      {data.dividend && <Dividend v={data.dividend} />}
      <p className="text-[10px] text-slate-500" data-testid="pfa-provenance">Hồ sơ khoá theo phiên {fmtDate(data.asOf)}{data.builtAt ? ` (dựng ${new Date(data.builtAt).toLocaleString("vi-VN", { hour12: false })})` : ""} · {data.version} · BCTC theo ngày công bố thật: quý công bố sau phiên không được dùng. Tham khảo định lượng — không phải khuyến nghị đầu tư.</p>
    </div>
  );
}
