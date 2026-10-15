/**
 * Import one CSV (period,value) into the SQLite store.
 *   npx tsx scripts/import-csv.ts --db macro.db --series CPI --file cpi.csv --locale vi
 * Options: --delimiter ;  --monthly last|mean  --as-of YYYY-MM-DD  --no-header
 * Exit code 1 when a hard data-quality error is found (the data is still stored; fix and re-import).
 */
import { readFileSync } from 'node:fs';
import { VN_CATALOG } from '../src/macro-data';
import { SqliteVintageStore } from '../src/macro-store-sqlite';
import { importCsvInto, parseArgs } from '../src/macro-import';

const { values, flags } = parseArgs(process.argv.slice(2));
const meta = VN_CATALOG.find((m) => m.id === values.series);
if (!values.file || !meta) {
  console.error(`Cách dùng: tsx scripts/import-csv.ts --db macro.db --series <${VN_CATALOG.map((m) => m.id).join('|')}> --file duong-dan.csv [--locale vi|en|auto] [--delimiter ;] [--monthly last|mean] [--as-of YYYY-MM-DD] [--no-header]`);
  process.exit(2);
}
const store = new SqliteVintageStore(values.db ?? 'macro.db');
const report = importCsvInto(store, readFileSync(values.file, 'utf8'), meta, {
  locale: (values.locale as 'vi' | 'en' | 'auto') ?? 'auto',
  delimiter: values.delimiter,
  hasHeader: !flags.has('no-header'),
  monthly: (values.monthly as 'last' | 'mean') ?? 'last',
  asOf: values['as-of'],
  today: new Date().toISOString().slice(0, 10),
});
console.log(`${report.seriesId}: nạp ${report.inserted} kỳ (${report.firstPeriod} → ${report.lastPeriod}), bỏ ${report.rejectedRows} dòng không đọc được.`);
for (const i of report.issues) console.log(`  [${i.severity}] ${i.message}`);
store.close();
process.exit(report.hasErrors ? 1 : 0);
