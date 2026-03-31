/**
 * 图片文字叠加工具 - 将卖点文案排版到生成的详情页图片上
 * 支持多种排版模板，字体清晰锐利
 */

export type OverlayStyle =
  | 'selling-point'
  | 'scene'
  | 'detail'
  | 'main'
  | 'center-title'
  | 'price-tag'
  | 'promo-watermark'
  | 'split-info'
  | 'badge-grid';

export interface TextOverlayConfig {
  title?: string;
  sellingPoints: string[];
  productName?: string;
  style?: OverlayStyle;
  brandColor?: string;
  price?: string;
  promoText?: string;
}

const FONT_STACK = '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Helvetica Neue", sans-serif';

/**
 * 将文字叠加到图片上，返回合成后的 data URL
 */
export async function overlayTextOnImage(
  imageUrl: string,
  config: TextOverlayConfig
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(imageUrl); return; }

        ctx.drawImage(img, 0, 0);

        const w = canvas.width;
        const h = canvas.height;
        const padding = Math.round(w * 0.06);
        const brandColor = config.brandColor || '#FF4D4F';

        ctx.textRendering = 'optimizeLegibility' as any;
        (ctx as any).imageSmoothingEnabled = true;
        (ctx as any).imageSmoothingQuality = 'high';

        const drawFn = DRAW_MAP[config.style || 'selling-point'] || drawSellingPointOverlay;
        drawFn(ctx, w, h, padding, config, brandColor);

        resolve(canvas.toDataURL('image/png', 1.0));
      } catch (err) {
        console.error('Text overlay error:', err);
        resolve(imageUrl);
      }
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}

// ──────────────────────────────────────────
// Draw function registry
// ──────────────────────────────────────────
type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number, p: number, cfg: TextOverlayConfig, brand: string) => void;

const DRAW_MAP: Record<OverlayStyle, DrawFn> = {
  'selling-point': drawSellingPointOverlay,
  'scene': drawSceneOverlay,
  'detail': drawDetailOverlay,
  'main': drawMainOverlay,
  'center-title': drawCenterTitleOverlay,
  'price-tag': drawPriceTagOverlay,
  'promo-watermark': drawPromoWatermarkOverlay,
  'split-info': drawSplitInfoOverlay,
  'badge-grid': drawBadgeGridOverlay,
};

// ──────────────────────────────────────────
// 1. 卖点展示 — 底部渐变 + 编号列表
// ──────────────────────────────────────────
function drawSellingPointOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  const points = config.sellingPoints.slice(0, 4);
  const blockH = Math.round(h * 0.38);
  const startY = h - blockH;

  const grad = ctx.createLinearGradient(0, startY - 40, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.15, 'rgba(0,0,0,0.7)');
  grad.addColorStop(1, 'rgba(0,0,0,0.88)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, startY - 40, w, blockH + 40);

  if (config.productName) {
    const s = Math.round(w * 0.05);
    ctx.font = `bold ${s}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    setShadow(ctx, 'rgba(0,0,0,0.5)', 4, 0, 2);
    ctx.fillText(config.productName, padding, startY + padding * 0.6);
    clearShadow(ctx);
  }

  const lineY = startY + padding * (config.productName ? 1.2 : 0.3);
  ctx.fillStyle = brandColor;
  ctx.fillRect(padding, lineY, w * 0.12, 3);

  const fontSize = Math.round(w * 0.035);
  const lh = fontSize * 2.2;
  let y = lineY + padding * 0.8;

  points.forEach((point, i) => {
    const bs = Math.round(fontSize * 1.4);
    ctx.fillStyle = brandColor;
    roundRect(ctx, padding, y - bs * 0.7, bs, bs, 4);
    ctx.fill();

    ctx.font = `bold ${Math.round(fontSize * 0.85)}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, padding + bs / 2, y - bs * 0.7 + bs * 0.72);
    ctx.textAlign = 'left';

    ctx.font = `500 ${fontSize}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText(point, padding + bs + 10, y);
    y += lh;
  });
}

// ──────────────────────────────────────────
// 2. 场景展示 — 左侧竖条
// ──────────────────────────────────────────
function drawSceneOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  const barW = Math.round(w * 0.35);
  const g = ctx.createLinearGradient(0, 0, barW, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, barW, h);

  ctx.fillStyle = brandColor;
  ctx.fillRect(padding * 0.4, padding, 4, h - padding * 2);

  if (config.productName) {
    const s = Math.round(w * 0.04);
    ctx.font = `bold ${s}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(config.productName, padding, padding + s);
  }

  if (config.sellingPoints.length > 0) {
    const qs = Math.round(w * 0.035);
    ctx.font = `300 ${qs}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const maxW = barW - padding * 1.5;
    let y = padding + (config.productName ? Math.round(w * 0.08) : 0);
    config.sellingPoints.slice(0, 2).forEach((pt) => {
      wrapText(ctx, pt, maxW).forEach((line) => {
        ctx.fillText(line, padding, y + qs);
        y += qs * 1.6;
      });
      y += qs * 0.5;
    });
  }
}

// ──────────────────────────────────────────
// 3. 细节特写 — 底部极简标注
// ──────────────────────────────────────────
function drawDetailOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  const barH = Math.round(h * 0.12);
  const barY = h - barH;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, barY, w, barH);
  ctx.fillStyle = brandColor;
  ctx.fillRect(0, barY, w, 3);

  ctx.font = `bold ${Math.round(w * 0.035)}px ${FONT_STACK}`;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillText(config.productName || '', padding, barY + barH * 0.45);

  if (config.sellingPoints.length > 0) {
    ctx.font = `400 ${Math.round(w * 0.028)}px ${FONT_STACK}`;
    ctx.fillStyle = '#666666';
    ctx.fillText(config.sellingPoints[0], padding, barY + barH * 0.78);
  }
}

// ──────────────────────────────────────────
// 4. 主图 — 底部品牌标注
// ──────────────────────────────────────────
function drawMainOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  const grad = ctx.createLinearGradient(0, h * 0.8, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, h * 0.8, w, h * 0.2);

  if (config.productName) {
    const s = Math.round(w * 0.045);
    ctx.font = `bold ${s}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    setShadow(ctx, 'rgba(0,0,0,0.6)', 6);
    ctx.fillText(config.productName, padding, h - padding * 1.8);
    clearShadow(ctx);
  }
  if (config.sellingPoints.length > 0) {
    const s = Math.round(w * 0.03);
    ctx.font = `400 ${s}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    setShadow(ctx, 'rgba(0,0,0,0.5)', 4);
    ctx.fillText(config.sellingPoints[0], padding, h - padding);
    clearShadow(ctx);
  }
}

// ──────────────────────────────────────────
// 5. 居中大字标题 — 全屏遮罩 + 居中大标题 + 副标题
// ──────────────────────────────────────────
function drawCenterTitleOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  // Dimmed overlay for legibility
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, w, h);

  // Top accent line
  const lineW = Math.round(w * 0.15);
  ctx.fillStyle = brandColor;
  ctx.fillRect((w - lineW) / 2, h * 0.35, lineW, 4);

  // Main title — product name large and centered
  const titleText = config.productName || config.sellingPoints[0] || '';
  const titleSize = Math.round(w * 0.09);
  ctx.font = `bold ${titleSize}px ${FONT_STACK}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  setShadow(ctx, 'rgba(0,0,0,0.6)', 8);

  const titleLines = wrapText(ctx, titleText, w - padding * 4);
  let ty = h * 0.42;
  titleLines.forEach((line) => {
    ctx.fillText(line, w / 2, ty + titleSize);
    ty += titleSize * 1.3;
  });
  clearShadow(ctx);

  // Subtitle — first selling point
  if (config.sellingPoints.length > 0) {
    const subSize = Math.round(w * 0.035);
    ctx.font = `300 ${subSize}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    const subText = config.sellingPoints[config.productName ? 0 : 1] || '';
    if (subText) {
      ctx.fillText(subText, w / 2, ty + subSize * 1.2);
    }
  }

  // Bottom accent line
  ctx.fillStyle = brandColor;
  ctx.fillRect((w - lineW) / 2, ty + Math.round(w * 0.08), lineW, 4);

  ctx.textAlign = 'left';
}

// ──────────────────────────────────────────
// 6. 价格标签 — 右下角醒目价格 + 产品名
// ──────────────────────────────────────────
function drawPriceTagOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  const price = config.price || config.promoText || '¥99';

  // Price badge background — rounded rectangle bottom-right
  const badgeW = Math.round(w * 0.45);
  const badgeH = Math.round(h * 0.18);
  const bx = w - badgeW - padding;
  const by = h - badgeH - padding;

  ctx.fillStyle = brandColor;
  roundRect(ctx, bx, by, badgeW, badgeH, 12);
  ctx.fill();

  // Price text
  const priceSize = Math.round(w * 0.08);
  ctx.font = `bold ${priceSize}px ${FONT_STACK}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  setShadow(ctx, 'rgba(0,0,0,0.3)', 4);
  ctx.fillText(price, bx + badgeW / 2, by + badgeH * 0.55);
  clearShadow(ctx);

  // "到手价" or subtitle
  const labelSize = Math.round(w * 0.025);
  ctx.font = `500 ${labelSize}px ${FONT_STACK}`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('到手价', bx + badgeW / 2, by + badgeH * 0.82);
  ctx.textAlign = 'left';

  // Product name top-left with soft gradient
  const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.2);
  topGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
  topGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, h * 0.2);

  if (config.productName) {
    const ns = Math.round(w * 0.04);
    ctx.font = `bold ${ns}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    setShadow(ctx, 'rgba(0,0,0,0.5)', 4);
    ctx.fillText(config.productName, padding, padding + ns);
    clearShadow(ctx);
  }
}

// ──────────────────────────────────────────
// 7. 促销水印 — 全图斜向重复水印文字
// ──────────────────────────────────────────
function drawPromoWatermarkOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  const text = config.promoText || config.title || '限时特惠';
  const fontSize = Math.round(w * 0.06);

  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.font = `bold ${fontSize}px ${FONT_STACK}`;
  ctx.fillStyle = brandColor;
  ctx.rotate(-Math.PI / 6);

  const spacing = fontSize * 4;
  for (let y = -h; y < h * 2; y += spacing) {
    for (let x = -w; x < w * 2; x += spacing) {
      ctx.fillText(text, x, y);
    }
  }
  ctx.restore();

  // Main banner strip in center
  const stripH = Math.round(h * 0.14);
  const stripY = (h - stripH) / 2;
  ctx.fillStyle = brandColor;
  ctx.fillRect(0, stripY, w, stripH);

  // Banner text
  const bannerSize = Math.round(w * 0.065);
  ctx.font = `bold ${bannerSize}px ${FONT_STACK}`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, stripY + stripH * 0.65);

  // Sub info
  if (config.sellingPoints.length > 0) {
    const subSize = Math.round(w * 0.028);
    ctx.font = `400 ${subSize}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText(config.sellingPoints[0], w / 2, stripY + stripH * 0.92);
  }
  ctx.textAlign = 'left';

  // Product name bottom
  if (config.productName) {
    const ns = Math.round(w * 0.035);
    ctx.font = `500 ${ns}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    setShadow(ctx, 'rgba(0,0,0,0.6)', 6);
    ctx.fillText(config.productName, padding, h - padding);
    clearShadow(ctx);
  }
}

// ──────────────────────────────────────────
// 8. 左右分栏 — 左侧信息栏 + 右侧产品区
// ──────────────────────────────────────────
function drawSplitInfoOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  // Left panel
  const panelW = Math.round(w * 0.42);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.fillRect(0, 0, panelW, h);

  // Brand accent top
  ctx.fillStyle = brandColor;
  ctx.fillRect(0, 0, panelW, 5);

  let y = padding * 1.5;

  // Product name
  if (config.productName) {
    const ns = Math.round(w * 0.042);
    ctx.font = `bold ${ns}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    const lines = wrapText(ctx, config.productName, panelW - padding * 2);
    lines.forEach((line) => {
      ctx.fillText(line, padding, y + ns);
      y += ns * 1.4;
    });
    y += padding * 0.5;
  }

  // Divider
  ctx.fillStyle = brandColor;
  ctx.fillRect(padding, y, panelW * 0.3, 3);
  y += padding;

  // Selling points
  const ps = Math.round(w * 0.03);
  ctx.font = `400 ${ps}px ${FONT_STACK}`;
  config.sellingPoints.slice(0, 5).forEach((pt) => {
    ctx.fillStyle = brandColor;
    ctx.beginPath();
    ctx.arc(padding + 6, y + ps * 0.3, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const lines = wrapText(ctx, pt, panelW - padding * 2 - 20);
    lines.forEach((line) => {
      ctx.fillText(line, padding + 18, y + ps);
      y += ps * 1.5;
    });
    y += ps * 0.4;
  });

  // Price if available
  if (config.price) {
    y += padding * 0.5;
    const priceS = Math.round(w * 0.055);
    ctx.font = `bold ${priceS}px ${FONT_STACK}`;
    ctx.fillStyle = brandColor;
    ctx.fillText(config.price, padding, y + priceS);
  }
}

// ──────────────────────────────────────────
// 9. 卖点徽章网格 — 顶部标题 + 底部 2×2 圆角徽章
// ──────────────────────────────────────────
function drawBadgeGridOverlay(ctx: CanvasRenderingContext2D, w: number, h: number, padding: number, config: TextOverlayConfig, brandColor: string) {
  // Bottom area for badges
  const gridH = Math.round(h * 0.35);
  const gridY = h - gridH;

  // Frosted background
  const grad = ctx.createLinearGradient(0, gridY - 30, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.1, 'rgba(255,255,255,0.88)');
  grad.addColorStop(1, 'rgba(255,255,255,0.95)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, gridY - 30, w, gridH + 30);

  // Top colored bar
  ctx.fillStyle = brandColor;
  ctx.fillRect(0, gridY - 30, w, 4);

  // Product name as header
  if (config.productName) {
    const ns = Math.round(w * 0.04);
    ctx.font = `bold ${ns}px ${FONT_STACK}`;
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'center';
    ctx.fillText(config.productName, w / 2, gridY + padding * 0.3);
    ctx.textAlign = 'left';
  }

  // 2x2 badge grid
  const points = config.sellingPoints.slice(0, 4);
  const cols = 2;
  const gap = Math.round(w * 0.03);
  const badgeW = Math.round((w - padding * 2 - gap) / cols);
  const badgeH = Math.round((gridH - padding * 2.5) / 2);

  points.forEach((pt, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const bx = padding + col * (badgeW + gap);
    const by = gridY + padding * 0.8 + row * (badgeH + gap * 0.8);

    // Badge background
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, bx, by, badgeW, badgeH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Number circle
    const circR = Math.round(w * 0.025);
    ctx.fillStyle = brandColor;
    ctx.beginPath();
    ctx.arc(bx + padding * 0.7, by + badgeH * 0.35, circR, 0, Math.PI * 2);
    ctx.fill();

    const numS = Math.round(circR * 1.1);
    ctx.font = `bold ${numS}px ${FONT_STACK}`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.fillText(`${i + 1}`, bx + padding * 0.7, by + badgeH * 0.35 + numS * 0.35);
    ctx.textAlign = 'left';

    // Badge text
    const ts = Math.round(w * 0.028);
    ctx.font = `500 ${ts}px ${FONT_STACK}`;
    ctx.fillStyle = '#333333';
    const lines = wrapText(ctx, pt, badgeW - padding * 1.8);
    lines.slice(0, 2).forEach((line, li) => {
      ctx.fillText(line, bx + padding * 1.3, by + badgeH * 0.3 + ts * li * 1.4);
    });
  });
}

// ──────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of text) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function setShadow(ctx: CanvasRenderingContext2D, color: string, blur: number, ox = 0, oy = 0) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = ox;
  ctx.shadowOffsetY = oy;
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * 批量为详情页图片添加文字叠加
 */
export async function overlayTextOnDetailImages(
  images: string[],
  config: Omit<TextOverlayConfig, 'style'>,
  types: OverlayStyle[]
): Promise<string[]> {
  const results: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const style = types[i] || 'selling-point';
    const result = await overlayTextOnImage(images[i], { ...config, style });
    results.push(result);
  }
  return results;
}
