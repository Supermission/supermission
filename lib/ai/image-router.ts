/**
 * Image Router
 * Detects user intent when an image is uploaded
 * Routes to either token analysis or image modification flows
 */

import { MessageAttachment } from '@/lib/store/chat';
import { analyzeImage, TokenImageData, VisionAnalysisResult } from './vision-analyzer';

/**
 * Intent types for image routing
 */
export type ImageIntent =
  | { type: 'token_analysis'; extractedData?: TokenImageData; visionResult?: VisionAnalysisResult }
  | { type: 'image_modification'; modificationType?: string; sourceImage: string; mimeType: string }
  | { type: 'general_query'; description?: string };

/**
 * Keywords that suggest token analysis intent
 */
const TOKEN_KEYWORDS = [
  'buy', 'sell', 'trade', 'swap',
  'token', 'coin', 'crypto',
  'analyze', 'analysis', 'check',
  'safe', 'scam', 'rug',
  'due diligence', 'dd',
  'should i', 'is this',
  'what do you think', 'opinion',
  'price', 'market cap', 'liquidity',
  'contract', 'address',
  'dexscreener', 'etherscan', 'basescan',
  'birdeye', 'coingecko', 'dextools',
];

/**
 * Keywords that suggest image modification intent
 */
const MODIFICATION_KEYWORDS = [
  'make', 'edit', 'modify', 'change', 'transform',
  'vibrant', 'colorful', 'bright', 'dark', 'dim',
  'neon', 'glow', 'glowing',
  'vintage', 'retro', 'old', 'aged',
  'anime', 'cartoon', 'stylize', 'artistic',
  'enhance', 'improve', 'better', 'hd', 'upscale',
  'filter', 'effect', 'style',
  'black and white', 'b&w', 'monochrome', 'grayscale',
  'cinematic', 'movie', 'film',
  'blur', 'sharpen', 'focus',
  'remove background', 'transparent',
  'add', 'overlay', 'text',
];

/**
 * Modification type presets
 */
const MODIFICATION_PRESETS: Record<string, string> = {
  'vibrant': 'Make this image more vibrant and colorful',
  'neon': 'Add neon glow effects to this image',
  'vintage': 'Apply a vintage/retro filter to this image',
  'anime': 'Transform this image into anime style',
  'cinematic': 'Apply cinematic color grading to this image',
  'enhance': 'Enhance and improve the quality of this image',
  'b&w': 'Convert this image to black and white',
  'blur': 'Apply artistic blur effect to this image',
};

/**
 * Detect the intent behind an image upload
 */
export async function detectImageIntent(
  attachment: MessageAttachment,
  userMessage: string
): Promise<ImageIntent> {
  const messageLower = userMessage.toLowerCase();

  console.log('[ImageRouter] Detecting intent for message:', userMessage.slice(0, 50));

  // Step 1: Quick keyword-based detection
  const hasTokenKeywords = TOKEN_KEYWORDS.some(kw => messageLower.includes(kw));
  const hasModificationKeywords = MODIFICATION_KEYWORDS.some(kw => messageLower.includes(kw));

  console.log('[ImageRouter] Keyword detection:', {
    hasTokenKeywords,
    hasModificationKeywords,
  });

  // If clear modification intent from keywords, route there
  if (hasModificationKeywords && !hasTokenKeywords) {
    const modificationType = detectModificationType(messageLower);
    return {
      type: 'image_modification',
      modificationType,
      sourceImage: attachment.data,
      mimeType: attachment.mimeType,
    };
  }

  // Step 2: Use vision analysis for ambiguous cases or token-related keywords
  if (attachment.type === 'image') {
    try {
      const visionResult = await analyzeImage(attachment.data, attachment.mimeType);

      console.log('[ImageRouter] Vision analysis result:', {
        isTokenScreenshot: visionResult.isTokenScreenshot,
        isCryptoRelated: visionResult.isCryptoRelated,
        suggestedAction: visionResult.suggestedAction,
        hasAddress: !!visionResult.tokenData?.contractAddress,
      });

      // If it's a token screenshot, route to token analysis
      if (visionResult.isTokenScreenshot && visionResult.tokenData) {
        return {
          type: 'token_analysis',
          extractedData: visionResult.tokenData,
          visionResult,
        };
      }

      // If user has token keywords but image isn't a token screenshot
      if (hasTokenKeywords && !visionResult.isTokenScreenshot) {
        // Still route to token analysis but without extracted data
        return {
          type: 'token_analysis',
          extractedData: undefined,
          visionResult,
        };
      }

      // If vision suggests modification
      if (visionResult.suggestedAction === 'image_modification' || hasModificationKeywords) {
        return {
          type: 'image_modification',
          modificationType: detectModificationType(messageLower),
          sourceImage: attachment.data,
          mimeType: attachment.mimeType,
        };
      }

      // Default: general query with description
      return {
        type: 'general_query',
        description: visionResult.description,
      };
    } catch (error) {
      console.error('[ImageRouter] Vision analysis failed:', error);
      // Fall back to keyword-based routing
    }
  }

  // Step 3: Fallback based on keywords only
  if (hasTokenKeywords) {
    return {
      type: 'token_analysis',
      extractedData: undefined,
    };
  }

  if (hasModificationKeywords) {
    return {
      type: 'image_modification',
      modificationType: detectModificationType(messageLower),
      sourceImage: attachment.data,
      mimeType: attachment.mimeType,
    };
  }

  // Default to general query
  return {
    type: 'general_query',
  };
}

/**
 * Detect the type of modification requested
 */
function detectModificationType(message: string): string | undefined {
  const lower = message.toLowerCase();

  // Check for preset matches
  for (const preset of Object.keys(MODIFICATION_PRESETS)) {
    if (lower.includes(preset)) {
      return preset;
    }
  }

  // Check for specific style keywords
  if (lower.includes('vibrant') || lower.includes('colorful') || lower.includes('bright')) {
    return 'vibrant';
  }
  if (lower.includes('neon') || lower.includes('glow')) {
    return 'neon';
  }
  if (lower.includes('vintage') || lower.includes('retro') || lower.includes('old')) {
    return 'vintage';
  }
  if (lower.includes('anime') || lower.includes('cartoon')) {
    return 'anime';
  }
  if (lower.includes('cinematic') || lower.includes('movie') || lower.includes('film')) {
    return 'cinematic';
  }
  if (lower.includes('enhance') || lower.includes('improve') || lower.includes('better')) {
    return 'enhance';
  }
  if (lower.includes('black and white') || lower.includes('b&w') || lower.includes('monochrome')) {
    return 'b&w';
  }

  return undefined;
}

/**
 * Get a human-readable description of the modification type
 */
export function getModificationDescription(type: string | undefined): string {
  if (!type) return 'Transform this image';
  return MODIFICATION_PRESETS[type] || `Apply ${type} effect to this image`;
}

/**
 * Get all available modification presets
 */
export function getModificationPresets(): Array<{ id: string; name: string; description: string }> {
  return [
    { id: 'vibrant', name: 'Vibrant', description: 'Make colors pop and stand out' },
    { id: 'neon', name: 'Neon', description: 'Add glowing neon effects' },
    { id: 'vintage', name: 'Vintage', description: 'Apply retro film look' },
    { id: 'anime', name: 'Anime', description: 'Transform to anime style' },
    { id: 'cinematic', name: 'Cinematic', description: 'Movie-like color grading' },
    { id: 'enhance', name: 'Enhance', description: 'Improve quality and clarity' },
    { id: 'b&w', name: 'B&W', description: 'Classic black and white' },
  ];
}
