// HS360-v3 H4 (27/11/2026, docs/ho-so-360-v3/02 §4) — ma trận LỚP × BẰNG CHỨNG của góc Tổng quan: 9 lớp phân tích, mỗi lớp một dòng
// (trạng thái hôm nay · chiều · dấu bằng chứng chép từ sổ · nguồn). Bấm dòng -> mở khối chi tiết cũ ngay dưới (một khối mỗi lúc) hoặc
// chuyển sang góc nhìn chứa chi tiết. MÀU THEO BẰNG CHỨNG, không theo hướng: chỉ lớp có dấu ĐẠT / MỘT PHẦN mới tô màu chiều.
import { useState, type ReactNode } from "react";
import type { LayerId, ProfileLayer, ProfileSeal } from "../../../lib/elite10/profileTypes";

const SEAL_TONE: Record<ProfileSeal, string> = {
  "ĐẠT": "border-emerald-400/50 text-emerald-300", "MỘT PHẦN": "border-q-accent/50 text-q-accent-strong", "THĂM DÒ": "border-white/15 text-slate-300",
  "ĐANG TÍCH LUỸ": "border-white/15 text-slate-300", "MÔ TẢ": "border-white/15 text-slate-400", "CHƯA KIỂM ĐỊNH": "border-white/10 text-slate-400", "KHÔNG ĐẠT": "border-rose-400/40 text-rose-300",
};
export function SealChip({ seal }: { seal: ProfileSeal }) {
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 text-[10px] ${SEAL_TONE[seal] ?? "border-white/10 text-slate-400"}`}>{seal}</span>;
}
const strong = (s: ProfileSeal) => s === "ĐẠT" || s === "MỘT PHẦN";
const dm = (d?: string | null) => (d ? d.slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "—");

/** Chiều: ký hiệu + chữ (không chỉ màu); chỉ tô màu khi dấu bằng chứng ĐẠT / MỘT PHẦN. */
function Direction({ d, seal }: { d: ProfileLayer["direction"]; seal: ProfileSeal }) {
  if (d == null) return <span className="text-slate-500">— chưa rõ</span>;
  const tone = !strong(seal) ? "text-slate-300" : d > 0 ? "text-emerald-300" : d < 0 ? "text-rose-300" : "text-slate-300";
  return <span className={tone}>{d > 0 ? "▲ ủng hộ" : d < 0 ? "▼ bất lợi" : "— trung tính"}</span>;
}

export interface LayerAction { detail?: ReactNode; goto?: { label: string; onClick: () => void } }

export default function LayerMatrix({ layers, actions }: { layers: ProfileLayer[]; actions: Partial<Record<LayerId, LayerAction>> }) {
  const [open, setOpen] = useState<LayerId | null>(null);
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.02] p-3" data-testid="profile-layers" aria-label="Lớp phân tích">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[12px] font-semibold text-slate-100">Lớp phân tích</h4>
        <span className="text-[10px] text-slate-500">màu theo bằng chứng: chỉ lớp ĐẠT / MỘT PHẦN tô màu chiều</span>
      </div>
      <div className="mt-1.5 divide-y divide-white/5">
        {layers.map((l) => {
          const a = actions[l.id];
          const expanded = open === l.id;
          return (
            <div key={l.id} data-testid={`profile-layer-${l.id}`} data-direction={String(l.direction)} data-seal={l.seal}>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-1 text-[11px] md:grid-cols-[150px_minmax(0,1fr)_96px_118px_44px_150px]">
                <span className="font-semibold text-slate-200">{l.labelVi}</span>
                <span className="col-span-2 text-slate-300 md:col-span-1">{l.stateVi}</span>
                <span className="text-[10.5px]"><Direction d={l.direction} seal={l.seal} /></span>
                <span title={l.sealSource}><SealChip seal={l.seal} /></span>
                <span className="hidden text-[10px] text-slate-500 md:inline" title={`Nguồn: ${l.sealSource}`}>{dm(l.asOf)}</span>
                <span className="text-right">
                  {a?.detail ? (
                    <button type="button" aria-expanded={expanded} aria-controls={`profile-layer-detail-${l.id}`} onClick={() => setOpen(expanded ? null : l.id)} data-testid={`profile-layer-toggle-${l.id}`}
                      className="min-h-[24px] rounded border border-white/10 px-2 text-[10.5px] text-slate-300 hover:border-q-accent/50 hover:text-q-accent-strong">{expanded ? "Thu gọn" : "Chi tiết ▸"}</button>
                  ) : a?.goto ? (
                    <button type="button" onClick={a.goto.onClick} data-testid={`profile-layer-goto-${l.id}`}
                      className="min-h-[24px] rounded border border-white/10 px-2 text-[10.5px] text-slate-300 hover:border-q-accent/50 hover:text-q-accent-strong">{a.goto.label} →</button>
                  ) : null}
                </span>
              </div>
              {expanded && a?.detail && <div id={`profile-layer-detail-${l.id}`} className="pb-2" data-testid={`profile-layer-detail-${l.id}`}>{a.detail}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
