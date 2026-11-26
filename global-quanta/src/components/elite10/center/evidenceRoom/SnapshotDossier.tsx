// 26/11/2026 — Hiển thị Hồ sơ phân tích của snapshot (xem dossierModel.ts). Thứ tự đọc: kết luận → điểm các lớp →
// từng lớp (đọc · số đo · điều gì đổi đánh giá) → chất lượng dữ liệu → chi tiết kỹ thuật (thu gọn).
import type { ReactNode } from "react";
import type { EvidenceRef } from "../../../../lib/evidenceBrain/types";
import type { DomainCard, DomainId, Dossier } from "./dossierModel";
import { refPairs, refValueText } from "./dossierModel";
import { dateVi } from "./roomView";

const STATUS_VI = { VERIFIED: "Xác minh", DERIVED: "Tính từ nguồn", AI_INTERPRETATION: "Diễn giải AI", USER_NOTE: "Ghi chú" } as const;
const FRESH_VI = { CURRENT: "Đúng phiên", STALE: "Cũ", MISSING: "Thiếu", UNKNOWN: "Chưa rõ" } as const;

export function DomainBlock({ card, onOpen, open = true }: { card: DomainCard; onOpen?: (id: DomainId) => void; open?: boolean }) {
  return <section className={`eb-dos-card tone-${card.tone}`} data-testid={`eb-dos-${card.id}`} aria-label={card.title}>
    <header>
      <h3>{onOpen ? <button type="button" className="small-link" onClick={() => onOpen(card.id)}>{card.title} ›</button> : card.title}</h3>
      <span className={`eb-dos-state tone-${card.tone}`}>{card.state}</span>
    </header>
    <p className="eb-dos-read">{card.read}</p>
    {open && card.facts.length > 0 && <dl className="eb-dos-facts">{card.facts.map((f) => <div key={f.label} className={f.tone ? `tone-${f.tone}` : undefined}>
      <dt>{f.label}</dt><dd>{f.value}{f.hint && <small> · {f.hint}</small>}</dd>
    </div>)}</dl>}
    {open && card.change.length > 0 && <div className="eb-dos-change"><b>Điều gì làm thay đổi đánh giá</b><ul>{card.change.map((c) => <li key={c}>{c}</li>)}</ul></div>}
  </section>;
}

export function QualityBlock({ quality, keys }: { quality: Dossier["quality"]; keys?: string[] }) {
  const rows = keys ? quality.rows.filter((r) => keys.includes(r.key)) : quality.rows;
  const ok = rows.filter((r) => r.tone === "good").length;
  return <section className="eb-dos-quality" data-testid="eb-dos-quality" aria-label="Chất lượng dữ liệu">
    <h3>Chất lượng dữ liệu <small>{ok}/{rows.length} nguồn sạch{keys ? "" : ` · ${quality.refs.total} ref (${quality.refs.verified} xác minh, ${quality.refs.derived} tính từ nguồn; ${quality.refs.current} đúng phiên${quality.refs.stale ? `, ${quality.refs.stale} cũ` : ""}${quality.refs.missing ? `, ${quality.refs.missing} thiếu` : ""})`}</small></h3>
    <table className="eb-dos-table"><thead><tr><th scope="col">Nguồn</th><th scope="col">Trạng thái</th><th scope="col">Đến ngày</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.key} className={`tone-${r.tone}`}>
        <td><span className="eb-dos-dot" aria-hidden />{r.label}{r.note && <small className="eb-dos-note">{r.note}</small>}</td><td>{r.state}</td><td>{r.asOf}</td>
      </tr>)}</tbody></table>
    {!keys && quality.issues.length > 0 && <ul className="eb-dos-issues">{quality.issues.slice(0, 8).map((i) => <li key={i}>{i}</li>)}</ul>}
  </section>;
}

export default function SnapshotDossier({ dossier, onOpen, technical }: { dossier: Dossier; onOpen: (id: DomainId) => void; technical: ReactNode }) {
  const { verdict, scoreline: s } = dossier;
  return <div className="eb-dos" data-testid="eb-snapshot-dossier">
    <section className={`eb-dos-verdict tone-${verdict.tone}`} aria-label="Kết luận của snapshot">
      <div className="eyebrow">{dossier.scope}</div>
      <strong data-testid="eb-dos-verdict">{verdict.label}</strong>
      <p>{verdict.reason}</p>
      {s.total > 0 && <div className="eb-dos-score" aria-label="Điểm các lớp xác nhận">
        <span className="tone-good">{s.pass} đạt</span><span className="tone-warn">{s.wait} chờ</span><span className="tone-warn">{s.missing} thiếu căn cứ</span><span className="tone-bad">{s.fail} chưa đạt</span>
        <span className="eb-dos-of">/ {s.total} lớp chấm</span>
      </div>}
    </section>
    {dossier.triggers.length > 0 && <section className="eb-dos-triggers" aria-label="Điều kiện cần theo dõi">
      <h3>Theo dõi tiếp</h3><ol>{dossier.triggers.map((t) => <li key={t}>{t}</li>)}</ol>
    </section>}
    <div className="eb-dos-grid">{dossier.domains.map((card) => <DomainBlock key={card.id} card={card} onOpen={onOpen} />)}</div>
    <QualityBlock quality={dossier.quality} />
    <details className="eb-dos-tech"><summary>Chi tiết kỹ thuật (snapshot id, endpoint, phiên bản, ref)</summary>{technical}</details>
    <p className="eb-claim-check">Hồ sơ đọc cơ học từ số đo của snapshot — không phải khuyến nghị và không thay kiểm định. Các lớp đã kiểm định ngoài mẫu đều KHÔNG ĐẠT nên chỉ dùng để mô tả.</p>
  </div>;
}

/** Ref đọc được: tên trường, giá trị đã định dạng (cặp khoá: giá trị cho đối tượng), nguồn · ngày · trạng thái; JSON gốc thu gọn. */
export function ReadableRefs({ refs, link }: { refs: EvidenceRef[]; link: (raw: string | null) => string | null }) {
  if (!refs.length) return null;
  return <section className="eb-dos-refs" aria-label="Ref bằng chứng"><h3>Ref bằng chứng ({refs.length})</h3>
    {refs.map((ref) => {
      const pairs = refPairs(ref.value);
      const text = pairs.length ? "" : refValueText(ref.value, ref.unit);
      const href = link(ref.url);
      return <article key={ref.id} className="eb-dos-ref">
        <p><b>{ref.fieldPath}</b>{text && <> = <span className="eb-dos-val">{text}</span></>}</p>
        {pairs.length > 0 && <dl className="eb-dos-facts compact">{pairs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        <p className="eb-source-label">{STATUS_VI[ref.status]} · {FRESH_VI[ref.freshness]} · {ref.source} · đến {dateVi(ref.asOf, true)} · {ref.sourceVersion ?? ref.methodVersion ?? "chưa có phiên bản"}</p>
        {ref.limitation && <p className="eb-claim-check">{ref.limitation}</p>}
        {href && <a href={href} target="_blank" rel="noreferrer">Mở nguồn ↗</a>}
        {typeof ref.value === "object" && ref.value !== null && <details><summary>JSON gốc</summary><pre>{JSON.stringify(ref.value, null, 2)}</pre></details>}
      </article>;
    })}
  </section>;
}
