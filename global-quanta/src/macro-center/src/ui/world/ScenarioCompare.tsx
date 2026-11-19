// W1 (19/11/2026) — so sánh tối đa 4 kịch bản trên cùng bảng nhiệt ngành × kịch bản. Dùng nguyên engine kịch bản của Gateway
// (POST /api/world/scenario, mỗi kịch bản một lần gọi, có đệm). Không tính lại gì: ô = ước tính điểm của engine sau `horizon` tháng.
// Ô có khoảng tin cậy 90% chứa 0 (engine trả conclusive=false) hiển thị sọc + "?" — chưa kết luận được hướng, không tô màu hướng.
import { useMemo, useState } from 'react';
import { fmtSigned } from '../../world-view';
import { useAsync } from '../useMacro';
import type { WorldClient } from '../../world-client';
import type { ScenarioInfo, ScenarioPayload } from './ScenarioStock';
import { PERSIST_KEYS, usePersistedState } from './persist';

export const MAX_COMPARE = 4;
/** Câu lỗi cho người xem: 429 = Gateway đang giới hạn số lần tính. */
export const compareErrorVi = (e: string) => (/429|quá nhiều|too many/i.test(e) ? 'Gateway đang giới hạn số lần tính kịch bản, thử lại sau ít phút.' : e);
export const DEFAULT_COMPARE = ['usd-strong', 'oil-spike', 'fed-cut', 'risk-off'];
const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.length <= MAX_COMPARE && v.every((x) => typeof x === 'string');

/** Mức tô màu theo độ lớn ước tính (%), chỉ cho ô kết luận được hướng. */
export function heatLevel(est: number, conclusive: boolean): 0 | 1 | 2 | 3 {
  if (!conclusive || !Number.isFinite(est)) return 0;
  const a = Math.abs(est);
  return a >= 8 ? 3 : a >= 3 ? 2 : 1;
}

type Col = { id: string; nameVi: string; result: ScenarioPayload | null; error: string | null };

export function compareRows(cols: Col[]) {
  const order: { sector: string; nameVi: string }[] = [];
  const seen = new Set<string>();
  for (const c of cols) for (const s of c.result?.sectors ?? []) if (!seen.has(s.sector)) { seen.add(s.sector); order.push({ sector: s.sector, nameVi: s.nameVi }); }
  return order.map((r) => ({ ...r, cells: cols.map((c) => c.result?.sectors.find((s) => s.sector === r.sector) ?? null) }));
}

export function ScenarioCompare(props: { client: WorldClient; scenarios: ScenarioInfo[]; horizon: number; onHorizon?: (h: number) => void; onPick: (scenarioId: string, sector: string) => void }) {
  const [ids, setIds] = usePersistedState<string[]>(PERSIST_KEYS.scenarioCompare, DEFAULT_COMPARE, isIdList);
  const known = useMemo(() => new Set(props.scenarios.map((s) => s.id)), [props.scenarios]);
  const picked = ids.filter((id) => known.has(id));
  const [retry, setRetry] = useState(0);
  const runs = useAsync(async (signal) => {
    const out = await Promise.allSettled(picked.map((scenarioId) => props.client.scenario<ScenarioPayload>({ scenarioId, horizon: props.horizon }, signal)));
    return out.map((r, i) => ({ id: picked[i], result: r.status === 'fulfilled' ? r.value : null, error: r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : null }));
  }, [props.client, picked.join(','), props.horizon, retry], picked.length > 0);
  const cols: Col[] = (runs.data ?? []).map((r) => ({ ...r, nameVi: props.scenarios.find((s) => s.id === r.id)?.nameVi ?? r.id }));
  const rows = compareRows(cols);
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_COMPARE ? cur : [...cur, id]));

  return (
    <div data-testid="scenario-compare">
      <div className="chips" role="group" aria-label={`Chọn tối đa ${MAX_COMPARE} kịch bản để so sánh`}>
        {props.scenarios.map((s) => {
          const on = ids.includes(s.id);
          return <button key={s.id} type="button" className="chip" aria-pressed={on} disabled={!on && ids.length >= MAX_COMPARE} onClick={() => toggle(s.id)} data-testid={`compare-chip-${s.id}`}>{s.nameVi}</button>;
        })}
      </div>
      {props.onHorizon && (
        <div className="frow">
          <label className="flabel" htmlFor="wd-cmp-h">Tầm nhìn</label>
          <select id="wd-cmp-h" value={props.horizon} onChange={(e: { target: { value: string } }) => props.onHorizon?.(Number(e.target.value))}>
            {[1, 3, 6, 12].map((h) => (<option key={h} value={h}>{h} tháng</option>))}
          </select>
        </div>
      )}
      <p className="muted">Chọn tối đa {MAX_COMPARE} kịch bản. Ô là ước tính của engine sau {props.horizon} tháng (%). Ô sọc có dấu “?”: khoảng tin cậy 90% chứa 0, chưa kết luận được hướng. Ô “bất ổn”: ước tính vượt ±50% trong 3 tháng (mẫu tháng ngắn), không dùng. Bấm một ô để xem chi tiết kịch bản đó.</p>
      {picked.length === 0 && <p className="state">Chưa chọn kịch bản nào.</p>}
      {runs.loading && !runs.data && <p className="state" role="status">Đang mô phỏng {picked.length} kịch bản…</p>}
      {runs.error && <p className="state alert" role="alert">{runs.error}</p>}
      {runs.data && rows.length === 0 && cols.some((c) => c.error) && (
        <div className="state alert" role="alert" data-testid="scenario-compare-error">
          Không mô phỏng được kịch bản nào: {compareErrorVi(cols.find((c) => c.error)?.error ?? '')}{' '}
          <button type="button" className="chip" onClick={() => setRetry((n) => n + 1)} data-testid="scenario-compare-retry">Thử lại</button>
        </div>
      )}
      {rows.length > 0 && (
        <div className="scroll">
          <table className="sc-heat" data-testid="scenario-heat">
            <caption className="sr-only">Bảng so sánh tác động của các kịch bản lên ngành Việt Nam sau {props.horizon} tháng.</caption>
            <thead>
              <tr>
                <th scope="col">Ngành</th>
                {cols.map((c) => <th key={c.id} scope="col">{c.nameVi}{c.error && <span className="chip-warn" title={compareErrorVi(c.error)}> lỗi</span>}{c.result && <span className="muted sc-sub">{c.result.conclusiveCount}/{c.result.sectors.length} kết luận</span>}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sector}>
                  <th scope="row">{r.nameVi}</th>
                  {r.cells.map((s, i) => {
                    if (!s) return <td key={cols[i].id}><span className="cell none">–</span></td>;
                    const unstable = !!s.unstable;
                    const lv = unstable ? 0 : heatLevel(s.est, s.conclusive);
                    const dir = s.est >= 0 ? 'up' : 'down';
                    return (
                      <td key={cols[i].id}>
                        <button type="button" className={`cell ${lv === 0 ? 'l0' : `${dir} l${lv}`}`} data-testid={`heat-${cols[i].id}-${r.sector}`} data-level={lv} data-unstable={unstable ? 'true' : undefined}
                          aria-label={unstable ? `${cols[i].nameVi}, ${r.nameVi}: bất ổn về số, không dùng` : `${cols[i].nameVi}, ${r.nameVi}: ${fmtSigned(s.est, 1, '%')}, khoảng 90% ${fmtSigned(s.lo, 1)} đến ${fmtSigned(s.hi, 1)}${s.conclusive ? '' : ', chưa kết luận hướng'}`}
                          title={unstable ? 'Ước tính vượt ±50% trong 3 tháng — bất ổn về số (mẫu tháng ngắn)' : `Khoảng 90%: ${fmtSigned(s.lo, 1)} đến ${fmtSigned(s.hi, 1)}%`} onClick={() => props.onPick(cols[i].id, r.sector)}>
                          <span className="sc-val">{unstable ? 'bất ổn' : <>{fmtSigned(s.est, 1, '%')}{s.conclusive ? '' : ' ?'}</>}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cols.some((c) => c.result?.warnings.length) && (
        <details><summary>Lưu ý của engine</summary><ul>{cols.flatMap((c) => (c.result?.warnings ?? []).map((w) => <li key={`${c.id}-${w}`} className="muted">{c.nameVi}: {w}</li>))}</ul></details>
      )}
      <p className="muted">Mô phỏng theo local projection trên số liệu tháng lịch sử — là phản ứng trung bình trong quá khứ, không phải dự báo. Ước tính vượt ±50% trong 3 tháng bị engine đánh dấu bất ổn về số.</p>
    </div>
  );
}
