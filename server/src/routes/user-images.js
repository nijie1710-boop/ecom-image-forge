import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import pool from "../db/pool.js";

const router = Router();

/**
 * POST /api/user-images
 *
 * Unified endpoint for managing user's generated image records.
 * Actions: list, save, delete
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { action } = req.body;
    const userId = req.user.id;

    // ─── LIST ──────────────────────────────────────────────────
    if (action === "list") {
      const limit = Math.min(Number(req.body.limit) || 24, 100);
      const offset = Math.max(Number(req.body.offset) || 0, 0);

      const result = await pool.query(
        `SELECT id, image_url, prompt, style, scene, aspect_ratio, image_type, created_at, group_id, task_kind
         FROM generated_images
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset],
      );

      return res.json({ images: result.rows });
    }

    // ─── SAVE ──────────────────────────────────────────────────
    if (action === "save") {
      const records = Array.isArray(req.body.records) ? req.body.records : [req.body.record].filter(Boolean);

      if (!records.length) {
        return res.status(400).json({
          error: "RECORDS_REQUIRED",
          message: "At least one image record is required",
        });
      }

      const inserted = [];
      for (const record of records) {
        const result = await pool.query(
          `INSERT INTO generated_images (user_id, image_url, prompt, aspect_ratio, image_type, style, scene, group_id, task_kind)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, image_url, created_at`,
          [
            userId,
            record.image_url,
            record.prompt || null,
            record.aspect_ratio || null,
            record.image_type || null,
            record.style || null,
            record.scene || null,
            record.group_id || null,
            record.task_kind || null,
          ],
        );
        inserted.push(result.rows[0]);
      }

      return res.json({ saved: inserted });
    }

    // ─── DELETE ─────────────────────────────────────────────────
    if (action === "delete") {
      const ids = Array.isArray(req.body.ids) ? req.body.ids : [];

      if (!ids.length) {
        return res.status(400).json({
          error: "IDS_REQUIRED",
          message: "ids array is required for delete",
        });
      }

      // Only delete images owned by this user
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(",");
      const result = await pool.query(
        `DELETE FROM generated_images WHERE user_id = $1 AND id IN (${placeholders}) RETURNING id`,
        [userId, ...ids],
      );

      return res.json({ deleted: result.rows.map((r) => r.id) });
    }

    // ─── COUNT ──────────────────────────────────────────────────
    if (action === "count") {
      const result = await pool.query(
        "SELECT COUNT(*)::int AS total FROM generated_images WHERE user_id = $1",
        [userId],
      );

      return res.json({ total: result.rows[0]?.total || 0 });
    }

    return res.status(400).json({
      error: "INVALID_ACTION",
      message: `Unknown action: ${action}`,
    });
  } catch (err) {
    console.error("user-images error:", err);
    res.status(500).json({
      error: "UNKNOWN_ERROR",
      message: err.message || "Unknown error",
    });
  }
});

export default router;
