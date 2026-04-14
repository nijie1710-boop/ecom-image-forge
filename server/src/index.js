import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { corsMiddleware } from "./middleware/cors.js";

// Routes
import authRoutes from "./routes/auth.js";
import generateImageRoutes from "./routes/generate-image.js";
import suggestScenesRoutes from "./routes/suggest-scenes.js";
import detailPlanRoutes from "./routes/detail-plan.js";
import translateImageRoutes from "./routes/translate-image.js";
import generateCopyRoutes from "./routes/generate-copy.js";
import optimizeProductInfoRoutes from "./routes/optimize-product-info.js";
import manageBalanceRoutes from "./routes/manage-balance.js";
import alipayOrderRoutes from "./routes/alipay-order.js";
import adminUsersRoutes from "./routes/admin-users.js";
import uploadImageRoutes from "./routes/upload-image.js";
import userImagesRoutes from "./routes/user-images.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || "/opt/picspark/uploads";
fs.mkdirSync(path.join(uploadDir, "translated"), { recursive: true });
fs.mkdirSync(path.join(uploadDir, "images"), { recursive: true });

// Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/generate-image", generateImageRoutes);
app.use("/api/suggest-scenes", suggestScenesRoutes);
app.use("/api/detail-plan", detailPlanRoutes);
app.use("/api/translate-image", translateImageRoutes);
app.use("/api/generate-copy", generateCopyRoutes);
app.use("/api/optimize-product-info", optimizeProductInfoRoutes);
app.use("/api/manage-balance", manageBalanceRoutes);
app.use("/api/alipay-order", alipayOrderRoutes);
app.use("/api/admin-users", adminUsersRoutes);
app.use("/api/upload-image", uploadImageRoutes);
app.use("/api/user-images", userImagesRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "NOT_FOUND", message: "API endpoint not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "INTERNAL_ERROR", message: "服务器内部错误" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ PicSpark API server running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});
