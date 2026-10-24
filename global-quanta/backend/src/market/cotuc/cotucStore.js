// B2 (25/10/2026) — KHO CỔ TỨC trên Gateway (Railway Volume), thay CSDL Neon của Project A cho các bảng của tab Cổ tức.
// Lý do: Neon gói miễn phí tính hạn mức theo thời gian máy thức; các lượt quét giữ Neon thức -> hết hạn mức (53000) -> cả
// "⏱ Timeline điểm mua" (tab Cổ tức) lẫn "Điểm mua 10 phiên tới" (Radar, Elite 10) cùng sập. Neon chỉ là nơi LƯU: đầu vào
// đến từ SSI / VNDirect / Gateway và mọi thống kê do engine của Project A tính — nên chuyển chỗ lưu không đổi công thức.
//
// Mô hình bảng (giữ đúng tên cột Prisma để Project A đổi chỗ đọc/ghi mà không đổi logic):
//   decision  CotucDecisionState       khoá ticker
//   timing    TimingSignalCache        khoá ticker
//   season    EarningsSeasonalityCache khoá ticker — cột NẶNG (samples, paths, announceDates) để riêng từng mã trên đĩa
//   track     CotucSignalTrack         khoá id
//   cycle     DividendCycleWindow      khoá ticker:exDate
//   meta      dữ liệu phụ (VD danh mục + ngành dùng cho Timeline)  khoá key
// Ghi = gộp theo CỘT (giống Prisma upsert/update: cột không gửi giữ nguyên). Phần nhẹ của mọi bảng ở trong RAM (vài MB) và
// lưu một tài liệu / bảng; phần nặng đọc lười theo mã. Mọi khoá `local:` -> chỉ nằm trên Railway Volume, không sao sang Supabase.

export const COTUC_TABLES = Object.freeze({
  decision: { key: (r) => r.ticker, heavy: [] },
  timing: { key: (r) => r.ticker, heavy: [] },
  season: { key: (r) => r.ticker, heavy: ["samples", "paths", "announceDates"] },
  track: { key: (r) => r.id, heavy: [] },
  cycle: { key: (r) => (r.ticker && r.exDate ? `${r.ticker}:${String(r.exDate).slice(0, 10)}` : null), heavy: [] },
  meta: { key: (r) => r.key, heavy: [] },
});

const KEY_RE = /^[A-Za-z0-9_:.\-]{1,120}$/;
const lightKv = (table) => `local:cotuc:t:${table}`;
const heavyKv = (table, key) => `local:cotuc:h:${table}:${key}`;

/** Lấy giá trị theo đường dẫn chấm ("snapshot.decision.level"); thiếu -> undefined. */
function getPath(obj, path) {
  let cur = obj;
  for (const p of path.split(".")) { if (cur == null || typeof cur !== "object") return undefined; cur = cur[p]; }
  return cur;
}
function setPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) { cur[parts[i]] ??= {}; cur = cur[parts[i]]; }
  cur[parts.at(-1)] = value;
}

/** Chiếu một dòng theo danh sách trường (đường dẫn chấm). Nhánh vắng -> không có khoá (nơi dùng đọc qua ?. / ??). */
export function projectRow(row, fields) {
  if (!fields?.length) return row;
  const out = {};
  for (const f of fields) { const v = getPath(row, f); if (v !== undefined) setPath(out, f, v); }
  return out;
}

export function createCotucStore({ store, now = Date.now, log = console } = {}) {
  const tables = new Map(); // table -> { rows: Map(key -> lightRow), updatedAt, bytes }
  const loading = new Map();
  let chain = Promise.resolve(); // ghi tuần tự: không có hai lượt ghi cùng một tài liệu chồng nhau
  const stats = { reads: 0, writes: 0, rowsWritten: 0, lastWriteAt: null, lastError: null };

  async function table(name) {
    if (tables.has(name)) return tables.get(name);
    if (!loading.has(name)) {
      loading.set(name, (async () => {
        let doc = null;
        try { doc = (await store.getKv(lightKv(name)))?.value ?? null; } catch (e) { stats.lastError = `đọc ${name}: ${e.message}`; }
        const t = { rows: new Map(Object.entries(doc?.rows ?? {})), updatedAt: doc?.updatedAt ?? null, bytes: doc ? JSON.stringify(doc.rows ?? {}).length : 0 };
        tables.set(name, t);
        return t;
      })());
    }
    return loading.get(name);
  }

  function check(name) {
    if (!Object.hasOwn(COTUC_TABLES, name)) { const e = new Error(`Bảng không hợp lệ: ${name}`); e.status = 400; throw e; }
    return COTUC_TABLES[name];
  }

  return {
    /**
     * Đọc bảng. `keys` = lọc theo khoá chính; `tickers` = lọc theo cột ticker; `fields` = đường dẫn chấm cần lấy
     * (có cột nặng -> đọc thêm phần nặng của từng dòng). Trả dòng theo thứ tự khoá tăng dần (ổn định).
     */
    async list(name, { keys = null, tickers = null, fields = null } = {}) {
      const spec = check(name);
      const t = await table(name);
      stats.reads++;
      const want = keys ? new Set(keys) : null;
      const tick = tickers ? new Set(tickers) : null;
      const needHeavy = spec.heavy.filter((h) => !fields || fields.some((f) => f === h || f.startsWith(`${h}.`)));
      const out = [];
      for (const k of [...t.rows.keys()].sort()) {
        const row = t.rows.get(k);
        if (want && !want.has(k)) continue;
        if (tick && !tick.has(row.ticker)) continue;
        let full = row;
        if (needHeavy.length) {
          const h = (await store.getKv(heavyKv(name, k)).catch(() => null))?.value ?? {};
          full = { ...row };
          for (const c of needHeavy) if (c in h) full[c] = h[c];
        }
        out.push(projectRow(full, fields));
      }
      return out;
    },

    /** Ghi (gộp theo cột). Trả số dòng đã ghi. Lỗi kho -> ném lỗi (Project A biết lượt ghi thất bại, không báo thành công giả). */
    upsert(name, rows) {
      const spec = check(name);
      if (!Array.isArray(rows)) { const e = new Error("rows phải là mảng"); e.status = 400; throw e; }
      for (const r of rows) {
        const k = r && typeof r === "object" ? spec.key(r) : null;
        if (typeof k !== "string" || !KEY_RE.test(k)) { const e = new Error(`Khoá dòng không hợp lệ (${name})`); e.status = 400; throw e; }
      }
      const run = chain.then(async () => {
        const t = await table(name);
        const at = new Date(now()).toISOString();
        for (const r of rows) {
          const k = spec.key(r);
          const light = { ...(t.rows.get(k) ?? {}) };
          const heavy = {};
          for (const [c, v] of Object.entries(r)) { if (spec.heavy.includes(c)) heavy[c] = v; else if (v !== undefined) light[c] = v; }
          if (Object.keys(heavy).length) {
            const prev = (await store.getKv(heavyKv(name, k)).catch(() => null))?.value ?? {};
            await store.setKv(heavyKv(name, k), { ...prev, ...heavy });
          }
          t.rows.set(k, light);
        }
        const doc = { rows: Object.fromEntries(t.rows), updatedAt: at };
        await store.setKv(lightKv(name), doc);
        t.updatedAt = at;
        t.bytes = JSON.stringify(doc.rows).length;
        stats.writes++; stats.rowsWritten += rows.length; stats.lastWriteAt = at;
        return rows.length;
      });
      chain = run.catch((e) => { stats.lastError = `ghi ${name}: ${e.message}`; log.warn?.(`[cotuc-store] ${stats.lastError}`); });
      return run;
    },

    /** Trạng thái: số dòng, lần ghi cuối, dung lượng phần nhẹ của từng bảng — để giám sát độ mới (B4). */
    async status() {
      const out = {};
      for (const name of Object.keys(COTUC_TABLES)) {
        const t = await table(name);
        out[name] = { rows: t.rows.size, updatedAt: t.updatedAt, lightBytes: t.bytes };
      }
      return { tables: out, ...stats };
    },
  };
}
