// /api/world-sectors/* — Nhịp đập thị trường: ngành thế giới ↔ ngành Việt Nam (ICB). Công khai, chỉ đọc; giới hạn tần suất theo IP.
import { Router } from "express";
import { createRateLimiter } from "./macro.js";
import { MATCH_LABEL_VI, REGIONS, VN_SECTORS, WORLD_SECTOR_INSTRUMENTS } from "../market/worldSectors/catalog.js";

export function createWorldSectorsRouter({ getService, readLimit = 120, now } = {}) {
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
  return router;
}
