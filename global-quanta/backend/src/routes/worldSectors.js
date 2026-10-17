// /api/world-sectors/* — Nhịp đập thị trường: ngành thế giới ↔ ngành Việt Nam (ICB). Công khai, chỉ đọc; giới hạn tần suất theo IP.
import { Router } from "express";
import { createRateLimiter } from "./macro.js";
import { MATCH_LABEL_VI, REGIONS, VN_SECTORS, WORLD_SECTOR_INSTRUMENTS } from "../market/worldSectors/catalog.js";

export function createWorldSectorsRouter({ getService, getStrategy = null, readLimit = 120, now } = {}) {
  const router = Router();
  const readRl = createRateLimiter({ limit: readLimit, now });
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (e) {
      res.status(500).json({ error: "Lỗi dữ liệu ngành thế giới." });
      console.warn(`[world-sectors] ${req.method} ${req.path}: ${e?.message}`);
    }
  };
  router.get("/catalog", readRl, (req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json({ vn: VN_SECTORS, regions: REGIONS, instruments: WORLD_SECTOR_INSTRUMENTS, matchLabels: MATCH_LABEL_VI });
  });
  router.get("/snapshot", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=120");
    res.json(await getService().snapshot());
  }));
  router.get("/scores", readRl, wrap(async (req, res) => {
    res.set("Cache-Control", "public, max-age=120");
    res.json(await getService().scores());
  }));
  // Chiến lược ngắn hạn (α = IC·σ·z, chỉ IC đã kiểm định) & bối cảnh trung hạn (S1).
  router.get("/strategy", readRl, wrap(async (req, res) => {
    if (!getStrategy) { res.status(503).json({ error: "Chưa bật chiến lược." }); return; }
    res.set("Cache-Control", "public, max-age=120");
    res.json(await getStrategy().strategy());
  }));
  router.get("/:icb/detail", readRl, wrap(async (req, res) => {
    const r = await getService().detail(String(req.params.icb || ""), typeof req.query.range === "string" ? req.query.range : "3y");
    res.set("Cache-Control", r.status === 200 ? "public, max-age=300" : "no-store");
    res.status(r.status).json(r.body);
  }));
  return router;
}
