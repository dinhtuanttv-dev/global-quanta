// K3 (06/11/2026) — chất lượng lợi nhuận & sức khoẻ tài chính (TTM): dồn tích Sloan, CFO/LNST, Piotroski F, Beneish M, Altman Z″,
// DuPont 3 tầng, vòng quay vốn lưu động; chỉ số riêng ngân hàng / chứng khoán / bảo hiểm; xu hướng 12 quý.
import type { ReactNode } from "react";
import { fin, num, pctPlain } from "../../../../lib/kqkd/format";
import type { KqkdDetail, QualityPoint } from "../../../../lib/kqkd/types";

function Card({ title, value, sub, tone = "text-slate-100", children, testId, hint }: { title: string; value: ReactNode; sub?: ReactNode; tone?: string; children?: ReactNode; testId?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid={testId} title={hint}>
      <p className="text-[10px] font-bold uppercase text-slate-500">{title}</p>
      <p className={`font-mono text-[20px] font-bold tabular-nums ${tone}`}>{value}</p>
      {sub && <p className="text-[10.5px] text-slate-400">{sub}</p>}
      {children}
    </div>
  );
}

function Trend({ s, pick, label, fmt }: { s: QualityPoint[]; pick: (p: QualityPoint) => number | null; label: string; fmt: (v: number | null) => string }) {
  const pts = s.map((p) => ({ q: p.quarter, v: pick(p) })).filter((p) => fin(p.v)) as { q: string; v: number }[];
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
  const Wd = 160, Hd = 34, x = (i: number) => 2 + (i / (pts.length - 1)) * (Wd - 4), y = (v: number) => 3 + ((hi - v) / (hi - lo || 1)) * (Hd - 6);
  return (
    <svg width="100%" viewBox={`0 0 ${Wd} ${Hd}`} className="mt-1" role="img" aria-label={`${label} 12 quý: ${pts.map((p) => `${p.q} ${fmt(p.v)}`).join(", ")}`}>
      {lo < 0 && hi > 0 && <line x1={0} x2={Wd} y1={y(0)} y2={y(0)} stroke="rgba(148,163,184,0.3)" strokeDasharray="2 2" />}
      <polyline points={pts.map((p, i) => `${x(i)},${y(p.v)}`).join(" ")} fill="none" stroke="#E8B84B" strokeWidth={2} strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].v)} r={3} fill="#F5CE72" />
    </svg>
  );
}

const ZONE: Record<string, { t: string; cls: string }> = { SAFE: { t: "an toàn", cls: "text-emerald-300" }, GREY: { t: "vùng xám", cls: "text-amber-300" }, DISTRESS: { t: "rủi ro", cls: "text-rose-300" } };
const KPI_LABEL: Record<string, { t: string; fmt: (v: number | null) => string; hint: string }> = {
  nim: { t: "NIM (xấp xỉ)", fmt: (v) => pctPlain(v, 2), hint: "Thu nhập lãi thuần 4 quý ÷ tài sản sinh lãi bình quân (cho vay + liên ngân hàng + chứng khoán + tiền gửi NHNN)" },
  cir: { t: "CIR", fmt: (v) => pctPlain(v), hint: "Chi phí hoạt động ÷ tổng thu nhập hoạt động (4 quý)" },
  ldr: { t: "Cho vay / tiền gửi KH", fmt: (v) => pctPlain(v), hint: "Dư nợ cho vay khách hàng ÷ tiền gửi khách hàng (cuối quý; không phải LDR theo quy định của NHNN)" },
  creditCost: { t: "Chi phí tín dụng", fmt: (v) => pctPlain(v, 2), hint: "Dự phòng rủi ro 4 quý ÷ dư nợ cho vay bình quân" },
  niiShare: { t: "Tỷ trọng thu nhập lãi", fmt: (v) => pctPlain(v), hint: "Thu nhập lãi thuần ÷ tổng thu nhập hoạt động" },
  loanGrowth: { t: "Tăng trưởng cho vay", fmt: (v) => pctPlain(v), hint: "Dư nợ cho vay so với cùng kỳ năm trước" },
  depositGrowth: { t: "Tăng trưởng tiền gửi", fmt: (v) => pctPlain(v), hint: "Tiền gửi khách hàng so với cùng kỳ năm trước" },
  marginToEquity: { t: "Cho vay margin / VCSH", fmt: (v) => pctPlain(v), hint: "Dư nợ cho vay ÷ vốn chủ sở hữu (cuối quý)" },
  brokerageShare: { t: "Tỷ trọng môi giới", fmt: (v) => pctPlain(v), hint: "Doanh thu môi giới ÷ doanh thu hoạt động (4 quý)" },
  lendingShare: { t: "Tỷ trọng lãi cho vay", fmt: (v) => pctPlain(v), hint: "Lãi từ cho vay và phải thu ÷ doanh thu hoạt động (4 quý)" },
  propShare: { t: "Tỷ trọng tự doanh FVTPL", fmt: (v) => pctPlain(v), hint: "Lãi FVTPL thuần ÷ doanh thu hoạt động (4 quý)" },
  unrealizedShare: { t: "LNTT chưa thực hiện", fmt: (v) => pctPlain(v), hint: "Phần LNTT từ đánh giá lại tài sản tài chính (4 quý)" },
  lossRatio: { t: "Tỷ lệ bồi thường", fmt: (v) => pctPlain(v), hint: "Tổng chi bồi thường ÷ doanh thu phí bảo hiểm thuần (4 quý)" },
  investShare: { t: "LNTT từ đầu tư & khác", fmt: (v) => pctPlain(v), hint: "Phần LNTT ngoài kinh doanh bảo hiểm (4 quý)" },
  premiumGrowth: { t: "Tăng trưởng phí BH", fmt: (v) => pctPlain(v), hint: "Doanh thu phí thuần 4 quý so cùng kỳ" },
  debtToEquity: { t: "Vay / VCSH", fmt: (v) => num(v), hint: "(Vay ngắn hạn + dài hạn) ÷ vốn chủ sở hữu" },
  interestCover: { t: "Khả năng trả lãi", fmt: (v) => (fin(v) ? `${num(v, 1)} lần` : "—"), hint: "EBIT 4 quý ÷ chi phí lãi vay 4 quý" },
  netDebtToEbitda: { t: "Nợ ròng / EBITDA", fmt: (v) => num(v), hint: "(Vay − tiền − đầu tư ngắn hạn) ÷ (EBIT + khấu hao) 4 quý; âm = tiền ròng" },
};

export default function QualityHealth({ d }: { d: KqkdDetail }) {
  const q = d.quality, s = d.qualitySeries;
  const acc = q.accrual, f = q.piotroski, m = q.beneish, z = q.altman;
  return (
    <div className="space-y-3" data-testid="kq-quality">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        <Card title="Dồn tích Sloan" value={pctPlain(acc)} tone={fin(acc) && acc > 0.1 ? "text-rose-300" : fin(acc) && acc < 0 ? "text-emerald-300" : "text-slate-100"} testId="kq-q-accrual"
          sub={fin(acc) ? (acc > 0.1 ? "cao: lợi nhuận chưa thành tiền" : acc < 0 ? "dòng tiền vượt lợi nhuận" : "trung bình") : "thiếu dữ liệu"} hint="(LNST − dòng tiền HĐKD) 4 quý ÷ tổng tài sản bình quân (Sloan 1996). Càng cao càng nhiều lợi nhuận kế toán chưa thu tiền.">
          <Trend s={s} pick={(p) => p.accrual} label="Dồn tích" fmt={(v) => pctPlain(v)} />
        </Card>
        <Card title="CFO / LNST (4 quý)" value={fin(q.cfoToNpat) ? `${num(q.cfoToNpat)}×` : "—"} tone={fin(q.cfoToNpat) && q.cfoToNpat < 0.5 ? "text-amber-300" : "text-slate-100"} testId="kq-q-cfo"
          sub={fin(q.cfoToNpat) ? (q.cfoToNpat >= 1 ? "lợi nhuận được dòng tiền xác nhận" : q.cfoToNpat < 0 ? "dòng tiền HĐKD âm" : "dòng tiền thấp hơn lợi nhuận") : "không áp dụng khi lỗ"}>
          <Trend s={s} pick={(p) => p.cfoToNpat} label="CFO/LNST" fmt={(v) => num(v)} />
        </Card>
        <Card title="ROE (DuPont)" value={pctPlain(q.dupont.roe)} testId="kq-q-dupont"
          sub={<>biên ròng {pctPlain(q.dupont.netMargin)} × vòng quay {num(q.dupont.turnover)} × đòn bẩy {num(q.dupont.leverage)}</>} hint="ROE = LNST/doanh thu × doanh thu/tài sản bình quân × tài sản/VCSH bình quân (4 quý)">
          <Trend s={s} pick={(p) => p.roe} label="ROE" fmt={(v) => pctPlain(v)} />
        </Card>
        {f && (
          <Card title="Piotroski F-score" value={f.score == null ? "—" : `${f.score}/9`} tone={f.score == null ? "text-slate-400" : f.score >= 7 ? "text-emerald-300" : f.score <= 3 ? "text-rose-300" : "text-slate-100"} testId="kq-q-piotroski"
            sub={f.score == null ? `chỉ có ${f.of}/9 phép thử đủ dữ liệu` : f.score >= 7 ? "mạnh" : f.score <= 3 ? "yếu" : "trung bình"} hint="Piotroski (2000): 9 phép thử sinh lời, đòn bẩy/thanh khoản, hiệu quả hoạt động (4 quý so cùng kỳ)">
            <ul className="mt-1 space-y-0.5 text-[10.5px]">{f.tests.map((t) => <li key={t.id} className={t.pass == null ? "text-slate-500" : t.pass ? "text-emerald-300" : "text-rose-300"}>{t.pass == null ? "○" : t.pass ? "✓" : "✗"} {t.label}</li>)}</ul>
          </Card>
        )}
        {m && (
          <Card title="Beneish M-score" value={fin(m.m) ? num(m.m) : "—"} tone={m.flag ? "text-amber-300" : "text-slate-100"} testId="kq-q-beneish"
            sub={m.flag == null ? "thiếu dữ liệu" : m.flag ? "trên −1,78: nên soát kỹ số liệu" : "dưới −1,78: không có dấu hiệu"} hint="Beneish (1999) 8 biến, 4 quý so cùng kỳ. Công cụ sàng lọc, không phải kết luận về gian lận.">
            <div className="mt-1 grid grid-cols-4 gap-x-2 text-[10px] text-slate-400">{Object.entries(m.vars).map(([k, v]) => <span key={k}>{k} <b className="font-mono text-slate-200">{num(v)}</b></span>)}</div>
          </Card>
        )}
        {z && (
          <Card title="Altman Z″" value={fin(z.z) ? num(z.z) : "—"} tone={z.zone ? ZONE[z.zone].cls : "text-slate-400"} testId="kq-q-altman"
            sub={z.zone ? `${ZONE[z.zone].t} (ngưỡng 1,1 / 2,6)` : "thiếu dữ liệu"} hint="Altman Z″ (1995) cho doanh nghiệp ngoài sản xuất / thị trường mới nổi: 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4">
            <div className="mt-1 grid grid-cols-2 gap-x-2 text-[10px] text-slate-400"><span>X1 vốn lưu động/TS <b className="font-mono text-slate-200">{num(z.x.X1)}</b></span><span>X2 LN giữ lại/TS <b className="font-mono text-slate-200">{num(z.x.X2)}</b></span><span>X3 EBIT/TS <b className="font-mono text-slate-200">{num(z.x.X3)}</b></span><span>X4 VCSH/nợ <b className="font-mono text-slate-200">{num(z.x.X4)}</b></span></div>
            <Trend s={s} pick={(p) => p.z} label="Altman Z″" fmt={(v) => num(v)} />
          </Card>
        )}
        {q.wc && (
          <Card title="Chu kỳ tiền mặt" value={fin(q.wc.ccc) ? `${Math.round(q.wc.ccc)} ngày` : "—"} testId="kq-q-wc"
            sub={<>thu tiền {fin(q.wc.dso) ? Math.round(q.wc.dso) : "—"} · tồn kho {fin(q.wc.dio) ? Math.round(q.wc.dio) : "—"} · trả NCC {fin(q.wc.dpo) ? Math.round(q.wc.dpo) : "—"} ngày</>}
            hint="CCC = DSO + DIO − DPO; tính trên doanh thu và giá vốn 4 quý, số dư cuối quý" />
        )}
        {q.kpi && Object.entries(q.kpi).map(([k, v]) => KPI_LABEL[k] && (
          <Card key={k} title={KPI_LABEL[k].t} value={KPI_LABEL[k].fmt(v)} hint={KPI_LABEL[k].hint} testId={`kq-q-kpi-${k}`}>
            {(d.tpl === "bank" || d.tpl === "sec" || d.tpl === "ins") && <Trend s={s} pick={(p) => p.kpi?.[k] ?? null} label={KPI_LABEL[k].t} fmt={KPI_LABEL[k].fmt} />}
          </Card>
        ))}
      </div>
      {d.tpl !== "corp" && <p className="text-[10.5px] text-slate-400">Piotroski, Beneish, Altman chỉ dùng cho mẫu doanh nghiệp (không hợp với bảng cân đối ngân hàng, chứng khoán, bảo hiểm). {d.tpl === "bank" ? "Nguồn VNDirect không có nợ xấu nên không hiển thị." : ""}</p>}
      <p className="text-[10px] text-slate-500">Tất cả tính trên 4 quý gần nhất (TTM) tới {q.quarter}; số dư bình quân = (cuối quý này + cùng quý năm trước) ÷ 2. {d.method.label}</p>
    </div>
  );
}
