// Phần bổ sung của Hồ sơ ngành (U2): bối cảnh trung hạn, truyền dẫn, kịch bản và tin cùng chủ đề của đúng ngành đang mở.
// Dữ liệu dùng lại /api/world-sectors/strategy và /api/world/news, không tính thêm công thức mới.
import useSWR from "swr";
import { ExternalLink } from "lucide-react";
import { useWorldStrategy } from "../../../../hooks/useWorldStrategy";
import { fetchMarketJson } from "../../../../services/marketDataClient";
import { fmtZ } from "../../../../lib/worldSectors/types";
import { MEDIUM_STANCE_VI, QUADRANT_VI } from "../../../../lib/worldSectors/strategyTypes";
import { fmtVnTime, VERIFICATION_VI, type NewsDoc } from "../../../../lib/world/monitor";
import EvidenceTag from "../EvidenceTag";

const muted = { color: "var(--text-tertiary)" };
const box = { background: "rgba(148,163,184,0.04)", border: "1px solid rgba(148,163,184,0.08)" };
const VOTE_VI = ["Điểm 3 tháng thế giới", "Chu kỳ RRG Lọc ngành", "Áp lực yếu tố A/B"];

/** Ngành ICB -> chủ đề tin. Ánh xạ đặt tay theo nội dung ngành, chỉ để lọc tin, không kết luận tác động. */
export const ICB_NEWS_TOPICS: Record<string, string[]> = {
  "0500": ["energy"], "1300": ["energy", "china"], "1700": ["metals", "china"], "1750": ["metals", "china", "trade"], "2300": ["metals", "rates"], "2700": ["trade", "growth"], "2770": ["trade", "energy"],
  "3300": ["trade", "growth"], "3500": ["growth"], "3570": ["growth"], "3700": ["growth", "china"], "4500": ["growth"], "5300": ["growth"], "5700": ["growth", "energy"], "6500": ["chips", "china"],
  "7500": ["energy"], "7530": ["energy"], "8300": ["rates", "usd"], "8500": ["rates"], "8600": ["rates"], "8700": ["rates", "em"], "9500": ["chips", "trade"],
};

export default function SectorDossierExtras({ icb }: { icb: string }) {
  const { data: st } = useWorldStrategy();
  const topics = ICB_NEWS_TOPICS[icb] ?? [];
  const { data: news } = useSWR<NewsDoc>(topics.length ? "world-news" : null, () => fetchMarketJson<NewsDoc>("/api/world/news?limit=200"), { refreshInterval: 60_000, dedupingInterval: 30_000 });
  const m = st?.medium?.find((x) => x.icb === icb);
  const related = (news?.items ?? []).filter((n) => n.topics.some((t) => topics.includes(t))).slice(0, 5);
  const links = m?.factorPressure.links ?? [];
  const scenarios = (m?.scenarios ?? []).filter((s) => !s.unreliable);

  return <>
    {m && <section className="rounded-lg p-3 space-y-2" style={box} data-testid="dossier-medium">
      <div className="flex items-center justify-between gap-2"><h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Bối cảnh 1–3 tháng: {MEDIUM_STANCE_VI[m.stance]}</h4><EvidenceTag kind="heuristic" title="Trung hạn không đạt kiểm định đặt trước, chỉ để tham khảo." /></div>
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        {m.votes.map((v, i) => <div key={VOTE_VI[i]} className="rounded px-2 py-1.5" style={{ background: "rgba(2,6,15,0.4)" }}><p style={muted}>{VOTE_VI[i]}</p><b style={{ color: v > 0 ? "#7cb4f5" : v < 0 ? "#f09595" : "var(--text-secondary)" }}>{v > 0 ? "+ thuận" : v < 0 ? "− ngược" : "0 trung tính"}</b></div>)}
      </div>
      {m.rrg && <p className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>RRG: {QUADRANT_VI[m.rrg.quadrant] ?? m.rrg.quadrant}{m.rrg.state ? ` · ${m.rrg.state}` : ""}{m.rrg.accumulation != null ? ` · tích luỹ ${m.rrg.accumulation}` : ""}</p>}
    </section>}

    {m && <section className="rounded-lg p-3 space-y-1.5" style={box} data-testid="dossier-transmission">
      <h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Truyền dẫn và kịch bản</h4>
      {links.length === 0 && m.confirm.length === 0 && scenarios.length === 0 && <p className="text-[10.5px]" style={muted}>Ngành này chưa có rổ truyền dẫn tháng, hoặc chưa có liên kết bậc A/B.</p>}
      {links.map((l) => <p key={`${l.factor}-${l.lag}`} className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>{l.factor} · bậc {l.tier} · β {fmtZ(l.beta, 2)} · trễ {l.lag} tháng{l.z != null ? ` · yếu tố ${fmtZ(l.z, 1)} σ` : ""}</p>)}
      {m.confirm.map((c) => <p key={c.id} className="text-[10.5px]" style={muted}>Cổng xác nhận {c.id} ({c.factor}): {c.confirmed ? "đã xác nhận" : c.signOk === false ? "ngược chiều kỳ vọng" : "chưa xác nhận"}, q {c.q.toFixed(3).replace(".", ",")}</p>)}
      {scenarios.map((s) => <p key={s.id} className="text-[10.5px]" style={{ color: "var(--text-secondary)" }}>Kịch bản {s.nameVi}: {fmtZ(s.estPct, 1)}% ({fmtZ(s.lo, 1)}% đến {fmtZ(s.hi, 1)}%){s.conclusive ? "" : ", khoảng tin cậy chứa 0, chưa kết luận được hướng"}</p>)}
      <p className="text-[9.5px]" style={muted}>Quan hệ lịch sử theo tháng, không chứng minh nhân quả.</p>
    </section>}

    {topics.length > 0 && <section className="rounded-lg p-3 space-y-1.5" style={box} data-testid="dossier-news">
      <h4 className="text-[10px] font-bold uppercase" style={{ color: "var(--text-secondary)" }}>Tin cùng chủ đề <span className="font-normal normal-case" style={muted}>· lọc theo chủ đề, chưa chứng minh tác động lên ngành</span></h4>
      {!news && <p className="text-[10.5px]" style={muted}>Đang tải tin…</p>}
      {news && related.length === 0 && <p className="text-[10.5px]" style={muted}>Không có tin cùng chủ đề trong 7 ngày gần nhất.</p>}
      {related.map((n) => <p key={n.url} className="text-[10.5px]"><a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "#e2e8f0" }}>{n.title} <ExternalLink className="inline h-2.5 w-2.5" aria-hidden /></a><br /><span className="text-[9.5px]" style={muted}>{VERIFICATION_VI[n.verification].label} · {n.sourceLabel} · Đăng {fmtVnTime(n.publishedAt)}</span></p>)}
    </section>}
  </>;
}
