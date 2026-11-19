// V4 (19/11/2026) — Bộ công cụ của "Hỏi đáp xúc tác", chuyển từ Project A (lib/catalyst/chat/chatTools.ts) về Gateway.
// Khác Project A: đặc tả và thực thi gọi THẲNG dịch vụ trong tiến trình (vĩ mô, thế giới, ngành thế giới, Elite, snapshot xúc tác)
// thay vì gọi HTTP sang Gateway — bớt một chặng mạng và không dùng chung giới hạn tần suất theo IP của route công khai.
// Mọi công cụ CHỈ ĐỌC. Hợp đồng kết quả (ChatToolResult: { ok, notice?, data?, guidance?, error? }) giữ nguyên.
import { CATALYST_TOOL_SPECS, runCatalystTool } from "./catalystTools.js";

/** E5: vai trò trong chế độ tranh luận của Phòng họp AI (Elite). */
export const ROLE_PROMPTS = {
  bull: "VAI TRÒ: phe MUA trong một cuộc tranh luận có trọng tài. Xây dựng lập luận mạnh nhất cho việc nghiêng tỷ trọng TĂNG (mã hoặc danh mục được hỏi), CHỈ dựa trên kết quả công cụ. Bắt buộc: nêu bậc bằng chứng (A/B/C) của từng luận điểm, và kết thúc bằng điểm yếu lớn nhất của chính lập luận phe mua.",
  bear: "VAI TRÒ: phe BÁN / thận trọng trong một cuộc tranh luận có trọng tài. Xây dựng lập luận mạnh nhất cho việc GIẢM hoặc không tăng tỷ trọng (mã hoặc danh mục được hỏi), CHỈ dựa trên kết quả công cụ. Bắt buộc: nêu bậc bằng chứng (A/B/C) của từng luận điểm, và kết thúc bằng điểm yếu lớn nhất của chính lập luận phe bán.",
  judge: "VAI TRÒ: trọng tài độc lập. Câu hỏi chứa lập luận của phe mua và phe bán. Gọi công cụ để KIỂM CHỨNG các con số và luận điểm chính; chấm từng luận điểm theo bậc bằng chứng (A/B/C) và mức độ kiểm chứng được; chỉ rõ luận điểm sai, không truy được hoặc phóng đại. Kết luận cân bằng: bên nào có bằng chứng mạnh hơn và mạnh đến mức nào, kèm điều kiện cụ thể sẽ làm thay đổi kết luận. Không khuyến nghị mua/bán.",
};
export const CHAT_ROLES = new Set(Object.keys(ROLE_PROMPTS));

const CALENDAR_TOOL = {
  name: "macro_catalyst_calendar",
  description: "Lịch vĩ mô sắp tới dưới dạng sự kiện xúc tác: ngày công bố số liệu VN (GSO, NHNN, PMI — ƯỚC TÍNH), họp FOMC (ngày chính thức; từ 2027 là lịch dự kiến của Fed), cảnh báo / chuyển chế độ vĩ mô (chỉ khi có số liệu thật). Dùng khi hỏi 'sắp có sự kiện vĩ mô gì'.",
  input_schema: { type: "object", properties: { horizonDays: { type: "integer", minimum: 1, maximum: 180, description: "Số ngày tới, mặc định 45." } }, required: [], additionalProperties: false },
};

/**
 * Đặc tả các nhóm công cụ. Mỗi nguồn lỗi -> null (nhóm đó vắng mặt, chat vẫn chạy và system prompt nói thật là không lấy được).
 * @param {{ macro?: () => Promise<any>, world?: () => Promise<any>, ws?: () => any, elite?: () => any }} sources
 */
export async function loadToolSpecs(sources) {
  const safe = async (f) => {
    try {
      return f ? await f() : null;
    } catch {
      return null;
    }
  };
  const [macro, world, ws, elite] = await Promise.all([safe(sources.macro), safe(sources.world), safe(sources.ws), safe(sources.elite)]);
  return { macro, world, ws, elite };
}

export function buildToolList({ macro, world, ws, elite }) {
  const toTool = (t) => ({ name: t.name, description: t.description, input_schema: t.input_schema });
  const groupTools = [...(elite?.anthropic ?? []), ...(ws?.anthropic ?? []), ...(macro?.anthropic ?? []), ...(world?.anthropic ?? [])].map(toTool);
  // eager_input_streaming: tham số công cụ stream ngay khi sinh; server không còn kiểm tra -> mọi tham số đều được kiểm tra lại
  // ở nơi thực thi (validateArgs của từng nhóm; runCatalystTool).
  return [...groupTools, CALENDAR_TOOL, ...CATALYST_TOOL_SPECS].map((t) => ({ ...t, eager_input_streaming: true }));
}

/**
 * @param {{ getSnapshot: () => Promise<any>, calendar: (horizonDays:number) => Promise<any>,
 *           run: { macro?: (n,a)=>Promise<any>, world?: (n,a)=>Promise<any>, ws?: (n,a)=>Promise<any>, elite?: (n,a)=>Promise<any> } }} deps
 */
export function createToolExecutor({ getSnapshot, calendar, run }) {
  let snap = null;
  const LABEL = { world: "Kết nối thế giới", ws: "Ngành thế giới", elite: "Trung tâm quyết định Elite", macro: "Trung tâm vĩ mô" };
  return async (name, input) => {
    if (name.startsWith("catalyst_")) {
      snap ??= getSnapshot().catch(() => null);
      return runCatalystTool(name, input, await snap);
    }
    if (name === "macro_catalyst_calendar") {
      const h = input?.horizonDays;
      const horizonDays = Number.isInteger(h) && h >= 1 && h <= 180 ? h : 45;
      try {
        const b = await calendar(horizonDays);
        return { ok: true, notice: b.notice ?? null, data: { asOf: b.asOf, events: b.events, mode: b.mode }, guidance: [b.caveat, "Lịch công bố số liệu không có hướng tốt/xấu — chỉ biết sau khi công bố."] };
      } catch (e) {
        return { ok: false, error: `Không lấy được lịch vĩ mô (${e?.message ?? "lỗi"}).` };
      }
    }
    const group = name.startsWith("world_") ? "world" : name.startsWith("ws_") ? "ws" : name.startsWith("elite_") ? "elite" : name.startsWith("macro_") ? "macro" : null;
    if (!group) return { ok: false, error: `Không có công cụ ${name}.` };
    const fn = run[group];
    if (!fn) return { ok: false, error: `${LABEL[group]} hiện không khả dụng.` };
    try {
      return await fn(name, input ?? {});
    } catch (e) {
      return { ok: false, error: `${LABEL[group]} lỗi: ${e?.statusCode ? `HTTP ${e.statusCode}` : (e?.message ?? "không rõ").slice(0, 160)}.` };
    }
  };
}

export function buildSystemPrompt({ macro, world, ws, elite }, todayVn, role = null) {
  return [
    ...(role ? [ROLE_PROMPTS[role], ""] : []),
    `Bạn là trợ lý "Hỏi đáp xúc tác" trong ứng dụng phân tích chứng khoán Việt Nam. Hôm nay là ${todayVn} (giờ Việt Nam).`,
    "Nhiệm vụ: trả lời câu hỏi về chất xúc tác (tin tức, sự kiện, chính sách tác động tới ngành/mã), bối cảnh vĩ mô và tác động của thế giới tới ngành/cổ phiếu Việt Nam, CHỈ dựa trên kết quả công cụ.",
    "Khi hỏi về danh mục Elite, Điểm Elite, độ tin cậy của tín hiệu hay hồ sơ định lượng của một mã: dùng elite_decision / elite_ticker / elite_evidence trước.",
    "Cách phân tích một ngành hoặc một mã: (1) ws_stock / ws_sector để biết ngành ICB, tư thế ngắn hạn, bối cảnh trung hạn, hàng hoá dẫn dắt; (2) catalyst_* để xem tin/sự kiện tác động; (3) macro_* / world_* khi cần bối cảnh vĩ mô hay truyền dẫn. Kết luận theo thứ tự: tác động ngành -> tác động mã -> rủi ro / độ tin cậy.",
    "",
    "Quy tắc chung (bắt buộc):",
    "- Gọi công cụ trước khi nêu bất kỳ con số, ngành, mã hay sự kiện cụ thể nào. Không có kết quả công cụ thì không có số liệu — nói rõ là chưa có dữ liệu.",
    "- Mọi con số trong câu trả lời phải lấy nguyên từ kết quả công cụ (có thể làm tròn). Hệ thống tự kiểm tra và hiện cảnh báo nếu có con số không truy được.",
    "- Nếu kết quả có trường notice (dữ liệu mô phỏng, dữ liệu cũ) thì nêu ngay câu đầu tiên.",
    "- Không đưa khuyến nghị mua/bán, giá mục tiêu hay tỷ trọng. Trình bày như thông tin tham khảo, kèm mức độ bằng chứng.",
    "- Tỷ lệ thắng lịch sử dưới 50% nghĩa là nhóm tín hiệu đó chưa tốt hơn ngẫu nhiên — phải nói rõ, không tô hồng.",
    "- Quan hệ vĩ mô là thống kê lịch sử, không phải nhân quả; điểm vĩ mô (MacroScore) CHỈ để tham khảo. \"Chế độ vĩ mô\" hiện chỉ chạy trên CPI — gọi đúng là chế độ lạm phát.",
    "- Trả lời bằng tiếng Việt, ngắn gọn: kết luận trước, 1–3 con số quan trọng, rồi lưu ý. Dùng gạch đầu dòng khi liệt kê; không dùng bảng dài.",
    "",
    macro?.systemPrompt ?? "Công cụ vĩ mô hiện không khả dụng — nếu được hỏi về vĩ mô, nói thật là không lấy được dữ liệu.",
    "",
    world
      ? [
          "Công cụ Kết nối thế giới (world_*): yếu tố/sự kiện thế giới -> ngành Việt Nam, bậc bằng chứng A/B/C, kết nối thị trường, kịch bản.",
          "Mã ngành của world_*: S_BANK ngân hàng, S_SEC chứng khoán, S_RE bất động sản, S_STEEL thép, S_OIL dầu khí, S_SEAFOOD thuỷ sản, S_TEXTILE dệt may, S_PORT cảng & logistics, S_TECH công nghệ, S_POWER điện.",
          "Ánh xạ sang ngành ICB: S_BANK=8300, S_SEC=8700, S_RE=8600, S_STEEL=1750, S_OIL=0500, S_PORT=2770, S_TECH=9500, S_POWER=7530.",
          "PMI Mỹ dùng proxy Philly Fed, bất định thuế quan dùng EPU thương mại (FRED). Cước container, PMI Trung Quốc, dòng vốn EM CHƯA có nguồn — nếu kết quả báo bỏ qua/thiếu, nói rõ, không suy đoán.",
          world.guidelines ?? "",
        ].join("\n")
      : "Công cụ Kết nối thế giới hiện không khả dụng — nếu được hỏi về tác động của thế giới lên ngành, nói thật là không lấy được dữ liệu.",
    "",
    ws?.guidelines ?? "Công cụ ngành thế giới (ws_*) hiện không khả dụng.",
    "",
    elite?.guidelines ?? "Công cụ trung tâm quyết định Elite (elite_*) hiện không khả dụng.",
  ].join("\n");
}
