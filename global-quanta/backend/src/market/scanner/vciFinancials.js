// BCTC theo quý từ VCI (iq.vietcap.com.vn) — CHUYỂN NGUYÊN VĂN từ Project A
// (lib/cotuc/vci-financials-adapter.ts, vci-balance-sheet-adapter.ts, commit 9306bc3).
// Mã trường đã được Project A đối chiếu với BCTC công khai:
//   KQKD: isa1 doanh thu thuần, isa22 LNST, isa23 EPS, isa4 giá vốn, isa5 lợi nhuận gộp
//   CĐKT: bsa53 tổng tài sản, bsa54 tổng nợ, bsa78 VCSH, bsa1 TSNH, bsa55 nợ ngắn hạn, bsa67 nợ dài hạn,
//         bsa15 hàng tồn kho ròng, bsa9 phải thu khách hàng (thêm cho SEPA)
// VCI trả HTTP 200 kể cả khi lỗi -> phải kiểm tra `successful`.

const IQ_BASE_URL = "https://iq.vietcap.com.vn/api/iq-insight-service";
// VCI trả 403 nếu thiếu Origin/Referer của trang Vietcap (đo ngày 01/10/2026: không có -> 403, có -> 200).
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  Accept: "application/json",
  Origin: "https://trading.vietcap.com.vn",
  Referer: "https://trading.vietcap.com.vn/",
};

const num = (v) => (v !== null && v !== undefined ? Number(v) : null);
const nz = (v) => (v !== null && v !== undefined && Number(v) !== 0 ? Number(v) : null);

/**
 * Loại BCTC theo mẫu VCI (đối chiếu /financial-statement/metrics ngày 22/10/2026): ngân hàng có isb* (isb38 Tổng thu nhập
 * hoạt động), bảo hiểm có isi* (isi64 Doanh thu thuần HĐKD bảo hiểm), chứng khoán có iss* (iss42 doanh thu môi giới,
 * iss115 lãi FVTPL). Mẫu ngân hàng KHÔNG có doanh thu thuần / lợi nhuận gộp / TSNH / nợ ngắn hạn (isa1, isa5, bsa1, bsa55 = 0).
 */
export function statementKind(row) {
  if (nz(row.isb38) !== null || nz(row.isb27) !== null) return "bank";
  if (nz(row.isi64) !== null || nz(row.isi103) !== null) return "insurance";
  if (nz(row.iss42) !== null || nz(row.iss115) !== null) return "securities";
  return "corporate";
}
const byNewest = (a, b) => (b.year - a.year) || (b.quarter - a.quarter);

async function fetchSection(ticker, section, mapRow, fetchImpl) {
  try {
    const url = `${IQ_BASE_URL}/v1/company/${ticker}/financial-statement?section=${section}&period=quarterly`;
    const res = await fetchImpl(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return { ticker, available: false, quarters: [], error: `VCI HTTP ${res.status}` };
    const json = await res.json();
    if (json?.successful !== true) {
      const reason = json?.exception ?? json?.msg ?? "Không rõ nguyên nhân";
      return { ticker, available: false, quarters: [], error: `VCI báo lỗi: ${String(reason).slice(0, 150)}` };
    }
    const rawRows = Array.isArray(json?.data?.quarters) ? json.data.quarters : [];
    const quarters = rawRows
      .map((row) => {
        const year = Number(row.yearReport);
        const quarter = Number(row.lengthReport);
        if (!year || !quarter || quarter < 1 || quarter > 4) return null;
        return { ticker, year, quarter, periodLabel: `Q${quarter}/${year}`, ...mapRow(row) };
      })
      .filter(Boolean)
      .sort(byNewest);
    if (quarters.length === 0) return { ticker, available: false, quarters: [], error: "VCI trả về thành công nhưng không có dòng quý hợp lệ nào" };
    return { ticker, available: true, quarters };
  } catch (err) {
    return { ticker, available: false, quarters: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export function fetchQuarterlyIncome(ticker, fetchImpl = globalThis.fetch) {
  return fetchSection(ticker, "INCOME_STATEMENT", (row) => ({
    // Doanh thu: isa1 (doanh nghiệp, chứng khoán); ngân hàng = Tổng thu nhập hoạt động (isb38); bảo hiểm = isi64.
    revenue: nz(row.isa1) ?? nz(row.isb38) ?? nz(row.isi64) ?? num(row.isa1 ?? null),
    kind: statementKind(row),
    netProfit: num(row.isa22 ?? null),
    eps: num(row.isa23 ?? null),
    cogs: num(row.isa4 ?? null),
    grossProfit: num(row.isa5 ?? null),
  }), fetchImpl);
}

export function fetchQuarterlyBalance(ticker, fetchImpl = globalThis.fetch) {
  return fetchSection(ticker, "BALANCE_SHEET", (row) => ({
    totalAssets: num(row.bsa53 ?? null),
    totalLiabilities: num(row.bsa54 ?? null),
    totalEquity: num(row.bsa78 ?? null),
    currentAssets: num(row.bsa1 ?? null),
    currentLiabilities: num(row.bsa55 ?? null),
    longTermDebt: num(row.bsa67 ?? null),
    // SEPA (Chương 8 — chất lượng lợi nhuận): đối chiếu metadata VCI /financial-statement/metrics ngày 09/10/2026.
    inventory: num(row.bsa15 ?? null), // Hàng tồn kho, ròng
    receivables: num(row.bsa9 ?? null), // Phải thu khách hàng
  }), fetchImpl);
}
