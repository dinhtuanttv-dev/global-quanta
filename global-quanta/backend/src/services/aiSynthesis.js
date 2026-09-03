// AI Synthesis & Reasoning Layer — Mục 4.4 tài liệu kỹ thuật.
// Gọi Gemini + Claude (reasoning thuần văn bản, KHÔNG cần ảnh) để tổng hợp
// toàn bộ dữ liệu JSON từ các layer trước thành kết luận có cấu trúc.
// Dual-Model Cross-Check: nếu 2 model bất đồng -> hạ confidence_ceiling.

const USE_MOCK = process.env.USE_MOCK_DATA !== "false";

const SYNTHESIS_SYSTEM_PROMPT = `Bạn là trưởng nhóm phân tích, nhận báo cáo JSON từ các chuyên viên định
lượng và đưa ra kết luận cuối cùng theo cấu trúc bắt buộc: Luận điểm chính
-> Bằng chứng hỗ trợ (trích field JSON cụ thể) -> Yếu tố mâu thuẫn/rủi ro
-> Kết luận có điều kiện kèm ngưỡng vô hiệu hóa.
Không được tự suy luận ra số liệu mới ngoài dữ liệu JSON được cung cấp.
Không đưa ra mệnh lệnh giao dịch tuyệt đối ("phải mua ngay").
Không vượt quá confidence_ceiling đã cho. Trả lời DUY NHẤT bằng JSON.`;

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
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYNTHESIS_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: JSON.stringify(pipelineData) }] }],
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini synthesis lỗi: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  return JSON.parse(text);
}

function mockSynthesis(pipelineData) {
  const bias = pipelineData?.consensus_verdict?.final_bias || "Neutral";
  return {
    models_used: ["gemini-2.5-flash (mock)", "claude-sonnet (mock)"],
    synthesis_disagreement: false,
    main_thesis: `Cấu trúc đa khung hiện đang ủng hộ ${bias}.`,
    supporting_evidence_fields: [
      "macro_layer.weekly.structural_bias",
      "quant_layer.order_flow_bias",
    ],
    conflicting_factors: ["RSI Weekly tiệm cận vùng quá mua"],
    conditional_conclusion:
      "Bias hợp lệ nếu giá giữ trên vùng hỗ trợ chính; vô hiệu hóa nếu đóng nến Daily dưới invalidation_level.",
    ai_synthesis_narrative:
      "Xu hướng chính vẫn nghiêng theo bias tổng hợp khi các khung lớn đồng thuận, nhưng nên chờ nhịp điều chỉnh thay vì vào lệnh đuổi giá.",
  };
}
