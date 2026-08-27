import useSWR from "swr";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useAppStore } from "../../../store/useAppStore";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  gold: "var(--gold, #f59e0b)",
  textSecondary: "var(--text-secondary, #94a3b8)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

interface ImpactEvent {
  id: string;
  title: string;
  sector_key: string;
  direction: "positive" | "negative" | "mixed";
  impact_score: number;
  confidence: number;
  vn_tickers: string[];
  created_at: string;
}

function DirectionIcon({ direction }: { direction: ImpactEvent["direction"] }) {
  if (direction === "positive") return <TrendingUp className="w-3.5 h-3.5" style={{ color: T.positive }} />;
  if (direction === "negative") return <TrendingDown className="w-3.5 h-3.5" style={{ color: T.negative }} />;
  return <Minus className="w-3.5 h-3.5" style={{ color: T.textTertiary }} />;
}

export default function StockImpactTable() {
  const selectTicker = useAppStore((s) => s.selectTicker);
  // Khong can real-time - moi khi bam "Chay Phan Tich AI" se co ban ghi
  // moi, revalidate khi focus lai tab la du.
  const { data, error, isLoading } = useSWR(`${API_BASE}/api/global/impact-table`, fetcher, {
    revalidateOnFocus: true,
  });

  const events: ImpactEvent[] = data?.events ?? [];

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold uppercase" style={{ color: T.textSecondary }}>Bảng Tổng Hợp Tác Động Cổ Phiếu</p>
        <span title="Kết quả suy luận từ AI, không phải công thức toán cố định"
          className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(245,158,11,0.1)", color: T.gold }}>
          ESTIMATED
        </span>
      </div>

      {/* Du 3 trang thai Loading/Error/Empty (dung quy chuan 3.3 trong guide) */}
      {isLoading && (
        <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>Đang tải...</p>
      )}
      {error && (
        <p className="text-xs" style={{ color: T.negative }}>Không tải được: {String(error)}</p>
      )}
      {!isLoading && !error && events.length === 0 && (
        <p className="text-xs italic py-3 text-center" style={{ color: T.textTertiary }}>
          Chưa có dữ liệu — bấm "Chạy Phân Tích AI" ở trên để tạo bản ghi đầu tiên.
        </p>
      )}
      {events.length > 0 && (
        <div className="space-y-2">
          {events.map((e) => (
            <div key={e.id} style={{ background: "rgba(148,163,184,0.04)" }} className="rounded-lg p-2.5">
              <div className="flex items-start gap-2">
                <DirectionIcon direction={e.direction} />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px]" style={{ color: "#f1f5f9" }}>{e.title}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: T.textTertiary }}>
                    Điểm tác động: <b style={{ color: "#f1f5f9" }}>{e.impact_score}/100</b> · {new Date(e.created_at).toLocaleString("vi-VN")}
                  </p>
                  {e.vn_tickers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {e.vn_tickers.map((t) => (
                        <button key={t} onClick={() => selectTicker(t)}
                          className="text-[9px] font-black px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(2,6,15,0.6)", color: e.direction === "positive" ? T.positive : e.direction === "negative" ? T.negative : T.textSecondary }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
