import { fmtNum, fmtQ } from '../../macro-filter';
import { fmtSigned } from '../../world-view';
import { CiTrack, ColumnChart, EvidenceChip } from './shared';
import type { EvidenceTier } from '../../world-types';

export interface EventRow {
  id: string;
  titleVi: string;
  kind: string;
  region: string;
  sessionDate: string | null;
  sectorName?: string;
  car?: number;
  ci90?: [number, number];
  q?: number;
  tier: EvidenceTier | 'pending';
  status?: string;
  /** W5: ngành mục tiêu định trước (sectorsHint[0]) hay ngành p nhỏ nhất (thăm dò) */
  prespecified?: boolean;
  overlapsWith?: string[];
  signOk?: boolean | null;
}

export interface EventDetailPayload {
  event: EventRow & { reasonVi?: string; sameDay?: boolean; bmp?: { n: number; t: number; p: number } | null; limitDays?: number; extraction?: { method: string; confidence: number; reviewed: boolean } | null };
  alignment: { date: string; sameDay: boolean } | null;
  path: { day: number; ar: number; car: number | null; se: number | null }[];
  model: { nEst: number; beta: number } | null;
  sectors: { sector: string; nameVi: string; car: number; ci90: [number, number]; q: number }[];
}

const kindVi = (k: string) => (k === 'scheduled' ? 'Theo lịch' : 'Bất ngờ');

export function EventList({ events, selected, onSelect }: { events: EventRow[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <div className="scroll">
      <table className="ev-table">
        <caption className="sr-only">Danh sách sự kiện thế giới và phản ứng của ngành Việt Nam chịu ảnh hưởng nhiều nhất.</caption>
        <thead><tr><th scope="col">Phiên</th><th scope="col">Sự kiện</th><th scope="col">Ngành định trước</th><th scope="col">Phản ứng (%)</th><th scope="col">q</th><th scope="col">Bậc</th></tr></thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} aria-selected={selected === e.id} className={selected === e.id ? 'sel' : undefined}>
              <td>{e.sessionDate ?? '[–]'}</td>
              <td><button type="button" className="link" onClick={() => onSelect(e.id)} aria-label={`Xem chi tiết: ${e.titleVi}`}>{e.titleVi}</button><br /><span className="muted">{kindVi(e.kind)} · {e.region}</span></td>
              <td>{e.sectorName ?? '–'}{e.prespecified === false && <><br /><span className="muted">thăm dò</span></>}{e.overlapsWith?.length ? <><br /><span className="muted" title={e.overlapsWith.join('; ')}>trùng cửa sổ</span></> : null}{e.signOk === false && <><br /><span className="muted">ngược chiều</span></>}</td>
              <td>
                {e.car !== undefined && e.ci90 ? (
                  <span className="car-cell"><CiTrack est={e.car} lo={e.ci90[0]} hi={e.ci90[1]} range={8} label={`Phản ứng ${fmtSigned(e.car, 1, '%')}, khoảng tin cậy ${fmtSigned(e.ci90[0], 1)} đến ${fmtSigned(e.ci90[1], 1)}`} /><strong>{fmtSigned(e.car, 1, '%')}</strong></span>
                ) : (
                  <span className="muted">[–]</span>
                )}
              </td>
              <td>{e.q !== undefined ? fmtQ(e.q) : '[–]'}</td>
              <td><EvidenceChip tier={e.tier} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EventDetail({ d }: { d: EventDetailPayload }) {
  const e = d.event;
  const ar = d.path.map((p) => p.ar);
  const car = d.path.map((p) => p.car ?? 0);
  const ci = d.path.map((p) => (p.car !== null && p.se !== null ? { lo: p.car - 1.645 * p.se, hi: p.car + 1.645 * p.se } : { lo: 0, hi: 0 }));
  const inWindow = (i: number) => d.path[i]?.car !== null && d.path[i]?.day <= 3;
  return (
    <div className="detail">
      <h3 className="h3">{e.titleVi}</h3>
      <div className="chips"><EvidenceChip tier={e.tier} /><span className="chip-plain">{kindVi(e.kind)}</span><span className="chip-plain">{e.region}</span></div>
      {d.alignment && (
        <p className="callout">
          Sự kiện được tính vào phiên giao dịch {d.alignment.date}
          {d.alignment.sameDay ? ' (công bố trước giờ đóng cửa nên phản ứng ngay trong phiên).' : ' (công bố sau giờ đóng cửa hoặc ngoài ngày giao dịch nên phản ứng từ phiên kế tiếp).'}
        </p>
      )}
      {d.path.length > 0 ? (
        <>
          <p className="cap">Lợi suất bất thường mỗi phiên, ngành {e.sectorName} (%)</p>
          <ColumnChart values={ar} scale={14} highlight={inWindow} label={`Lợi suất bất thường từng phiên của ngành ${e.sectorName}`} />
          <p className="cap">Tích luỹ (CAR) và khoảng tin cậy 90% (%)</p>
          <ColumnChart values={car} scale={7} ci={ci} highlight={inWindow} label={`Lợi suất bất thường tích luỹ của ngành ${e.sectorName}`} />
          <p className="muted">Nền đậm là cửa sổ đo (−1, +3). Phiên 0 là phiên phản ứng đầu tiên.</p>
          <dl className="kv">
            <dt>CAR (−1, +3)</dt><dd>{fmtSigned(e.car ?? NaN, 2, '%')}</dd>
            <dt>q sau hiệu chỉnh</dt><dd>{e.q !== undefined ? fmtQ(e.q) : '–'}</dd>
            {e.bmp && (<><dt>Kiểm định BMP, {e.bmp.n} sự kiện cùng loại</dt><dd>t = {fmtNum(e.bmp.t, 1)}, p = {fmtQ(e.bmp.p)}</dd></>)}
            {d.model && (<><dt>Số phiên ước lượng mô hình</dt><dd>{d.model.nEst}</dd></>)}
            <dt>Phiên chạm biên độ trong cửa sổ</dt><dd>{e.limitDays ?? 0}</dd>
          </dl>
          {e.reasonVi && <p className="muted">{e.reasonVi}</p>}
        </>
      ) : (
        <p className="state">Chưa đủ phiên sau sự kiện để đo phản ứng. Sự kiện ở hàng đợi giả thuyết cho đến khi có đủ cửa sổ (−1, +3).</p>
      )}
      {d.sectors.length > 0 && (
        <>
          <p className="cap">Phản ứng của các ngành với cùng sự kiện (CAR −1, +3)</p>
          <ul className="sector-bars">
            {d.sectors.map((s) => (
              <li key={s.sector}><span>{s.nameVi}</span><CiTrack est={s.car} lo={s.ci90[0]} hi={s.ci90[1]} range={8} label={`${s.nameVi}: ${fmtSigned(s.car, 1, '%')}`} /><strong>{fmtSigned(s.car, 1, '%')}</strong></li>
            ))}
          </ul>
        </>
      )}
      {e.extraction && (
        <p className="muted">Trích xuất: {e.extraction.method === 'llm' ? 'AI' : 'thủ công'}, độ tin cậy {fmtNum(e.extraction.confidence, 2)}; đã kiểm duyệt bởi người: {e.extraction.reviewed ? 'rồi' : 'chưa'}.</p>
      )}
    </div>
  );
}
