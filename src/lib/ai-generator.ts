import { supabase } from "@/integrations/supabase/client";

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  n?: number;
  imageBase64?: string;
  referenceImageUrl?: string;
  imageType?: string;
}

export interface GenerateImageResult {
  images: string[];
  error?: string;
}

// 判断是否是致命错误（遇到这类错误应立即停止重试）
function isFatalError(message: string | undefined): boolean {
  if (!message) return false;
  return message.includes("余额不足") ||
    message.includes("未授权") ||
    message.includes("请先登录") ||
    message.includes("认证失败") ||
    message.includes("INSUFFICIENT_BALANCE") ||
    message.includes("权限不足");
}

async function generateSingleImage(params: GenerateImageParams, attempt: number): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke('generate-image', {
    body: {
      prompt: params.prompt,
      referenceImageUrl: params.imageBase64 || undefined,
      referenceStyleUrl: params.referenceImageUrl || undefined,
      aspectRatio: params.aspectRatio || '1:1',
      imageType: params.imageType || '电商主图',
    },
  });

  if (error) {
    // 网络错误或函数调用失败
    console.error(`[attempt ${attempt}] Edge function error:`, error);
    return { url: null, error: error.message || "服务暂时不可用，请稍后重试" };
  }

  if (data?.error) {
    // 服务端返回了错误信息（余额不足、未授权、AI额度等）
    const errorMsg = typeof data.error === 'string' ? data.error : data.error?.error || "生成失败";
    console.error(`[attempt ${attempt}] Generation error:`, errorMsg);
    return { url: null, error: errorMsg };
  }

  const imageUrl = data?.images?.[0];
  if (!imageUrl) {
    return { url: null, error: "未能生成图片，请重试" };
  }

  return { url: imageUrl, error: null };
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  try {
    const count = Math.min(params.n || 1, 4);
    const images: string[] = [];
    let lastError: string | undefined;

    // 串行调用，每次一张，避免并发 429
    for (let i = 0; i < count; i++) {
      const result = await generateSingleImage(params, i + 1);

      if (result.url) {
        images.push(result.url);
      } else if (result.error) {
        lastError = result.error;
        // 致命错误立即停止（余额不足、未授权、AI额度等）
        if (isFatalError(result.error)) {
          break;
        }
        // 非致命错误，等3秒后重试一次
        if (i < count - 1) {
          await new Promise(r => setTimeout(r, 3000));
        }
      }
    }

    if (images.length === 0) {
      return { images: [], error: lastError || "未能生成图片，请重试" };
    }

    return { images };
  } catch (error: any) {
    console.error("Generation error:", error);
    return { images: [], error: error.message || "未知错误" };
  }
}

// Generate prompt based on product and settings
export function generatePrompt(
  productType: string,
  style: string,
  scene: string,
  model: string,
  imageType?: string
): string {
  const isSceneImage = imageType === '场景图' || imageType === '买家秀';

  const stylePrompts: Record<string, string> = {
    '纯白背景': 'Clean white background, professional product photography, studio lighting',
    '品牌质感': 'Luxury brand style, high-end product photography, studio lighting, elegant',
    '小红书风格': 'Xiaohongshu style, trendy, lifestyle, warm colors, Instagram quality',
    '直播带货': 'E-commerce livestream style, eye-catching, professional, sales-oriented',
    '极简产品摄影': 'Minimalist product photography, clean, modern, simple',
    '户外冒险风': 'Outdoor adventure style, nature background, dynamic, adventure',
    '圣诞节日风': 'Christmas holiday style, festive decorations, red and green colors, warm cozy',
    '新春中国风': 'Chinese New Year style, red gold colors, traditional decorations, festive',
    '情人节浪漫': 'Valentine style, romantic pink red colors, hearts, roses, love theme',
    '万圣节风': 'Halloween style, orange black colors, spooky decorations, pumpkin',
    '夏日清新': 'Summer fresh style, light blue yellow colors, beach vacation, sunshine',
    '复古胶片': 'Vintage film style, retro aesthetic, warm tones, nostalgic feel',
    '赛博朋克': 'Cyberpunk style, neon lights, futuristic city, digital effects',
    '日式和风': 'Japanese minimal style, zen atmosphere, natural wood, tatami elements',
    '工业风': 'Industrial style, concrete walls, metal elements, modern edgy',
    '田园森系': 'Forest natural style, green plants, organic materials, eco-friendly',
  };

  const scenePrompts: Record<string, string> = {
    '客厅': 'in a cozy living room with modern sofa, warm lighting',
    '厨房': 'in a modern kitchen with countertop, bright lighting',
    '办公桌': 'on an office desk with computer, professional setting',
    '户外露营': 'in an outdoor camping setting, nature, adventure, forest',
    '咖啡馆': 'in a cozy coffee shop, warm lighting, casual atmosphere',
    '健身房': 'in a modern gym, fitness equipment in background',
    '卧室': 'in a cozy bedroom, modern interior design',
    '阳台': 'on a balcony with city view, modern setting',
    '浴室': 'in a clean bathroom with modern tiles',
    '餐厅': 'in an elegant dining room, restaurant style',
    '沙滩海边': 'on tropical beach with crystal clear water, sunset background',
    '森林草地': 'in lush green forest with sunlight filtering through trees',
    '城市街道': 'on busy city street with modern buildings, urban setting',
    '花店': 'in a beautiful flower shop with colorful bouquets, natural light',
    '书店': 'in a cozy bookstore with wooden shelves, reading corner',
    '儿童房': 'in a colorful kids room with toys, playful atmosphere',
    '玄关': 'in a stylish entrance hallway with decorative elements',
    '衣帽间': 'in a walk-in closet with organized clothing display',
    '庭院花园': 'in a beautiful garden with flowers and plants, outdoor setting',
  };

  const modelPrompts: Record<string, string> = {
    '亚洲女模特': 'with Asian female model wearing/using the product',
    '亚洲男模特': 'with Asian male model wearing/using the product',
    '欧美女模特': 'with Western female model wearing/using the product',
    '欧美男模特': 'with Western male model wearing/using the product',
    '无模特': '',
  };

  const parts = [
    stylePrompts[style] || style,
    scene !== '无模特' ? scenePrompts[scene] || scene : '',
    model !== '无模特' ? modelPrompts[model] || '' : '',
    isSceneImage
      ? 'Realistic lifestyle product photography. No text overlays.'
      : 'Professional e-commerce product photo, high quality, detailed, ready for online store listing.',
  ].filter(Boolean);

  return parts.join(', ');
}
