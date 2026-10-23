// DW10 — cảnh báo Elliott khi giá chạm mốc: gợi ý mốc từ cách đếm đang vẽ, bật / tắt từng mốc, danh sách lần báo (trong ứng dụng,
// Telegram cho tài khoản quản trị). Máy chủ kiểm mỗi 60 giây trong phiên. Lời báo trung tính — không phải khuyến nghị mua / bán.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../../services/marketDataClient";
import { currentUser, getAccessToken } from "../../../services/api";
import type { ElliottState } from "../../../lib/quant-core/elliott";
import { suggestAlerts, type AlertCondition, type AlertSuggestion } from "../../../lib/quant-core/elliott/alertSuggestions";
import type { UserCountPoint } from "../../../lib/quant-core/elliott/userCount";

export interface ElliottAlert {
  id: string; symbol: string; timeframe: string; kind: string; label: string; condition: AlertCondition; source: "auto" | "mine";
  channels: { telegram: boolean }; enabled: boolean; oneShot: boolean; cooldownMin: number; createdAt: string; lastFiredAt: string | null; firedCount: number;
}
export interface ElliottAlertEvent { id: string; alertId: string; symbol: string; kind: string; price: number; message: string; firedAt: string; read: boolean }
interface AlertsResponse { alerts: ElliottAlert[]; events: ElliottAlertEvent[]; unread: number; disclaimer: string }

const CARD = { background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" } as const;

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!isMarketGatewayEnabled()) return null;
  const token = await getAccessToken().catch(() => null);
  if (!token) return null;
  return fetchMarketJson<T>(path, {}, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) } });
}

/** Danh sách cảnh báo + lần báo của tài khoản (làm mới 60 giây). */
export function useElliottAlerts() {
  const { data, mutate } = useSWR<AlertsResponse | null>(isMarketGatewayEnabled() ? "elliott-alerts" : null, () => call<AlertsResponse>("/api/market/elliott/alerts"),
    { refreshInterval: 60_000, revalidateOnFocus: true });
  const save = useCallback(async (alerts: ElliottAlert[]) => { const r = await call<AlertsResponse>("/api/market/elliott/alerts", { method: "PUT", body: JSON.stringify({ alerts }) }); if (r) await mutate(r, false); return r; }, [mutate]);
  const markRead = useCallback(async () => { const r = await call<AlertsResponse>("/api/market/elliott/alerts/read", { method: "POST", body: JSON.stringify({}) }); if (r) await mutate(r, false); }, [mutate]);
  return { data: data ?? null, save, markRead };
}

const sameCond = (a: AlertCondition, b: AlertCondition) => JSON.stringify(a) === JSON.stringify(b);
let seq = 0;
const newId = () => `a${Date.now().toString(36)}${(seq++ % 1296).toString(36)}`;

/** Ghi nhớ nhãn cách đếm tự động lần trước (theo mã + khung) để báo trong ứng dụng khi nó thay đổi. */
export function useCountChangeNotice(symbol: string, tf: string, label: string | null) {
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!label) return;
    const k = `gq.ta.elliottLastLabel.v1:${symbol}:${tf}`;
    try {
      const prev = window.localStorage.getItem(k);
      setNotice(prev && prev !== label ? `Cách đếm tự động đã đổi: "${prev}" → "${label}"` : null);
      window.localStorage.setItem(k, label);
    } catch { /* chế độ riêng tư */ }
  }, [symbol, tf, label]);
  return { notice, dismiss: () => setNotice(null) };
}

interface Props { ticker: string; timeframe: string; state: ElliottState | null; mine: UserCountPoint[] | null; dailyBars: { date: string; close: number }[] | null }

export default function ElliottAlertsPanel({ ticker, timeframe, state, mine, dailyBars }: Props) {
  const { data, save, markRead } = useElliottAlerts();
  const admin = !!currentUser()?.admin;
  const [telegram, setTelegram] = useState(false);
  const tf = timeframe === "W" || timeframe === "1H" || timeframe === "15m" ? timeframe : "D";
  const sugg = useMemo(() => suggestAlerts(state, { mine, dailyBars: tf === "D" ? dailyBars : null }), [state, mine, dailyBars, tf]);
  const change = useCountChangeNotice(ticker, tf, state?.label ?? null);
  if (!data) return null;
  const mineAlerts = data.alerts.filter((a) => a.symbol === ticker);
  const on = (s: AlertSuggestion) => mineAlerts.find((a) => a.enabled && sameCond(a.condition, s.condition));
  const toggle = (s: AlertSuggestion) => {
    const ex = on(s);
    const next = ex ? data.alerts.filter((a) => a.id !== ex.id)
      : [...data.alerts, { id: newId(), symbol: ticker, timeframe: tf, kind: s.kind, label: s.label, condition: s.condition, source: mine?.length ? "mine" : "auto",
          channels: { telegram: admin && telegram }, enabled: true, oneShot: true, cooldownMin: 240, createdAt: new Date().toISOString(), lastFiredAt: null, firedCount: 0 } as ElliottAlert];
    void save(next);
  };
  const events = data.events.filter((e) => e.symbol === ticker).slice(0, 8);
  return (
    <div className="rounded-lg p-2 space-y-1.5" style={CARD} data-testid="elliott-alerts">
      <p className="text-[9px] font-semibold text-slate-400 uppercase flex items-center gap-1">
        {data.unread ? <BellRing className="w-3 h-3 text-amber-300" /> : <Bell className="w-3 h-3" />}Cảnh báo khi giá chạm mốc
        {data.unread > 0 && <button type="button" onClick={() => void markRead()} className="ml-auto normal-case text-[8.5px] px-1.5 rounded border border-amber-500/40 text-amber-300" data-testid="elliott-alerts-read">{data.unread} chưa đọc · đánh dấu đã đọc</button>}
      </p>
      {change.notice && <p className="text-[9px] text-amber-200" data-testid="elliott-count-change">{change.notice} <button type="button" className="underline" onClick={change.dismiss}>ẩn</button></p>}
      {sugg.length === 0 ? <p className="text-[9px] text-slate-500">Cách đếm hiện tại chưa có mốc để đặt cảnh báo.</p> : (
        <ul className="space-y-0.5">
          {sugg.map((s) => {
            const ex = on(s);
            return (
              <li key={s.key} className="flex items-center gap-1 text-[9.5px]">
                <button type="button" onClick={() => toggle(s)} aria-pressed={!!ex} data-testid={`elliott-alert-${s.key}`}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${ex ? "border-amber-500/50 text-amber-300 bg-amber-500/10" : "border-slate-700 text-slate-400"}`}>
                  {ex ? <BellRing className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}{ex ? "Đang bật" : "Bật"}
                </button>
                <span className="text-slate-300">{s.label}</span>
              </li>
            );
          })}
        </ul>
      )}
      {admin && <label className="flex items-center gap-1 text-[9px] text-slate-400"><input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />Gửi cả Telegram (bot vận hành) cho cảnh báo bật mới</label>}
      {mineAlerts.length > 0 && <p className="text-[8.5px] text-slate-500">{mineAlerts.filter((a) => a.enabled).length} cảnh báo đang bật cho {ticker} · kiểm mỗi phút trong phiên · báo một lần rồi tự tắt.</p>}
      {events.length > 0 && (
        <ul className="space-y-0.5" data-testid="elliott-alert-events">
          {events.map((e) => <li key={e.id} className={`text-[9px] ${e.read ? "text-slate-500" : "text-amber-200"}`}>{new Date(e.firedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {e.message}</li>)}
        </ul>
      )}
      <p className="text-[8.5px] text-slate-500">{data.disclaimer}</p>
    </div>
  );
}
