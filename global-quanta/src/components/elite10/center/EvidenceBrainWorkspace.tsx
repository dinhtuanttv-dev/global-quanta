import { useMemo, useState } from "react";
import { useEliteDecision, useEliteTicker } from "../../../hooks/elite10/useEliteCenter";
import { useGatewayBuyTimeline } from "../../../hooks/useGatewayBuyTimeline";
import { useEventRadar } from "../../../hooks/useEventRadar";
import { useVolumeAnalysis } from "../../../hooks/useVolumeAnalysis";
import PriceActionConfirmation from "../profile/PriceActionConfirmation";
import type { Lane } from "../../MainTabs/ChatXucTac/CatalystChatPanel";

type Props = {
  ticker: string;
  onTickerChange: (value: string) => void;
  bull: Lane | null;
  bear: Lane | null;
  judge: Lane | null;
};

const fmt = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value)
  ? "—" : value.toLocaleString("vi-VN", { maximumFractionDigits: digits });
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString("vi-VN") : "—";
const safeHttpUrl = (value: string | null) => {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null; }
  catch { return null; }
};

function Node({ title, status, children, tone = "cyan" }: { title: string; status: string; children?: React.ReactNode; tone?: "cyan" | "green" | "red" | "amber" }) {
  const palette = {
    cyan: "border-cyan-400/30 bg-cyan-400/[0.06]",
    green: "border-emerald-400/30 bg-emerald-400/[0.06]",
    red: "border-rose-400/30 bg-rose-400/[0.06]",
    amber: "border-amber-400/30 bg-amber-400/[0.06]",
  }[tone];
  return <article className={`relative z-10 min-w-0 rounded-lg border p-2.5 ${palette}`}>
    <div className="flex items-center justify-between gap-2"><h5 className="text-[10px] font-bold uppercase tracking-wide text-slate-200">{title}</h5><span className="text-[9px] text-slate-400">{status}</span></div>
    {children && <div className="mt-1.5 text-[10px] leading-relaxed text-slate-300">{children}</div>}
  </article>;
}

function OnDemandSources({ ticker }: { ticker: string }) {
  const news = useEventRadar({ ticker, limit: 12 });
  const volume = useVolumeAnalysis(ticker);
  const events = (news.data?.events ?? []).filter((event) => event.tickers.some((item) => item.toUpperCase() === ticker));
  return <div className="grid gap-2 lg:grid-cols-2">
    <Node title="Tin tức & chất xúc tác" status={news.isLoading ? "đang tải" : news.error ? "lỗi nguồn" : `${events.length} sự kiện`} tone="amber">
      {news.error ? "Không tải được Event Radar." : events.length ? <ul className="space-y-1.5">{events.slice(0, 5).map((event) => <li key={event.eventId} className="border-t border-white/5 pt-1.5">
        <span className="font-semibold text-slate-100">{event.title}</span><br />
        <span>{event.sourceLabel} · {event.verificationStatus} · {date(event.publishedAt ?? event.firstSeenAt)}</span>
        {safeHttpUrl(event.url) && <a className="ml-1 text-cyan-300 underline" href={safeHttpUrl(event.url)!} target="_blank" rel="noreferrer">Nguồn</a>}
      </li>)}</ul> : news.isLoading ? "Đang tải tin theo mã đã chọn…" : "Không có sự kiện phù hợp trong phản hồi hiện tại; trạng thái này không đồng nghĩa không có tin."}
    </Node>
    <Node title="Khối lượng & thanh khoản" status={volume.isLoading ? "đang tải" : volume.error ? "lỗi nguồn" : volume.data ? `as of ${date(volume.data.asOf)}` : "chưa có dữ liệu"} tone="cyan">
      {volume.data ? <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span>RVOL {volume.data.today.rvolMode === "intraday" ? "cùng thời điểm" : "20 phiên"}</span><b>{fmt(volume.data.today.rvolMode === "intraday" ? volume.data.today.rvolTimeAdjusted : volume.data.today.rvol20)}×</b>
        <span>GTGD hôm nay</span><b>{fmt(volume.data.today.value / 1e9)} tỷ</b>
        <span>Up/down volume 20p</span><b>{fmt(volume.data.trend.upDownVolumeRatio20)}×</b>
        <span>OBV · CMF20</span><b>{volume.data.trend.obvDirection} · {fmt(volume.data.trend.cmf20, 3)}</b>
        <span>Trạng thái nến</span><b>{volume.data.partialToday ? "đang diễn ra" : "đã chốt"}</b>
        {volume.data.trend.divergence && <p className="col-span-2 text-amber-200">Phân kỳ: {volume.data.trend.divergence.label}</p>}
      </div> : volume.error ? "Không tải được phân tích khối lượng." : "Chưa có dữ liệu khối lượng."}
    </Node>
  </div>;
}

export default function EvidenceBrainWorkspace({ ticker, onTickerChange, bull, bear, judge }: Props) {
  const [loadSources, setLoadSources] = useState(false);
  const [loadPriceAction, setLoadPriceAction] = useState(false);
  const [focus, setFocus] = useState("snapshot");
  const normalized = ticker.trim().toUpperCase();
  const validTicker = /^[A-Z0-9]{3,10}$/.test(normalized) ? normalized : null;
  const decision = useEliteDecision();
  const selected = useEliteTicker(validTicker);
  const timeline = useGatewayBuyTimeline();
  const pick = decision.data?.portfolio.find((row) => row.ticker.toUpperCase() === normalized);
  const candidate = decision.data?.candidates?.find((row) => row.ticker.toUpperCase() === normalized);
  const score = decision.data?.scores.find((row) => row.ticker.toUpperCase() === normalized);
  const timing = useMemo(() => normalized
    ? timeline.data?.rows.find((row) => row.ticker.toUpperCase() === normalized)
    : undefined, [normalized, timeline.data]);
  const eligibility = pick ? "Danh mục" : candidate ? "Hàng chờ" : score?.eligible ? "Đủ điều kiện · ngoài danh mục" : score ? "Chưa đủ điều kiện" : validTicker ? "Chưa xác minh trong phiên" : "Chọn mã";

  return <section className="rounded-xl border border-cyan-400/25 bg-[#07111d] p-3 text-slate-200 shadow-[0_16px_50px_rgba(0,0,0,.28)]" data-testid="evidence-brain-workspace">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div><p className="text-[9px] font-bold uppercase tracking-[.2em] text-cyan-300">Evidence Brain · research workspace</p>
        <h3 className="mt-0.5 text-sm font-bold text-white">Phòng họp AI · bản đồ bằng chứng</h3>
        <p className="mt-0.5 text-[10px] text-slate-500">Phiên tham chiếu {decision.data?.date ?? "đang tải"} · {decision.data?.version ?? "chưa có phiên bản"} · {decision.data?.builtAt ? `dựng ${new Date(decision.data.builtAt).toLocaleString("vi-VN")}` : "nguồn quyết định chưa sẵn sàng"}</p>
        <p className="text-[9px] text-slate-600">Nguồn được nạp theo từng dịch vụ; các lượt AI hiện chưa khóa chung một snapshot bất biến.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="elite-debate-subject" className="sr-only">Mã cổ phiếu phân tích</label>
        <input id="elite-debate-subject" value={ticker} onChange={(event) => onTickerChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))} maxLength={10}
          placeholder="Mã cổ phiếu" aria-label="Chủ đề tranh luận" className="w-32 rounded-md border border-white/15 bg-slate-950 px-2.5 py-1.5 text-[11px] uppercase outline-none focus:border-cyan-400/50" />
        <span className={`rounded border px-2 py-1 text-[9px] ${pick ? "border-emerald-400/40 text-emerald-300" : "border-amber-400/40 text-amber-200"}`}>{eligibility}</span>
        <span className="rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400">AI = diễn giải</span>
      </div>
    </header>

    <div className="mt-3 grid gap-3 xl:grid-cols-[210px_minmax(0,1fr)_240px]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Phễu tuyển chọn</h4><span className="text-[9px] text-slate-600">phiên {decision.data?.date ?? "—"}</span></div>
        {[
          ["01", "Bảng tín hiệu", decision.data?.universe.panel],
          ["02", "Đủ điều kiện theo engine", decision.data?.universe.eligible],
          ["03", "Đạt tầng 1", null],
          ["04", "Hợp lưu", null],
          ["05", "Hợp lưu · giao dịch được", null],
          ["06", "Trong vùng mua", null],
          ["07", "Danh mục", decision.data?.portfolio.length],
        ].map(([step, label, count], index) => <button key={step} type="button" onClick={() => setFocus(`funnel-${step}`)} className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left ${focus === `funnel-${step}` ? "border-cyan-300/40 bg-cyan-300/[.08]" : "border-white/8 bg-white/[.02]"}`}>
          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] ${index === 6 && pick ? "bg-emerald-400/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{step}</span>
          <span className="min-w-0 flex-1 text-[10px] text-slate-300">{label}</span><b className="text-[10px] text-slate-100">{count == null ? "—" : count}</b>
        </button>)}
        <p className="text-[9px] leading-relaxed text-slate-600">Payload phiên hiện tại chỉ cung cấp quy mô universe, số mã đủ điều kiện và danh mục; các bước funnel trung gian không được ước tính. Chưa có membership từng bước cho mã này.</p>
      </aside>

      <main className="relative min-h-[290px] overflow-hidden rounded-lg border border-white/10 bg-[radial-gradient(circle_at_50%_40%,rgba(15,63,82,.2),transparent_55%),linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:auto,24px_24px,24px_24px] p-2.5">
        <div className="mb-2 flex items-center justify-between"><h4 className="text-[10px] font-bold uppercase tracking-wide text-cyan-200">Canvas 2D · quan hệ claim & nguồn</h4><div className="flex gap-1"><button type="button" onClick={() => setFocus("snapshot")} className="rounded border border-white/10 px-2 py-1 text-[9px] text-slate-400">Đặt lại</button><span className="rounded border border-white/10 px-2 py-1 text-[9px] text-slate-500">Read only</span></div></div>
        <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-14 h-[220px] w-full" preserveAspectRatio="none" viewBox="0 0 800 250">
          <defs><marker id="brain-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7" fill="none" stroke="#426174" /></marker></defs>
          <path d="M135 48 C245 48 230 100 355 100" fill="none" stroke="#426174" strokeDasharray="5 5" markerEnd="url(#brain-arrow)" />
          <path d="M135 195 C245 195 230 140 355 140" fill="none" stroke="#426174" strokeDasharray="5 5" markerEnd="url(#brain-arrow)" />
          <path d="M445 100 C560 100 545 48 665 48" fill="none" stroke="#426174" strokeDasharray="5 5" markerEnd="url(#brain-arrow)" />
          <path d="M445 140 C560 140 545 195 665 195" fill="none" stroke="#426174" strokeDasharray="5 5" markerEnd="url(#brain-arrow)" />
        </svg>
        <div className="relative grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_1.2fr_1fr]">
          <div className="space-y-2"><Node title="Nguồn · Elite" status={decision.isLoading || selected.isLoading ? "đang tải" : decision.error || selected.error ? "lỗi" : `as of ${date(decision.data?.date)}`}>
            {pick ? `${normalized} · hạng #${pick.rank} · tỷ trọng ${fmt(pick.weight * 100, 1)}% · Z ${fmt(pick.Z)}` : candidate ? `${normalized} · ứng viên #${candidate.rank} · ${candidate.reason}` : score ? `${normalized} · ${score.reason ?? (score.eligible ? "đạt điều kiện" : "chưa đạt")}` : "Dữ liệu membership/điểm từng mã chưa có."}
            {selected.panel && <div className="mt-1 border-t border-white/10 pt-1 text-slate-400">Ngành: {selected.panel.sector ?? "chưa phân loại"}{selected.panel.missingSources.length ? ` · thiếu nguồn: ${selected.panel.missingSources.join(", ")}` : ""}</div>}
          </Node><Node title="Price Action" status={loadPriceAction ? "đã mở" : "chưa tải"} tone="amber">OHLCV ngày · trạng thái setup chỉ được xác định khi mở dữ liệu kỹ thuật.</Node></div>
          <div className="space-y-2 rounded-lg border border-cyan-300/30 bg-[#0b1b28]/90 p-3 text-center shadow-[0_0_35px_rgba(34,211,238,.08)]">
            <span className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-cyan-300/50 bg-cyan-300/10 text-xs font-bold text-cyan-200">{validTicker ?? "E10"}</span>
            <h5 className="text-[11px] font-bold text-white">{validTicker ? `${validTicker} · phiên tham chiếu` : "Danh mục Elite 10 · phiên tham chiếu"}</h5>
            <p className="text-[9px] text-slate-500">{decision.data?.date ? `Phiên ${decision.data.date}` : "Đang chờ dữ liệu phiên"} · không tạo điểm mua</p>
            <div className="grid grid-cols-3 gap-1 border-t border-white/10 pt-2 text-[9px]"><span className="text-emerald-300">MUA · {bull?.text ? "có luận điểm" : "chờ tranh luận"}</span><span className="text-rose-300">BÁN · {bear?.text ? "có luận điểm" : "chờ phản biện"}</span><span className="text-amber-200">TRỌNG TÀI · {judge?.text ? "đã phản hồi" : "chưa chạy"}</span></div>
          </div>
          <div className="space-y-2"><Node title="Chất xúc tác" status={loadSources ? "đã mở" : "chưa tải"} tone="amber">Event Radar · giữ nguyên trạng thái xác minh, nguồn và thời điểm công bố.</Node><Node title="Volume" status={loadSources ? "đã mở" : "chưa tải"}>RVOL · OBV · CMF · phân kỳ; tách rõ dữ liệu intraday và nến đã chốt.</Node></div>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2"><Node title="Phe mua · Claude" status={bull?.text ? "diễn giải AI" : "chưa có claim"} tone="green">{bull?.text ? `${bull.text.slice(0, 220)}${bull.text.length > 220 ? "…" : ""}` : "Chạy tranh luận bên dưới để thêm luận điểm."}</Node><Node title="Phe bán · Gemini" status={bear?.text ? "diễn giải AI" : "chưa có claim"} tone="red">{bear?.text ? `${bear.text.slice(0, 220)}${bear.text.length > 220 ? "…" : ""}` : "Luận điểm AI chưa được gắn ref nguồn có cấu trúc."}</Node></div>
        {judge?.text && <div className="mt-2"><Node title="Trọng tài · Claude" status="diễn giải AI · không thay người quyết định" tone="amber">{judge.text.slice(0, 360)}{judge.text.length > 360 ? "…" : ""}</Node></div>}
      </main>

      <aside className="space-y-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Ma trận thời điểm</h4>
        <Node title="Tư cách danh mục" status={eligibility} tone={pick ? "green" : "amber"}>{pick ? `Tỷ trọng ${fmt(pick.weight * 100, 1)}% · theo snapshot Elite.` : candidate ? "Ứng viên, chưa thuộc danh mục." : "Mã không được xác nhận là thành viên danh mục."}</Node>
        <Node title="Catalyst timing" status={timing ? `${timing.tier} · ${timing.status}` : timeline.loading ? "đang tải" : "chưa có nghiên cứu phù hợp"} tone="amber">{timing ? `${timing.kind === "DIVIDEND" ? "Cổ tức" : "KQKD"} · ${timing.eventLabel} · ${timing.windowLabel} · ${timing.entryFromDate} → ${timing.entryToDate} · thắng ${fmt(timing.winRate * 100, 0)}% / ${timing.nEvents} sự kiện · kỳ vọng ròng ${fmt(timing.netExpectancy * 100, 1)}% (cận dưới ${fmt(timing.netExpectancyLcb * 100, 1)}%)${pick ? " · mã thuộc danh mục" : " · mã ngoài danh mục"}` : timeline.error ?? "Chưa có dữ liệu catalyst cho mã này; không suy ra không có sự kiện."}<br /><span className="text-slate-500">Nghiên cứu theo mùa vụ, không phải trigger giá hoặc khuyến nghị mua.</span></Node>
        <Node title="Price Action" status="chưa xác minh" tone="amber">Chưa tải OHLCV hoặc chưa có kết quả engine cho mã đã chọn.</Node>
        <Node title="Thanh khoản / khớp lệnh" status={pick ? "tham chiếu Elite" : "chưa đánh giá"}>{pick ? `Giá đóng cửa ${fmt(pick.close)} · stop mô hình ${fmt(pick.stop)} · mục tiêu ${fmt(pick.target)}.` : "Không suy thanh khoản hoặc khả năng khớp lệnh từ điểm số."}</Node>
        <div className="grid grid-cols-1 gap-1.5 pt-1"><button type="button" disabled={!validTicker} onClick={() => setLoadPriceAction((value) => !value)} className="rounded-md border border-cyan-400/30 px-2.5 py-2 text-left text-[10px] font-semibold text-cyan-200 disabled:opacity-40">{loadPriceAction ? "Ẩn" : "Tải"} xác nhận Price Action</button><button type="button" disabled={!validTicker} onClick={() => setLoadSources((value) => !value)} className="rounded-md border border-white/15 px-2.5 py-2 text-left text-[10px] font-semibold text-slate-300 disabled:opacity-40">{loadSources ? "Ẩn" : "Tải"} tin tức & volume</button></div>
        <p className="text-[9px] leading-relaxed text-slate-600">Các lớp là trạng thái riêng biệt. Thiếu dữ liệu = chưa rõ; không quy đổi thành tín hiệu mua.</p>
      </aside>
    </div>
    {validTicker && loadPriceAction && <div className="mt-3"><PriceActionConfirmation ticker={validTicker} /></div>}
    {validTicker && loadSources && <div className="mt-3"><OnDemandSources ticker={validTicker} /></div>}
  </section>;
}
