// Port từ locnganh-timing-engine (ui/sector-rotation/sector-timing-signals.schema.test.ts).
import { describe, expect, it } from 'vitest';
import { formatIssues, parseSectorTimingSignals, sectorTimingSignalsBulkV3Schema } from './sector-timing-signals.schema';

function makeSignal(o: Record<string, unknown> = {}) {
  return {
    sectorKey: 'THEP',
    action: 'IN_WINDOW',
    tdSinceTransition: 5,
    window: { entryFrom: -10, entryTo: -2, exitOffset: 5 },
    expectedNetReturn: 0.02,
    nEvents: 10,
    fdrQValue: 0.06,
    confidence: 'MEDIUM',
    reactionProbability: { mean: 0.68, ci: [0.52, 0.81] },
    ...o,
  };
}
function makeBulk(signals = [makeSignal()], o: Record<string, unknown> = {}) {
  return { version: 'test-v1', asOf: '2026-10-01T03:00:00Z', signals, ...o };
}

describe('sectorTimingSignalsBulkV3Schema: dữ liệu hợp lệ', () => {
  it('chấp nhận dữ liệu mẫu', () => {
    expect(parseSectorTimingSignals(makeBulk()).ok).toBe(true);
  });
  it('chấp nhận danh sách rỗng và NO_SIGNAL đúng cách (window/reactionProbability đều null)', () => {
    expect(parseSectorTimingSignals(makeBulk([])).ok).toBe(true);
    const s = makeSignal({ action: 'NO_SIGNAL', window: null, reactionProbability: null, confidence: null, nEvents: null, expectedNetReturn: null, tdSinceTransition: null });
    expect(parseSectorTimingSignals(makeBulk([s])).ok).toBe(true);
  });
  it('safeParse trực tiếp cũng dùng được', () => {
    expect(sectorTimingSignalsBulkV3Schema.safeParse(makeBulk()).success).toBe(true);
  });
});

describe('sectorTimingSignalsBulkV3Schema: hợp đồng nghiệp vụ', () => {
  it('IN_WINDOW/TOO_EARLY/WINDOW_PASSED phải có window', () => {
    for (const action of ['IN_WINDOW', 'TOO_EARLY', 'WINDOW_PASSED']) {
      expect(parseSectorTimingSignals(makeBulk([makeSignal({ action, window: null })])).ok).toBe(false);
    }
  });
  it('NO_SIGNAL không được có window hoặc reactionProbability (không bịa khi chưa qua cổng)', () => {
    const r1 = parseSectorTimingSignals(makeBulk([makeSignal({ action: 'NO_SIGNAL' })]));
    expect(r1.ok).toBe(false);
    const r2 = parseSectorTimingSignals(makeBulk([makeSignal({ action: 'NO_SIGNAL', window: null })])); // vẫn còn reactionProbability
    expect(r2.ok).toBe(false);
  });
  it('entryFrom phải ≤ entryTo; exitOffset không được sớm hơn entryTo', () => {
    expect(parseSectorTimingSignals(makeBulk([makeSignal({ window: { entryFrom: -2, entryTo: -10, exitOffset: 5 } })])).ok).toBe(false);
    expect(parseSectorTimingSignals(makeBulk([makeSignal({ window: { entryFrom: -10, entryTo: -2, exitOffset: -5 } })])).ok).toBe(false);
  });
  it('sectorKey trùng trong cùng response bị từ chối', () => {
    const r = parseSectorTimingSignals(makeBulk([makeSignal({ sectorKey: 'THEP' }), makeSignal({ sectorKey: 'THEP' })]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join('\n')).toContain('sectorKey trùng');
  });
  it('bắt lỗi đơn vị: expectedNetReturn = 20 (nghĩa là 20%) bị từ chối', () => {
    expect(parseSectorTimingSignals(makeBulk([makeSignal({ expectedNetReturn: 20 })])).ok).toBe(false);
  });
  it('ci ngược (cao < thấp) bị từ chối', () => {
    expect(parseSectorTimingSignals(makeBulk([makeSignal({ reactionProbability: { mean: 0.6, ci: [0.8, 0.5] } })])).ok).toBe(false);
  });
  it('action/confidence sai enum bị từ chối', () => {
    expect(parseSectorTimingSignals(makeBulk([makeSignal({ action: 'MUA_NGAY' })])).ok).toBe(false);
    expect(parseSectorTimingSignals(makeBulk([makeSignal({ confidence: 'RẤT_CAO' })])).ok).toBe(false);
  });
  it('vượt maxSignals bị từ chối', () => {
    const many = Array.from({ length: 101 }, (_, i) => makeSignal({ sectorKey: `S${i}` }));
    expect(parseSectorTimingSignals(makeBulk(many)).ok).toBe(false);
  });
  it('asOf sai định dạng', () => {
    expect(parseSectorTimingSignals(makeBulk([makeSignal()], { asOf: 'hôm qua' })).ok).toBe(false);
  });
  it('rác đầu vào không ném lỗi', () => {
    expect(parseSectorTimingSignals(null).ok).toBe(false);
    expect(parseSectorTimingSignals('x').ok).toBe(false);
    expect(parseSectorTimingSignals(undefined).ok).toBe(false);
  });
});

describe('formatIssues', () => {
  it('nối đường dẫn thành chuỗi đọc được', () => {
    expect(formatIssues([{ path: ['signals', 0, 'sectorKey'], message: 'x' }])).toEqual(['signals.0.sectorKey: x']);
  });
});
