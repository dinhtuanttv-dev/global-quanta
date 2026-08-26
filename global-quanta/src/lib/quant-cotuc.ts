// ============================================================
// QUANT-COTUC DATA & LOGIC (v2 - da va 2 lo hong: #2 timezone, format ngay)
// Pure TypeScript - khong phu thuoc React, de unit test doc lap
// ============================================================

export type TechnicalTrend = "Bullish" | "Neutral" | "Bearish";
export type MarketCap = "Large" | "Mid" | "Small";
export type TradePhase =
  | "PRE_AGM" | "PREPARATION" | "ACCUMULATION"
  | "RUN_UP" | "DISCOUNT" | "EXPIRED";

export interface DividendStock {
  ticker: string; name: string; sector: string; price: number;
  pe: number; roe: number; dividendYield: number; payoutRatio: number;
  debtEquity: number; growth: number; marketCap: MarketCap; eps: number;
  fscore: number; grossMargin: number; pros: string[]; cons: string[];
  technicalTrend: TechnicalTrend; rsi: number; revenueGrowthQtr: number;
  institutionalHold: number; exDividendDate: string; paymentDate: string;
  dividendAmount: number; catalystScore: number; newsSentiment: string;
  sectorWaveScore: number; agmDate: string; agmAgenda: string;
  insiderStatus: string; macroCatalyst: string;
  globalIndicator: string; globalTrend: string;
}

// ============================================================
// DATA MAU (fallback khi VCI Events API loi - xem vci-events-adapter.ts)
// ============================================================
export const DIVIDEND_STOCKS: DividendStock[] = [
  { ticker:"BMP", name:"Nhựa Bình Minh", sector:"Vật liệu XD", price:115000, pe:9.8, roe:32.1, dividendYield:11.2, payoutRatio:95, debtEquity:0.05, growth:12.3, marketCap:"Large", eps:11734, fscore:8, grossMargin:41.2, pros:["Cổ tức bền bỉ cao vượt trội","Thế độc quyền nhóm","Tài chính gần như không nợ"], cons:["Chi phí hạt nhựa theo giá dầu","BĐS dân dụng phục hồi chậm"], technicalTrend:"Bullish", rsi:62, revenueGrowthQtr:14.5, institutionalHold:55.4, exDividendDate:"12/06/2026", paymentDate:"05/07/2026", dividendAmount:12000, catalystScore:9, newsSentiment:"Strong Positive", sectorWaveScore:7.8, agmDate:"25/04/2026", agmAgenda:"Thông qua chia cổ tức tiền mặt 100% và phương án mua cổ phiếu quỹ", insiderStatus:"Nawaplastic/SCG liên tục gom giữ", macroCatalyst:"Tháo gỡ pháp lý nhà ở dân dụng", globalIndicator:"Giá hạt nhựa PVC", globalTrend:"Giảm mạnh — nới biên LN gộp" },
  { ticker:"FPT", name:"FPT Corporation", sector:"Công nghệ TT", price:135000, pe:18.5, roe:25.4, dividendYield:3.5, payoutRatio:45, debtEquity:0.50, growth:20.1, marketCap:"Large", eps:7297, fscore:7, grossMargin:38.5, pros:["Tăng trưởng 20%/năm ổn định","Vị thế công nghệ số 1","Dòng tiền viễn thông tốt"], cons:["P/E sát đỉnh lịch sử","Áp lực tuyển dụng cao cấp"], technicalTrend:"Bullish", rsi:68, revenueGrowthQtr:22.1, institutionalHold:49.0, exDividendDate:"28/05/2026", paymentDate:"18/06/2026", dividendAmount:3000, catalystScore:8, newsSentiment:"Positive", sectorWaveScore:9.5, agmDate:"04/04/2026", agmAgenda:"Phê chuẩn cổ phiếu thưởng 20% và tạm ứng cổ tức tiền mặt đợt mới", insiderStatus:"Khối ngoại giữ kín room 49%", macroCatalyst:"Chuyển đổi số quốc gia và Data Center", globalIndicator:"Nasdaq / Chi tiêu AI toàn cầu", globalTrend:"Tăng mạnh — làn sóng AI & bán dẫn" },
  { ticker:"VNM", name:"Vinamilk", sector:"Thực phẩm", price:66000, pe:16.2, roe:19.2, dividendYield:5.8, payoutRatio:75, debtEquity:0.15, growth:3.5, marketCap:"Large", eps:4074, fscore:6, grossMargin:40.8, pros:["Thương hiệu sữa số 1 nội địa","Dòng tiền hoạt động mạnh","Cổ tức đều đặn 20 năm"], cons:["Thị trường sữa bão hòa","Cạnh tranh khốc liệt từ ngoại"], technicalTrend:"Neutral", rsi:48, revenueGrowthQtr:4.1, institutionalHold:46.2, exDividendDate:"05/06/2026", paymentDate:"30/06/2026", dividendAmount:3850, catalystScore:7, newsSentiment:"Neutral", sectorWaveScore:5.2, agmDate:"26/04/2026", agmAgenda:"Duy trì tỷ lệ cổ tức cao, trấn an cổ đông ngoại F&N", insiderStatus:"F&N Dairy gom thêm khi giá hấp dẫn", macroCatalyst:"Đẩy mạnh xuất khẩu sang Trung Đông", globalIndicator:"Giá bột sữa GDT", globalTrend:"Đi ngang — kiểm soát chi phí tốt" },
  { ticker:"DPM", name:"Phân bón Phú Mỹ", sector:"Hóa chất", price:34500, pe:8.5, roe:14.5, dividendYield:8.5, payoutRatio:70, debtEquity:0.08, growth:-5.0, marketCap:"Mid", eps:4058, fscore:5, grossMargin:22.4, pros:["Tiền gửi ngân hàng dồi dào","P/B sát giá trị sổ sách","Khấu hao sắp hoàn tất"], cons:["Giá khí đầu vào biến động","Phụ thuộc chu kỳ ure"], technicalTrend:"Bearish", rsi:38, revenueGrowthQtr:-8.4, institutionalHold:24.5, exDividendDate:"20/06/2026", paymentDate:"15/07/2026", dividendAmount:3000, catalystScore:8, newsSentiment:"Positive", sectorWaveScore:6.9, agmDate:"18/04/2026", agmAgenda:"Trình phương án chia cổ tức đặc biệt từ quỹ đầu tư lũy kế nhiều năm", insiderStatus:"PVN ưu tiên thu cổ tức về ngân sách", macroCatalyst:"Luật thuế VAT phân bón sửa đổi", globalIndicator:"Giá Ure thế giới FOB", globalTrend:"Tăng nhẹ — nguồn cung thắt chặt" },
  { ticker:"DCM", name:"Phân bón Cà Mau", sector:"Hóa chất", price:32000, pe:7.9, roe:16.1, dividendYield:9.0, payoutRatio:65, debtEquity:0.04, growth:-2.1, marketCap:"Mid", eps:4050, fscore:7, grossMargin:24.1, pros:["Đã xong khấu hao nhà máy","Nợ vay bằng không","XK Đông Nam Á tiềm năng"], cons:["Rủi ro thời tiết sức mua","Nguồn khí đầu vào hạn chế"], technicalTrend:"Neutral", rsi:45, revenueGrowthQtr:3.2, institutionalHold:18.2, exDividendDate:"25/06/2026", paymentDate:"20/07/2026", dividendAmount:2000, catalystScore:9, newsSentiment:"Strong Positive", sectorWaveScore:8.2, agmDate:"22/04/2026", agmAgenda:"Công bố kế hoạch bùng nổ cổ tức 2026 nhờ khấu hao giảm về mức tối thiểu", insiderStatus:"Ban điều hành mua tích lũy nội bộ", macroCatalyst:"Giá gạo neo cao thúc đẩy nông dân bón phân", globalIndicator:"Giá Ure Á Đông", globalTrend:"Tăng mạnh — gián đoạn cung từ TQ" },
  { ticker:"REE", name:"Cơ Điện Lạnh REE", sector:"Năng lượng", price:61000, pe:11.2, roe:15.2, dividendYield:4.5, payoutRatio:35, debtEquity:0.60, growth:8.5, marketCap:"Mid", eps:5446, fscore:6, grossMargin:28.3, pros:["Tài sản sinh lời phòng thủ","Dòng tiền cho thuê văn phòng cao","Lãnh đạo chiến lược dài hạn"], cons:["Thủy điện nhạy cảm El Nino","Mảng M&E phục hồi chậm"], technicalTrend:"Bullish", rsi:58, revenueGrowthQtr:10.5, institutionalHold:38.1, exDividendDate:"10/07/2026", paymentDate:"05/08/2026", dividendAmount:2500, catalystScore:7, newsSentiment:"Positive", sectorWaveScore:7.5, agmDate:"15/06/2026", agmAgenda:"Cập nhật dự án Etown 6 và kế hoạch cổ tức năm tài chính mới", insiderStatus:"Gia đình bà Mai Thanh và Platinum Victory gia cố sở hữu", macroCatalyst:"Quy hoạch Điện VIII ưu tiên thủy điện", globalIndicator:"Xu thế năng lượng xanh", globalTrend:"Tăng nóng — vốn quốc tế đổ vào xanh" },
  { ticker:"ACB", name:"Ngân hàng Á Châu", sector:"Ngân hàng", price:26000, pe:6.2, roe:24.5, dividendYield:5.0, payoutRatio:25, debtEquity:0.85, growth:16.5, marketCap:"Large", eps:4193, fscore:8, grossMargin:45.0, pros:["Chất lượng tài sản tốt nhất hệ thống","Nợ xấu cực thấp","ROE dẫn đầu ngành"], cons:["Tín dụng bị giới hạn bởi NHNN","Đòn bẩy đặc thù ngân hàng"], technicalTrend:"Bullish", rsi:60, revenueGrowthQtr:15.2, institutionalHold:32.1, exDividendDate:"02/06/2026", paymentDate:"25/06/2026", dividendAmount:1500, catalystScore:9, newsSentiment:"Strong Positive", sectorWaveScore:8.8, agmDate:"03/04/2026", agmAgenda:"Thông qua cổ tức tiền mặt 15% + cổ phiếu thưởng 10% — mức cao kỷ lục", insiderStatus:"Gia đình Chủ tịch Trần Hùng Huy và Dragon Capital đồng thuận", macroCatalyst:"Thông tư gia hạn nợ xấu giúp ACB NPL<1%", globalIndicator:"Basel III / Lãi suất Fed", globalTrend:"Tích cực — hạ lãi suất Fed giải tỏa tỷ giá" },
  { ticker:"GAS", name:"PetroVietnam Gas", sector:"Dầu khí", price:76000, pe:14.8, roe:20.2, dividendYield:6.2, payoutRatio:60, debtEquity:0.18, growth:5.5, marketCap:"Large", eps:5135, fscore:7, grossMargin:18.2, pros:["Độc quyền khí tự nhiên toàn quốc","Tiền mặt tích lũy lớn","Tiềm năng hạ tầng LNG"], cons:["Sản lượng mỏ truyền thống suy giảm","Giá bán khí nhạy cảm dầu"], technicalTrend:"Neutral", rsi:47, revenueGrowthQtr:3.8, institutionalHold:95.7, exDividendDate:"30/06/2026", paymentDate:"25/07/2026", dividendAmount:4500, catalystScore:8, newsSentiment:"Positive", sectorWaveScore:7.2, agmDate:"08/05/2026", agmAgenda:"Phê duyệt cơ chế bán khí LNG mới và kế hoạch cổ tức vững mạnh", insiderStatus:"Nhà nước sở hữu 95% qua PVN", macroCatalyst:"Nâng giá khí LNG cấp Nhơn Trạch 3&4", globalIndicator:"Giá LNG Henry Hub", globalTrend:"Tăng ổn định — năng lượng sạch tăng" },
  { ticker:"DHG", name:"Dược Hậu Giang", sector:"Dược phẩm", price:112000, pe:13.5, roe:22.3, dividendYield:5.5, payoutRatio:60, debtEquity:0.02, growth:8.0, marketCap:"Mid", eps:8296, fscore:7, grossMargin:46.5, pros:["Tài chính an toàn tuyệt đối","Hưởng lợi nhân khẩu già hóa","Japan-GMP hiện đại"], cons:["Cạnh tranh đấu thầu bệnh viện","Nguyên liệu phụ thuộc tỷ giá"], technicalTrend:"Neutral", rsi:50, revenueGrowthQtr:7.5, institutionalHold:52.0, exDividendDate:"14/06/2026", paymentDate:"08/07/2026", dividendAmount:6000, catalystScore:7, newsSentiment:"Neutral", sectorWaveScore:6.0, agmDate:"28/04/2026", agmAgenda:"Taisho cam kết tiếp tục chính sách cổ tức cao đều đặn hàng năm", insiderStatus:"Taisho Pharmaceutical Nhật nắm 51%", macroCatalyst:"Luật Dược sửa đổi nới lỏng đấu thầu Japan-GMP", globalIndicator:"Xu hướng biotech & y tế số", globalTrend:"Tăng đều — dòng tiền y tế phòng thủ cao" },
  { ticker:"SAB", name:"Sabeco", sector:"Thực phẩm", price:78000, pe:19.5, roe:28.1, dividendYield:6.5, payoutRatio:80, debtEquity:0.12, growth:7.5, marketCap:"Large", eps:4000, fscore:7, grossMargin:31.5, pros:["Thương hiệu bia số 1 VN","Cổ tức bền vững và cao","Nợ vay thấp"], cons:["P/E cao so với ngành","Áp lực thuế tiêu thụ đặc biệt"], technicalTrend:"Neutral", rsi:49, revenueGrowthQtr:6.2, institutionalHold:53.6, exDividendDate:"22/07/2026", paymentDate:"17/08/2026", dividendAmount:5000, catalystScore:7, newsSentiment:"Neutral", sectorWaveScore:5.8, agmDate:"24/04/2026", agmAgenda:"Thông qua kế hoạch cổ tức tiền mặt và ứng phó thuế tiêu thụ đặc biệt mới", insiderStatus:"ThaiBev sở hữu 53.6%", macroCatalyst:"Kinh tế phục hồi đẩy tiêu thụ bia về đỉnh lịch sử", globalIndicator:"Giá lúa mạch, gạo nguyên liệu", globalTrend:"Đi ngang — ổn định chi phí nguyên liệu" },
  { ticker:"GMD", name:"Gemadept", sector:"Vận tải biển", price:54000, pe:12.1, roe:17.5, dividendYield:5.2, payoutRatio:50, debtEquity:0.45, growth:19.0, marketCap:"Mid", eps:4463, fscore:7, grossMargin:35.8, pros:["Cảng Gemalink lớn nhất VN","Hưởng lợi dịch chuyển chuỗi cung ứng","Dòng tiền cảng biển phòng thủ"], cons:["Chi phí đầu tư hạ tầng lớn","Cạnh tranh cảng khu vực ĐNA"], technicalTrend:"Bullish", rsi:59, revenueGrowthQtr:21.3, institutionalHold:31.5, exDividendDate:"05/08/2026", paymentDate:"30/08/2026", dividendAmount:2500, catalystScore:9, newsSentiment:"Strong Positive", sectorWaveScore:8.8, agmDate:"14/04/2026", agmAgenda:"Cập nhật hiệu quả Gemalink và đề xuất tăng tỷ lệ cổ tức tiền mặt", insiderStatus:"Gemadept và cổ đông sáng lập gia tăng chi phối", macroCatalyst:"Bộ GTVT nâng khung giá bốc xếp cảng biển 10%", globalIndicator:"Cước container Drewry WCI", globalTrend:"Tăng mạnh — căng thẳng Biển Đỏ lệch cung cầu" },
  { ticker:"MWG", name:"Thế Giới Di Động", sector:"Bán lẻ", price:67000, pe:15.8, roe:18.5, dividendYield:3.8, payoutRatio:48, debtEquity:0.65, growth:22.0, marketCap:"Large", eps:4240, fscore:7, grossMargin:22.3, pros:["Hệ thống bán lẻ số 1 VN","An Khang mở rộng nhanh","Tăng trưởng bứt phá hậu khủng hoảng"], cons:["Biên LN mỏng","Áp lực thương mại điện tử"], technicalTrend:"Bullish", rsi:63, revenueGrowthQtr:24.5, institutionalHold:44.2, exDividendDate:"08/08/2026", paymentDate:"03/09/2026", dividendAmount:2000, catalystScore:8, newsSentiment:"Positive", sectorWaveScore:7.8, agmDate:"17/04/2026", agmAgenda:"Cập nhật kế hoạch mở rộng An Khang và chính sách cổ tức 2026", insiderStatus:"Founder Nguyễn Đức Tài và nhóm sáng lập cam kết chiến lược", macroCatalyst:"Kích cầu tiêu dùng nội địa và giảm thuế TNCN", globalIndicator:"Chỉ số tiêu dùng bán lẻ ĐNA", globalTrend:"Tăng mạnh — sức mua phục hồi toàn khu vực" },
  { ticker:"VCI", name:"Chứng khoán Vietcap", sector:"Chứng khoán", price:38000, pe:10.2, roe:21.5, dividendYield:5.8, payoutRatio:45, debtEquity:0.40, growth:28.0, marketCap:"Mid", eps:3725, fscore:8, grossMargin:55.0, pros:["Tăng trưởng DT 28% bứt phá","Mảng IB và margin cực mạnh","P/B hấp dẫn nhất nhóm CK"], cons:["Nhạy cảm với biến động thanh khoản","Rủi ro margin call"], technicalTrend:"Bullish", rsi:64, revenueGrowthQtr:30.2, institutionalHold:28.0, exDividendDate:"28/07/2026", paymentDate:"22/08/2026", dividendAmount:2200, catalystScore:9, newsSentiment:"Strong Positive", sectorWaveScore:9.2, agmDate:"09/04/2026", agmAgenda:"Trình phương án tăng vốn và chia cổ tức tiền mặt đón đầu nâng hạng thị trường", insiderStatus:"Dragon Capital và VinaCapital tăng tỷ trọng trước nâng hạng", macroCatalyst:"KRX tăng mạnh thanh khoản, mở room margin rộng hơn", globalIndicator:"VN-Index & Dòng vốn ngoại ETF", globalTrend:"Tăng tốt — FTSE Emerging 2026 là xúc tác lịch sử" },
  { ticker:"TCB", name:"Techcombank", sector:"Ngân hàng", price:28500, pe:7.1, roe:19.8, dividendYield:4.5, payoutRatio:28, debtEquity:0.82, growth:18.5, marketCap:"Large", eps:4014, fscore:8, grossMargin:52.0, pros:["Hệ sinh thái số & bancassurance số 1","Nền tảng khách hàng cao cấp","NIM duy trì cao"], cons:["Dự phòng BĐS còn nặng","Room tín dụng hạn chế"], technicalTrend:"Bullish", rsi:57, revenueGrowthQtr:17.5, institutionalHold:22.5, exDividendDate:"15/07/2026", paymentDate:"10/08/2026", dividendAmount:1300, catalystScore:8, newsSentiment:"Positive", sectorWaveScore:8.5, agmDate:"19/04/2026", agmAgenda:"Trình kế hoạch cổ tức tiền mặt lần đầu sau nhiều năm giữ lại LN", insiderStatus:"Hồ Hùng Anh và Warburg Pincus cam kết dài hạn", macroCatalyst:"Gói kích cầu tín dụng BĐS mở khóa tăng trưởng Q3", globalIndicator:"Basel III / Fed Funds Rate", globalTrend:"Giảm dần — hạ lãi suất mở rộng NIM" },
  { ticker:"HPG", name:"Hòa Phát Group", sector:"Thép", price:28000, pe:14.2, roe:12.5, dividendYield:3.0, payoutRatio:30, debtEquity:0.55, growth:15.0, marketCap:"Large", eps:1971, fscore:6, grossMargin:15.6, pros:["Thị phần thép số 1 VN","Chuỗi cung ứng khép kín","Hưởng lợi đầu tư công"], cons:["Thép có tính chu kỳ cao","Nợ vay tăng khi đầu tư DQ2"], technicalTrend:"Bullish", rsi:61, revenueGrowthQtr:18.2, institutionalHold:35.6, exDividendDate:"15/06/2026", paymentDate:"10/07/2026", dividendAmount:1000, catalystScore:8, newsSentiment:"Positive", sectorWaveScore:8.5, agmDate:"11/04/2026", agmAgenda:"Cập nhật tiến độ Dung Quất 2 và kế hoạch tăng cổ tức tiền mặt từ năm sau", insiderStatus:"Chủ tịch Trần Đình Long khẳng định chu kỳ tăng mới", macroCatalyst:"Đường sắt cao tốc Bắc-Nam và Long Thành", globalIndicator:"Giá Thép HRC / Quặng sắt", globalTrend:"Phục hồi ổn định — lực cầu hạ tầng" },
  { ticker:"NLG", name:"Nam Long Group", sector:"Bất động sản", price:42000, pe:11.5, roe:11.8, dividendYield:3.5, payoutRatio:35, debtEquity:0.70, growth:35.0, marketCap:"Mid", eps:3652, fscore:6, grossMargin:28.5, pros:["Quỹ đất sạch lớn nhất affordable","Tốc độ bàn giao tăng bứt phá","Kiểm toán Big4 minh bạch"], cons:["Dòng tiền phụ thuộc tiến độ bàn giao","BĐS phục hồi chưa đồng đều"], technicalTrend:"Bullish", rsi:61, revenueGrowthQtr:38.5, institutionalHold:42.1, exDividendDate:"12/09/2026", paymentDate:"07/10/2026", dividendAmount:1500, catalystScore:8, newsSentiment:"Positive", sectorWaveScore:7.5, agmDate:"30/04/2026", agmAgenda:"Thông qua kế hoạch bàn giao 2026 và tỷ lệ cổ tức bằng cổ phiếu", insiderStatus:"IFC World Bank duy trì cổ phần chiến lược", macroCatalyst:"Luật Kinh doanh BĐS & Luật Đất đai giải phóng dự án", globalIndicator:"Lãi suất cho vay mua nhà VN", globalTrend:"Giảm dần — lãi suất hạ kích thích cầu BĐS" },
  { ticker:"VCB", name:"Vietcombank", sector:"Ngân hàng", price:61400, pe:12.8, roe:20.2, dividendYield:3.2, payoutRatio:20, debtEquity:0.90, growth:13.1, marketCap:"Large", eps:4797, fscore:8, grossMargin:48.0, pros:["Ngân hàng quốc doanh lớn nhất","Chất lượng tài sản tốt nhất hệ thống","Dòng tiền ngoại tệ mạnh"], cons:["Room ngoại 0.4% — khó mua thêm","Cổ tức thấp do giữ lại vốn"], technicalTrend:"Neutral", rsi:50, revenueGrowthQtr:12.0, institutionalHold:74.8, exDividendDate:"20/07/2026", paymentDate:"15/08/2026", dividendAmount:2000, catalystScore:7, newsSentiment:"Positive", sectorWaveScore:7.2, agmDate:"26/04/2026", agmAgenda:"Trình phương án tăng tỷ lệ cổ tức tiền mặt sau khi được NHNN phê duyệt", insiderStatus:"Nhà nước sở hữu 74.8%", macroCatalyst:"Tăng vốn Tier 1 từ kế hoạch phát hành cổ phần mới", globalIndicator:"Lãi suất USD & DXY", globalTrend:"Tích cực — hạ lãi suất USD giảm áp tỷ giá" },
];

// ============================================================
// PURE FUNCTIONS (v2 - da va lo hong #2)
// ============================================================

/**
 * VA LO HONG #2: Truoc day dung `new Date()` (local timezone cua may
 * nguoi dung) va `split("/")` khong validate -> user o mui gio khac VN
 * tinh sai so ngay, format ngay sai se tra ve Invalid Date am tham.
 * Ban va: dung UTC nhat quan (khong phu thuoc timezone trinh duyet) +
 * validate chat che truoc khi tao Date, tra ve null RO RANG khi invalid
 * thay vi de NaN am tham lan trong logic sau.
 */
export function getDaysUntil(dateStr: string, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;

  const [ddStr, mmStr, yyyyStr] = parts;
  const dd = Number(ddStr), mm = Number(mmStr), yyyy = Number(yyyyStr);

  // Validate chat: khong chi check isNaN ma con check khoang gia tri hop ly
  if (!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yyyy)) return null;
  if (dd < 1 || dd > 31 || mm < 1 || mm > 12 || yyyy < 2000 || yyyy > 2100) return null;

  // Dung Date.UTC() thay vi `new Date(y,m,d)` de KHONG phu thuoc timezone
  // trinh duyet cua nguoi dung - moi nguoi tren the gioi tinh ra CUNG 1 ket qua.
  const targetUTC = Date.UTC(yyyy, mm - 1, dd);
  const target = new Date(targetUTC);

  // Kiem tra ngay co that su hop le khong (vd 31/02 se bi JS "lam tron"
  // thanh 02/03 - phai bat truong hop nay ro rang thay vi tra ve sai lech)
  if (target.getUTCDate() !== dd || target.getUTCMonth() !== mm - 1 || target.getUTCFullYear() !== yyyy) {
    return null; // Ngay khong ton tai that (vd 31/02/2026)
  }

  const nowUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((targetUTC - nowUTC) / 86400000);
}

export function getTradePhase(s: DividendStock): {
  status: TradePhase; label: string; color: string; icon: string; action: string; desc: string; safety: string;
} {
  const agmDays = getDaysUntil(s.agmDate);
  if (agmDays !== null && agmDays >= 0 && agmDays <= 14)
    return { status:"PRE_AGM", label:"Trước ĐHCĐ", color:"bg-purple-950 text-purple-300 border-purple-800", icon:"📋", action:"Theo dõi ĐHCĐ", desc:"Họp ĐHCĐ sắp diễn ra — thường biến động ±5–10%.", safety:"Theo dõi sát (6/10)" };
  const gdkhqDays = getDaysUntil(s.exDividendDate);
  if (gdkhqDays === null || gdkhqDays < 0)
    return { status:"EXPIRED", label:"Đã chốt quyền", color:"bg-slate-800 text-slate-500 border-slate-700", icon:"✔", action:"Đã an bài", desc:"Cổ phiếu đã qua GDKHQ. Chờ đợt tiếp theo.", safety:"Không áp dụng" };
  if (gdkhqDays > 35)
    return { status:"PREPARATION", label:"Tích lũy sớm", color:"bg-blue-950 text-blue-400 border-blue-800", icon:"⏳", action:"Mua gom dần", desc:"Thị trường chưa chú ý nhiều. Tích lũy giá tốt.", safety:"An toàn (9/10)" };
  if (s.rsi >= 60 && s.technicalTrend === "Bullish")
    return { status:"RUN_UP", label:"Tăng nóng", color:"bg-rose-950 text-rose-400 border-rose-800", icon:"🔥", action:"Tránh mua đuổi", desc:"Tăng nóng trước chốt quyền — rủi ro Sell on News.", safety:"Rủi ro cao (3/10)" };
  if (s.rsi <= 42 && s.technicalTrend === "Bearish")
    return { status:"DISCOUNT", label:"Chiết khấu sâu", color:"bg-emerald-950 text-emerald-400 border-emerald-800", icon:"🎁", action:"Gom mua đậm", desc:"RSI quá bán sát ngày chia — cơ hội giá hời.", safety:"Cơ hội (8/10)" };
  return { status:"ACCUMULATION", label:"Tích Lũy", color:"bg-amber-950 text-amber-400 border-amber-800", icon:"💎", action:"Mua tích lũy", desc:"Nền giá ổn định RSI 43–59. Biên an toàn đủ giải ngân.", safety:"Khuyến nghị (7/10)" };
}

export function calcDividendScore(s: DividendStock): number {
  let score = 0;
  score += Math.min(20, (s.dividendYield / 15) * 20);
  score += Math.min(20, (s.roe / 40) * 20);
  score += Math.min(20, Math.max(0, ((s.growth + 5) / 30) * 20));
  score += Math.max(0, (1 - Math.min(1, s.debtEquity)) * 20);
  score += (s.fscore / 9) * 20;
  return Math.min(100, Math.round(score));
}

export function calcCatalystScore(s: DividendStock): number {
  let sc = s.catalystScore || 5;
  if (s.technicalTrend === "Bullish") sc += 1.5;
  if (s.rsi >= 45 && s.rsi <= 62) sc += 1;
  const days = getDaysUntil(s.exDividendDate);
  if (days !== null && days >= 15 && days <= 35) sc += 2;
  else if (days !== null && days > 0 && days < 15) sc -= 1;
  if ((s.sectorWaveScore || 0) >= 7.5) sc += 1;
  const agmDays = getDaysUntil(s.agmDate);
  if (agmDays !== null && agmDays >= 0 && agmDays <= 14) sc += 1.5;
  return Math.min(10, Math.max(1, parseFloat(sc.toFixed(1))));
}

export function detectRiskFlags(s: DividendStock): string[] {
  const flags: string[] = [];
  if (s.debtEquity > 0.8 && s.sector !== "Ngân hàng") flags.push("Đòn bẩy nợ cao (>0.8x)");
  if (s.payoutRatio > 85 && s.growth < 5) flags.push("Cổ tức quá cao so tăng trưởng");
  if (s.growth < 0) flags.push("Tăng trưởng lợi nhuận âm");
  if (s.pe > 18) flags.push("P/E cao hơn trung bình (>18x)");
  if (s.rsi > 70) flags.push("RSI quá mua (>70)");
  return flags;
}

/** LUU Y (vas lo hong #4): dung EPS lam proxy FCF - KHONG chinh xac
 * bang DCF chuan (Free Cash Flow that). UI phai canh bao ro dieu nay
 * (xem StockModal.tsx tab DCF - da them banner canh bao). */
export function calcDCF(s: DividendStock, scenario: "bear" | "base" | "bull"): number {
  const gMap = { bear: s.growth * 0.4, base: s.growth, bull: s.growth * 1.6 };
  const g = Math.max(-5, gMap[scenario]) / 100;
  const dr = 0.10, tg = 0.03;
  let fcf = s.eps, pv = 0;
  for (let y = 1; y <= 10; y++) { fcf *= (1 + g); pv += fcf / Math.pow(1 + dr, y); }
  return Math.round(pv + (fcf * (1 + tg) / (dr - tg)) / Math.pow(1 + dr, 10));
}

export interface DividendFilter {
  minYield: number; minRoe: number; maxPe: number; maxDebt: number; minFscore: number;
  trend: "All" | TechnicalTrend; phase: "All" | TradePhase;
  upcomingGDKHQ: boolean; upcomingAGM: boolean; hideRiskFlags: boolean; searchQ: string;
}

export const DEFAULT_FILTER: DividendFilter = {
  minYield:0, minRoe:0, maxPe:25, maxDebt:1.5, minFscore:0,
  trend:"All", phase:"All", upcomingGDKHQ:false, upcomingAGM:false,
  hideRiskFlags:false, searchQ:"",
};

export function filterAndSortStocks(
  stocks: DividendStock[], filter: DividendFilter,
  sortField: keyof DividendStock | "score" | "catalyst",
  sortAsc: boolean,
  realRsMap?: Record<string, number | null>
): DividendStock[] {
  const q = filter.searchQ.toLowerCase();
  return stocks
    .filter((s) => {
      if (q && !s.ticker.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      if (s.dividendYield < filter.minYield) return false;
      if (s.roe < filter.minRoe) return false;
      if (s.pe > filter.maxPe) return false;
      if (s.debtEquity > filter.maxDebt) return false;
      if (s.fscore < filter.minFscore) return false;
      if (filter.trend !== "All" && s.technicalTrend !== filter.trend) return false;
      if (filter.phase !== "All" && getTradePhase(s).status !== filter.phase) return false;
      const gdkhqDays = getDaysUntil(s.exDividendDate);
      if (filter.upcomingGDKHQ && !(gdkhqDays !== null && gdkhqDays >= 0 && gdkhqDays <= 45)) return false;
      const agmDays = getDaysUntil(s.agmDate);
      if (filter.upcomingAGM && !(agmDays !== null && agmDays >= 0 && agmDays <= 30)) return false;
      if (filter.hideRiskFlags && detectRiskFlags(s).length > 2) return false;
      return true;
    })
    .sort((a, b) => {
      let va: number, vb: number;
      if (sortField === "score") { va = calcDividendScore(a); vb = calcDividendScore(b); }
      else if (sortField === "catalyst") { va = calcCatalystScore(a); vb = calcCatalystScore(b); }
      else {
        const rawA = a[sortField as keyof DividendStock];
        const rawB = b[sortField as keyof DividendStock];
        va = typeof rawA === "number" ? rawA : 0;
        vb = typeof rawB === "number" ? rawB : 0;
      }
      return sortAsc ? va - vb : vb - va;
    });
}

export function fmtVND(v: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(v);
}
export const fmtPct = (v: number): string => v.toFixed(1) + "%";
