// MV-C0 (27/11/2026) — Kiểm tra từ CHÍNH Gateway (Railway) xem các trang công bố số liệu của Tổng cục Thống kê (TCTK) và Ngân hàng
// Nhà nước (NHNN) có truy cập được không, trước khi viết bộ đọc số liệu trực tiếp (CPI, IIP, xuất khẩu, FDI, lãi suất liên ngân hàng).
// Chỉ ĐỌC một danh sách URL CỐ ĐỊNH trong mã (không nhận URL từ người gọi), tối đa 1 lần / 24 giờ; kết quả là tóm tắt (mã HTTP,
// thời gian, dung lượng, tiêu đề, từ khoá, vài đường dẫn mẫu) — không lưu nội dung trang.
export const PROBE_TARGETS = Object.freeze([
  { id: "gso-home", org: "TCTK", url: "https://www.gso.gov.vn/" },
  { id: "gso-en", org: "TCTK", url: "https://www.gso.gov.vn/en/homepage/" },
  { id: "gso-search-cpi", org: "TCTK", url: "https://www.gso.gov.vn/?s=ch%E1%BB%89+s%E1%BB%91+gi%C3%A1+ti%C3%AAu+d%C3%B9ng" },
  { id: "gso-data", org: "TCTK", url: "https://www.gso.gov.vn/du-lieu-va-so-lieu-thong-ke/" },
  { id: "sbv-home", org: "NHNN", url: "https://www.sbv.gov.vn/" },
  { id: "sbv-interbank", org: "NHNN", url: "https://www.sbv.gov.vn/webcenter/portal/vi/menu/rm/ls/lsttlnh" },
]);
export const PROBE_KV_KEY = "macro:source-probe";
export const PROBE_EVERY_MS = 24 * 3600_000;
const MAX_BYTES = 1_500_000;
const KEYWORDS = [
  ["cpi", /\bCPI\b|ch[ỉi] s[ốo] gi[áa] ti[êe]u d[ùu]ng/i],
  ["iip", /\bIIP\b|s[ảa]n xu[ấa]t c[ôo]ng nghi[ệe]p/i],
  ["export", /xu[ấa]t kh[ẩa]u|export/i],
  ["fdi", /\bFDI\b|đ[ầa]u t[ưu] tr[ựu]c ti[ếe]p n[ưu][ớo]c ngo[àa]i/i],
  ["interbank", /li[êe]n ng[âa]n h[àa]ng|interbank/i],
  ["pressRelease", /th[ôo]ng c[áa]o b[áa]o ch[íi]|t[ìi]nh h[ìi]nh kinh t[ếe]/i],
];

const pick = (re, s) => (re.exec(s)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 140);

/** Tóm tắt một trang (không lưu nội dung). */
export function summarize(html) {
  const text = String(html ?? "");
  const hits = Object.fromEntries(KEYWORDS.map(([k, re]) => [k, re.test(text)]));
  const links = [...text.matchAll(/href="([^"#]+)"/gi)].map((m) => m[1])
    .filter((h) => /cpi|chi-so-gia|thong-cao|tinh-hinh-kinh-te|lai-suat|lsttlnh|\.xlsx?$|\.pdf$/i.test(h));
  return {
    title: pick(/<title[^>]*>([\s\S]*?)<\/title>/i, text),
    hits,
    jsOnly: text.length < 2_000 && /<script/i.test(text),
    sampleLinks: [...new Set(links)].slice(0, 6).map((h) => h.slice(0, 160)),
  };
}

/** Gọi từng URL cố định; lỗi một URL không chặn URL khác. */
export async function probeSources({ fetchImpl = globalThis.fetch, now = Date.now, targets = PROBE_TARGETS, timeoutMs = 20_000 } = {}) {
  const results = await Promise.all(targets.map(async (t) => {
    const t0 = now();
    try {
      const r = await fetchImpl(t.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)", accept: "text/html,*/*" }, redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
      const buf = await r.arrayBuffer();
      const html = new TextDecoder("utf-8").decode(buf.byteLength > MAX_BYTES ? buf.slice(0, MAX_BYTES) : buf);
      return { id: t.id, org: t.org, url: t.url, ok: r.ok, status: r.status, ms: now() - t0, bytes: buf.byteLength, contentType: r.headers?.get?.("content-type") ?? null, finalUrl: r.url && r.url !== t.url ? r.url : undefined, ...summarize(html) };
    } catch (e) {
      return { id: t.id, org: t.org, url: t.url, ok: false, status: null, ms: now() - t0, error: String(e?.cause?.code ?? e?.name ?? "") + (e?.message ? `: ${String(e.message).slice(0, 140)}` : "") };
    }
  }));
  const byOrg = {};
  for (const r of results) (byOrg[r.org] ??= { reachable: 0, total: 0 }), byOrg[r.org].total++, r.ok && byOrg[r.org].reachable++;
  return { at: new Date(now()).toISOString(), byOrg, results };
}
