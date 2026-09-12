import type { DividendLifecycleEvent } from "../../../hooks/useDividendEvents";

const EVENT_TYPE_LABEL: Record<string, string> = {
  CASH: "Cổ tức tiền mặt",
  STOCK_DIVIDEND: "Cổ tức bằng cổ phiếu",
  BONUS_ISSUE: "Cổ phiếu thưởng",
  ESOP: "Phát hành cho CBCNV (không phải quà cổ đông)",
};

const EVENT_TYPE_COLOR_CLASS: Record<string, string> = {
  CASH: "text-cf-positive",
  STOCK_DIVIDEND: "text-cf-positive",
  BONUS_ISSUE: "text-cf-gold",
  ESOP: "text-cf-tertiary",
};

interface Milestone {
  key: string;
  label: string;
  date: string | null;
}

function buildMilestones(e: DividendLifecycleEvent): Milestone[] {
  return [
    { key: "public", label: "Công bố", date: e.publicDate },
    { key: "agm", label: "ĐHĐCĐ", date: e.agmDate },
    { key: "exright", label: "GDKHQ", date: e.exrightDate },
    { key: "record", label: "Đăng ký cuối", date: e.recordDate },
    { key: "settlement", label: "Về tài khoản", date: e.settlementDate },
  ];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function milestoneStatus(dateStr: string | null): "done" | "future" | "unknown" {
  if (!dateStr) return "unknown";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.getTime() <= Date.now() ? "done" : "future";
}

export function DividendTimelinePanel({ events }: { events: DividendLifecycleEvent[] | undefined }) {
  if (!events || events.length === 0) {
    return (
      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-4 text-center">
        <p className="text-xs text-cf-tertiary">Chưa có dữ liệu vòng đời cổ tức thực từ VCI cho mã này.</p>
      </div>
    );
  }

  // Moi nhat truoc - da duoc sap xep tu backend (buildLifecycleEvents),
  // nhung sap xep lai o day cho chac chan khong phu thuoc thu tu API.
  const sorted = [...events].sort((a, b) => {
    const ta = a.publicDate ? new Date(a.publicDate).getTime() : 0;
    const tb = b.publicDate ? new Date(b.publicDate).getTime() : 0;
    return tb - ta;
  });

  return (
    <div className="space-y-3">
      {sorted.map((e, idx) => {
        const milestones = buildMilestones(e);
        return (
          <div key={idx} style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.08)" }} className="rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <p className={`text-[11px] font-bold ${EVENT_TYPE_COLOR_CLASS[e.eventType] ?? "text-cf-primary"}`}>
                {EVENT_TYPE_LABEL[e.eventType] ?? e.eventType}
              </p>
              <p className="text-[10px] text-cf-tertiary">
                {e.valuePerShare !== null ? `${e.valuePerShare.toLocaleString("vi-VN")} đ/CP` : e.exerciseRatio !== null ? `Tỷ lệ ${(e.exerciseRatio * 100).toFixed(2)}%` : ""}
              </p>
            </div>

            <div className="relative">
              {milestones.map((m, mi) => {
                const status = milestoneStatus(m.date);
                return (
                  <div key={m.key} className="flex gap-2.5 pb-3 last:pb-0 relative">
                    {mi < milestones.length - 1 && (
                      <div style={{ background: "rgba(148,163,184,0.15)" }} className="absolute left-[9px] top-[20px] bottom-0 w-[1.5px]" />
                    )}
                    <div
                      style={
                        status === "done"
                          ? { background: "rgba(148,163,184,0.2)" }
                          : status === "future"
                          ? { background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)" }
                          : { background: "rgba(148,163,184,0.06)", border: "0.5px solid rgba(148,163,184,0.15)" }
                      }
                      className="w-[19px] h-[19px] rounded-full flex items-center justify-center text-[9px] font-bold text-cf-secondary shrink-0 z-10"
                    >
                      {mi + 1}
                    </div>
                    <div className="flex-1 flex items-center justify-between min-w-0 pt-0.5">
                      <p className="text-[10px] text-cf-secondary">{m.label}</p>
                      <p className={`text-[10px] font-bold ${status === "unknown" ? "text-cf-tertiary" : "text-cf-primary"}`}>{formatDate(m.date)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
