import { z } from "zod";
import { eventKey, expectedArtifactId, expectedContentId, marketDay, RESEARCH_POLICY, type ResearchRun } from "./research";

const DB_NAME = "global-quanta-evidence-research";
const RUNS = "runs";
const REVIEWS = "reviews";
const iso = z.string().refine((value) => value.includes("T") && marketDay(value) !== null);
const uuid = z.string().uuid();
const hash = z.string().regex(/^eb-research-[a-f0-9]{64}$/);
const runRecord = z.object({
  schema: z.literal(1), account: z.string().min(1), id: uuid, contentId: hash, savedAt: iso, observedAt: iso,
  artifactId: hash.optional(), omittedCluster: z.string().min(1).nullable(), parentContentId: hash.nullable(),
  policy: z.enum(["research-confirmation-1", RESEARCH_POLICY]),
  projection: z.object({
    snap: z.object({
      schemaVersion: z.literal("vee-1.0"), ticker: z.string().regex(/^[A-Z0-9]{3,10}$/).nullable(), snapshotId: z.string().min(1),
      decisionSession: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => marketDay(value) === value),
      createdAt: iso, sources: z.array(z.object({ key: z.string(), warnings: z.array(z.string()) })),
      refs: z.array(z.object({ id: z.string(), domain: z.string(), fieldPath: z.string() })), data: z.record(z.string(), z.unknown()),
      stale: z.array(z.string()), missing: z.array(z.string()), conflicts: z.array(z.string()),
      funnel: z.object({ steps: z.array(z.object({ index: z.number() })), membership: z.object({ state: z.string() }), frozen: z.boolean() }),
    }),
    data: z.object({ events: z.array(z.object({ eventId: z.string(), clusterId: z.string().nullable(), title: z.string() })),
      price: z.object({ bars: z.array(z.object({ date: z.string(), close: z.number() })), priceBasis: z.string() }).nullable(),
      volume: z.object({ today: z.object({ date: z.string() }), trend: z.object({ bars30: z.array(z.object({ date: z.string() })) }) }).nullable(),
      pa: z.object({ ticker: z.string(), state: z.string(), blockers: z.array(z.string()) }).nullable(),
      liquidity: z.object({ ticker: z.string(), date: z.string() }).nullable(), timing: z.object({ status: z.string() }).nullable(), sector: z.string().nullable() }),
  }),
  confirmation: z.object({
    result: z.enum(["BLOCKED", "NO_CONFIRMATION", "INDETERMINATE", "PENDING", "CRITERIA_MET", "CONTEXT"]),
    reason: z.string(),
    checks: z.array(z.object({
      id: z.enum(["decision", "priceAction", "volume", "liquidity", "events"]),
      state: z.enum(["PASS", "FAIL", "MISSING", "WAIT", "CONTEXT", "EXCLUDED"]),
      reason: z.string(),
    })),
  }),
  claims: z.array(z.object({ id: z.string(), text: z.string(), refs: z.array(z.string()), supports: z.array(z.string()),
    invalidates: z.array(z.string()), validationNotes: z.array(z.string()) })),
});

export async function validResearchRun(input: unknown, account: string): Promise<ResearchRun | null> {
  const checked = runRecord.safeParse(input);
  if (!checked.success || checked.data.account !== account || checked.data.observedAt !== checked.data.projection.snap.createdAt) return null;
  // Zod validates the persisted shape. Retain the original object for re-hashing the full projection.
  const run = input as ResearchRun;
  try {
    if (run.omittedCluster && !run.projection.data.events.some((event) => eventKey(event) === run.omittedCluster)) return null;
    const ids = await expectedContentId(run.projection, run.omittedCluster, run.policy);
    if (ids.contentId !== run.contentId || ids.parentContentId !== run.parentContentId) return null;
    if (run.policy === RESEARCH_POLICY && (await expectedArtifactId(run)) !== run.artifactId) return null;
    return run;
  } catch { return null; }
}

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error("Trình duyệt không hỗ trợ IndexedDB."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      database.createObjectStore(RUNS, { keyPath: ["account", "id"] }).createIndex("account", "account");
      database.createObjectStore(REVIEWS, { keyPath: ["account", "id"] });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Kho đang mở ở cửa sổ khác."));
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function transact<T>(store: string | string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => IDBRequest<T>) {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      tx.onabort = () => reject(tx.error ?? new Error("Giao dịch IndexedDB bị hủy."));
      tx.onerror = () => reject(tx.error ?? new Error("Không thực hiện được giao dịch IndexedDB."));
      try {
        const request = action(tx);
        tx.oncomplete = () => resolve(request.result);
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  } finally { db.close(); }
}

export async function listResearchRuns(account: string, ticker: string | null) {
  const rows: unknown[] = await transact(RUNS, "readonly", (tx) => tx.objectStore(RUNS).index("account").getAll(account));
  const valid = await Promise.all(rows.map((row) => validResearchRun(row, account)));
  return {
    runs: valid.filter((row): row is ResearchRun => row !== null && row.projection.snap.ticker === ticker)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt) || b.id.localeCompare(a.id)),
    rejected: valid.filter((row) => row === null).length,
  };
}

export function storeResearchRun(run: ResearchRun) {
  return transact(RUNS, "readwrite", (tx) => tx.objectStore(RUNS).add(run));
}

type LocalReview = { account: string; id: string; approvedAt: string; artifactId?: string };

export async function getResearchApproval(run: ResearchRun): Promise<string | null> {
  const row: LocalReview | undefined = await transact(REVIEWS, "readonly", (tx) => tx.objectStore(REVIEWS).get([run.account, run.id]));
  return row && row.artifactId === run.artifactId && iso.safeParse(row.approvedAt).success ? row.approvedAt : null;
}

export async function approveResearchNote(run: ResearchRun): Promise<string> {
  const approvedAt = new Date().toISOString();
  const row: LocalReview | undefined = await transact([RUNS, REVIEWS], "readwrite", (tx) => {
    const runs = tx.objectStore(RUNS), reviews = tx.objectStore(REVIEWS);
    const key = [run.account, run.id];
    const record = runs.get(key);
    record.onsuccess = () => {
      if (record.result === undefined) runs.add(run);
      else if (record.result.artifactId !== run.artifactId || record.result.contentId !== run.contentId) tx.abort();
    };
    const review = reviews.get(key);
    review.onsuccess = () => {
      if (review.result === undefined) reviews.add({ account: run.account, id: run.id, approvedAt, artifactId: run.artifactId });
      else if (review.result.artifactId !== run.artifactId || !iso.safeParse(review.result.approvedAt).success) tx.abort();
    };
    return review;
  });
  return row?.approvedAt ?? approvedAt;
}
