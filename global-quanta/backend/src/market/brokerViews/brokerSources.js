// Nguồn báo cáo công khai của công ty chứng khoán (31/10/2026). Chỉ đọc trang công khai trong danh sách, không vượt đăng nhập hay chặn truy cập.
// MBS (chặn truy cập tự động) và VNDirect (403) không có trong danh sách vì lý do đó.
export const BROKERS = Object.freeze({
  SSI: { name: "SSI Research" },
  KBSV: { name: "KB Securities VN" },
  ACBS: { name: "ACBS" },
  BVSC: { name: "Chứng khoán Bảo Việt" },
});
export const ALLOWED_HOSTS = new Set(["www.ssi.com.vn", "ssi.com.vn", "www.kbsec.com.vn", "kbsec.com.vn", "acbs.com.vn", "www.acbs.com.vn", "bvsc.com.vn", "www.bvsc.com.vn"]);

const dec = (x) => String(x).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&#038;/g, "&").replace(/&[lr]dquo;/g, '"');
const text = (x) => dec(String(x).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
export const isoOf = (d) => { const m = String(d ?? "").match(/\b(\d{2})[/-](\d{2})[/-](20\d{2})\b/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const abs = (u, base) => { try { return new URL(dec(u), base).href; } catch { return null; } };

/** Chỉ lấy báo cáo thị trường, vĩ mô, chiến lược; bỏ báo cáo từng mã và thông báo dịch vụ. */
const WANT = /vĩ mô|chiến lược|triển vọng|chuyển động thị trường|thị trường tháng|ttck|thuế quan|thông tư/i;
const DROP = /khuyến mại|ký quỹ|danh mục chứng khoán|bản tin chứng khoán|báo cáo tài chính|morning|chatty|dòng vốn đầu tư toàn cầu/i;
export const wanted = (title) => WANT.test(title) && !DROP.test(title);

/** KBSV: <a href='...pdf' title='...'> rồi ngày trong span.date. */
export function parseKbsv(html, base) {
  const out = [];
  for (const m of html.matchAll(/<div class='item'>\s*<h3[^>]*>\s*<a[^>]*href='([^']+\.pdf)'[^>]*title='([^']*)'[\s\S]{0,500}?(\d{2}\/\d{2}\/20\d{2})/gi)) {
    out.push({ title: text(m[2]), pdfUrl: abs(m[1], base), publishedAt: isoOf(m[3]), pageUrl: abs(m[1], base) });
  }
  return out;
}

/** SSI: file tải yêu cầu đăng nhập nên chỉ dùng phần tóm tắt công khai ngay trên trang danh sách. */
export function parseSsi(html, base) {
  const out = [];
  const titles = [...html.matchAll(/<a[^>]*href="javascript:void\(0\)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)].map((m) => ({ i: m.index, title: text(m[1]) })).filter((t) => t.title.length > 12);
  for (const [k, t] of titles.entries()) {
    const end = titles[k + 1]?.i ?? html.length;
    const seg = html.slice(t.i, Math.min(end, t.i + 30000));
    const d = seg.match(/chart__content__item__time[\s\S]{0,200}?(\d{2}\/\d{2}\/20\d{2})/);
    if (!d) continue;
    const summary = text(seg.slice(0, d.index).replace(/^<a[\s\S]*?<\/a>/i, ""));
    if (summary.length >= 80) out.push({ title: t.title, pdfUrl: null, summary: summary.slice(0, 6000), publishedAt: isoOf(d[1]), pageUrl: base });
  }
  return out;
}

/** ACBS: danh sách trỏ tới trang chi tiết, trang đó mới có PDF và ngày. */
export function parseAcbs(html, base) {
  const seen = new Map();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']*trung-tam-phan-tich\/chi-tiet\/[^"']+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi)) {
    const t = text(m[2]), u = abs(m[1], base);
    if (u && t.length > 12 && !seen.has(u)) seen.set(u, { title: t, pdfUrl: null, publishedAt: null, pageUrl: u });
  }
  return [...seen.values()];
}

/** BVSC: a.contentNewArticle_Title rồi label.time__detail. */
export function parseBvsc(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a[^>]*class="contentNewArticle_Title"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,400}?)<\/a>[\s\S]{0,500}?time__detail">\s*(\d{2}\/\d{2}\/20\d{2})/gi)) {
    out.push({ title: text(m[2]), pdfUrl: null, publishedAt: isoOf(m[3]), pageUrl: abs(m[1], base) });
  }
  return out;
}

/** Trang chi tiết: link PDF đầu tiên và ngày đăng. */
export function parseDetail(html, base) {
  const pdf = html.match(/["'(]((?:https?:)?[^"'()\s<>]*\.pdf(?:\?[^"'()\s<>]*)?)/i);
  const meta = html.match(/article:published_time"[^>]*content="(20\d{2}-\d{2}-\d{2})/i) ?? html.match(/"datePublished"\s*:\s*"(20\d{2}-\d{2}-\d{2})/);
  return { pdfUrl: pdf ? abs(pdf[1], base) : null, publishedAt: meta?.[1] ?? isoOf(html.match(/\b\d{2}\/\d{2}\/20\d{2}\b/)?.[0]) };
}

export const SOURCES = Object.freeze([
  { id: "SSI-CL", broker: "SSI", type: "strategy", url: "https://www.ssi.com.vn/khach-hang-ca-nhan/bao-cao-chien-luoc", parse: parseSsi },
  { id: "SSI-VM", broker: "SSI", type: "macro", url: "https://www.ssi.com.vn/khach-hang-ca-nhan/bao-cao-vi-mo", parse: parseSsi },
  { id: "KBSV-CL", broker: "KBSV", type: "strategy", url: "https://www.kbsec.com.vn/vi/bao-cao-chien-luoc-thi-truong.htm", parse: parseKbsv },
  { id: "KBSV-VM", broker: "KBSV", type: "macro", url: "https://www.kbsec.com.vn/vi/bao-cao-trien-vong-kinh-te-vi-mo.htm", parse: parseKbsv },
  { id: "ACBS", broker: "ACBS", type: "market", url: "https://acbs.com.vn/trung-tam-phan-tich", parse: parseAcbs },
  { id: "BVSC-VM", broker: "BVSC", type: "macro", url: "https://bvsc.com.vn/danhmuc/phan-tich/bao-cao-chi-tiet-bvsc/bao-cao-vi-mo-thi-truong/?danhmucID=6390", parse: parseBvsc },
]);
