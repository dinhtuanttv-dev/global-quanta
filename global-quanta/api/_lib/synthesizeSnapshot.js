// synthesizeSnapshot.js — Thay thế hoàn toàn cho cặp
// Vision Capture (Playwright) + AI Vision (đọc ảnh biểu đồ).
//
// Đầu vào giờ là JSON có cấu trúc, tính THẬT từ historicalCandles
// (RSI/MACD/ADX qua technicalOscillators.js, mẫu hình + tỷ lệ thành công
// qua patternBacktest.js) — AI chỉ nhận JSON này để tổng hợp thành luận
// điểm, KHÔNG "nhìn" bất kỳ ảnh nào. Nhanh hơn, rẻ hơn, và mọi con số AI
// trích dẫn đều có thể truy vết lại đúng nguồn thật.
//
// Dual-Model Cross-Check: gọi cả Gemini và Claude cùng lúc trên cùng 1
// input, so khớp kết luận (bullish/bearish/neutral) để tính
// synthesis_disagreement THẬT — không hardcode.

import { callGeminiJSON } from "./geminiClient.js";

const SYSTEM_PROMPT = `Ban la chuyen gia phan tich ky thuat chung khoan Viet Nam.
Ban CHI duoc su dung cac con so co trong JSON duoc cung cap - KHONG duoc tu
suy ra, uoc luong, hay bia them bat ky gia tri nao khong co trong JSON.
Neu du lieu khong du de ket luan mot dieu gi do, hay noi ro trong
conflicting_factors thay vi tu bia.

invalidation_level PHAI la 1 con so co that trong JSON (vi du: invalidationLevel
cua currentlyForming, hoac swingLow/swingHigh gan nhat) - khong duoc tu chon
so tuy y. Neu khong co gia tri nao phu hop, dat null va giai thich trong
conflicting_factors.

VE pattern_layer.currentlyForming va historicalSuccessRates:
- Neu currentlyForming khac null, doi chieu voi historicalSuccessRates de
  tim dong co patternType trung khop, roi trich dan CHINH XAC successRatePct,
  sampleSize, avgReturnPct cua dong do. TUYET DOI KHONG tu uoc luong % khac.
- Neu sampleSize < 5, PHAI canh bao ro trong conflicting_factors rang mau
  qua nho de tin cay thong ke.
- Neu currentlyForming la null, khong duoc bia ra mau hinh nao - noi ro
  "khong co mau hinh hinh hoc ro rang dang hinh thanh" trong main_thesis.

Tra loi DUY NHAT bang JSON dung schema sau, khong kem van ban khac:
{
  "main_thesis": string,
  "supporting_evidence_fields": string[],
  "conflicting_factors": string[],
  "conditional_conclusion": string,
  "invalidation_level": number | null,
  "direction": "bullish" | "bearish" | "neutral",
  "confidence_tier": "Thấp" | "Trung bình" | "Cao",
  "checklist": [{ "label": string, "passed": boolean, "detail": string }]
}`;

async function callClaudeSynthesis(snapshot) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(snapshot) }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic API lỗi: ${response.status} ${await response.text()}`);
  const data = await response.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(text);
}

async function callGeminiSynthesis(snapshot) {
  const { json } = await callGeminiJSON({
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text: JSON.stringify(snapshot) }],
  });
  return json;
}

/**
 * @param {object} snapshot { ticker, timeframe, lastClose, lastDate, technical_layer, pattern_layer }
 * @returns {Promise<{ synthesis: object, modelsUsed: string[], synthesisDisagreement: boolean }>}
 */
export async function synthesizeSnapshot(snapshot) {
  const [claudeResult, geminiResult] = await Promise.allSettled([
    process.env.ANTHROPIC_API_KEY ? callClaudeSynthesis(snapshot) : Promise.reject(new Error("Thiếu ANTHROPIC_API_KEY")),
    process.env.GEMINI_API_KEY ? callGeminiSynthesis(snapshot) : Promise.reject(new Error("Thiếu GEMINI_API_KEY")),
  ]);

  const claude = claudeResult.status === "fulfilled" ? claudeResult.value : null;
  const gemini = geminiResult.status === "fulfilled" ? geminiResult.value : null;

  if (!claude && !gemini) {
    throw new Error(
      "Cả Claude và Gemini đều lỗi khi tổng hợp: " +
        `Claude: ${claudeResult.reason?.message ?? "n/a"}; Gemini: ${geminiResult.reason?.message ?? "n/a"}`
    );
  }

  const primary = claude || gemini;
  const modelsUsed = [claude && "claude", gemini && "gemini"].filter(Boolean);
  // Dual-Model Cross-Check thật: so khớp "direction" giữa 2 model, không
  // hardcode như ensembleAgreement cũ.
  const synthesisDisagreement = !!(claude && gemini && claude.direction !== gemini.direction);

  return { synthesis: primary, modelsUsed, synthesisDisagreement };
}
