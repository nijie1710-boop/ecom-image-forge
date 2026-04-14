import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import pool from "../db/pool.js";

const router = Router();

// POST /api/manage-balance
router.post("/", requireAuth, async (req, res) => {
  try {
    const { action, userId, amount, operationType, description, paymentMethod, notes } = req.body;
    const currentUserId = req.user.id;

    // Determine target user: default to the authenticated user
    const targetUserId = userId || currentUserId;

    switch (action) {
      case "get": {
        const [balanceResult, rechargeCount, consumptionCount] = await Promise.all([
          pool.query(
            "SELECT balance, total_recharged, total_consumed FROM user_balances WHERE user_id = $1",
            [targetUserId]
          ),
          pool.query(
            "SELECT COUNT(*)::int AS cnt FROM recharge_records WHERE user_id = $1",
            [targetUserId]
          ),
          pool.query(
            "SELECT COUNT(*)::int AS cnt FROM consumption_records WHERE user_id = $1",
            [targetUserId]
          ),
        ]);
        const row = balanceResult.rows[0];
        return res.json({
          balance: {
            balance: Number(row?.balance ?? 0),
            total_recharged: Number(row?.total_recharged ?? 0),
            total_consumed: Number(row?.total_consumed ?? 0),
            recharge_count: rechargeCount.rows[0]?.cnt ?? 0,
            consumption_count: consumptionCount.rows[0]?.cnt ?? 0,
          },
          user_id: targetUserId,
        });
      }

      case "get_pricing": {
        const result = await pool.query(
          "SELECT key, value FROM admin_settings WHERE key IN ('recharge_packages', 'credit_rules')"
        );
        const settings = {};
        for (const row of result.rows) {
          try {
            settings[row.key] = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
          } catch {
            settings[row.key] = row.value;
          }
        }
        return res.json({ settings });
      }

      case "history": {
        const [rechargeResult, consumptionResult] = await Promise.all([
          pool.query(
            `SELECT id, user_id, amount, payment_method, notes, created_at
             FROM recharge_records
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [targetUserId]
          ),
          pool.query(
            `SELECT id, user_id, amount, operation_type, description, created_at
             FROM consumption_records
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 50`,
            [targetUserId]
          ),
        ]);

        return res.json({
          recharges: rechargeResult.rows,
          consumptions: consumptionResult.rows,
        });
      }

      case "deduct": {
        if (!amount || amount <= 0) {
          return res.status(400).json({ error: "INVALID_AMOUNT", message: "Amount must be positive" });
        }

        const deductDesc = description || operationType || "manual-deduct";
        const result = await pool.query(
          "SELECT deduct_balance($1, $2, $3) AS new_balance",
          [targetUserId, amount, deductDesc]
        );

        return res.json({
          success: true,
          new_balance: result.rows[0]?.new_balance,
          deducted: amount,
          description: deductDesc,
        });
      }

      case "recharge": {
        // Admin-only action
        const roleResult = await pool.query(
          "SELECT role FROM user_roles WHERE user_id = $1 AND role = 'admin'",
          [currentUserId]
        );
        if (roleResult.rows.length === 0) {
          return res.status(403).json({ error: "FORBIDDEN", message: "Only admins can recharge balances" });
        }

        if (!amount || amount <= 0) {
          return res.status(400).json({ error: "INVALID_AMOUNT", message: "Amount must be positive" });
        }

        if (!targetUserId) {
          return res.status(400).json({ error: "USER_ID_REQUIRED", message: "Target userId is required for recharge" });
        }

        const rechargeDesc = description || "admin-recharge";
        const result = await pool.query(
          "SELECT add_balance($1, $2, $3) AS new_balance",
          [targetUserId, amount, rechargeDesc]
        );

        return res.json({
          success: true,
          new_balance: result.rows[0]?.new_balance,
          added: amount,
          description: rechargeDesc,
          paymentMethod: paymentMethod || null,
          notes: notes || null,
        });
      }

      case "purchase_package": {
        return res.status(410).json({
          error: "MOVED",
          message: "Package purchase has been moved to the Alipay payment flow",
        });
      }

      default: {
        return res.status(400).json({
          error: "INVALID_ACTION",
          message: `Unknown action: ${action}. Supported: get, get_pricing, history, deduct, recharge, purchase_package`,
        });
      }
    }
  } catch (err) {
    console.error("manage-balance error:", err);
    res.status(500).json({ error: "UNKNOWN_ERROR", message: err.message || "Unknown error" });
  }
});

export default router;
