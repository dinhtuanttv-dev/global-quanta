import type { VolumeAnalysis } from "../../hooks/useVolumeAnalysis";

export function researchSameTime(volume: VolumeAnalysis | null, observedAt: string) {
  const sample = volume?.intraday?.sameTime;
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return null;
  const observedSession = new Date(observed + 7 * 60 * 60_000).toISOString().slice(0, 10);
  if (!volume?.partialToday || volume.coverage?.detail !== "research" || !sample ||
    sample.ticker !== volume.symbol || sample.session !== volume.today.date || sample.session !== volume.asOf || sample.session !== observedSession ||
    sample.methodVersion !== "rvol-same-minute-v1" || sample.source !== "SSI_FC_V2" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(sample.session) || !/^(0[9]|1[0-5]):[0-5]\d$/.test(sample.asOfTime) ||
    !Number.isSafeInteger(sample.sessions) || sample.sessions < 8 || sample.sessions > 20 ||
    typeof sample.traded !== "number" || !Number.isSafeInteger(sample.traded) || sample.traded < 0 || sample.traded !== volume.intraday?.totalVolume ||
    typeof sample.median !== "number" || !Number.isFinite(sample.median) || sample.median <= 0 ||
    sample.ratio !== Math.round(sample.traded / sample.median * 100) / 100 || sample.ratio !== volume.today.rvolTimeAdjusted) return null;
  const asOf = `${sample.session}T${sample.asOfTime}:00+07:00`;
  return Date.parse(asOf) + 60_000 <= observed ? { ...sample, asOf } : null;
}
