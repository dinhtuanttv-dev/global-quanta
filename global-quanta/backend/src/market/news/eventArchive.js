// I0-G2 (19/11/2026) — Kho lưu trữ nghiên cứu Event Radar.
// Sổ bản sửa của Event Radar giữ MỌI bản sửa (đầy đủ nội dung) trong một tệp JSON nạp toàn bộ vào bộ nhớ, tăng không giới hạn.
// Mỗi ngày: chuyển bản sửa cũ hơn `days` ngày (của sự kiện không còn hiển thị) sang tệp nén theo tháng `<dir>/revisions-YYYY-MM.jsonl.gz`
// — mỗi dòng một bản sửa đầy đủ (giữ nguyên để kiểm toán + nghiên cứu); nối thêm bằng thành viên gzip mới (tệp gzip nhiều thành viên hợp lệ).
// Ghi kho lỗi -> trả lại bản sửa vào sổ (không mất dữ liệu).
import { appendFile, mkdir, readdir, readFile } from "node:fs/promises";
import { gunzipSync, gzipSync } from "node:zlib";
import path from "node:path";

export const ARCHIVE_AFTER_DAYS = 30;

export function createEventArchive({ repository, dir = path.join(repository.directory, "archive"), days = ARCHIVE_AFTER_DAYS, now = Date.now, log = console }) {
  async function rotate() {
    const cutoff = new Date(now() - days * 86_400_000).toISOString();
    const rows = await repository.takeRevisionsBefore(cutoff);
    if (!rows.length) return { archived: 0, cutoff };
    const byMonth = new Map();
    for (const r of rows) { const m = String(r.observed_at ?? "unknown").slice(0, 7); byMonth.set(m, [...(byMonth.get(m) ?? []), r]); }
    try {
      await mkdir(dir, { recursive: true });
      for (const [m, list] of byMonth) await appendFile(path.join(dir, `revisions-${m}.jsonl.gz`), gzipSync(list.map((r) => JSON.stringify(r)).join("\n") + "\n"));
    } catch (e) {
      await repository.restoreRevisions(rows);
      log.warn?.(`[event-archive] ghi kho lỗi, đã trả lại ${rows.length} bản sửa: ${e.message}`);
      throw e;
    }
    log.log?.(`[event-archive] chuyển ${rows.length} bản sửa (trước ${cutoff.slice(0, 10)}) sang kho`);
    return { archived: rows.length, cutoff, months: [...byMonth.keys()] };
  }

  /** Đọc kho (cho nghiên cứu): mọi bản sửa trong [from, to] (theo observed_at), kèm cả bản sửa còn trong sổ. */
  async function read({ from = "0000", to = "9999" } = {}) {
    const out = [];
    let files = [];
    try { files = (await readdir(dir)).filter((f) => /^revisions-\d{4}-\d{2}\.jsonl\.gz$/.test(f)).sort(); } catch { files = []; }
    for (const f of files) {
      const m = f.slice(10, 17);
      if (m < from.slice(0, 7) || m > to.slice(0, 7)) continue;
      for (const line of gunzipSync(await readFile(path.join(dir, f))).toString("utf8").split("\n")) {
        if (!line) continue;
        const r = JSON.parse(line);
        if (r.observed_at >= from && r.observed_at <= to) out.push(r);
      }
    }
    return out;
  }

  return { rotate, read, dir };
}
