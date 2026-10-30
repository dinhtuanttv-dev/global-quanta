process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { classifyRadarEvent, MACRO_RSS_FEEDS, RADAR_CLASSIFIER_VERSION } from "../src/market/news/eventRadar.js";

const kind = (title, extra = {}) => classifyRadarEvent({ title, summary: "", ...extra }).id;
const macro = (title, tickers = []) => kind(title, { feedSection: "macro", tickers });

test("EV-R1: tin doanh nghiệp không còn bị xếp nhầm vào nhóm vĩ mô (tiêu đề thật 29–30/10/2026)", () => {
  assert.equal(kind("Vingroup lãi kỷ lục gần 44 ngàn tỷ đồng sau 9 tháng"), "OTHER"); // cũ: FISCAL_POLICY ("thue" trong tóm tắt)
  assert.equal(kind("Sau 9 tháng, Hòa Phát đạt 23.746 tỷ đồng lợi nhuận sau thuế, vượt 8% kế hoạch năm"), "EARNINGS");
  assert.equal(kind("Tiềm lực doanh nghiệp vừa 'hút' 1.200 tỷ đồng từ kênh trái phiếu, lãi suất 12,5%"), "ISSUANCE"); // cũ: MONETARY_POLICY
  assert.equal(kind("SGN lập đỉnh doanh thu, lợi nhuận, cổ phiếu tăng trần 2 phiên liền"), "EARNINGS"); // cũ: MARKET_STRUCTURE
  assert.equal(kind("VIX: Nghị quyết HĐQT thông qua hạn mức tín dụng tại Techcombank", { tickers: ["VIX"] }), "AGM");
  assert.equal(kind("PPC bị phạt và truy thu thuế hơn 800 triệu"), "OTHER"); // cũ: FISCAL_POLICY
});

test("EV-R1: tin vĩ mô thật vẫn đúng nhóm", () => {
  assert.equal(kind("Chủ tịch UBCKNN Vũ Thị Chân Phương: \"Doanh nghiệp là yếu tố then chốt thu hút dòng vốn mới\""), "MARKET_STRUCTURE");
  assert.equal(kind("Fed giữ nguyên lãi suất: Áp lực nào đối với Việt Nam?"), "MONETARY_POLICY");
  assert.equal(kind("Ngân hàng Nhà nước nói về việc không dùng tiền mặt mua, bán vàng"), "MONETARY_POLICY");
  assert.equal(kind("Xem xét giảm giá điện và giảm thuế tiêu thụ đặc biệt với xăng từ 01/11/2026"), "FISCAL_POLICY");
  assert.equal(kind("Nợ công của Việt Nam đang ở mức khoảng 34% GDP"), "MACRO_DATA");
  assert.equal(kind("CPI tháng 10 tăng 0,2% so với tháng trước"), "MACRO_DATA");
  assert.equal(kind("Thị trường chứng khoán chính thức được FTSE nâng hạng"), "MARKET_STRUCTURE");
  assert.equal(kind("Động đất mạnh làm gián đoạn chuỗi cung ứng"), "SYSTEMIC_STRESS");
});

test("EV-R2: chuyên mục vĩ mô — tin không gắn mã -> Tin kinh tế vĩ mô; có mã / tin doanh nghiệp rõ loại -> giữ loại doanh nghiệp", () => {
  assert.equal(macro("Chuyên gia World Bank: Mô hình cũ không thể giúp Việt Nam 'giàu'"), "MACRO_NEWS");
  assert.equal(macro("Tổng Bí thư, Chủ tịch nước Tô Lâm: TPHCM phải khai thác hiệu quả thẩm quyền"), "MACRO_NEWS"); // không phải nhân sự DN
  assert.equal(macro("Phó Thủ tướng: Sẽ trình Trung ương nghị quyết mới về chính sách tiền lương"), "MACRO_NEWS"); // không phải ĐHĐCĐ
  assert.equal(macro("Techcombank bổ nhiệm thêm nữ Phó Tổng Giám đốc", ["TCB"]), "PERSONNEL");
  assert.equal(macro("TPBank lãi trước thuế gần 7.500 tỷ đồng sau 9 tháng"), "EARNINGS");
  assert.equal(macro("Thủ tướng: Việt Nam quyết tâm đạt tăng trưởng GDP trên 10%"), "MACRO_DATA");
  // Tóm tắt nhắc tên ngân hàng -> bộ ghép mã gắn mã; tin chuyên mục vĩ mô không phải tin doanh nghiệp rõ loại vẫn là vĩ mô.
  assert.equal(macro("Dân giữ 500 tấn vàng, gửi ngân hàng 11,2 triệu tỷ, vốn vẫn không vào sản xuất", ["VCB", "BID"]), "MACRO_NEWS");
  // Nguồn ngoài chuyên mục vĩ mô: tin chung không gắn mã vẫn là tin doanh nghiệp / khác như trước.
  assert.equal(kind("Chuyên gia World Bank: Mô hình cũ không thể giúp Việt Nam 'giàu'"), "OTHER");
});

test("EV-R2: 3 nguồn chuyên mục vĩ mô được cấu hình; phiên bản bộ phân loại có tên", () => {
  assert.equal(MACRO_RSS_FEEDS.length, 3);
  assert.ok(MACRO_RSS_FEEDS.every((f) => f.section === "macro" && /^https:\/\//.test(f.url)));
  assert.equal(RADAR_CLASSIFIER_VERSION, "radar-classify-v2");
});
