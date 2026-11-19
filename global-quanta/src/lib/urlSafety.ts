/**
 * S7 (Phase 1, tich hop tu goi ban giao Chat Xuc Tac 2.0): whitelist domain
 * nguon tin truoc khi render href - chong open-redirect/phishing neu backend
 * bi compromise hoac tra ve URL khong mong doi.
 *
 * Dung o moi noi render href tu du lieu server (DomesticEventsPanel,
 * MarketAnnouncementWatchPanel, ...).
 */
const TRUSTED_DOMAINS = [
  "cafef.vn",
  "vnexpress.net",
  "hsx.vn",
  "hnx.vn",
  "ssc.gov.vn",
  "sbv.gov.vn",
  "vneconomy.vn",
  "tinnhanhchungkhoan.vn",
  "reuters.com",
  "bloomberg.com",
  "fiinpro.com",
  "vietstock.vn",
  // V3 (19/11/2026): nguồn chính thức của sự kiện cơ cấu thị trường / vĩ mô (trước đây nguồn LSEG bị ẩn liên kết "URL chưa xác thực")
  "lseg.com",
  "ftserussell.com",
  "msci.com",
  "gso.gov.vn",
  "federalreserve.gov",
  "imf.org",
];

export function isTrustedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return TRUSTED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
