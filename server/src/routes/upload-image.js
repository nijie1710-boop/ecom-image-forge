import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const router = Router();

/**
 * POST /api/upload-image
 *
 * Accepts a base64 image (data URL or raw base64) and saves it to disk.
 * Returns the public URL for the stored file.
 *
 * Body: { imageData: string, folder?: string }
 *   - imageData: data:image/png;base64,... or raw base64 string
 *   - folder: optional subfolder (default "images")
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { imageData, folder } = req.body;

    if (!imageData || typeof imageData !== "string") {
      return res.status(400).json({
        error: "IMAGE_DATA_REQUIRED",
        message: "imageData (base64) is required",
      });
    }

    // Parse data URL or raw base64
    let base64;
    let mimeType = "image/png";

    if (imageData.startsWith("data:")) {
      const match = imageData.match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) {
        return res.status(400).json({
          error: "INVALID_DATA_URL",
          message: "Invalid data URL format",
        });
      }
      mimeType = match[1];
      base64 = match[2];
    } else {
      base64 = imageData;
    }

    // Determine file extension
    const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const subfolder = (folder || "images").replace(/[^a-zA-Z0-9_-]/g, "");
    const uploadDir = process.env.UPLOAD_DIR || "/opt/picspark/uploads";
    const targetDir = path.join(uploadDir, subfolder);

    await fs.mkdir(targetDir, { recursive: true });

    const filename = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(targetDir, filename);

    await fs.writeFile(filePath, Buffer.from(base64, "base64"));

    const publicUrl = `/uploads/${subfolder}/${filename}`;

    res.json({ url: publicUrl });
  } catch (err) {
    console.error("upload-image error:", err);
    res.status(500).json({
      error: "UPLOAD_FAILED",
      message: err.message || "Image upload failed",
    });
  }
});

export default router;
