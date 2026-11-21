// Frontmatter YAML an toàn: mọi chuỗi trong nháy kép (thoát \ và "), bỏ ký tự điều khiển, đổi xuống dòng thành dấu cách.
// Ngày ISO (YYYY-MM-DD) để trần để Dataview nhận là ngày. Chỉ hỗ trợ tập con cần dùng: vô hướng, map một cấp, danh sách chuỗi.

export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | YamlScalar[] | Record<string, YamlScalar>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[a-z][a-z0-9_]*$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Chuỗi một dòng, sạch ký tự điều khiển. */
export function cleanLine(s: string): string {
  return s.replace(/\r\n|\r|\n|\t/g, " ").replace(CONTROL, "").replace(/\s{2,}/g, " ").trim();
}
export function yamlScalar(v: YamlScalar, opts: { date?: boolean } = {}): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  const s = cleanLine(v);
  if (opts.date && ISO_DATE.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Dựng khối frontmatter. Khoá phải là snake_case (chống chèn khoá lạ). Trường có tên kết thúc `date`/`_N` ngày -> giữ dạng ngày. */
export function frontmatter(fields: [string, YamlValue][], dateKeys: Set<string> = new Set()): string {
  const out = ["---"];
  for (const [k, v] of fields) {
    if (!KEY.test(k)) throw new Error(`Khoá YAML không hợp lệ: ${k}`);
    if (Array.isArray(v)) {
      if (!v.length) { out.push(`${k}: []`); continue; }
      out.push(`${k}:`);
      for (const x of v) out.push(`  - ${yamlScalar(x)}`);
    } else if (v !== null && typeof v === "object") {
      out.push(`${k}:`);
      for (const [k2, v2] of Object.entries(v)) {
        if (!KEY.test(k2)) throw new Error(`Khoá YAML không hợp lệ: ${k}.${k2}`);
        out.push(`  ${k2}: ${yamlScalar(v2)}`);
      }
    } else out.push(`${k}: ${yamlScalar(v, { date: dateKeys.has(k) })}`);
  }
  out.push("---");
  return out.join("\n");
}
