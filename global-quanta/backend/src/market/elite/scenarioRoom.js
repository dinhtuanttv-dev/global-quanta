import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson, evaluateConfirmation, scenarioComparison, SCENARIO_VERSION } from "../vendor/evidenceRoom.mjs";

const hash = (value) => createHash("sha256").update(canonicalJson(value)).digest("hex");
const scenarioId = z.string().regex(/^[a-f0-9]{64}$/);
const source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lock"), id: z.string().regex(/^vee1-[a-f0-9]{64}$/) }),
  z.object({ kind: z.literal("run"), id: z.string().uuid() }),
  z.object({ kind: z.literal("scenario"), id: scenarioId }),
]);
const target = z.object({ kind: z.enum(["EVENT_CLUSTER", "VOLUME_LAYER", "PA_TRIGGER"]), key: z.string().min(1).max(1024) }).strict();
const previewInput = z.object({ source, target }).strict();
const saveInput = previewInput.extend({ digest: scenarioId, approve: z.boolean().optional() }).strict();

export function claimsFromLock(item) {
  const lanes = ["BULL", "BEAR", "JUDGE"].map((role) => item.results[role]).filter(Boolean);
  const claims = lanes.flatMap((lane) => lane.scenarioClaims ?? []);
  const partial = lanes.some((lane) => !lane.scenarioClaims || lane.scenarioTruncated);
  return { claims, claimCoverage: partial ? "partial" : claims.length ? "full" : "none" };
}

export function createScenarioRoom({ store, serial, locks, archives, now, error }) {
  const archive = (owner) => archives(owner) + ":scenarios:v1";
  const read = async (key) => (await store.getKv(key))?.value;
  function parse(schema, input) {
    const result = schema.safeParse(input);
    if (!result.success) throw error(400, "Định danh hoặc phạm vi mô phỏng không hợp lệ.");
    return result.data;
  }
  async function get(owner, id) {
    const record = await read(archive(owner) + ":" + parse(scenarioId, id));
    if (!record) throw error(404, "Chưa có kịch bản này trong kho tài khoản.");
    return record;
  }
  async function parent(owner, input) {
    const ref = parse(source, input);
    if (ref.kind === "scenario") return (await get(owner, ref.id)).parent;
    let lockId = ref.id;
    if (ref.kind === "run") {
      const item = await read(archives(owner) + ":" + ref.id);
      if (!item || item.run.account !== owner) throw error(404, "Phiên lưu chưa khả dụng.");
      if (item.run.omittedCluster) throw error(409, "Chọn bản gốc của phiên lưu để mô phỏng.");
      if (canonicalJson(evaluateConfirmation(item.run.projection)) !== canonicalJson(item.run.confirmation))
        throw error(409, "Phiếu gốc không khớp bộ luật hiện tại. Hãy khóa một snapshot mới.");
      if (item.scenarioSeal) return { ...item.scenarioSeal, projection: item.run.projection };
      lockId = item.run.projection.snap.snapshotId;
      const captured = await lockParent(owner, lockId);
      if (canonicalJson(captured.projection) !== canonicalJson(item.run.projection))
        throw error(409, "Bản lưu chưa có nguồn gốc Gateway đối chiếu được. Hãy khóa snapshot mới.");
      return captured;
    }
    return lockParent(owner, lockId);
  }
  async function lockParent(owner, id) {
    const item = (await read(locks(owner)) ?? []).find((row) => row.expiresAt > now() && row.projection.snap.snapshotId === id);
    if (!item) throw error(404, "Snapshot Gateway đã hết hạn hoặc không thuộc tài khoản.");
    return { projection: item.projection, ...claimsFromLock(item) };
  }
  async function preview(owner, input) {
    const request = parse(previewInput, input);
    const base = await parent(owner, request.source);
    let compared;
    try { compared = scenarioComparison(base, request.target); }
    catch { throw error(422, "Không tìm thấy mục tiêu trên bản gốc đã khóa."); }
    const version = SCENARIO_VERSION;
    const id = hash({ version, parent: base, target: request.target });
    const digest = hash({ id, baseline: compared.baseline, confirmation: compared.confirmation, removed: compared.removedRefs.map((ref) => ref.id) });
    return { id, digest, version, parent: base, target: compared.target, baseline: compared.baseline, confirmation: compared.confirmation, savedAt: null };
  }
  return {
    parent, preview, get,
    async list(owner, ticker) {
      parse(z.string().regex(/^[A-Z0-9]{3,10}$/), ticker);
      return (await read(archive(owner)) ?? []).filter((row) => row.ticker === ticker);
    },
    async save(owner, rawId, input) {
      const id = parse(scenarioId, rawId);
      const request = parse(saveInput, input);
      const key = archive(owner);
      return serial(key, async () => {
        const index = await read(key) ?? [];
        let record = await read(key + ":" + id);
        if (!record) {
          const value = await preview(owner, { source: request.source, target: request.target });
          if (value.id !== id || value.digest !== request.digest) throw error(409, "Bản gốc hoặc luận điểm đã đổi. Xem lại phép so sánh.");
          if (index.length >= 80) throw error(409, "Kho kịch bản đã đủ 80 bản.");
          record = { ...value, savedAt: new Date(now()).toISOString() };
          if (Buffer.byteLength(JSON.stringify(record)) > 450000) throw error(413, "Kịch bản vượt dung lượng cho phép.");
          await store.setKv(key + ":" + id, record);
        }
        if (record.digest !== request.digest || record.target.kind !== request.target.kind || record.target.key !== request.target.key)
          throw error(409, "Kịch bản đã lưu có nội dung khác.");
        if (request.approve && !record.approvedAt) {
          record = { ...record, approvedAt: new Date(now()).toISOString() };
          await store.setKv(key + ":" + id, record);
        }
        if (!index.some((entry) => entry.id === id)) await store.setKv(key, [{ id, target: record.target,
          savedAt: record.savedAt, observedAt: record.parent.projection.snap.createdAt, ticker: record.parent.projection.snap.ticker }, ...index]);
        return record;
      });
    },
  };
}
