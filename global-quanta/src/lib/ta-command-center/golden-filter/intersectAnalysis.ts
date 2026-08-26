import type { GoldenFilterStock } from "./goldenFilterEngine";

export interface Top20TechStock {
  ticker: string; sector: string;
  scores: { total: number; confluence: number };
  rs3m: number | null; volumeSpikeRatio: number | null; ma50Status: string | null;
}

export interface IntersectResult {
  ticker: string; sector: string;
  inGoldenFilter: boolean; inTop20Tech: boolean; isIntersection: boolean;
  goldenFilterScore: number | null; patternLabel: string | null;
  top20TechScore: number | null; rs3m: number | null;
  volumeSpikeRatio: number | null; ma50Status: string | null;
  compositeRank: number;
  recommendation: "MUA MANH" | "THEO DOI" | "CAN NHAC";
}

export function intersectGoldenFilterAndTop20(
  goldenFilter: GoldenFilterStock[],
  top20Tech: Top20TechStock[]
): { results: IntersectResult[]; intersectionCount: number } {
  const goldenMap = new Map(goldenFilter.map((g) => [g.ticker, g]));
  const top20Map = new Map(top20Tech.map((t) => [t.ticker, t]));
  const allTickers = new Set([...goldenMap.keys(), ...top20Map.keys()]);

  const results: IntersectResult[] = Array.from(allTickers).map((ticker) => {
    const golden = goldenMap.get(ticker);
    const top20 = top20Map.get(ticker);
    const isIntersection = !!golden && !!top20;

    let compositeRank = 0;
    if (golden && top20) compositeRank = golden.confidenceScore * 0.5 + top20.scores.total * 0.5 + 15;
    else if (golden) compositeRank = golden.confidenceScore * 0.7;
    else if (top20) compositeRank = top20.scores.total * 0.7;
    compositeRank = Math.round(Math.min(100, compositeRank));

    let recommendation: IntersectResult["recommendation"] = "CAN NHAC";
    if (isIntersection && compositeRank >= 75) recommendation = "MUA MANH";
    else if (isIntersection || compositeRank >= 60) recommendation = "THEO DOI";

    return {
      ticker, sector: golden?.sector ?? top20?.sector ?? "-",
      inGoldenFilter: !!golden, inTop20Tech: !!top20, isIntersection,
      goldenFilterScore: golden?.confidenceScore ?? null,
      patternLabel: golden?.patternLabel ?? null,
      top20TechScore: top20?.scores.total ?? null,
      rs3m: top20?.rs3m ?? null,
      volumeSpikeRatio: top20?.volumeSpikeRatio ?? null,
      ma50Status: top20?.ma50Status ?? null,
      compositeRank, recommendation,
    };
  });

  results.sort((a, b) => b.compositeRank - a.compositeRank);
  const intersectionCount = results.filter((r) => r.isIntersection).length;
  return { results, intersectionCount };
}

export function buildAIAnalysisPrompt(intersectResults: IntersectResult[], intersectionCount: number): string {
  const topIntersect = intersectResults.filter((r) => r.isIntersection).slice(0, 10);
  const list = topIntersect.map((r, i) =>
    `${i + 1}. ${r.ticker} (${r.sector}): Pattern "${r.patternLabel}" (${r.goldenFilterScore}d) + Diem ky thuat ${r.top20TechScore}d, RS 3T ${r.rs3m ?? "N/A"}%, MA50 ${r.ma50Status ?? "N/A"} -> Composite ${r.compositeRank}d`
  ).join("\n");

  return `Ban la CIO phan tich chung khoan Viet Nam. Duoi day la ${intersectionCount} ma xuat hien CA HAI: (1) Pattern Scanner VA (2) Top 20 Ky Thuat:\n\n${list}\n\nHay viet 1 doan nhan xet ngan gon (toi da 150 tu) bang tieng Viet: (1) Nhan xet chung ve chat luong dong thuan, (2) Neu 2-3 ma dang chu y nhat va ly do, (3) 1 canh bao rui ro. KHONG dua ra loi khuyen dau tu cu the.`;
}
