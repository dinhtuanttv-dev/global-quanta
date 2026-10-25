import { mkdir, open, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FILE_VERSION = 1;

/**
 * Gateway-owned Event Radar ledger. A mounted persistent volume is required for
 * durability across container replacement; writes are serialized and committed
 * with an atomic rename. One active Gateway writer is supported per data dir.
 */
export function createEventRadarRepository({ dataDir = process.env.EVENT_RADAR_DATA_DIR, cwd = process.cwd() } = {}) {
  const explicitlyConfigured = Boolean(String(dataDir ?? "").trim());
  const directory = path.resolve(cwd, String(dataDir || path.join("data", "event-radar")));
  const filePath = path.join(directory, "ledger.json");
  const healthFilePath = path.join(directory, "health.json");
  let statePromise;
  let writeQueue = Promise.resolve();

  async function load() {
    if (!statePromise) {
      statePromise = (async () => {
        await mkdir(directory, { recursive: true });
        try {
          const parsed = JSON.parse(await readFile(filePath, "utf8"));
          if (parsed.version !== FILE_VERSION || !Array.isArray(parsed.events) || !Array.isArray(parsed.revisions)) {
            throw new Error("Unsupported Event Radar ledger format.");
          }
          let health = parsed.health && typeof parsed.health === "object" ? parsed.health : null;
          try { health = JSON.parse(await readFile(healthFilePath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
          return {
            version: FILE_VERSION,
            events: parsed.events,
            revisions: parsed.revisions,
            health,
          };
        } catch (error) {
          if (error.code === "ENOENT") {
            let health = null;
            try { health = JSON.parse(await readFile(healthFilePath, "utf8")); } catch (healthError) { if (healthError.code !== "ENOENT") throw healthError; }
            return { version: FILE_VERSION, events: [], revisions: [], health };
          }
          throw error;
        }
      })();
    }
    return statePromise;
  }

  async function writeAtomic(targetPath, contents) {
    const temporaryPath = path.join(directory, `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporaryPath, targetPath);
      const directoryHandle = await open(directory, "r").catch(() => null);
      if (directoryHandle) {
        // Some platforms (notably Windows) do not allow fsync on directory handles.
        try { await directoryHandle.sync().catch(() => {}); } finally { await directoryHandle.close(); }
      }
    } catch (error) {
      const { unlink } = await import("node:fs/promises");
      await unlink(temporaryPath).catch(() => {});
      throw error;
    }
  }

  async function commit(state) {
    await writeAtomic(filePath, JSON.stringify(state));
  }

  function mutate(mutator) {
    const operation = writeQueue.then(async () => {
      const state = await load();
      const result = await mutator(state);
      await commit(state);
      return result;
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }

  return {
    kind: "gateway_file",
    get storageInfo() {
      return {
        kind: "gateway_file",
        durability: explicitlyConfigured ? "persistent_volume_required" : "local_path_volume_not_confirmed",
        configuredPath: explicitlyConfigured,
        singleWriter: true,
      };
    },
    async listEvents({ ids, limit = 2500 } = {}) {
      const state = await load();
      const idSet = ids ? new Set(ids) : null;
      return state.events
        .filter((row) => !idSet || idSet.has(row.event_id))
        .sort((a, b) => String(b.first_seen_at ?? "").localeCompare(String(a.first_seen_at ?? "")))
        .slice(0, limit)
        .map((row) => structuredClone(row));
    },
    async getEvent(eventId) {
      const state = await load();
      const row = state.events.find((item) => item.event_id === eventId);
      return row ? structuredClone(row) : null;
    },
    async listRevisions(eventId, { limit = 200, before = null } = {}) {
      const state = await load();
      const all = state.revisions.filter((row) => row.event_id === eventId)
        .sort((a, b) => String(a.observed_at).localeCompare(String(b.observed_at)))
      const cursorIndex = before ? all.findIndex((row) => row.revision_id === before) : all.length;
      const end = cursorIndex >= 0 ? cursorIndex : all.length;
      const start = Math.max(0, end - Math.max(1, Math.min(500, limit)));
      const rows = all.slice(start, end);
      return {
        rows: rows.map((row) => structuredClone(row)),
        hasMore: start > 0,
        nextBefore: start > 0 ? rows[0]?.revision_id ?? null : null,
      };
    },
    async upsertEvents(rows) {
      return mutate((state) => {
        const byId = new Map(state.events.map((row) => [row.event_id, row]));
        for (const row of rows) byId.set(row.event_id, structuredClone(row));
        state.events = [...byId.values()];
        return rows.length;
      });
    },
    async appendRevisions(rows) {
      return mutate((state) => {
        const existing = new Set(state.revisions.map((row) => row.revision_id));
        for (const row of rows) {
          if (!existing.has(row.revision_id)) {
            state.revisions.push(structuredClone(row));
            existing.add(row.revision_id);
          }
        }
        return rows.length;
      });
    },
    async pruneEvents(keep = 2500) {
      return mutate((state) => {
        state.events.sort((a, b) => String(b.first_seen_at ?? "").localeCompare(String(a.first_seen_at ?? "")));
        const removed = Math.max(0, state.events.length - keep);
        if (removed) state.events.splice(keep);
        // Revisions are an audit ledger and intentionally outlive event-list retention.
        return removed;
      });
    },
    async saveBatch({ events = [], revisions = [], retain = 2500 } = {}) {
      return mutate((state) => {
        const eventById = new Map(state.events.map((row) => [row.event_id, row]));
        for (const row of events) eventById.set(row.event_id, structuredClone(row));
        state.events = [...eventById.values()].sort((a, b) => String(b.first_seen_at ?? "").localeCompare(String(a.first_seen_at ?? "")));
        const revisionIds = new Set(state.revisions.map((row) => row.revision_id));
        for (const row of revisions) {
          if (!revisionIds.has(row.revision_id)) {
            state.revisions.push(structuredClone(row));
            revisionIds.add(row.revision_id);
          }
        }
        if (state.events.length > retain) state.events.splice(retain);
        return { events: events.length, revisions: revisions.length };
      });
    },
    async getHealth() {
      const state = await load();
      return state.health ? structuredClone(state.health) : null;
    },
    async setHealth(value) {
      const operation = writeQueue.then(async () => {
        const state = await load();
        state.health = structuredClone(value);
        await writeAtomic(healthFilePath, JSON.stringify(state.health));
      });
      writeQueue = operation.catch(() => {});
      return operation;
    },
    async importLegacy({ events = [], revisions = [], health = null } = {}) {
      return mutate((state) => {
        if (state.events.length || state.revisions.length) return { imported: false, reason: "gateway_ledger_not_empty" };
        state.events = events.map((row) => structuredClone(row));
        state.revisions = revisions.map((row) => structuredClone(row));
        state.health = health ? structuredClone(health) : null;
        return { imported: true, events: events.length, revisions: revisions.length };
      });
    },
  };
}
