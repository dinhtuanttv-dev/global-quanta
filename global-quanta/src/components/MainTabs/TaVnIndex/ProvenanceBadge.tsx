import { PROVENANCE_META, type Provenance } from "../../../lib/ta-command-center/provenance";

/** Huy hiệu nguồn gốc dữ liệu (HARD / DERIVED / INFERRED / MODEL) — chuẩn chung cho tab TA VN-Index. */
export default function ProvenanceBadge({ kind, className = "ml-auto" }: { kind: Provenance; className?: string }) {
  const meta = PROVENANCE_META[kind];
  return (
    <span data-provenance={kind} title={meta.title}
      className={`${className} font-mono text-[8.5px] font-semibold tracking-wide px-1 rounded border`}
      style={{ color: meta.color, borderColor: `${meta.color}55`, background: `${meta.color}14` }}>
      {kind}
    </span>
  );
}
