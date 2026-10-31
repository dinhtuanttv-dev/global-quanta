// geminiClient.js — Gọi Gemini API dùng chung cho aiVisionService.js và
// aiSynthesis.js, có FALLBACK CHAIN: nếu model chính (mặc định là alias
// "-latest" tự động theo bản mới nhất của Google) trả lỗi (model bị tắt,
// đổi tên đột ngột...), tự động thử lần lượt các model dự phòng thay vì
// crash toàn bộ pipeline.
//
// Vì sao dùng alias "-latest" làm mặc định: Google định kỳ chuyển alias
// này sang model mới nhất trong dòng Flash mà KHÔNG cần đổi code (đã xác
// nhận: gemini-flash-latest từng tự chuyển gemini-2.5-flash -> gemini-3-
// flash-preview -> gemini-3.5-flash chỉ trong vài tháng đầu 2026).
// gemini-2.5-flash (ghim cứng, không alias) sẽ NGỪNG HOẠT ĐỘNG từ
// 16/10/2026 theo lịch deprecate của Google — đây là lý do không nên ghim
// cứng 1 phiên bản cụ thể trong code lâu dài.

const DEFAULT_PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// Danh sách dự phòng theo thứ tự ưu tiên, cấu hình được qua env (phân
// tách bằng dấu phẩy) để không phải sửa code khi Google đổi model line-up.
// gemini-2.5-flash đã tắt (404, kiểm tra 31/10/2026). Changelog: https://ai.google.dev/gemini-api/docs/changelog
const DEFAULT_FALLBACKS = (
  process.env.GEMINI_MODEL_FALLBACKS || "gemini-flash-latest,gemini-3.5-flash,gemini-3.6-flash,gemini-flash-lite-latest"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function buildModelChain() {
  // Model chính (từ .env hoặc tham số truyền vào) luôn thử trước, sau đó
  // mới tới danh sách dự phòng — loại trùng để không gọi lại cùng 1 model 2 lần.
  const chain = [DEFAULT_PRIMARY_MODEL, ...DEFAULT_FALLBACKS];
  return [...new Set(chain)];
}

export class GeminiAllModelsFailedError extends Error {
  constructor(attempts) {
    super(`Toàn bộ ${attempts.length} model Gemini đều lỗi: ${attempts.map((a) => `${a.model} (${a.error})`).join("; ")}`);
    this.attempts = attempts;
  }
}

/**
 * @param {object} params
 * @param {string} params.systemPrompt
 * @param {Array<{ text?: string, inlineData?: { mimeType: string, data: string } }>} params.parts - nội dung gửi (text và/hoặc ảnh base64)
 * @param {string} [params.model] - ép dùng đúng 1 model, bỏ qua fallback chain (dùng khi test)
 * @param {string[]} [params.models] - thay danh sách model mặc định
 * @param {object} [params.generationConfig] - ghép thêm vào cấu hình sinh (temperature, responseSchema...)
 * @param {number} [params.timeoutMs] - giới hạn thời gian cho mỗi model
 * @returns {Promise<{ json: object, modelUsed: string, usage: object | null }>}
 */
export async function callGeminiJSON({ systemPrompt, parts, model, models, generationConfig = {}, timeoutMs = 120_000, retryMs = 2_500 }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Thiếu GEMINI_API_KEY trong .env.");
  }

  const modelsToTry = model ? [model] : models?.length ? models : buildModelChain();
  const attempts = [];

  // Hai vòng: 429/503 thường là quá tải tạm thời, chờ rồi thử lại các model vừa gặp lỗi đó.
  const queue = modelsToTry.map((m) => ({ model: m, retried: false }));
  while (queue.length) {
    const job = queue.shift();
    const candidateModel = job.model;
    if (job.retried && retryMs > 0) await new Promise((r) => setTimeout(r, retryMs));
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent`,
        {
          method: "POST",
          // Khoá đi bằng header để không lọt vào URL trong log.
          headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts }],
            generationConfig: { responseMimeType: "application/json", ...generationConfig },
          }),
        }
      );

      if (!response.ok) {
        attempts.push({ model: candidateModel, error: `HTTP ${response.status}`, status: response.status });
        if ((response.status === 429 || response.status === 503) && !job.retried) queue.push({ model: candidateModel, retried: true });
        continue; // thử model tiếp theo trong chain
      }

      const data = await response.json();
      // Model có suy luận trả nhiều phần; chỉ ghép phần nội dung.
      const text = (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
      if (!text) {
        attempts.push({ model: candidateModel, error: "Response rỗng/không có text" });
        continue;
      }

      const json = JSON.parse(text); // nếu JSON.parse lỗi, rơi xuống catch, thử model tiếp theo
      if (attempts.length > 0) {
        console.warn(
          `Gemini: model chính lỗi (${attempts.map((a) => a.model).join(", ")}), đã tự chuyển sang "${candidateModel}".`
        );
      }
      return { json, modelUsed: candidateModel, usage: data.usageMetadata ?? null };
    } catch (err) {
      attempts.push({ model: candidateModel, error: err.message });
      continue;
    }
  }

  throw new GeminiAllModelsFailedError(attempts);
}
