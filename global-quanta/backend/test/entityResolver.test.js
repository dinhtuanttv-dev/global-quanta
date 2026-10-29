import test from "node:test";
import assert from "node:assert/strict";
import { buildAliasIndex, coreName, resolveEntities } from "../src/market/news/entityResolver.js";
import { createStockNameIndex, fetchStockNames } from "../src/market/news/stockNames.js";

const STOCKS = [
  { code: "HPG", name: "Công ty Cổ phần Tập đoàn Hòa Phát", short: "Tập đoàn Hòa Phát" },
  { code: "PDR", name: "Công ty Cổ phần Phát triển Bất động sản Phát Đạt", short: "BĐS Phát Đạt" },
  { code: "VCB", name: "Ngân hàng Thương mại Cổ phần Ngoại thương Việt Nam", short: "Vietcombank" },
  { code: "MWG", name: "Công ty Cổ phần Đầu tư Thế Giới Di Động", short: "Thế Giới Di Động" },
  { code: "FPT", name: "Công ty Cổ phần FPT", short: "FPT" },
  { code: "FOX", name: "Công ty Cổ phần Viễn thông FPT", short: "FPT Telecom" },
  { code: "BMI", name: "Tổng Công ty Cổ phần Bảo Minh", short: "Bảo Minh" },
  { code: "BMS", name: "Công ty Cổ phần Chứng khoán Bảo Minh", short: "CK Bảo Minh" },
  { code: "API", name: "Công ty Cổ phần Đầu tư Châu Á - Thái Bình Dương", short: "API" },
  { code: "HCM", name: "Công ty Cổ phần Chứng khoán Thành phố Hồ Chí Minh", short: "HSC" },
  { code: "HVN", name: "Tổng Công ty Hàng không Việt Nam - CTCP", short: "Vietnam Airlines" },
  { code: "ACV", name: "Tổng Công ty Cảng hàng không Việt Nam - CTCP", short: "ACV" },
  { code: "GVR", name: "Tập đoàn Công nghiệp Cao su Việt Nam - CTCP", short: "Cao su Việt Nam" },
];
const IDX = buildAliasIndex(STOCKS);
const codes = (text, idx = IDX) => resolveEntities(text, idx).map((e) => e.code).sort();

test("EV1: lõi tên bỏ tiền tố pháp lý", () => {
  assert.equal(coreName("Công ty Cổ phần Tập đoàn Hòa Phát"), "hòa phát");
  assert.equal(coreName("Tổng Công ty Hàng không Việt Nam - CTCP"), "hàng không việt nam");
});

test("EV1: tên công ty / thương hiệu -> mã; mã đứng riêng vẫn nhận như trước", () => {
  assert.deepEqual(codes("Hòa Phát báo lãi quý III tăng mạnh"), ["HPG"]);
  assert.deepEqual(codes("Vietcombank giảm lãi suất cho vay"), ["VCB"]);
  assert.deepEqual(codes("Thế Giới Di Động mở thêm 50 cửa hàng; FPT ký hợp đồng mới"), ["FPT", "MWG"]);
  const r = resolveEntities("Vietcombank giảm lãi suất", IDX);
  assert.deepEqual(r, [{ code: "VCB", via: "alias", alias: "vietcombank" }]);
});

test("EV1: khớp dài nhất, không chồng lấn — 'Hòa Phát đạt…' không kéo thêm PDR; 'Chứng khoán Bảo Minh' là BMS không phải BMI", () => {
  assert.deepEqual(codes("Hòa Phát đạt sản lượng kỷ lục"), ["HPG"]);
  assert.deepEqual(codes("Phát Đạt khởi công dự án mới"), ["PDR"]);
  assert.deepEqual(codes("Chứng khoán Bảo Minh công bố lợi nhuận"), ["BMS"]);
  assert.deepEqual(codes("Bảo Minh chi trả bồi thường"), ["BMI"]);
});

test("EV1: mã nằm trong tên mã khác không tính riêng ('FPT Telecom' -> FOX)", () => {
  assert.deepEqual(codes("FPT Telecom chia cổ tức tiền mặt"), ["FOX"]);
});

test("EV1: từ dừng, TP.HCM và tên chung chung không gắn nhầm; tiêu đề công bố 'API: …' vẫn nhận", () => {
  assert.deepEqual(codes("Giá API của nhà cung cấp tăng; CEO nói USD mạnh"), []);
  assert.deepEqual(codes("API: Nghị quyết Hội đồng quản trị"), ["API"]);
  assert.deepEqual(codes("Giá nhà tại TP.HCM tăng; Tp HCM mở rộng metro"), []);
  assert.deepEqual(codes("HCM báo lãi quý III"), ["HCM"]);
  // "hàng không việt nam" chỉ gồm từ chung -> bỏ bí danh tự động; ACV cũng không bị kéo vào.
  assert.deepEqual(codes("Ngành hàng không Việt Nam phục hồi"), []);
  // bí danh viết tay vẫn thắng
  assert.deepEqual(codes("Vietnam Airlines mở đường bay mới"), ["HVN"]);
});

test("EV1: dạng sàn 'HOSE: X' và mã thay thế (VRG -> GVR)", () => {
  assert.deepEqual(resolveEntities("Cổ phiếu (HOSE: HPG) tăng trần", IDX), [{ code: "HPG", via: "exchange_tag" }]);
  assert.deepEqual(codes("VRG đẩy mạnh khu công nghiệp"), ["GVR"]);
});

test("EV1: chưa nạp được tên -> vẫn gắn mã + bí danh viết tay theo danh mục mã SSI", () => {
  const idx = buildAliasIndex([], undefined, ["VCB", "FPT", "HPG"]);
  assert.deepEqual(codes("Vietcombank và FPT tăng; Hòa Phát đi ngang; Phát Đạt giảm", idx), ["FPT", "HPG", "VCB"]); // PDR không trong danh mục mã
});

function fakeVnd(rowsByFloor, { fail = false } = {}) {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (fail) return { ok: false, status: 503, json: async () => ({}) };
    const u = new URL(url), floor = /floor:(\w+)/.exec(u.searchParams.get("q"))[1], page = Number(u.searchParams.get("page"));
    const rows = rowsByFloor[floor] ?? [], size = Number(u.searchParams.get("size"));
    return { ok: true, status: 200, json: async () => ({ data: rows.slice((page - 1) * size, page * size) }) };
  };
  return { fetchImpl, calls: () => calls };
}
const row = (code, companyName, shortName) => ({ code, companyName, shortName, type: "STOCK", status: "listed" });

test("EV1: nạp danh mục VNDirect — từng sàn, phân trang tới trang thiếu, bỏ mã không hợp lệ", async () => {
  const hose = Array.from({ length: 7 }, (_, i) => row(`A${String(i).padStart(2, "0")}`, `Công ty Cổ phần Alpha ${i}`, null));
  const { fetchImpl, calls } = fakeVnd({ HOSE: hose, HNX: [row("VC2", "CTCP Xây dựng VINACONEX 2", null), row("BAD1", "x", null)], UPCOM: [] });
  const list = await fetchStockNames({ fetchImpl, pageSize: 3 });
  assert.equal(list.length, 8);
  assert.equal(calls(), 3 + 1 + 1);
});

test("EV1: bộ nạp lưu khoá local:, dùng bản cũ khi VNDirect lỗi, không gọi lại liên tục sau lỗi", async () => {
  const kv = new Map();
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, v); } };
  const L = (n) => String.fromCharCode(65 + n);
  const many = Array.from({ length: 520 }, (_, i) => row(`${L(i % 26)}${L(Math.floor(i / 26))}${i % 10}`, `Công ty Cổ phần Mẫu ${i}`, null));
  many.push(row("VCB", "Ngân hàng TMCP Ngoại thương Việt Nam", "Vietcombank"));
  const ok = fakeVnd({ HOSE: many });
  let t = Date.parse("2026-10-29T03:00:00Z");
  const names = createStockNameIndex({ store, fetchImpl: ok.fetchImpl, now: () => t });
  const idx = await names.index(["VCB"]);
  assert.deepEqual(resolveEntities("Vietcombank tăng vốn", idx).map((e) => e.code), ["VCB"]);
  assert.ok([...kv.keys()].every((k) => k.startsWith("local:")));
  assert.ok(names.meta().names >= 500);

  // Hết hạn 7 ngày + VNDirect lỗi -> giữ bản cũ; lỗi không gọi lại trong 1 giờ.
  const bad = fakeVnd({}, { fail: true });
  t += 8 * 86_400_000;
  const names2 = createStockNameIndex({ store, fetchImpl: bad.fetchImpl, now: () => t });
  const idx2 = await names2.index(["VCB"]);
  assert.deepEqual(resolveEntities("Vietcombank tăng vốn", idx2).map((e) => e.code), ["VCB"]);
  assert.match(names2.meta().lastError, /503/);
  const n = bad.calls();
  t += 60_000;
  await names2.index(["VCB"]);
  assert.equal(bad.calls(), n);
});
