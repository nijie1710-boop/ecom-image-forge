/**
 * composite.js - Background removal + scene compositing utilities
 */
import sharp from "sharp";
import { removeBackground } from "@imgly/background-removal-node";

/**
 * Remove the background from a product image.
 * @param {Buffer} imageBuffer - The raw image buffer
 * @returns {Promise<Buffer>} - Transparent PNG buffer
 */
export async function removeProductBackground(imageBuffer) {
  // @imgly/background-removal-node accepts Blob, ArrayBuffer, or URL
  const blob = new Blob([imageBuffer], { type: "image/png" });
  const resultBlob = await removeBackground(blob, {
    output: { format: "image/png" },
  });
  const arrayBuffer = await resultBlob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Composite a transparent product image onto a scene background.
 *
 * The product is centered and scaled to occupy ~65-75% of the scene,
 * matching typical e-commerce hero shot composition.
 *
 * @param {Buffer} sceneBgBuffer - Scene background image (JPEG/PNG)
 * @param {Buffer} productBuffer - Transparent product image (PNG with alpha)
 * @param {{ aspectRatio?: string, position?: "center" | "bottom-center" }} options
 * @returns {Promise<Buffer>} - Final composited JPEG buffer
 */
export async function compositeProductOnScene(sceneBgBuffer, productBuffer, options = {}) {
  const position = options.position || "center";

  // Get scene dimensions
  const sceneMeta = await sharp(sceneBgBuffer).metadata();
  const sceneWidth = sceneMeta.width || 1024;
  const sceneHeight = sceneMeta.height || 1024;

  // Get product dimensions
  const productMeta = await sharp(productBuffer).metadata();
  const productWidth = productMeta.width || 512;
  const productHeight = productMeta.height || 512;

  // Scale product to fit ~70% of the scene (by the larger dimension)
  const targetFraction = 0.70;
  const scaleX = (sceneWidth * targetFraction) / productWidth;
  const scaleY = (sceneHeight * targetFraction) / productHeight;
  const scale = Math.min(scaleX, scaleY);

  const newWidth = Math.round(productWidth * scale);
  const newHeight = Math.round(productHeight * scale);

  // Resize product
  const resizedProduct = await sharp(productBuffer)
    .resize(newWidth, newHeight, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Calculate position
  let left = Math.round((sceneWidth - newWidth) / 2);
  let top;
  if (position === "bottom-center") {
    top = Math.round(sceneHeight - newHeight - sceneHeight * 0.08);
  } else {
    top = Math.round((sceneHeight - newHeight) / 2);
  }

  // Ensure non-negative
  left = Math.max(0, left);
  top = Math.max(0, top);

  // Composite
  const result = await sharp(sceneBgBuffer)
    .composite([
      {
        input: resizedProduct,
        left,
        top,
        blend: "over",
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();

  return result;
}

/**
 * Add a subtle drop shadow beneath the product for more natural compositing.
 *
 * @param {Buffer} sceneBgBuffer - Scene background
 * @param {Buffer} productBuffer - Transparent product
 * @param {{ sceneWidth: number, sceneHeight: number, productRect: { left: number, top: number, width: number, height: number } }} params
 * @returns {Promise<Buffer>} - Shadow layer as PNG buffer
 */
export async function createShadowLayer(sceneWidth, sceneHeight, productRect) {
  // Create a semi-transparent elliptical shadow
  const shadowWidth = Math.round(productRect.width * 0.8);
  const shadowHeight = Math.round(productRect.height * 0.08);
  const shadowX = productRect.left + Math.round((productRect.width - shadowWidth) / 2);
  const shadowY = productRect.top + productRect.height - Math.round(shadowHeight * 0.5);

  const svg = `<svg width="${sceneWidth}" height="${sceneHeight}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="${Math.round(shadowHeight * 0.6)}" />
      </filter>
    </defs>
    <ellipse cx="${shadowX + shadowWidth / 2}" cy="${shadowY}" rx="${shadowWidth / 2}" ry="${shadowHeight / 2}" fill="rgba(0,0,0,0.15)" filter="url(#blur)" />
  </svg>`;

  return Buffer.from(svg);
}
