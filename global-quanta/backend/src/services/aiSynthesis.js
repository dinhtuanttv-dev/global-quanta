// AI Synthesis & Reasoning Layer — Mục 4.4 tài liệu kỹ thuật.
// Gọi Gemini + Claude (reasoning thuần văn bản, KHÔNG cần ảnh) để tổng hợp
// toàn bộ dữ liệu JSON từ các layer trước thành kết luận có cấu trúc.
// Dual-Model Cross-Check: nếu 2 model bất đồng -> hạ confidence_ceiling.
//
// ĐÃ SỬA: gọi Gemini qua geminiClient.js dùng chung với aiVisionService.js
// — có fallback chain tự động khi model/alias lỗi, không còn hardcode
// "gemini-2.5-flash" ở đây nữa (bản cũ sẽ ngừng hoạt động từ 16/10/2026).

import { callGeminiJSON } from "./geminiClient.js";

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";

const SYNTHESIS_SYSTEM_PROMPT = `Bạn là trưởng nhóm phân tích, nhận báo cáo JSON từ các chuyên viên định
lượng và đưa ra kết luận cuối cùng theo cấu trúc bắt buộc: Luận điểm chính
-> Bằng chứng hỗ trợ (trích field JSON cụ thể) -> Yếu tố mâu thuẫn/rủi ro
-> Kết luận có điều kiện kèm ngưỡng vô hiệu hóa.
Không được tự suy luận ra số liệu mới ngoài dữ liệu JSON được cung cấp.
Không đưa ra mệnh lệnh giao dịch tuyệt đối ("phải mua ngay").
Không vượt quá confidence_ceiling đã cho. Trả lời DUY NHẤT bằng JSON.

QUY TẮC BẮT BUỘC về pattern_layer (tỷ lệ thành công mẫu hình):
- Nếu pattern_layer có dữ liệu, CHỈ được trích dẫn nguyên văn giá trị
  successRatePct đã được patternBacktest.js tính sẵn bằng thuật toán xác
  định trên lịch sử giá thật. TUYỆT ĐỐI không tự ước lượng, làm tròn cảm
  tính, hay "đoán" một tỷ lệ % khác dựa trên việc nhìn ảnh biểu đồ.
- Nếu một mục trong pattern_layer có lowSampleWarning = true (sampleSize
  nhỏ hơn 5), BẮT BUỘC phải nêu rõ trong conflicting_factors hoặc
  conditional_conclusion rằng tỷ lệ % này KHÔNG có ý nghĩa thống kê do
  kích thước mẫu quá nhỏ — không được trình bày con số đó như một sự thật
  đáng tin cậy.`;

export async function synthesizeConclusion(pipelineData) {
  if (USE_MOCK || (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY)) {
    return mockSynthesis(pipelineData);
  }

  const [claudeResult, geminiResult] = await Promise.allSettled([
    callClaudeSynthesis(pipelineData),
    callGeminiSynthesis(pipelineData),
  ]);

  const claude = claudeResult.status === "fulfilled" ? claudeResult.value : null;
  const gemini = geminiResult.status === "fulfilled" ? geminiResult.value : null;

  if (!claude && !gemini) return mockSynthesis(pipelineData);

  const primary = claude || gemini;
  const disagreement = claude && gemini ? claude.main_thesis_bias !== gemini.main_thesis_bias : false;

  return {
    models_used: [claude && "claude", gemini && "gemini"].filter(Boolean),
    synthesis_disagreement: disagreement,
    ...primary,
  };
}

async function callClaudeSynthesis(pipelineData) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 800,
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(pipelineData) }],
    }),
  });
  if (!response.ok) throw new Error(`Claude synthesis lỗi: ${response.status}`);
  const data = await response.json();
  const text = data.content?.find((b) => b.type === "text")?.text || "{}";
  return JSON.parse(text);
}

async function callGeminiSynthesis(pipelineData) {
  const { json } = await callGeminiJSON({
    systemPrompt: SYNTHESIS_SYSTEM_PROMPT,
    parts: [{ text: JSON.stringify(pipelineData) }],
  });
  return json;
}

function mockSynthesis(pipelineData) {
  const bias = pipelineData?.consensus_verdict?.final_bias || "Neutral";
  const patterns = pipelineData?.pattern_layer || [];
  const lowSamplePatterns = patterns.filter((p) => p.lowSampleWarning);
  const reliablePattern = patterns.find((p) => !p.lowSampleWarning && p.successRatePct != null);

  const conflictingFactors = ["RSI Weekly tiệm cận vùng quá mua"];
  if (lowSamplePatterns.length > 0) {
    conflictingFactors.push(
      `Mẫu hình ${lowSamplePatterns.map((p) => p.patternType).join(", ")} có sampleSize < 5 — tỷ lệ % chưa có ý nghĩa thống kê, chỉ mang tính tham khảo.`
    );
  }

  return {
    models_used: ["gemini-2.5-flash (mock)", "claude-sonnet (mock)"],
    synthesis_disagreement: false,
    main_thesis: `Cấu trúc đa khung hiện đang ủng hộ ${bias}.`,
    supporting_evidence_fields: [
      "macro_layer.weekly.structural_bias",
      "quant_layer.order_flow_bias",
      ...(reliablePattern ? [`pattern_layer[patternType=${reliablePattern.patternType}].successRatePct`] : []),
    ],
    conflicting_factors: conflictingFactors,
    conditional_conclusion:
      "Bias hợp lệ nếu giá giữ trên vùng hỗ trợ chính; vô hiệu hóa nếu đóng nến Daily dưới invalidation_level.",
    ai_synthesis_narrative:
      "Xu hướng chính vẫn nghiêng theo bias tổng hợp khi các khung lớn đồng thuận, nhưng nên chờ nhịp điều chỉnh thay vì vào lệnh đuổi giá.",
  };
}
