// LQ1 (18/11/2026) — Hồ sơ 360° · Doanh nghiệp: "Thanh khoản & năng lực giao dịch". Biểu đồ GTGD khớp lệnh 60 phiên (trung vị,
// ngưỡng vào, phiên cạn cầu), số đo LQ-v1, năng lực theo vốn của người xem (tính lại từ chuỗi, giống hệt Gateway). Chỉ hiển thị.
import { useEffect, useMemo, useState } from "react";
import { useEliteLiquidity } from "../../../hooks/elite10/useEliteLiquidity";
import { BINDING_VI, bnText, LQ_TIER, lqCapacity, lqThresholds, reasonText, statsFromSeries, type LqPoint } from "../../../lib/elite10/liquidity";
import type { LqRules } from "../../../lib/elite10/decisionTypes";
import { Block, Evidence, fmtDate, num, Stat } from "./pfaParts";

const CAP_KEY = "gq:lq:capitalBn";
const readCap = (d: number) => { try { const v = Number(localStorage.getItem(CAP_KEY)); return v > 0 ? v : d; } catch { return d; } };

/** Biểu đồ cột GTGD 60 phiên: cột cao quá trần trục được cắt và đánh dấu ▲; vùng 20 phiên gần nhất tô nền; đường trung vị và ngưỡng. */
function ValueChart({ series, med20, medMin, p10Min, rules }: { series: LqPoint[]; med20: number; medMin: number; p10Min: number; rules: LqRules }) {
  const W = 600, H = 120, n = series.length, bw = W / Math.max(n, 1);
  const vals = series.map((p) => p.v ?? 0);
  const top = Math.max(medMin * 1.4, med20 * 2.5, Math.min(Math.max(...vals), med20 * 4)) || 1;
  const y = (v: number) => H - Math.min(v, top) / top * (H - 6);
  const v60s = [...vals].sort((a, b) => a - b), med60 = v60s.length ? v60s[Math.floor((v60s.length - 1) / 2)] : 0;
  return (
    <div data-testid="lq-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full" role="img" aria-label={`GTGD khớp lệnh ${n} phiên; trung vị 20 phiên ${bnText(med20)}; ngưỡng vào ${bnText(medMin)}`}>
        <rect x={W - Math.min(rules.win, n) * bw} y={0} width={Math.min(rules.win, n) * bw} height={H} fill="rgba(232,184,75,0.06)" />
        {series.map((p, i) => {
          const v = p.v ?? 0, stress = p.r != null && p.r <= -rules.stressRet && v < rules.stressFrac * med60, clipped = v > top;
          return (
            <g key={p.d}>
              <rect x={i * bw + 1} y={y(v)} width={Math.max(bw - 2, 1)} height={H - y(v)} rx={1}
                fill={stress ? "#fb7185" : p.v == null ? "#475569" : v < p10Min ? "#f59e0b" : "#38bdf8"} opacity={i >= n - rules.win ? 0.95 : 0.55}>
                <title>{`${fmtDate(p.d)} · GTGD ${p.v == null ? "không có số liệu" : bnText(v)} · ${p.r == null ? "—" : `${p.r > 0 ? "+" : ""}${num(p.r * 100, 2)}%`}${stress ? " · giảm sâu mà cạn cầu" : ""}`}</title>
              </rect>
              {clipped && <path d={`M${i * bw + bw / 2 - 3},7 L${i * bw + bw / 2 + 3},7 L${i * bw + bw / 2},2 Z`} fill="#e2e8f0" />}
            </g>
          );
        })}
        <line x1={W - Math.min(rules.win, n) * bw} x2={W} y1={y(med20)} y2={y(med20)} stroke="#F5CE72" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={y(medMin)} y2={y(medMin)} stroke="#94a3b8" strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={y(p10Min)} y2={y(p10Min)} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
        <span><span className="mr-1 inline-block h-0.5 w-3 align-middle" style={{ background: "#79a8ff" }} />Trung vị 20 phiên {bnText(med20)}</span>
        <span><span className="mr-1 inline-block w-3 border-t border-dashed border-slate-400 align-middle" />Ngưỡng vào {bnText(medMin)}</span>
        <span><span className="mr-1 inline-block w-3 border-t border-dotted border-amber-400 align-middle" />Sàn phiên xấu {bnText(p10Min)}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-400 align-middle" />Giảm sâu mà cạn cầu</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-500 align-middle" />Dưới sàn phiên xấu</span>
        <span>▲ cột bị cắt (đột biến) · nền vàng = 20 phiên gần nhất · {fmtDate(series[0]?.d)} → {fmtDate(series[n - 1]?.d)}</span>
      </div>
    </div>
  );
}

export default function LiquidityProfileBlock({ ticker }: { ticker: string }) {
  const { data, error, isLoading } = useEliteLiquidity(ticker);
  const rules = data?.rules;
  const [capital, setCapital] = useState<number | null>(null);
  useEffect(() => { if (rules && capital == null) setCapital(readCap(rules.capitalBn)); }, [rules, capital]);
  const cap = capital ?? rules?.capitalBn ?? 5;
  const mine = useMemo(() => (data?.series && rules ? statsFromSeries(data.series, data.sigma20, rules, cap) : null), [data, rules, cap]);
  const setCap = (v: number) => { if (!(v > 0)) return; setCapital(v); try { localStorage.setItem(CAP_KEY, String(v)); } catch { /* bộ nhớ trình duyệt bị chặn */ } };

  const head = <Evidence label="MÔ TẢ" title="LQ-v1: số đo thanh khoản trên GTGD KHỚP LỆNH (không gồm thoả thuận). Không đổi danh mục; đổi cổng chọn mã cần kiểm định đăng ký trước LQ-r1." />;
  if (isLoading) return <Block title="Thanh khoản & năng lực giao dịch" testId="lq-profile" right={head}><p className="text-[11px] italic text-slate-500">Đang tải số đo thanh khoản…</p></Block>;
  if (error || !data || data.missing || !data.liq || !data.series || !rules || !mine) {
    return <Block title="Thanh khoản & năng lực giao dịch" testId="lq-profile" right={head}><p className="text-[11px] text-slate-400" data-testid="lq-missing">{error ? `Không tải được số đo thanh khoản: ${String((error as Error).message ?? error)}` : `Chưa có chuỗi GTGD của ${ticker} ở phiên quyết định mới nhất.`}</p></Block>;
  }
  const gw = data.liq, t = LQ_TIER[gw.tier], tm = LQ_TIER[mine.tier], th = lqThresholds(rules, cap);
  const q = rules.wMax * cap, c = lqCapacity(mine, data.sigma20, q, rules);
  return (
    <Block title="Thanh khoản & năng lực giao dịch" testId="lq-profile" right={head}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
        <span className={`rounded border px-1.5 py-0.5 font-bold ${t.cls}`} data-testid="lq-tier" title={t.hint}>{t.short} · {t.label}</span>
        <span className="text-slate-400">theo vốn tham chiếu {num(rules.capitalBn, 0)} tỷ của hệ thống · phiên {fmtDate(data.date)}{data.inPanel === false ? " · mã ngoài bảng tín hiệu" : ""}</span>
      </div>
      <ValueChart series={data.series} med20={gw.med20 ?? 0} medMin={th.medMin} p10Min={th.p10Min} rules={rules} />
      <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-3">
        <Stat label="Trung vị GTGD 20 phiên" testId="lq-med" sub={`Trung bình ${bnText(gw.mean20)}${gw.mean20 && gw.med20 && gw.mean20 > gw.med20 * 1.2 ? ` — cao hơn trung vị ${num((gw.mean20 / gw.med20 - 1) * 100, 0)}% do đột biến` : ""}`}>{bnText(gw.med20)}</Stat>
        <Stat label="Phiên thấp (p10, 60 phiên)" testId="lq-p10" sub={`Thấp nhất 20 phiên ${bnText(gw.min20)} · cao nhất ${bnText(gw.max20)}`}>{bnText(gw.p10)}</Stat>
        <Stat label="Mật độ giao dịch" testId="lq-density" sub={`Số phiên trong 20 có GTGD ≥ ${bnText(lqThresholds(rules).dayMin)} · phiên lớn nhất chiếm ${num((gw.maxShare ?? 0) * 100, 0)}%`}>{gw.density}/20</Stat>
        <Stat label="Trượt giá Amihud (60 phiên)" testId="lq-illiq" sub={`Σ|lợi suất| / ΣGTGD · cờ > ${num(rules.illiqWarn, 1)} · trần ${num(rules.illiqMax, 1)}%/tỷ`}>
          <span className={(gw.illiq ?? 0) > rules.illiqMax ? "text-rose-300" : (gw.illiq ?? 0) > rules.illiqWarn ? "text-amber-300" : "text-slate-100"}>{num(gw.illiq, 3)}%/tỷ</span>
        </Stat>
        <Stat label="Phiên giảm sâu mà cạn cầu" testId="lq-stress" sub={`Giảm ≥ ${num(rules.stressRet * 100, 0)}% với GTGD < ${num(rules.stressFrac * 100, 0)}% trung vị 60 phiên`}>
          <span className={(gw.stressDays ?? 0) > 0 ? "text-rose-300" : "text-slate-100"}>{gw.stressDays ?? 0}</span>
        </Stat>
        <Stat label="Vị thế tối đa (hệ thống)" testId="lq-capacity" sub={`Ràng buộc: ${BINDING_VI[gw.binding ?? "in"]} · vốn tối đa nếu tỷ trọng 15%: ${bnText(gw.capitalMaxBn)}`}>{bnText(gw.capacityBn)}</Stat>
      </div>
      {gw.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-amber-200" data-testid="lq-reasons">{gw.reasons.map((id) => <li key={id}>• {reasonText(id, gw, rules)}</li>)}</ul>
      )}
      <div className="mt-2 rounded border border-white/10 bg-white/[0.02] p-2 text-[11px]" data-testid="lq-whatif">
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-slate-300">Thử với vốn của anh</span>
          <input type="number" min={0.1} step={0.5} value={cap} onChange={(e) => setCap(Number(e.target.value))} className="w-20 rounded border border-white/15 bg-transparent px-1.5 py-0.5 text-right text-slate-100" aria-label="Vốn danh mục, tỷ đồng" data-testid="lq-capital" />
          <span className="text-slate-400">tỷ đồng · vị thế lớn nhất 15% = {bnText(q)}</span>
        </label>
        <p className="mt-1 text-slate-300" data-testid="lq-mine">
          Bậc theo vốn này <b className={`rounded border px-1 ${tm.cls}`}>{tm.short} · {tm.label}</b> · cần trung vị ≥ {bnText(th.medMin)}, phiên thấp ≥ {bnText(th.p10Min)} ·
          tác động ước tính <b className={(c.impactPct ?? 0) > rules.impactMax * 100 ? "text-amber-300" : "text-slate-100"}>{num(c.impactPct, 2)}%</b> một chiều ·
          thoát hết trong ~<b className={(c.dtl ?? 0) > rules.exitDays ? "text-amber-300" : "text-slate-100"}>{num(c.dtl, 1)}</b> phiên xấu
        </p>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
          Tác động theo luật căn bậc hai: {num(rules.impactY, 1)} × σ ngày ({num(Math.max(data.sigma20 ?? 0, rules.sigmaFloor) * 100, 1)}%) × √(vị thế / trung vị GTGD). Phí trong sổ Elite HL (0,20% mua / 0,25% bán) chưa gồm phần tác động này.
          Ô vốn lưu riêng trên trình duyệt của anh, không đổi số của hệ thống.
        </p>
      </div>
      {/* HS360-v3 H4: "Price Action × Khối lượng" (kỹ thuật) chuyển sang lớp Kỹ thuật của ma trận ở góc Tổng quan. */}
    </Block>
  );
}
