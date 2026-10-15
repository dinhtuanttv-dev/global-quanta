/** Writes SYNTHETIC sample CSVs (Vietnamese number format) to ./samples so the import flow can be tried. */
import { writeFileSync } from 'node:fs';
import { makeSyntheticStore } from '../src/macro-seed';

const store = makeSyntheticStore(7);
for (const id of ['CPI', 'IR', 'M2', 'VNINDEX']) {
  const rows = store.getSeries(id).map((p) => `${p.period},"${p.value.toFixed(2).replace('.', ',')}"`);
  writeFileSync(`samples/SAMPLE-synthetic-${id}.csv`, [`Kỳ,${id}`, ...rows].join('\n') + '\n');
}
console.log('ok');
