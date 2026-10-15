/**
 * Write the monthly macro report as Markdown.
 *   npx tsx scripts/make-report.ts --demo --out bao-cao.md
 *   npx tsx scripts/make-report.ts --db macro.db --as-of 2026-07-15 --out bao-cao-07-2026.md
 */
import { writeFileSync } from 'node:fs';
import { createMacroApi } from '../src/macro-api';
import { SqliteVintageStore } from '../src/macro-store-sqlite';
import { SYNTHETIC_NOTICE, makeSyntheticStore } from '../src/macro-seed';
import { parseArgs } from '../src/macro-import';

const { values, flags } = parseArgs(process.argv.slice(2));
const demo = flags.has('demo');
const store = demo ? makeSyntheticStore() : new SqliteVintageStore(values.db ?? 'macro.db');
const api = createMacroApi({ store, notice: demo ? SYNTHETIC_NOTICE : undefined, today: demo ? () => '2026-07-15' : undefined });
api.handle({ method: 'GET', path: '/api/macro/report', query: values['as-of'] ? { asOf: values['as-of'] } : {}, body: undefined }).then((r) => {
  if (r.status !== 200) {
    console.error(`Không tạo được báo cáo: ${(r.body as { error?: string }).error ?? r.status}`);
    process.exit(1);
  }
  const out = values.out ?? 'bao-cao-vi-mo.md';
  writeFileSync(out, (r.body as { markdown: string }).markdown);
  console.log(`Đã ghi ${out}`);
});
