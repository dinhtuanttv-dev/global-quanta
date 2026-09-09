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
// ⚠️ Cần rà soát lại danh sách này sau 16/10/2026 (ngày gemini-2.5-flash
// chính thức tắt) — xem changelog: https://ai.google.dev/gemini-api/docs/changelog
const DEFAULT_FALLBACKS = (
  process.env.GEMINI_MODEL_FALLBACKS || "gemini-flash-latest,gemini-2.5-flash,gemini-3.1-flash-lite"
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
 * @returns {Promise<{ json: object, modelUsed: string }>}
 */
export async function callGeminiJSON({ systemPrompt, parts, model }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Thiếu GEMINI_API_KEY trong .env.");
  }

  const modelsToTry = model ? [model] : buildModelChain();
  const attempts = [];

  for (const candidateModel of modelsToTry) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${candidateModel}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ parts }],
          }),
        }
      );

      if (!response.ok) {
        attempts.push({ model: candidateModel, error: `HTTP ${response.status}` });
        continue; // thử model tiếp theo trong chain
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
      return { json, modelUsed: candidateModel };
    } catch (err) {
      attempts.push({ model: candidateModel, error: err.message });
      continue;
    }
  }

  throw new GeminiAllModelsFailedError(attempts);
}
