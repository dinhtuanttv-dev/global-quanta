import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../services/marketDataClient";
import { getAccessToken } from "../services/api";
import { snapFingerprint, type RadarSnapshot, type SnapItem } from "../lib/radarHistory";

export interface RadarHistoryResponse { list: string; today: string; snapshots: RadarSnapshot[] }

const DAYS = 60;
const SAVE_DEBOUNCE_MS = 15_000;
const REFRESH_MS = 30 * 60_000;

async function authed<T>(path: string, params: Record<string, string | number>, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error("Cần đăng nhập để lưu lịch sử Radar.");
  return fetchMarketJson<T>(path, params, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) } });
}

/**
 * Lịch sử ELITE COMMAND RADAR (Supabase qua Gateway, theo tài khoản đăng nhập × tên ★ danh mục — xem được trên mọi máy).
 * Tự lưu ảnh chụp của ngày giao dịch hiện tại khi radar ĐỦ dữ liệu (`ready`) và có thay đổi
 * (hoặc mỗi 30 phút để cập nhật giá); thiếu nguồn thì không lưu, tránh sự kiện "rời Core" giả.
 */
export function useRadarHistory(listName: string, items: SnapItem[], ready: boolean) {
  const enabled = isMarketGatewayEnabled() && Boolean(listName);
  const { data, error, mutate, isLoading } = useSWR<RadarHistoryResponse>(
    enabled ? ["radar-history", listName] : null,
    () => authed<RadarHistoryResponse>("/api/market/radar/history", { list: listName, days: DAYS }),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  const saved = useRef<{ list: string; fp: string; at: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Mốc so sánh = ảnh chụp hôm nay đã có trên máy chủ (mở trang lần 2 trong ngày không ghi lại nếu radar không đổi).
  useEffect(() => {
    if (!data || saved.current?.list === listName) return;
    const today = data.snapshots.find((s) => s.date === data.today);
    saved.current = { list: listName, fp: today ? snapFingerprint(today.items) : "", at: today?.updatedAt ? Date.parse(today.updatedAt) : 0 };
  }, [data, listName]);

  const fp = snapFingerprint(items);
  useEffect(() => {
    if (!enabled || !data || !ready || !items.length || saved.current?.list !== listName) return;
    const last = saved.current;
    if (last.fp === fp && Date.now() - last.at < REFRESH_MS) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await authed<{ date: string }>("/api/market/radar/snapshot", {}, { method: "PUT", body: JSON.stringify({ list: listName, items }) });
        saved.current = { list: listName, fp, at: Date.now() };
        setSaveError(null);
        await mutate((cur) => cur && {
          ...cur, today: res.date,
          snapshots: [...cur.snapshots.filter((s) => s.date !== res.date), { date: res.date, items, updatedAt: new Date().toISOString() }]
            .sort((a, b) => a.date.localeCompare(b.date)),
        }, { revalidate: false });
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : String(e));
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // items đổi theo fp (giá đổi không tự kích hoạt lưu, chỉ kèm theo lần lưu kế tiếp).
  }, [enabled, data, ready, fp, listName, mutate, tick]);

  return {
    enabled,
    snapshots: data?.snapshots ?? [],
    today: data?.today ?? null,
    loading: isLoading,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    saving, saveError,
  };
}
