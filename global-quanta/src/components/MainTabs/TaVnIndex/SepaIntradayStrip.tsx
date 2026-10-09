// SEPA SP6 — dải "Cảnh báo phá vỡ trong phiên" (tab SEPA + Golden SEPA). Mã SEPA đang chờ pivot: giá hiện tại so với pivot,
// khối lượng cả phiên NGOẠI SUY (255 phút HOSE) so với TB50 — phá vỡ đạt chuẩn khi ≥ 1,4× và chưa quá pivot + 5% (s.265, s.270).
// Thông báo trình duyệt: chỉ khi người dùng bật; mỗi mã / ngày báo một lần (ghi nhớ trên máy).
import { useEffect, useState } from "react";
import { Bell, BellOff, Zap } from "lucide-react";
import { useSepaIntraday, type SepaIntradayRow } from "../../../hooks/useSepaIntraday";

const STYLE: Record<string, string> = {
  BREAKOUT: "border-emerald-500/50 bg-emerald-500/10 text-emerald-200",
  BREAKOUT_LOW_VOL: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  EXTENDED: "border-slate-600 bg-slate-500/10 text-slate-300",
  NEAR: "border-sky-500/30 bg-sky-500/5 text-sky-200",
};
const SESSION_VI: Record<string, string> = { PRE_OPEN: "trước giờ mở cửa", ATO: "ATO", LO: "khớp lệnh liên tục", BREAK: "nghỉ trưa", ATC: "ATC", PT: "thoả thuận", CLOSED: "ngoài giờ" };
const NOTIFY_KEY = "gq_sepa_intraday_notify";
const SEEN_KEY = "gq_sepa_intraday_seen";
const fmtP = (v?: number) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("vi-VN"));
const pct = (v?: number) => (v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")}%`);
const hm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "");
const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

function useBreakoutNotifications(rows: SepaIntradayRow[], date: string | undefined) {
  const supported = typeof window !== "undefined" && "Notification" in window;
  const [on, setOn] = useState(() => supported && read(NOTIFY_KEY) === "1" && Notification.permission === "granted");
  useEffect(() => {
    if (!on || !date) return;
    let seen: Record<string, string[]> = {};
    try { seen = JSON.parse(read(SEEN_KEY) ?? "{}"); } catch { seen = {}; }
    const today = new Set(seen[date] ?? []);
    for (const r of rows) {
      if (r.state !== "BREAKOUT" || !r.reliable || today.has(r.ticker)) continue;
      today.add(r.ticker);
      try { new Notification(`SEPA · ${r.ticker} phá vỡ pivot ${fmtP(r.pivot)}`, { body: `Giá ${fmtP(r.price)} (${pct(r.distPct)}) · KL dự phóng ${r.projRatio?.toFixed(1).replace(".", ",")}× TB50 · ${r.pattern ?? ""} ${r.footprint ?? ""}`.trim(), tag: `sepa-${date}-${r.ticker}` }); } catch { /* bỏ qua */ }
    }
    write(SEEN_KEY, JSON.stringify({ [date]: [...today] }));
  }, [on, rows, date]);
  const toggle = async () => {
    if (!supported) return;
    if (on) { setOn(false); write(NOTIFY_KEY, "0"); return; }
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    const ok = p === "granted";
    setOn(ok); write(NOTIFY_KEY, ok ? "1" : "0");
  };
  return { supported, on, toggle };
}

export default function SepaIntradayStrip({ onOpen }: { onOpen?: (ticker: string) => void }) {
  const { data, error, live } = useSepaIntraday();
  const rows = (data?.rows ?? []).filter((r) => r.state && r.state !== "BELOW");
  const notify = useBreakoutNotifications(data?.rows ?? [], data?.date);
  if (error) return <p className="text-[9px] text-slate-500" data-testid="sepa-intraday-error">Cảnh báo trong phiên chưa sẵn sàng: {error.message}</p>;
  if (!data) return null;
  return (
    <div className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-2 space-y-1" data-testid="sepa-intraday">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[9.5px]">
        <Zap className="w-3 h-3 text-emerald-400" />
        <b className="text-slate-200">Cảnh báo phá vỡ trong phiên</b>
        <span className="text-slate-400" data-testid="sepa-intraday-session">
          {data.date} · {SESSION_VI[data.session] ?? data.session}{live ? ` · ${data.minutesElapsed}/${data.sessionMinutes} phút` : ""} · {data.candidates} mã chờ pivot (quét {data.scanDataAsOf})
        </span>
        {notify.supported && (
          <button type="button" onClick={() => void notify.toggle()} aria-pressed={notify.on} data-testid="sepa-intraday-notify"
            className="ml-auto inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 hover:text-emerald-300">
            {notify.on ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}{notify.on ? "Đang bật thông báo" : "Bật thông báo"}
          </button>
        )}
      </div>
      {rows.length ? (
        <div className="flex flex-wrap gap-1.5" data-testid="sepa-intraday-rows">
          {rows.map((r) => (
            <button key={r.ticker} type="button" onClick={() => onOpen?.(r.ticker)} data-testid="sepa-intraday-chip" data-state={r.state ?? ""}
              title={`${r.label} · pivot ${fmtP(r.pivot)} · vùng mua tới ${fmtP(r.buyZoneTop)} · KL ${fmtP(r.totalVolume)} cp${r.projRatio != null ? `, dự phóng ${r.projRatio.toFixed(2)}× TB50` : ""}${r.reliable === false ? " · mới mở cửa, ngoại suy kém tin cậy" : ""}`}
              className={`text-left text-[9px] px-1.5 py-1 rounded-md border ${STYLE[r.state!] ?? ""}`}>
              <b className="font-black">{r.ticker}</b> <span>{r.label}</span>
              <span className="block font-mono text-[8.5px] opacity-90">
                {fmtP(r.price)} · {pct(r.distPct)} so pivot · KL {r.projRatio != null ? `${r.projRatio.toFixed(1).replace(".", ",")}×` : "—"}{r.reliable === false ? "*" : ""}{r.since ? ` · từ ${hm(r.since)}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : <p className="text-[9px] text-slate-500" data-testid="sepa-intraday-empty">Chưa có mã nào vượt hoặc tiến sát pivot{live ? "" : " (ngoài giờ giao dịch — số liệu là của phiên gần nhất)"}.</p>}
      <p className="text-[8.5px] text-slate-500">{data.rule}. KL dự phóng = KL hiện tại × 255 / số phút đã giao dịch (s.270); * = dưới 15 phút, kém tin cậy. Chỉ báo hiệu để xem xét — không phải lệnh mua.</p>
    </div>
  );
}
