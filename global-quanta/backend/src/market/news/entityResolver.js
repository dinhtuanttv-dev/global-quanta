// EV1 (29/10/2026) — gắn MÃ cho tin tức / sự kiện: ngoài mã 3 ký tự viết hoa (như trước), nhận cả TÊN CÔNG TY, tên ngắn và THƯƠNG HIỆU.
//   1. Mã: "HOSE: PVT" (chắc chắn) + mã 3 ký tự đứng riêng có trong danh mục (trừ từ dừng) — giữ nguyên hành vi cũ.
//   2. Bí danh viết tay (thương hiệu / tên gọi phổ biến của các mã lớn — Vietcombank -> VCB, Điện Máy Xanh -> MWG…), CHỐT 29/10/2026 từ hiểu
//      biết chung, không chỉnh theo lỗi của bộ đánh giá.
//   3. Bí danh tự động từ tên công ty VNDirect (bỏ "Công ty Cổ phần", "Tập đoàn", "Ngân hàng TMCP"…), chỉ nhận khi ≥ 2 từ, ≥ 6 ký tự và
//      KHÔNG trùng giữa hai mã.
// So khớp trên chữ thường NFC GIỮ DẤU, theo ranh giới từ; ưu tiên bí danh DÀI nhất và không chồng lấn ("Nông nghiệp Hòa Phát" -> HPA,
// không kéo thêm HPG). Hàm thuần; danh mục tên nạp từ VNDirect /v4/stocks (đã niêm yết).

/** Bí danh viết tay: mã -> tên gọi (chữ thường, có dấu). */
export const CURATED_ALIASES = Object.freeze({
  VCB: ["vietcombank"], BID: ["bidv"], CTG: ["vietinbank"], TCB: ["techcombank"], MBB: ["mbbank", "ngân hàng quân đội", "ngân hàng mb"], ACB: ["ngân hàng á châu"],
  VPB: ["vpbank"], HDB: ["hdbank"], STB: ["sacombank"], SHB: ["ngân hàng sài gòn - hà nội"], TPB: ["tpbank"], VIB: ["ngân hàng quốc tế việt nam"], MSB: ["ngân hàng hàng hải"],
  LPB: ["lpbank", "lộc phát việt nam"], OCB: ["ngân hàng phương đông"], EIB: ["eximbank"], SSB: ["seabank"], NAB: ["nam a bank"], VAB: ["vietabank"], BVB: ["bvbank"], NVB: ["ncb"], KLB: ["kienlongbank"], BAB: ["bac a bank"], ABB: ["abbank"], SGB: ["saigonbank"], PGB: ["pgbank"], VBB: ["vietbank"],
  MWG: ["thế giới di động", "điện máy xanh", "bách hóa xanh", "bách hoá xanh"], FRT: ["fpt retail", "long châu"], DGW: ["digiworld", "thế giới số"], PNJ: ["phú nhuận"],
  VNM: ["vinamilk"], MSN: ["masan group", "tập đoàn masan"], MCH: ["masan consumer"], MSR: ["masan high-tech materials"], SAB: ["sabeco"], BHN: ["habeco"], KDC: ["kido"], QNS: ["đường quảng ngãi"],
  VIC: ["vingroup"], VHM: ["vinhomes"], VRE: ["vincom retail"], VPL: ["vinpearl"], NVL: ["novaland"], DXG: ["đất xanh"], PDR: ["phát đạt"], KDH: ["khang điền"], NLG: ["nam long"], KBC: ["kinh bắc"], IDC: ["idico"],
  BCM: ["becamex idc", "becamex"], SZC: ["sonadezi châu đức"], AGG: ["an gia"], DIG: ["dic corp"], CEO: ["c.e.o group"], HDG: ["hà đô"], HDC: ["hodeco"], DXS: ["đất xanh services"],
  HPG: ["hòa phát", "hoà phát"], HPA: ["nông nghiệp hòa phát", "nông nghiệp hoà phát"], HSG: ["hoa sen group", "tập đoàn hoa sen"], NKG: ["thép nam kim"], TLH: ["thép tiến lên"],
  GAS: ["pv gas"], PLX: ["petrolimex"], POW: ["pv power"], BSR: ["lọc hóa dầu bình sơn", "lọc hoá dầu bình sơn"], PVS: ["ptsc"], PVD: ["pv drilling"], PVT: ["pvtrans"], OIL: ["pv oil"],
  GVR: ["tập đoàn công nghiệp cao su", "vrg"], DPM: ["đạm phú mỹ"], DCM: ["đạm cà mau"], DGC: ["hóa chất đức giang", "hoá chất đức giang"], DHB: ["đạm hà bắc"],
  VJC: ["vietjet"], HVN: ["vietnam airlines"], ACV: ["cảng hàng không việt nam"], GMD: ["gemadept"], MVN: ["vimc"], VSC: ["viconship"],
  FPT: ["tập đoàn fpt"], FOX: ["fpt telecom"], CTR: ["công trình viettel", "viettel construction"], VGI: ["viettel global"], VTP: ["viettel post"], CMG: ["tập đoàn công nghệ cmc"],
  SSI: ["chứng khoán ssi"], VND: ["vndirect"], VCI: ["vietcap"], HCM: ["chứng khoán hsc"], SHS: ["chứng khoán sài gòn - hà nội"], VPX: ["vpbanks"], DSC: ["chứng khoán dsc"],
  GEX: ["gelex"], GEE: ["gelex electric", "điện lực gelex"], GEL: ["hạ tầng gelex", "gelex infrastructure"], REE: ["cơ điện lạnh"], PC1: ["tập đoàn pc1"],
  VEA: ["veam"], HUT: ["tasco"], VGC: ["viglacera"], DRC: ["cao su đà nẵng"], TCH: ["tài chính hoàng huy"], HHS: ["hoàng huy"], VHC: ["vĩnh hoàn"], ANV: ["nam việt"], DBC: ["dabaco"],
  BMP: ["nhựa bình minh"], AAA: ["an phát xanh"], DHG: ["dược hậu giang"], IMP: ["imexpharm"], BVH: ["bảo việt"], BIC: ["bảo hiểm bidv"], PGI: ["bảo hiểm petrolimex"], BMI: ["bảo minh"], BMS: ["chứng khoán bảo minh"],
  LHG: ["long hậu"], NTL: ["lideco"], KOS: ["kosy"], STK: ["sợi thế kỷ"], TNG: ["đầu tư và thương mại tng"], VNR: ["vinare"], PVI: ["pvi"], SLS: ["mía đường sơn la"], DBT: ["dược phẩm bến tre"],
  F88: ["f88"], NTC: ["nam tân uyên"], LIX: ["lixco"], NET: ["netco"], IDP: ["sữa quốc tế"], HNA: ["thủy điện hủa na", "thuỷ điện hủa na"], VSH: ["vĩnh sơn - sông hinh", "vĩnh sơn sông hinh"],
  TBC: ["thủy điện thác bà", "thuỷ điện thác bà"], DVP: ["cảng đình vũ"], SCL: ["sông đà cao cường"], WCS: ["bến xe miền tây"], VC7: ["tập đoàn bgi", "bgi group"], HVX: ["vicem hải vân"],
  PAN: ["pan group", "tập đoàn pan"], DPG: ["đạt phương"], TV2: ["pecc2"], BWE: ["nước - môi trường bình dương", "biwase"], TDS: ["thép thủ đức"], PAP: ["cảng phước an"], CMS: ["cmh group"],
});

// Từ viết tắt / tiền tệ / chỉ báo kỹ thuật trùng mã chứng khoán — không coi là mã khi đứng riêng.
const STOP = new Set(["CEO", "CFO", "CTO", "COO", "USD", "VND", "EUR", "JPY", "CNY", "KRW", "SGD", "THB", "GDP", "CPI", "PMI", "FDI", "ODA", "ETF", "IPO", "ESG", "VAT", "BOT", "BCC", "EPC", "LNG",
  "THE", "AND", "FOR", "NHNN", "UBCK", "HNX", "HSX", "ATM", "API", "SMA", "EMA", "RSI", "ADX", "NAV", "EPS", "ROE", "ROA", "CNC", "MCP", "KCN", "BĐS", "GPS", "SUV", "USB", "VIP", "MBA", "PHD", "SOS"]);
/** Mã viết tắt mà báo chí dùng cho một mã KHÁC (VRG = Tập đoàn Cao su VN -> GVR, không phải mã VRG). */
export const CODE_OVERRIDES = Object.freeze({ VRG: "GVR" });
/** Từ thông dụng: bí danh TỰ ĐỘNG chỉ gồm các từ này bị bỏ ("hàng không việt nam", "hợp nhất", "quốc dân", "tiên phong"…). */
const GENERIC = new Set(("việt nam á âu quốc tế đông tây nam bắc trung miền hà nội sài gòn thành phố hồ chí minh hợp nhất thống thiết bị tiên phong quốc dân quân đội "
  + "thương mại dầu khí đầu tư phát triển xây dựng công nghiệp nông lâm thủy hải sản dịch vụ du lịch vận tải hàng không sông biển cảng kho bãi bất động sản tài chính "
  + "chứng khoán bảo hiểm ngân hàng điện nước môi trường năng lượng khoáng than thép nhựa giấy may dệt sợi thực phẩm đồ uống dược y tế giáo dục công nghệ thông tin "
  + "viễn tổng hợp liên doanh sản xuất kinh doanh xuất nhập khẩu tập đoàn công ty cổ phần một thành viên mtv số hạ tầng đô thị khu nhà ở và của các cho với an phú thịnh "
  + "hưng phát đạt thành lợi tài vàng xanh mới đại toàn cầu kỹ thuật cơ khí lắp máy thiết kế tư vấn điện lực mạng truyền thông").split(" "));
const LETTER = "a-zà-ỹđ0-9";
export const norm = (s) => String(s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

const PREFIX = [/^ngân hàng thương mại cổ phần\s+/, /^ngân hàng tmcp\s+/, /^tổng công ty cổ phần\s+/, /^tổng ctcp\s+/, /^tổng công ty\s+/, /^công ty cổ phần\s+/,
  /^ctcp\s+/, /^tct\s+/, /^tập đoàn\s+/, /^công ty\s+/];
/** Lõi tên công ty (bỏ tiền tố pháp lý). */
export function coreName(name) {
  let s = norm(name).replace(/\s*[-–]\s*ctcp$/, "");
  for (let k = 0; k < 3; k++) for (const p of PREFIX) s = s.replace(p, "");
  return s.trim();
}

/**
 * Dựng bảng bí danh từ danh mục [{code, name, short}] + bí danh viết tay. Bí danh tự động trùng giữa hai mã bị bỏ.
 * `extraCodes`: mã niêm yết khác (danh mục SSI của Gateway) — vẫn gắn được mã / bí danh viết tay khi chưa nạp được tên.
 */
export function buildAliasIndex(stocks, curated = CURATED_ALIASES, extraCodes = []) {
  const codes = new Set([...stocks.map((s) => s.code), ...extraCodes]);
  const owner = new Map(), ambiguous = new Set();
  const addAuto = (alias, code) => {
    if (alias.length < 6 || alias.split(" ").length < 2) return;
    if (alias.split(" ").every((w) => GENERIC.has(w))) return; // tên chung chung -> dễ khớp nhầm
    if (owner.has(alias) && owner.get(alias) !== code) ambiguous.add(alias); else owner.set(alias, code);
  };
  for (const s of stocks) {
    addAuto(coreName(s.name), s.code);
    if (s.short && !/[.]/.test(s.short)) {
      const sh = coreName(s.short);
      addAuto(sh, s.code);
      // tên ngắn VNDirect viết tắt "CK" / "NH" / "BH" -> dạng báo chí dùng ("CK Bảo Minh" -> "chứng khoán bảo minh")
      const ex = sh.replace(/^ck\s/, "chứng khoán ").replace(/^nh\s/, "ngân hàng ").replace(/^bh\s/, "bảo hiểm ");
      if (ex !== sh) addAuto(ex, s.code);
    }
  }
  for (const a of ambiguous) owner.delete(a);
  for (const [code, list] of Object.entries(curated)) if (codes.has(code)) for (const a of list) owner.set(norm(a), code); // viết tay thắng
  const aliases = [...owner.entries()].sort((a, b) => b[0].length - a[0].length)
    .map(([alias, code]) => [alias, code, new RegExp(`(?<![${LETTER}])${escapeRe(alias)}(?![${LETTER}])`, "g")]);
  return { codes, aliases };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Mã trong văn bản: [{code, via: "disclosure_title"|"exchange_tag"|"code"|"alias", alias?}] (không trùng mã). */
export function resolveEntities(text, index) {
  const raw = String(text ?? "");
  const found = new Map();
  const put = (code, v) => { if (index.codes.has(code) && !found.has(code)) found.set(code, v); };
  // 1. Bí danh: tìm MỌI vị trí khớp, chọn dài nhất rồi sớm nhất, không chồng lấn ("Hòa Phát đạt…" -> HPG, không PDR).
  const t = ` ${norm(raw)} `;
  const hits = [];
  for (const [alias, code, re] of index.aliases) {
    if (!t.includes(alias)) continue;
    for (const m of t.matchAll(re)) hits.push({ start: m.index, end: m.index + alias.length, alias, code });
  }
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const taken = [];
  for (const h of hits) {
    if (taken.some((x) => h.start < x.end && x.start < h.end)) continue;
    taken.push(h);
  }
  // Mã nằm TRONG cụm tên của mã khác ("FPT Telecom" -> FOX, "Becamex IDC" -> BCM) không tính riêng.
  const insideAlias = new Set(taken.flatMap((h) => (t.slice(h.start, h.end).match(/[a-z0-9]{3}/g) ?? []).map((w) => w.toUpperCase()).filter((w) => w !== h.code)));
  // 2a. Tiêu đề công bố thông tin dạng "API: Nghị quyết HĐQT" — chắc chắn, kể cả mã trùng từ dừng (API, CNC…).
  const head = /^\s*([A-Z][A-Z0-9]{2})\s*:/.exec(raw);
  if (head) put(CODE_OVERRIDES[head[1]] ?? head[1], { code: CODE_OVERRIDES[head[1]] ?? head[1], via: "disclosure_title" });
  // 2b. "HOSE: PVT" — chắc chắn.
  for (const m of raw.matchAll(/\b(?:HOSE|HSX|HNX|UPCOM|UPCoM)\s*[:：]\s*([A-Z][A-Z0-9]{2})\b/g)) put(CODE_OVERRIDES[m[1]] ?? m[1], { code: CODE_OVERRIDES[m[1]] ?? m[1], via: "exchange_tag" });
  // 3. Mã đứng riêng (trừ từ dừng, "TP.HCM", mã nằm trong tên mã khác).
  for (const m of raw.matchAll(/(?<![A-Za-z0-9À-ỹ])([A-Z][A-Z0-9]{2})(?![A-Za-z0-9À-ỹ])/g)) {
    const c = m[1];
    if (STOP.has(c) || insideAlias.has(c)) continue;
    if (c === "HCM" && /(?:TP\.?\s?|Tp\.?\s?|thành phố\s)$/i.test(raw.slice(Math.max(0, m.index - 12), m.index))) continue;
    const code = CODE_OVERRIDES[c] ?? c;
    put(code, { code, via: "code" });
  }
  for (const h of taken.sort((a, b) => a.start - b.start)) put(h.code, { code: h.code, via: "alias", alias: h.alias });
  return [...found.values()];
}
