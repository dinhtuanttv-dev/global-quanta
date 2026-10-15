/**
 * Run the macro API.
 *   npx tsx scripts/serve.ts --demo                    # synthetic data, banner shown in every payload
 *   npx tsx scripts/serve.ts --db macro.db --port 8787 # real data from SQLite
 * Optional: --cors http://localhost:5173 to allow a Vite dev server.
 */
import { createMacroApi } from '../src/macro-api';
import { startMacroServer } from '../src/macro-http';
import { SqliteVintageStore } from '../src/macro-store-sqlite';
import { SYNTHETIC_NOTICE, makeSyntheticStore } from '../src/macro-seed';
import { parseArgs } from '../src/macro-import';

const { values, flags } = parseArgs(process.argv.slice(2));
const demo = flags.has('demo');
const store = demo ? makeSyntheticStore() : new SqliteVintageStore(values.db ?? 'macro.db');
const api = createMacroApi({ store, notice: demo ? SYNTHETIC_NOTICE : undefined });
startMacroServer(api, { port: Number(values.port ?? 8787), allowOrigin: values.cors }).then((s) => {
  console.log(`Macro API: http://127.0.0.1:${s.port}/api/macro/health  (${demo ? 'DỮ LIỆU MÔ PHỎNG' : 'SQLite ' + (values.db ?? 'macro.db')})`);
  process.on('SIGINT', () => {
    void s.close().then(() => process.exit(0));
  });
});
