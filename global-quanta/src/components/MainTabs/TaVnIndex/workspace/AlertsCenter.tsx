// C11 (28/11/2026, docs/ta-tradingview C11) — TRUNG TÂM CẢNH BÁO của tab Kỹ thuật: một nơi xem / thêm / bật tắt / xoá mọi cảnh báo
// (giá chạm mức · giá cắt hình vẽ · giá cắt EMA / SMA · mốc Elliott) + lịch sử lần báo. Cảnh báo theo TÀI KHOẢN trên Gateway
// (cùng kho với cảnh báo Elliott DW10; máy chủ kiểm mỗi 60 giây trong phiên). Chưa đăng nhập: cảnh báo giá lưu trên máy này (như cũ).
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellOff, BellRing, Trash2 } from "lucide-react";
import { currentUser } from "../../../../services/api";
import { alertActions, alertText, browserNotify, usePriceAlerts } from "../../../../lib/priceAlerts";
import { GROUP_LABEL, alertGroup, conditionText, maAlert, priceAlert, type CenterAlertDraft } from "../../../../lib/ta-command-center/alerts/alertCenter";
import { useElliottAlerts, type ElliottAlert, type ElliottAlertEvent } from "../ElliottAlertsPanel";
import { Popover } from "./ui";

let seq = 0;
const newId = () => `c${Date.now().toString(36)}${(seq++ % 1296).toString(36)}`;
export type AddResult = "server" | "local" | "duplicate" | "full" | "unsupported";

/** Kho cảnh báo chung: Gateway theo tài khoản (data != null) hoặc cảnh báo giá trên máy này. `onEvent` = có lần báo mới. */
export function useAlertCenter(onEvent?: (e: ElliottAlertEvent) => void) {
  const { data, save, markRead } = useElliottAlerts();
  const local = usePriceAlerts();
  const add = useCallback(async (ticker: string, d: CenterAlertDraft, telegram = false): Promise<AddResult> => {
    if (data) {
      const same = (a: ElliottAlert) => a.symbol === ticker && a.enabled && JSON.stringify(a.condition) === JSON.stringify(d.condition);
      if (data.alerts.some(same)) return "duplicate";
      if (data.alerts.length >= (data.maxAlerts ?? 50)) return "full";
      const a: ElliottAlert = { id: newId(), symbol: ticker, timeframe: d.timeframe, kind: d.kind, label: d.label, condition: d.condition, source: "mine",
        channels: { telegram }, enabled: true, oneShot: true, cooldownMin: 240, createdAt: new Date().toISOString(), lastFiredAt: null, firedCount: 0 };
      return (await save([...data.alerts, a])) ? "server" : "unsupported";
    }
    if (d.condition.type === "level") return alertActions.add(ticker, d.condition.side, d.condition.price, d.label) ? "local" : "duplicate";
    return "unsupported";
  }, [data, save]);
  const toggle = useCallback((id: string) => { if (data) void save(data.alerts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a))); }, [data, save]);
  const remove = useCallback((id: string) => { if (data) void save(data.alerts.filter((a) => a.id !== id)); }, [data, save]);
  // Lần báo mới (đếm chưa đọc tăng) -> báo trong ứng dụng + thông báo trình duyệt (nếu đã cho phép).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.events.map((e) => e.id));
    if (seen.current) for (const e of data.events) if (!e.read && !seen.current.has(e.id)) { onEvent?.(e); browserNotify("Cảnh báo giá", e.message, e.id); }
    seen.current = ids;
  }, [data, onEvent]);
  return { data, local, add, toggle, remove, markRead };
}
export type AlertCenterApi = ReturnType<typeof useAlertCenter>;

export const ADD_MESSAGE: Record<AddResult, string> = {
  server: "Đã thêm cảnh báo (theo tài khoản, máy chủ kiểm mỗi phút trong phiên).",
  local: "Đã thêm cảnh báo giá trên máy này (đăng nhập để lưu theo tài khoản).",
  duplicate: "Cảnh báo này đã có.",
  full: "Đã đủ số cảnh báo tối đa — xoá bớt cảnh báo cũ.",
  unsupported: "Cần đăng nhập để đặt loại cảnh báo này.",
};

const when = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

interface Props { ticker: string; last: number | null; api: AlertCenterApi; onAdded: (msg: string) => void }

export default function AlertsCenter({ ticker, last, api, onAdded }: Props) {
  const { data, local } = api;
  const [all, setAll] = useState(false);
  const [price, setPrice] = useState("");
  const [ma, setMa] = useState<"ema" | "sma">("ema");
  const [period, setPeriod] = useState(20);
  const [telegram, setTelegram] = useState(false);
  const admin = !!currentUser()?.admin;
  const server = (data?.alerts ?? []).filter((a) => all || a.symbol === ticker);
  const localList = local.filter((a) => all || a.ticker === ticker);
  const active = (data?.alerts ?? []).filter((a) => a.enabled).length + local.filter((a) => !a.triggeredAt).length;
  const unread = data?.unread ?? 0;
  const events = (data?.events ?? []).filter((e) => all || e.symbol === ticker).slice(0, 10);
  const run = async (d: CenterAlertDraft) => onAdded(ADD_MESSAGE[await api.add(ticker, d, admin && telegram)]);
  const addPrice = () => {
    const v = Number(price.replace(/\./g, "").replace(",", "."));
    if (!(v > 0)) { onAdded("Nhập giá hợp lệ."); return; }
    void run(priceAlert(v, last));
    setPrice("");
  };
  const ok = period >= 2 && period <= 400;
  return (
    <Popover testid="alerts-btn" panelTestid="alerts-center" width={420} align="end" title="Cảnh báo" optionalLabel active={unread > 0}
      icon={unread > 0 ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
      label={<span className="inline-flex items-center gap-1">Cảnh báo{active > 0 && <span className="font-mono" data-testid="alerts-count">({active})</span>}</span>}>
      <div className="space-y-2 text-[12px]" data-testid="alerts-center-body">
        <div className="flex items-center gap-2">
          <b className="text-slate-100">Cảnh báo</b>
          <div className="q-seg ml-auto" role="tablist" aria-label="Phạm vi">
            <button type="button" role="tab" aria-selected={!all} onClick={() => setAll(false)} data-testid="alerts-scope-ticker">{ticker}</button>
            <button type="button" role="tab" aria-selected={all} onClick={() => setAll(true)} data-testid="alerts-scope-all">Tất cả mã</button>
          </div>
        </div>

        {/* Thêm cảnh báo: giá chạm mức · giá cắt EMA / SMA (khung ngày). Cắt hình vẽ: chọn hình rồi bấm chuột phải. */}
        <div className="space-y-1.5 rounded-md p-2" style={{ background: "var(--q-surface-2)", border: "1px solid var(--q-line-2)" }}>
          <div className="flex items-center gap-1.5">
            <span className="w-20 text-slate-400">Giá chạm</span>
            <input className="ws-input w-28" inputMode="decimal" placeholder={last ? Math.round(last).toLocaleString("vi-VN") : "giá"} value={price}
              onChange={(e) => setPrice(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPrice(); }} aria-label="Giá cảnh báo" data-testid="alerts-price-input" />
            <button type="button" className="ws-btn" onClick={addPrice} data-testid="alerts-add-price">Thêm</button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="w-20 text-slate-400">Giá cắt</span>
            <select className="ws-input" value={ma} onChange={(e) => setMa(e.target.value as "ema" | "sma")} aria-label="Loại đường trung bình" data-testid="alerts-ma-type">
              <option value="ema">EMA</option><option value="sma">SMA</option>
            </select>
            <input className="ws-input w-16" type="number" min={2} max={400} value={period} onChange={(e) => setPeriod(Math.round(Number(e.target.value) || 0))} aria-label="Chu kỳ" data-testid="alerts-ma-period" />
            <button type="button" className="ws-btn" disabled={!data || !ok} onClick={() => void run(maAlert(ma, period, "above"))} data-testid="alerts-add-ma-up">cắt lên</button>
            <button type="button" className="ws-btn" disabled={!data || !ok} onClick={() => void run(maAlert(ma, period, "below"))} data-testid="alerts-add-ma-down">cắt xuống</button>
          </div>
          <p className="text-[11px] text-slate-500">Giá cắt hình vẽ: chọn đường ngang / đường xu hướng / vùng rồi bấm chuột phải → “Cảnh báo khi giá cắt hình này”.</p>
          {admin && data && <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />Gửi cả Telegram cho cảnh báo thêm mới</label>}
        </div>

        {!data && <p className="text-[11px] text-slate-400" data-testid="alerts-local-note">Chưa đăng nhập: chỉ đặt được cảnh báo giá, lưu trên máy này. Đăng nhập để lưu theo tài khoản và đặt cảnh báo hình vẽ / chỉ báo.</p>}

        <ul className="space-y-1 max-h-64 overflow-y-auto" data-testid="alerts-list">
          {server.length === 0 && localList.length === 0 && <li className="text-slate-500">Chưa có cảnh báo{all ? "" : ` cho ${ticker}`}.</li>}
          {server.map((a) => (
            <li key={a.id} className="flex items-start gap-1.5" data-alert-id={a.id} data-alert-group={alertGroup(a.kind)}>
              <span className="shrink-0 px-1.5 rounded text-[11px] text-slate-300" style={{ background: "var(--q-surface-3)" }}>{GROUP_LABEL[alertGroup(a.kind)]}</span>
              <span className="min-w-0 flex-1">
                <span className="text-slate-100">{all && <b>{a.symbol} · </b>}{a.label || conditionText(a.condition)}</span>
                <span className="block text-[11px] text-slate-500">{conditionText(a.condition)}{a.lastFiredAt ? ` · đã báo ${when(a.lastFiredAt)}` : ""}{a.enabled ? "" : " · đang tắt"}</span>
              </span>
              <button type="button" className="ws-btn" aria-pressed={a.enabled} onClick={() => api.toggle(a.id)} title={a.enabled ? "Tắt cảnh báo" : "Bật lại cảnh báo"} aria-label={a.enabled ? "Tắt cảnh báo" : "Bật lại cảnh báo"}>
                {a.enabled ? <BellRing className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              </button>
              <button type="button" className="ws-btn" onClick={() => api.remove(a.id)} title="Xoá cảnh báo" aria-label="Xoá cảnh báo"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
          {localList.map((a) => (
            <li key={a.id} className="flex items-start gap-1.5" data-alert-id={a.id} data-alert-group="local">
              <span className="shrink-0 px-1.5 rounded text-[11px] text-slate-300" style={{ background: "var(--q-surface-3)" }}>Máy này</span>
              <span className="min-w-0 flex-1">
                <span className="text-slate-100">{alertText(a)}</span>
                <span className="block text-[11px] text-slate-500">{a.triggeredAt ? `đã báo ${when(a.triggeredAt)}` : "đang chờ · kiểm bằng giá trực tiếp khi trang mở"}</span>
              </span>
              <button type="button" className="ws-btn" onClick={() => alertActions.remove(a.id)} title="Xoá cảnh báo" aria-label="Xoá cảnh báo"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>

        {events.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-slate-400">
              <span>Lần báo gần đây</span>
              {unread > 0 && <button type="button" className="ml-auto underline text-[11px]" onClick={() => void api.markRead()} data-testid="alerts-mark-read">{unread} chưa đọc · đánh dấu đã đọc</button>}
            </div>
            <ul className="space-y-0.5 mt-1" data-testid="alerts-events">
              {events.map((e) => <li key={e.id} className={`text-[11px] ${e.read ? "text-slate-500" : "text-slate-100"}`}>{when(e.firedAt)} · {e.message}</li>)}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-slate-500">{data?.userDisclaimer ?? "Cảnh báo do bạn đặt — không phải khuyến nghị mua / bán."} Cảnh báo báo một lần rồi tự tắt; bật lại bằng nút chuông.</p>
      </div>
    </Popover>
  );
}
