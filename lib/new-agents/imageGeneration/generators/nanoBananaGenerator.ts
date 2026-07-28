/**
 * Nano Banana Generator
 * Uses Google Gemini's native image generation models
 * - gemini-3-pro-image-preview (Nano Banana Pro) - Professional, up to 4K, Thinking mode
 * - gemini-2.5-flash-image (Nano Banana) - Fast & efficient, 1K resolution only
 */

import openrouter from '@/lib/openrouter/client';
import { GeneratedImage, AspectRatio, ImageSize } from '../types';

// Image generation routed via OpenRouter (only OPENROUTER_API_KEY needed).
// gemini-2.5-flash-image = Google "Nano Banana", a cheap/fast image model.
const IMAGE_MODEL = 'google/gemini-2.5-flash-image';

// Gemini image dimensions
const DIMENSIONS: Record<ImageSize, Record<AspectRatio, { width: number; height: number }>> = {
  '1K': {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1376, height: 768 },
    '9:16': { width: 768, height: 1376 },
    '4:3': { width: 1200, height: 896 },
    '3:4': { width: 896, height: 1200 },
    '2:3': { width: 848, height: 1264 },
    '3:2': { width: 1264, height: 848 },
    '4:5': { width: 928, height: 1152 },
    '5:4': { width: 1152, height: 928 },
    '21:9': { width: 1584, height: 672 },
  },
  '2K': {
    '1:1': { width: 2048, height: 2048 },
    '16:9': { width: 2752, height: 1536 },
    '9:16': { width: 1536, height: 2752 },
    '4:3': { width: 2400, height: 1792 },
    '3:4': { width: 1792, height: 2400 },
    '2:3': { width: 1696, height: 2528 },
    '3:2': { width: 2528, height: 1696 },
    '4:5': { width: 1856, height: 2304 },
    '5:4': { width: 2304, height: 1856 },
    '21:9': { width: 3168, height: 1344 },
  },
  '4K': {
    '1:1': { width: 4096, height: 4096 },
    '16:9': { width: 5504, height: 3072 },
    '9:16': { width: 3072, height: 5504 },
    '4:3': { width: 4800, height: 3584 },
    '3:4': { width: 3584, height: 4800 },
    '2:3': { width: 3392, height: 5056 },
    '3:2': { width: 5056, height: 3392 },
    '4:5': { width: 3712, height: 4608 },
    '5:4': { width: 4608, height: 3712 },
    '21:9': { width: 6336, height: 2688 },
  },
};

export async function generateWithNanoBanana(
  prompt: string,
  aspectRatio: AspectRatio = '1:1',
  imageSize: ImageSize = '2K',
  usePro: boolean = true,
  sourceImage?: string,
  sourceMimeType: string = 'image/png'
): Promise<GeneratedImage> {
  const startTime = Date.now();
  // OpenRouter serves one flash image model; aspect ratio is passed as a prompt hint.
  const effectiveImageSize = usePro ? imageSize : '1K';
  const isImg2Img = !!sourceImage;
  console.log(`[NanoBanana] Generating with model: ${IMAGE_MODEL}, aspect: ${aspectRatio}, size: ${effectiveImageSize}, img2img: ${isImg2Img}`);

  // Build multimodal content — include the source image for img2img.
  const promptText = sourceImage
    ? `Transform this image according to the following instructions: ${prompt}. Maintain the core composition and subject matter while applying the requested transformation. Target aspect ratio: ${aspectRatio}.`
    : `${prompt}. Target aspect ratio: ${aspectRatio}.`;

  const content: any[] = [{ type: 'text', text: promptText }];
  if (sourceImage) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${sourceMimeType};base64,${sourceImage}` },
    });
  }

  try {
    // OpenRouter image generation: request the image modality; the model returns
    // generated images on message.images as data: URIs.
    const response = await openrouter.chat.completions.create({
      model: IMAGE_MODEL,
      modalities: ['image', 'text'],
      messages: [{ role: 'user', content }],
    } as any);

    const message = response.choices?.[0]?.message as any;
    const images = message?.images;
    let url: string | null = null;
    if (Array.isArray(images) && images.length > 0) {
      url = images[0]?.image_url?.url || images[0]?.url || null;
    }

    if (!url) {
      console.error('[NanoBanana] No image data in response');
      throw new Error('No image generated');
    }

    // Get dimensions based on aspect ratio and size
    const dimensions = getImageDimensions(aspectRatio, effectiveImageSize, usePro);

    return {
      url,
      model: IMAGE_MODEL,
      prompt,
      width: dimensions.width,
      height: dimensions.height,
      generatedAt: new Date().toISOString(),
      generationTime: Date.now() - startTime,
      isBase64: true,
    };
  } catch (error) {
    console.error('[NanoBanana] Generation error:', error);
    throw error;
  }
}

function getImageDimensions(
  aspectRatio: AspectRatio,
  imageSize: ImageSize,
  usePro: boolean
): { width: number; height: number } {
  // Flash model only supports 1K
  if (!usePro) {
    return DIMENSIONS['1K'][aspectRatio] || DIMENSIONS['1K']['1:1'];
  }

  return DIMENSIONS[imageSize]?.[aspectRatio] || DIMENSIONS['2K']['1:1'];
}
