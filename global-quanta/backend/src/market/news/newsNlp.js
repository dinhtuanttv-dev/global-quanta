// Xử lý ngôn ngữ cho tin chứng khoán tiếng Việt (hàm thuần, không gọi mạng, không dùng AI trả phí):
//   - nhận diện mã cổ phiếu trong tiêu đề / tóm tắt
//   - phân loại sự kiện (cổ tức, KQKD, giao dịch nội bộ, phát hành, M&A, pháp lý, hợp đồng, ĐHĐCĐ, nhân sự…)
//   - chấm cảm xúc theo từ điển tài chính có xử lý phủ định ("không đạt", "chưa có lãi"…)
//   - khử trùng lặp tin giữa các nguồn (Jaccard trên bộ từ đã chuẩn hoá)

export function fold(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

export function stripHtml(s) {
  return String(s ?? "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// Chữ in hoa 3 ký tự hay gặp trong tin nhưng không phải mã (khi trùng mã thật vẫn loại nếu không có ngữ cảnh sàn).
const STOP = new Set(["CEO", "CFO", "USD", "VND", "GDP", "CPI", "FED", "ETF", "IPO", "ESG", "HDQT", "ATM", "VAT", "EPS", "ROE", "ROA", "FDI", "ODA", "BOT", "PPP", "KCN", "BDS", "TPHCM", "HCM", "SBV", "NHNN", "UBND", "COVID", "AI", "IT", "VN", "EU", "US", "UK", "PMI", "OPEC", "LNG", "API", "THE", "AND", "MSCI", "FTSE"]);

/**
 * Mã cổ phiếu được nhắc tới. Ưu tiên dạng "(HOSE: TTF)" / "HNX: SHS"; sau đó là từ in hoa 3 ký tự
 * có trong danh sách mã niêm yết (loại từ viết tắt phổ biến).
 * @param {Set<string>} symbols
 */
export function extractTickers(text, symbols) {
  const out = new Set();
  const s = String(text ?? "");
  for (const m of s.matchAll(/\b(?:HOSE|HSX|HNX|UPCOM|UPCoM)\s*[:：]\s*([A-Z][A-Z0-9]{2})\b/g)) out.add(m[1]);
  for (const m of s.matchAll(/(?<![A-Za-z0-9À-ỹ])([A-Z][A-Z0-9]{2})(?![A-Za-z0-9À-ỹ])/g)) {
    if (!STOP.has(m[1]) && symbols.has(m[1])) out.add(m[1]);
  }
  return [...out];
}

/** Chữ thường, chuẩn NFC, GIỮ dấu (tránh nhầm "lãi"/"lại", "lỗ"/"lo", "gom"/"gồm"). */
export function vn(s) {
  return String(s ?? "").normalize("NFC").toLowerCase();
}

export const EVENT_TYPES = [
  { id: "LEGAL", label: "Pháp lý / cảnh báo", weight: 1.0, re: /(diện kiểm soát|diện cảnh báo|cảnh báo|đình chỉ|tạm ngừng giao dịch|hủy niêm yết|huỷ niêm yết|xử phạt|phạt tiền|vi phạm|khởi tố|điều tra|bắt giữ|thanh tra|cưỡng chế|nợ xấu|chậm nộp|chậm thanh toán)/ },
  { id: "EARNINGS", label: "Kết quả kinh doanh", weight: 0.95, re: /(lợi nhuận|lãi ròng|lãi trước thuế|lãi sau thuế|doanh thu|kết quả kinh doanh|kqkd|báo cáo tài chính|bctc|lỗ ròng|thua lỗ|báo lãi|báo lỗ|vượt kế hoạch|hoàn thành kế hoạch)/ },
  { id: "INSIDER", label: "Giao dịch nội bộ / cổ đông lớn", weight: 0.9, re: /(đăng ký mua|đăng ký bán|đã mua|đã bán|giao dịch cổ phiếu|cổ đông lớn|người nội bộ|người có liên quan|gom thêm|trở thành cổ đông)/ },
  { id: "MNA", label: "M&A / thoái vốn", weight: 0.9, re: /(sáp nhập|hợp nhất|mua lại|thâu tóm|chuyển nhượng vốn|m&a|thoái vốn)/ },
  { id: "DIVIDEND", label: "Cổ tức", weight: 0.8, re: /(cổ tức|chia thưởng|không hưởng quyền|chốt quyền|ngày đăng ký cuối cùng)/ },
  { id: "ISSUANCE", label: "Phát hành / tăng vốn", weight: 0.75, re: /(phát hành|tăng vốn|chào bán|esop|trái phiếu|cổ phiếu quỹ|niêm yết bổ sung|giao dịch bổ sung)/ },
  { id: "CONTRACT", label: "Hợp đồng / dự án", weight: 0.7, re: /(hợp đồng|trúng thầu|dự án|khởi công|khánh thành|mở rộng|nhà máy|xuất khẩu|đơn hàng|ký kết|hợp tác)/ },
  { id: "AGM", label: "ĐHĐCĐ / nghị quyết", weight: 0.6, re: /(đại hội|đhđcđ|nghị quyết|hđqt|lấy ý kiến cổ đông|kế hoạch kinh doanh)/ },
  { id: "PERSONNEL", label: "Nhân sự", weight: 0.5, re: /(bổ nhiệm|miễn nhiệm|từ nhiệm|tổng giám đốc|chủ tịch|thành viên hđqt|kế toán trưởng)/ },
  { id: "RATING", label: "Khuyến nghị / định giá", weight: 0.55, re: /(khuyến nghị|giá mục tiêu|định giá|nâng hạng|hạ hạng|xếp hạng|outperform)/ },
  // Diễn biến giá / thị trường: đặt CUỐI (loại cụ thể thắng) nhưng vẫn khớp tiêu đề, để tiêu đề kiểu "Vốn hoá PNJ giảm…"
  // không rơi xuống phân loại theo tóm tắt (từ khoá lẻ trong thân bài như "phát hành" làm nhầm loại).
  { id: "MARKET", label: "Diễn biến giá / thị trường", weight: 0.5, re: /(vốn hóa|vốn hoá|thị giá|giá cổ phiếu|cổ phiếu (?:tăng|giảm)|bốc hơi|khối ngoại|tăng trần|giảm sàn|nằm sàn|kịch trần|thanh khoản|phiên giao dịch|chứng khoán hôm nay|vn-index|vnindex)/ },
];
const OTHER = { id: "OTHER", label: "Tin doanh nghiệp", weight: 0.45 };

export function classifyEvent(text) {
  const f = vn(text);
  return EVENT_TYPES.find((t) => t.re.test(f)) ?? OTHER;
}

// Từ điển cảm xúc tài chính (có dấu). Cụm dài khớp trước để "giảm lỗ" không bị đếm là "giảm" + "lỗ".
const POS = [
  "tăng trưởng mạnh", "lãi kỷ lục", "lợi nhuận kỷ lục", "vượt kế hoạch", "vượt kỳ vọng", "hoàn thành kế hoạch", "giảm lỗ", "có lãi trở lại", "lãi trở lại",
  "tăng mạnh", "bùng nổ", "đột phá", "trúng thầu", "ký kết", "mở rộng", "khởi công", "khánh thành", "xuất khẩu", "nâng hạng", "nâng mức tín nhiệm",
  "chia cổ tức", "trả cổ tức", "cổ tức tiền mặt", "thưởng cổ phiếu", "mua vào", "đăng ký mua", "gom", "gom thêm", "tăng", "tích cực", "phục hồi",
  "lãi", "kỷ lục", "khả quan", "thuận lợi", "được giải cứu", "tăng trần", "hồi phục",
];
const NEG = [
  "lỗ ròng", "thua lỗ", "lỗ lũy kế", "lỗ luỹ kế", "giảm mạnh", "lao dốc", "sụt giảm", "không đạt", "chưa đạt", "không hoàn thành", "hạ hạng", "diện kiểm soát", "kiểm soát",
  "cảnh báo", "đình chỉ", "tạm ngừng", "hủy niêm yết", "huỷ niêm yết", "xử phạt", "phạt tiền", "vi phạm", "khởi tố", "điều tra", "nợ xấu", "chậm thanh toán", "chậm nộp",
  "đăng ký bán", "bán ra", "thoái vốn", "thoát hàng", "giảm", "tiêu cực", "rủi ro", "khó khăn", "áp lực", "lỗ", "giảm sàn", "bán tháo",
];
const NEGATORS = ["không", "chưa", "chẳng", "không còn", "hết", "giảm bớt"];

const toks = (s) => vn(s).replace(/[^\p{L}\p{N}%&]+/gu, " ").trim().split(" ").filter(Boolean);

/** Cảm xúc -1..1 và các cụm đã khớp (để giải thích trên UI). */
export function sentiment(text) {
  const words = toks(text);
  const used = new Array(words.length).fill(false);
  const hits = [];
  let score = 0;
  // Khớp cụm DÀI trước trên CẢ hai từ điển ("giảm lỗ" thắng "giảm" + "lỗ"; "không đạt" là cụm tiêu cực).
  const lexicon = [...NEG.map((p) => [p, -1]), ...POS.map((p) => [p, 1])]
    .sort((a, b) => b[0].split(" ").length - a[0].split(" ").length);
  for (const [phrase, sign] of lexicon) {
    const p = phrase.split(" ");
    for (let i = 0; i + p.length <= words.length; i++) {
      if (p.some((w, k) => used[i + k] || words[i + k] !== w)) continue;
      for (let k = 0; k < p.length; k++) used[i + k] = true;
      const before = words.slice(Math.max(0, i - 2), i).join(" ");
      const negated = NEGATORS.some((n) => before === n || before.endsWith(` ${n}`));
      score += (p.length > 1 ? 1.5 : 1) * (negated ? -1 : 1) * sign;
      hits.push(`${negated ? "¬" : ""}${phrase}`);
    }
  }
  return { score: Math.max(-1, Math.min(1, score / 3)), hits };
}

export function titleTokens(title) {
  return new Set(toks(title).filter((w) => w.length > 1));
}

export function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}
