/**
 * Image Generation Orchestrator
 * Main entry point for the SuperImageGen agent
 */

import { analyzePrompt } from './analyzers/promptAnalyzer';
import { enhancePrompt } from './analyzers/promptEnhancer';
import { generateWithNanoBanana } from './generators/nanoBananaGenerator';
import { uploadBase64ToIPFS } from './helpers/ipfsHelper';
import {
  ImageGenRequest,
  ImageGenResponse,
  EnhancedPrompt,
  PromptAnalysis,
  AspectRatio,
  ImageSize,
  ColorStyle,
  BackgroundStyle,
} from './types';

export const PRICING: Record<string, string> = {
  'flash': '0.3',          // Nano Banana (Flash) - 1K only
  'standard': '0.3',       // Nano Banana Pro - 2K resolution
  'premium': '0.3',        // Nano Banana Pro - 4K resolution
  'auto': '0.3',
};

export async function fetchImageGeneration(
  request: ImageGenRequest
): Promise<ImageGenResponse> {
  const startTime = Date.now();

  console.log('[ImageGen] Starting generation for:', request.prompt.slice(0, 50) + '...');

  // Step 1: Analyze prompt
  const analysis = await analyzePrompt(request.prompt);
  console.log('[ImageGen] Analysis complete:', {
    style: analysis.detectedStyle,
    complexity: analysis.complexity,
    hasText: analysis.hasTextRequest,
  });

  // Step 2: Determine model tier, aspect ratio, and size
  const tier = request.model || 'auto';
  const aiModel = request.aiModel || 'nano-banana-pro';

  // Determine if using Pro model based on aiModel selection
  // nano-banana = gemini-2.5-flash-image (1K only, fast)
  // nano-banana-pro = gemini-3-pro-image-preview (up to 4K, Thinking mode)
  const usePro = aiModel === 'nano-banana-pro';
  const aspectRatio = getAspectRatio(request, analysis);

  // Flash model only supports 1K, Pro supports 1K/2K/4K based on tier
  const imageSize = usePro ? getImageSize(tier) : '1K';

  console.log('[ImageGen] Using AI model:', aiModel, '(Pro:', usePro, ') tier:', tier, 'Aspect:', aspectRatio, 'Size:', imageSize);

  // Step 3: Enhance prompt (always on for better results unless explicitly disabled)
  let finalPrompt = request.prompt;
  let enhancedData: EnhancedPrompt | null = null;

  if (request.enhancePrompt !== false) {
    try {
      enhancedData = await enhancePrompt(request.prompt, analysis, {
        colorStyle: request.style,
        backgroundStyle: request.background,
      });
      finalPrompt = enhancedData.enhanced;
      console.log('[ImageGen] Prompt enhanced with style:', request.style, 'bg:', request.background);
    } catch (error) {
      console.warn('[ImageGen] Prompt enhancement failed, using original:', error);
    }
  }

  // Step 4: Generate image with Nano Banana (Gemini)
  const isImg2Img = !!request.sourceImage;
  console.log('[ImageGen] Generating image...', isImg2Img ? '(img2img mode)' : '(text-to-image)');
  const generatedImage = await generateWithNanoBanana(
    finalPrompt,
    aspectRatio,
    imageSize,
    usePro,
    request.sourceImage,
    request.sourceMimeType || 'image/png'
  );
  console.log('[ImageGen] Image generated in', generatedImage.generationTime, 'ms');

  // Step 5: Upload base64 image to Pinata IPFS for persistent URL
  try {
    console.log('[ImageGen] Uploading to IPFS...');
    const ipfsResult = await uploadBase64ToIPFS(
      generatedImage.url,
      {
        prompt: request.prompt,
        enhancedPrompt: finalPrompt,
        model: generatedImage.model,
        generatedAt: generatedImage.generatedAt,
        analysis: analysis,
        width: generatedImage.width,
        height: generatedImage.height,
      }
    );

    // Update image with IPFS URL
    generatedImage.ipfsHash = ipfsResult.hash;
    generatedImage.ipfsUrl = ipfsResult.url;
    generatedImage.url = ipfsResult.url; // Replace base64 with IPFS URL
    generatedImage.isBase64 = false;

    console.log('[ImageGen] IPFS upload complete:', ipfsResult.url);
  } catch (ipfsError) {
    // IPFS upload failed, keep base64 URL
    console.warn('[ImageGen] IPFS upload failed, keeping base64 URL:', ipfsError);
  }

  // Add enhanced prompt info
  if (enhancedData) {
    generatedImage.enhancedPrompt = enhancedData.enhanced;
  }

  const totalTime = Date.now() - startTime;
  console.log('[ImageGen] Total generation time:', totalTime, 'ms');

  return {
    success: true,
    analysis,
    images: [generatedImage],
    primaryImage: generatedImage,
    cost: PRICING[tier] || PRICING['auto'],
    model: generatedImage.model,
    metadata: {
      originalPrompt: request.prompt,
      finalPrompt,
      wasEnhanced: request.enhancePrompt !== false && enhancedData !== null,
      generationTime: totalTime,
    },
  };
}

function getAspectRatio(request: ImageGenRequest, analysis: PromptAnalysis): AspectRatio {
  // If user specified aspect ratio, use it
  if (request.aspectRatio) {
    return request.aspectRatio;
  }

  // If user specified dimensions, calculate aspect ratio
  if (request.width && request.height) {
    const ratio = request.width / request.height;
    if (ratio > 2) return '21:9';
    if (ratio > 1.7) return '16:9';
    if (ratio > 1.4) return '3:2';
    if (ratio > 1.2) return '4:3';
    if (ratio > 1.1) return '5:4';
    if (ratio > 0.9) return '1:1';
    if (ratio > 0.8) return '4:5';
    if (ratio > 0.7) return '3:4';
    if (ratio > 0.6) return '2:3';
    return '9:16';
  }

  // Auto-detect based on detected style and subjects
  if (analysis.detectedStyle === 'logo' || analysis.detectedStyle === 'typography') {
    return '1:1'; // Logos work best square
  }
  if (analysis.subjects.includes('landscape') ||
      analysis.subjects.includes('city') ||
      analysis.subjects.includes('beach') ||
      analysis.subjects.includes('mountain')) {
    return '16:9'; // Landscapes are wide
  }
  if (analysis.subjects.includes('portrait') ||
      analysis.subjects.includes('person') ||
      analysis.subjects.includes('woman') ||
      analysis.subjects.includes('man')) {
    return '3:4'; // Portraits are taller
  }

  return '1:1'; // Default to square
}

function getImageSize(tier: string): ImageSize {
  switch (tier) {
    case 'premium':
      return '4K';
    case 'flash':
      return '1K';
    case 'standard':
    case 'auto':
    default:
      return '2K';
  }
}
