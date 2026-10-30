import type { CatalystCard } from "../types/catalyst";
import { ForensicScoreResult, ScoreContributor, ScoreExplanation } from "../types/financialEngineering";

/**
 * A.7 - Explainability (Phase 1, tich hop tu goi ban giao Chat Xuc Tac 2.0)
 *
 * DA VIET LAI de dung dung schema CatalystCard THAT dang chay (khong co
 * sentiment/sourceCredibility/auditId nhu ban goc trong goi ban giao) -
 * chi dung cac field co san: trustScore, historicalWinRate,
 * corroborationCount, volumeFlag, netSignedImpact, compositeScore.
 *
 * Co tinh dung rule-based thay vi goi LLM cho MOI the tin: re, tuc thoi,
 * khong phu thuoc uptime cua API ben ngoai, va output co the kiem tra duoc
 * 100% (quan trong cho compliance).
 */

export function buildScoreExplanation(
  card: CatalystCard,
  forensic?: ForensicScoreResult
): ScoreExplanation {
  const contributors: ScoreContributor[] = [];

  contributors.push({
    factor: "Tac dong tin tuc (netSignedImpact)",
    weight: 0.4,
    direction: card.netSignedImpact >= 0 ? "positive" : "negative",
    detail: `Diem tac dong ${card.netSignedImpact.toFixed(2)} (${
      card.direction === "benefit" ? "tich cuc" : card.direction === "harm" ? "tieu cuc" : "trung tinh"
    }), lan toa ${card.propagationDistance === "direct" ? "truc tiep" : `qua ${card.hopCount} buoc`}.`,
  });

  contributors.push({
    factor: "Do tin cay nguon (trustScore)",
    weight: 0.25,
    direction: card.trustScore >= 60 ? "positive" : "negative",
    detail: `Nguon "${card.sourceTitle.slice(0, 40)}${card.sourceTitle.length > 40 ? "..." : ""}" co diem tin cay ${
      card.trustScore
    }/100 (do dua tren do lap lai nguon tin va lich su chinh xac).`,
  });

  contributors.push({
    factor: "Xac nhan cheo & khoi luong",
    weight: 0.2,
    direction: card.volumeFlag === "confirmed" ? "positive" : "negative",
    detail: `${card.corroborationCount} nguon xac nhan, khoi luong ${
      card.volumeFlag === "confirmed"
        ? "xac nhan xu huong"
        : card.volumeFlag === "diverging"
        ? "phan ky voi gia - can than trong"
        : "chua co tin hieu ro"
    }.`,
  });

  if (forensic) {
    contributors.push({
      factor: "Nen tang tai chinh (forensics)",
      weight: 0.15,
      direction: forensic.fundamentalSentimentConflict ? "negative" : "positive",
      detail: forensic.fundamentalSentimentConflict
        ? `⚠ Tin tich cuc nhung Altman Z''=${forensic.altmanZScore.toFixed(
            2
          )} (${forensic.altmanZone}), Piotroski F=${forensic.piotroskiFScore}/9 - nen tang chua ung ho.`
        : `Altman Z''=${forensic.altmanZScore.toFixed(2)} (${
            forensic.altmanZone
          }), Piotroski F=${forensic.piotroskiFScore}/9 - nhat quan voi tin hieu.`,
    });
  }

  const top3 = [...contributors]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);

  const narrativeVi = buildNarrative(card, top3, forensic);

  return {
    ticker: card.ticker,
    compositeScore: card.compositeScore,
    topContributors: top3,
    narrativeVi,
    auditId: `${card.sourceId}:${card.ticker}`,
  };
}

function buildNarrative(
  card: CatalystCard,
  top3: ScoreContributor[],
  forensic?: ForensicScoreResult
): string {
  const parts: string[] = [];
  const dirWord = card.direction === "benefit" ? "tich cuc" : card.direction === "harm" ? "tieu cuc" : "trung tinh";

  parts.push(
    `${card.ticker} co diem tong hop ${card.compositeScore.toFixed(
      0
    )} (${dirWord}), chu yeu do ${top3[0].factor.toLowerCase()}.`
  );

  if (forensic?.fundamentalSentimentConflict) {
    parts.push(
      "Luu y: tin tuc tich cuc nhung chi so nen tang cho thay rui ro - nen xem xet than trong hon muc diem goi y."
    );
  }

  if (card.historicalWinRate < 55) {
    parts.push(
      `Ty le thang lich su chi ${card.historicalWinRate.toFixed(0)}% - gan nhu tung dong xu, nen ha muc tin tuong vao tin hieu nay.`
    );
  }

  if (card.isConflicted) {
    parts.push("Co tin hieu mau thuan tu cac nguon khac cho cung ma - can ra soat them truoc khi ra quyet dinh.");
  }

  return parts.join(" ");
}
