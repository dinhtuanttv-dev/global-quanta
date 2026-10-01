// FRONTEND_ORIGIN: danh sách origin phân tách bằng dấu phẩy. Hỗ trợ "*" thay cho
// một nhãn subdomain (không chứa "." hay "/"), để cho phép các URL preview Vercel
// sinh mới mỗi lần deploy, VD:
//   https://global-quanta.vercel.app,https://global-quanta-*-dinhtuanttv-devs-projects.vercel.app

const escapeRegex = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

export function parseAllowedOrigins(raw = "http://localhost:5173") {
  return String(raw)
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .map((o) => (o.includes("*")
      ? new RegExp(`^${o.split("*").map(escapeRegex).join("[a-z0-9-]+")}$`, "i")
      : o));
}

export function isOriginAllowed(origin, allowed) {
  if (!origin) return false;
  return allowed.some((rule) => (rule instanceof RegExp ? rule.test(origin) : rule === origin));
}
