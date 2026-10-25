/**
 * macro-report.ts — monthly macro report as Markdown (Vietnamese), built from API payloads.
 * Pure function: same input → same text, so reports can be archived and diffed month to month.
 * Convert to PDF/DOCX with any Markdown tool (pandoc, the app's export, ...).
 */
import { fmtNum, fmtQ } from './macro-filter';

export interface ReportInput {
  asOf: string;
  notice?: string;
  names: Record<string, string>;
  impact: {
    firstPeriod: string;
    lastPeriod: string;
    best: { factor: string; target: string; lag: number; beta: number; t: number; q: number; significant: boolean; direction: string }[];
    stability: Record<string, { stable: boolean; shareSameSign: number; signFlips: number }>;
    warnings: string[];
    options: { adjust: string; alpha: number; maxLag: number };
  };
  score?: {
    target: string;
    thermometer: { value: number; bandVi: string; period: string; topContributors: { factor: string; contribution: number }[] } | null;
    backtest: { ic: number; icP: number; hitRate: number; gate: { pass: boolean; reasons: string[] } } | null;
    usableForDecisions: boolean;
    gateNote: string;
  };
  regime?: { K: number; current: { label: string; probs: number[] }; summary: { label: string; expectedDurationMonths: number; stationaryShare: number; meansByFeature: Record<string, number> }[] };
  alerts?: { level: string; messageVi: string }[];
  calendar?: { releases: { nameVi: string; period: string; expectedDate: string; status: string }[]; caveat: string };
}

const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const row = (cols: string[]): string => `| ${cols.map(cell).join(' | ')} |`;
const table = (head: string[], rows: string[][]): string =>
  [row(head), row(head.map(() => '---')), ...rows.map(row)].join('\n');
const dmy = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function buildMonthlyReport(inp: ReportInput): string {
  const n = (id: string) => inp.names[id] ?? id;
  const out: string[] = [];
  out.push(`# Báo cáo vĩ mô tháng ${inp.asOf.slice(5, 7)}/${inp.asOf.slice(0, 4)}`);
  out.push(`Ngày lập số liệu: ${dmy(inp.asOf)}. Dữ liệu từ ${inp.impact.firstPeriod} đến ${inp.impact.lastPeriod}.`);
  if (inp.notice) out.push(`> **Lưu ý:** ${inp.notice}`);

  const solid = inp.impact.best.filter((c) => c.significant);
  const stable = solid.filter((c) => inp.impact.stability[`${c.factor}|${c.target}`]?.stable);
  out.push('## 1. Tóm tắt');
  const sum: string[] = [];
  if (inp.score?.thermometer) sum.push(`- Nhiệt kế vĩ mô cho ${n(inp.score.target)}: **${inp.score.thermometer.bandVi}** (điểm ${fmtNum(inp.score.thermometer.value, 2)}).`);
  if (inp.regime) sum.push(`- Chế độ vĩ mô hiện tại: **${inp.regime.current.label}** (xác suất ${fmtNum(Math.max(...inp.regime.current.probs) * 100, 0)}%).`);
  sum.push(`- ${solid.length} cặp biến–chỉ số có ý nghĩa thống kê sau hiệu chỉnh kiểm định bội, trong đó ${stable.length} cặp ổn định theo thời gian.`);
  if (inp.alerts) sum.push(`- ${inp.alerts.length} cảnh báo đang hiệu lực.`);
  out.push(sum.join('\n'));

  if (inp.score) {
    out.push('## 2. Nhiệt kế vĩ mô');
    if (inp.score.thermometer) {
      out.push(`Điểm ${fmtNum(inp.score.thermometer.value, 2)} (thang −1 đến +1) cho kỳ ${inp.score.thermometer.period}: **${inp.score.thermometer.bandVi}**.`);
      if (inp.score.thermometer.topContributors.length)
        out.push(table(['Yếu tố', 'Đóng góp vào lợi suất kỳ vọng (%/tháng)'], inp.score.thermometer.topContributors.map((c) => [n(c.factor), `${c.contribution >= 0 ? '+' : ''}${fmtNum(c.contribution, 2)}`])));
    } else out.push('Chưa đủ dữ liệu để tính điểm.');
    out.push(`**Kiểm định ngoài mẫu:** ${inp.score.gateNote}${inp.score.backtest ? ` IC = ${fmtNum(inp.score.backtest.ic, 2)}, p = ${fmtNum(inp.score.backtest.icP, 3)}, đúng hướng ${fmtNum(inp.score.backtest.hitRate * 100, 0)}%.` : ''}`);
    if (inp.score.backtest && !inp.score.backtest.gate.pass) out.push(inp.score.backtest.gate.reasons.map((r) => `- ${r}`).join('\n'));
  }

  if (inp.regime) {
    out.push('## 3. Chế độ vĩ mô');
    out.push(table(['Chế độ', 'Thời gian kéo dài kỳ vọng (tháng)', 'Tỷ trọng dài hạn', 'Giá trị trung bình'],
      inp.regime.summary.map((s) => [s.label, fmtNum(s.expectedDurationMonths, 1), `${fmtNum(s.stationaryShare * 100, 0)}%`, Object.entries(s.meansByFeature).map(([f, v]) => `${f} ${fmtNum(v, 2)}`).join('; ')])));
  }

  out.push('## 4. Tác động nổi bật');
  const top = [...solid].sort((a, b) => Math.abs(b.t) - Math.abs(a.t)).slice(0, 12);
  if (top.length === 0) out.push('Không có cặp nào vượt hiệu chỉnh kiểm định bội trong kỳ này.');
  else {
    out.push(table(['Biến vĩ mô', 'Chỉ số', 'Hướng', 'Hệ số', 't', 'q', 'Độ trễ (tháng)', 'Ổn định'],
      top.map((c) => {
        const st = inp.impact.stability[`${c.factor}|${c.target}`];
        return [n(c.factor), n(c.target), c.direction === '+' ? 'Tăng giá' : 'Giảm giá', fmtNum(c.beta, 2), fmtNum(c.t, 1), fmtQ(c.q), String(c.lag), st ? (st.stable ? 'Có' : `Không (đổi dấu ${st.signFlips} lần)`) : 'Chưa kiểm tra'];
      })));
    out.push(`Hiệu chỉnh kiểm định bội: ${inp.impact.options.adjust.toUpperCase()}, ngưỡng ${fmtNum(inp.impact.options.alpha, 2)}.`);
  }

  if (inp.alerts) {
    out.push('## 5. Cảnh báo');
    out.push(inp.alerts.length ? inp.alerts.map((a) => `- **${a.level === 'high' ? 'Cao' : a.level === 'warn' ? 'Lưu ý' : 'Thông tin'}.** ${a.messageVi}`).join('\n') : 'Không có cảnh báo.');
  }

  if (inp.calendar) {
    out.push('## 6. Lịch công bố sắp tới');
    out.push(table(['Ngày dự kiến', 'Số liệu', 'Kỳ', 'Trạng thái'], inp.calendar.releases.slice(0, 6).map((r) => [dmy(r.expectedDate), r.nameVi, r.period, r.status === 'overdue' ? 'Chậm so với lịch' : 'Sắp tới'])));
    out.push(`_${inp.calendar.caveat}_`);
  }

  out.push('## 7. Phương pháp và giới hạn');
  out.push([
    '- Mọi chuỗi được kiểm tra tính dừng (ADF, KPSS, Zivot-Andrews) và biến đổi trước khi hồi quy; sai số chuẩn HAC Newey-West.',
    '- Mỗi ô của ma trận là một giả thuyết; cả họ được hiệu chỉnh kiểm định bội, nên ô không vượt ngưỡng không nên được đọc như tác động thực.',
    '- Số liệu được dịch theo độ trễ công bố để tránh dùng thông tin chưa biết tại thời điểm đó.',
    '- Tương quan thống kê không phải quan hệ nhân quả; độ nhạy lịch sử có thể đổi khi chế độ vĩ mô đổi.',
    ...inp.impact.warnings.map((w) => `- ${w}`),
  ].join('\n'));
  return out.join('\n\n') + '\n';
}
