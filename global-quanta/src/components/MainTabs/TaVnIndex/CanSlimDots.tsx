// 7 chấm C-A-N-S-L-I-M: xanh = mọi tiêu chí của yếu tố đạt, vàng = đạt một phần, xám = chưa đạt.
import type { TechnicalFilterComponent } from "../../../hooks/useTechnicalFilter";

const FACTORS = ["C", "A", "N", "S", "L", "I", "M"] as const;
const NAMES: Record<(typeof FACTORS)[number], string> = {
  C: "Lợi nhuận quý", A: "Lợi nhuận năm & ROE", N: "Đỉnh mới", S: "Cung–cầu (KL)", L: "Dẫn dắt (RS, ngành)", I: "Dòng tiền tổ chức (khối ngoại)", M: "Thị trường chung",
};

export function factorState(components: TechnicalFilterComponent[], f: string): "full" | "partial" | "none" {
  const list = components.filter((c) => c.factor === f);
  const ok = list.filter((c) => c.ok).length;
  return !list.length || ok === 0 ? "none" : ok === list.length ? "full" : "partial";
}

const STYLE = {
  full: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  partial: "bg-amber-500/15 text-amber-300 border-amber-500/40",
  none: "bg-slate-800/60 text-slate-500 border-slate-700/60",
};

export default function CanSlimDots({ components }: { components: TechnicalFilterComponent[] }) {
  return (
    <span className="inline-flex gap-0.5" data-testid="canslim-dots">
      {FACTORS.map((f) => {
        const st = factorState(components, f);
        const detail = components.filter((c) => c.factor === f).map((c) => `${c.ok ? "✓" : "✗"} ${c.label}`).join("\n");
        return (
          <span key={f} data-state={st} title={`${f} — ${NAMES[f]}\n${detail}`}
            className={`w-3.5 h-3.5 rounded-[3px] border text-[8px] font-black leading-[12px] text-center ${STYLE[st]}`}>
            {f}
          </span>
        );
      })}
    </span>
  );
}
