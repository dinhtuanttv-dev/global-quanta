/**
 * macro-store-sqlite.ts — persistent VintageStore on Node's built-in SQLite (node:sqlite, Node ≥ 22.5).
 * Append-only by design: a revised figure is a NEW row with a later as_of. Re-sending the same
 * (series, period, as_of) corrects that row in place and still bumps the data version, so every
 * cached API answer is invalidated.
 */
import { DatabaseSync } from 'node:sqlite';
import { isPeriod, type Observation, type VintageStore } from './macro-data';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS macro_observation (
  series_id TEXT NOT NULL,
  period    TEXT NOT NULL CHECK (period GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  value     REAL NOT NULL,
  as_of     TEXT NOT NULL CHECK (as_of GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  PRIMARY KEY (series_id, period, as_of)
);
CREATE INDEX IF NOT EXISTS macro_observation_asof ON macro_observation (series_id, as_of);
CREATE TABLE IF NOT EXISTS macro_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
INSERT OR IGNORE INTO macro_meta (key, value) VALUES ('version', 0);
`;

export class SqliteVintageStore implements VintageStore {
  private db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  upsert(obs: Observation[]): void {
    for (const o of obs) {
      if (!isPeriod(o.period)) throw new Error(`invalid period ${o.period}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) throw new Error(`invalid asOf ${o.asOf}`);
    }
    const ins = this.db.prepare(
      'INSERT INTO macro_observation (series_id, period, value, as_of) VALUES (?, ?, ?, ?) ON CONFLICT (series_id, period, as_of) DO UPDATE SET value = excluded.value',
    );
    this.db.exec('BEGIN');
    try {
      for (const o of obs) if (Number.isFinite(o.value)) ins.run(o.seriesId, o.period, o.value, o.asOf);
      this.db.exec("UPDATE macro_meta SET value = value + 1 WHERE key = 'version'");
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  getSeries(seriesId: string, asOf = '9999-12-31'): { period: string; value: number }[] {
    const rows = this.db
      .prepare(
        `SELECT o.period AS period, o.value AS value
           FROM macro_observation o
           JOIN (SELECT period, MAX(as_of) AS m FROM macro_observation WHERE series_id = ? AND as_of <= ? GROUP BY period) x
             ON o.period = x.period AND o.as_of = x.m
          WHERE o.series_id = ?
          ORDER BY o.period`,
      )
      .all(seriesId, asOf, seriesId) as { period: string; value: number }[];
    return rows.map((r) => ({ period: r.period, value: r.value }));
  }

  seriesIds(): string[] {
    return (this.db.prepare('SELECT DISTINCT series_id AS id FROM macro_observation ORDER BY series_id').all() as { id: string }[]).map((r) => r.id);
  }

  dataVersion(): string {
    const r = this.db.prepare("SELECT value FROM macro_meta WHERE key = 'version'").get() as { value: number };
    return `s${r.value}`;
  }

  close(): void {
    this.db.close();
  }
}
