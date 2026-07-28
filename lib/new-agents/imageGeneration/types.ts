/**
 * Image Generation Agent Types
 * Type definitions for the SuperImageGen agent
 */

export interface ImageGenRequest {
  prompt: string;
  model?: 'flash' | 'standard' | 'premium' | 'auto';  // Pricing/quality tiers
  aiModel?: 'nano-banana-pro' | 'nano-banana' | 'gpt-image';  // AI model to use (nano-banana = gemini-2.5-flash-image, nano-banana-pro = gemini-3-pro-image-preview)
  width?: number;
  height?: number;
  enhancePrompt?: boolean;  // Use AI to improve prompt (default: true)
  style?: ColorStyle;       // Color grading style
  background?: BackgroundStyle; // Background treatment
  aspectRatio?: AspectRatio;
  // img2img support
  sourceImage?: string;     // Base64 image data for image-to-image transformation
  sourceMimeType?: string;  // MIME type of source image (default: image/png)
  modificationStrength?: number; // 0-1, how much to modify (0 = keep original, 1 = full transformation)
}

export type ColorStyle = 'auto' | 'vibrant' | 'muted' | 'cinematic' | 'bw' | 'anime' | 'neon' | 'vintage';
export type BackgroundStyle = 'auto' | 'transparent' | 'white' | 'blur';

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9';
export type ImageSize = '1K' | '2K' | '4K';

export interface PromptAnalysis {
  detectedStyle: StyleCategory;
  complexity: 'simple' | 'moderate' | 'complex';
  subjects: string[];
  hasTextRequest: boolean;      // Wants text in image
  isPhotorealistic: boolean;
  isArtistic: boolean;
  recommendedModel: string;
  confidence: number;
}

export type StyleCategory =
  | 'photorealistic'
  | 'anime'
  | 'digital-art'
  | 'oil-painting'
  | 'watercolor'
  | 'sketch'
  | '3d-render'
  | 'pixel-art'
  | 'logo'
  | 'typography'
  | 'abstract'
  | 'other';

export interface EnhancedPrompt {
  original: string;
  enhanced: string;
  additions: string[];        // What was added
  styleModifiers: string[];   // Style-specific additions
  technicalParams: string[];  // Camera settings, lighting, etc.
}

export interface GeneratedImage {
  url: string;
  model: string;
  prompt: string;             // Final prompt used
  enhancedPrompt?: string;
  width: number;
  height: number;
  generatedAt: string;
  generationTime: number;     // ms
  ipfsHash?: string;
  ipfsUrl?: string;
  isBase64?: boolean;
}

export interface ImageGenResponse {
  success: boolean;
  analysis: PromptAnalysis;
  images: GeneratedImage[];   // Array for compare mode
  primaryImage: GeneratedImage;
  cost: string;
  model: string;
  metadata: {
    originalPrompt: string;
    finalPrompt: string;
    wasEnhanced: boolean;
    generationTime: number;
  };
}
