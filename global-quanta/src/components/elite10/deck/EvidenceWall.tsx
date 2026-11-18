// Command Deck — Z8 "Bằng chứng của từng lớp": thẻ sổ theo dõi tiến Elite HL (nhãn do hlLedgerSummary quyết định — luôn THĂM DÒ)
// + một thẻ cho mỗi kiểm định trong sổ bằng chứng của Gateway (/api/elite/evidence-registry), công bố cả KHÔNG ĐẠT, có nguồn.
import type { LedgerSummary } from "../../../lib/elite10/decisionTypes";
import { ledgerSeal, verdictTone } from "../../../lib/elite10/deckModel";
import type { EvidenceRegistry } from "../../../hooks/elite10/useDeckData";
import { fmtDate } from "../center/boardParts";
import { DeckPanel, EvidenceSeal } from "./parts";

export default function EvidenceWall({ ledger, registry, k0Note }: { ledger: LedgerSummary | null | undefined; registry: EvidenceRegistry | null | undefined; k0Note?: string | null }) {
  const seal = ledgerSeal(ledger), n5 = ledger?.horizons?.["5"]?.n ?? 0, n10 = ledger?.horizons?.["10"]?.n ?? 0;
  const sessions = (ledger as { criteria?: { sessions?: number } } | null | undefined)?.criteria?.sessions;
  const card = "rounded-lg border border-white/10 bg-[#161D2E] p-2.5";
  return (
    <DeckPanel title="Bằng chứng của từng lớp" meta="kiểm định đăng ký trước · công bố cả khi không đạt" testId="deck-evidence">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <li className={card} data-testid="deck-evidence-ledger">
          <EvidenceSeal seal={seal} />
          <p className="mt-1.5 text-[12px] font-semibold text-slate-100">Sổ theo dõi tiến Elite HL</p>
          <p className="mt-0.5 text-[11px] text-slate-300">{ledger?.labelVi ?? "Chưa có sổ."}</p>
          <p className="mt-1.5 font-mono text-[10px] text-slate-400">{sessions ?? "—"} phiên đã ghi · {n5} kỳ hạn 5 phiên · {n10} kỳ hạn 10 phiên đã chấm</p>
        </li>
        {k0Note && (
          <li className={card} data-testid="deck-evidence-k0">
            <EvidenceSeal seal={{ tone: "desc", text: "K0 · MÔ TẢ", title: "Mô phỏng khám phá, không phải kiểm định đăng ký trước" }} />
            <p className="mt-1.5 text-[12px] font-semibold text-slate-100">Mô phỏng danh mục (K0)</p>
            <p className="mt-0.5 text-[11px] text-slate-300">{k0Note}</p>
          </li>
        )}
        {(registry?.entries ?? []).map((e) => (
          <li key={e.id} className={card} data-testid={`deck-evidence-${e.id}`}>
            <EvidenceSeal seal={{ tone: verdictTone(e.verdict), text: `${e.test} · ${e.verdict}`, title: `Chạy ${fmtDate(e.ranAt)}` }} />
            <p className="mt-1.5 text-[12px] font-semibold text-slate-100">{e.layer}</p>
            <p className="mt-0.5 text-[11px] text-slate-300">{e.detail}</p>
            <p className="mt-1.5 font-mono text-[10px] text-slate-400">{e.src} · {fmtDate(e.ranAt)}</p>
          </li>
        ))}
      </ul>
      {!registry && <p className="mt-2 text-[10.5px] text-slate-500" data-testid="deck-evidence-missing">Chưa tải được sổ bằng chứng của các lớp từ Gateway.</p>}
    </DeckPanel>
  );
}
