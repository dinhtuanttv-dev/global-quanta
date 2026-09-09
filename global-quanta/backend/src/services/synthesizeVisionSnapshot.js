// synthesizeVisionSnapshot.js — Tổng hợp AI cho CHẾ ĐỘ VISION (giữ lại
// theo yêu cầu, song song với chế độ "structured" mặc định). Nhận dữ liệu
// đã qua Vision Capture (Playwright) + AI Vision (Claude/Gemini đọc ảnh) —
// khác với synthesizeSnapshot.js (chế độ structured) ở chỗ input là
// macro_layer/tactical_layer/quant_layer thay vì technical_layer/pattern_layer.

import { callGeminiJSON } from "./geminiClient.js";

const SYSTEM_PROMPT = `Ban la chuyen gia phan tich ky thuat chung khoan Viet Nam.
Du lieu JSON duoc cung cap den tu Vision AI doc anh chup bieu do (macro_layer,
tactical_layer) va Feature Extraction (quant_layer). Day KHONG phai du lieu
tinh toan xac dinh nhu che do "structured" - co the co sai so do AI doc anh.
PHAI neu ro trong conflicting_factors neu cac khung thoi gian (tactical_layer)
mau thuan nhau, hoac neu quant_layer danh dau la MOCK/ESTIMATED.

invalidation_level PHAI lay tu key_monthly_level.support hoac 1 gia tri co
that trong JSON - khong tu bia.

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
  const { json } = await callGeminiJSON({ systemPrompt: SYSTEM_PROMPT, parts: [{ text: JSON.stringify(snapshot) }] });
  return json;
}

export async function synthesizeVisionSnapshot(snapshot) {
  const [claudeResult, geminiResult] = await Promise.allSettled([
    process.env.ANTHROPIC_API_KEY ? callClaudeSynthesis(snapshot) : Promise.reject(new Error("Thiếu ANTHROPIC_API_KEY")),
    process.env.GEMINI_API_KEY ? callGeminiSynthesis(snapshot) : Promise.reject(new Error("Thiếu GEMINI_API_KEY")),
  ]);
  const claude = claudeResult.status === "fulfilled" ? claudeResult.value : null;
  const gemini = geminiResult.status === "fulfilled" ? geminiResult.value : null;
  if (!claude && !gemini) {
    throw new Error(
      `Cả Claude và Gemini đều lỗi: Claude: ${claudeResult.reason?.message ?? "n/a"}; Gemini: ${geminiResult.reason?.message ?? "n/a"}`
    );
  }
  const primary = claude || gemini;
  const modelsUsed = [claude && "claude", gemini && "gemini"].filter(Boolean);
  const synthesisDisagreement = !!(claude && gemini && claude.direction !== gemini.direction);
  return { synthesis: primary, modelsUsed, synthesisDisagreement };
}
