/**
 * Prompt Enhancer
 * Uses OpenRouter GPT-4o-mini to improve prompts for better image generation
 */

import { chatCompletion, MODELS } from '@/lib/openrouter/client';
import { EnhancedPrompt, PromptAnalysis, StyleCategory, ColorStyle, BackgroundStyle } from '../types';

export interface EnhanceOptions {
  colorStyle?: ColorStyle;
  backgroundStyle?: BackgroundStyle;
}

export async function enhancePrompt(
  originalPrompt: string,
  analysis: PromptAnalysis,
  options: EnhanceOptions = {}
): Promise<EnhancedPrompt> {
  const { colorStyle = 'auto', backgroundStyle = 'auto' } = options;
  // Style-specific modifiers
  const styleModifiers = getStyleModifiers(analysis.detectedStyle);

  // Technical parameters based on style
  const technicalParams = getTechnicalParams(analysis);

  // Use OpenRouter GPT-4o-mini to enhance the prompt
  const systemPrompt = `You are an expert at crafting image generation prompts for AI models like Imagen 3 and DALL-E.
Given a user's prompt, enhance it to produce better results.

Rules:
- Keep the original intent and subject matter
- Add specific details about lighting, composition, and atmosphere
- Add quality modifiers appropriate for the style
- Be concise but comprehensive (max 150 words)
- Return ONLY the enhanced prompt text, nothing else
- Do not add markdown formatting or explanations
- For photorealistic images, add camera/lens details
- For artistic styles, reference relevant art movements or techniques`;

  const userMessage = `Original prompt: "${originalPrompt}"
Detected style: ${analysis.detectedStyle}
Subjects: ${analysis.subjects.join(', ') || 'general'}
Complexity: ${analysis.complexity}

Enhance this prompt for optimal image generation with ${analysis.detectedStyle === 'photorealistic' ? 'photorealistic' : 'artistic'} style.`;

  let enhanced = originalPrompt;

  try {
    // Use existing OpenRouter client with GPT-4o-mini for cost effectiveness
    const response = await chatCompletion(
      MODELS.GPT_4O_MINI,
      systemPrompt,
      userMessage,
      { max_tokens: 300, temperature: 0.7 }
    );

    if (response && response.length > 0) {
      enhanced = response.trim();
    }
  } catch (error) {
    console.error('[PromptEnhancer] Enhancement failed, using original:', error);
    // Fall back to original prompt with basic enhancements
    enhanced = originalPrompt;
  }

  // Combine base enhanced prompt with style modifiers and technical params
  const finalParts = [enhanced];

  // Add color style modifiers
  const colorModifiers = getColorStyleModifiers(colorStyle);
  for (const modifier of colorModifiers) {
    if (!enhanced.toLowerCase().includes(modifier.toLowerCase())) {
      finalParts.push(modifier);
    }
  }

  // Add background style modifiers
  const backgroundModifiers = getBackgroundStyleModifiers(backgroundStyle);
  for (const modifier of backgroundModifiers) {
    if (!enhanced.toLowerCase().includes(modifier.toLowerCase())) {
      finalParts.push(modifier);
    }
  }

  // Add style modifiers if not already present
  for (const modifier of styleModifiers) {
    if (!enhanced.toLowerCase().includes(modifier.toLowerCase())) {
      finalParts.push(modifier);
    }
  }

  // Add technical params if not already present
  for (const param of technicalParams) {
    if (!enhanced.toLowerCase().includes(param.toLowerCase())) {
      finalParts.push(param);
    }
  }

  const finalPrompt = finalParts.join(', ');

  return {
    original: originalPrompt,
    enhanced: finalPrompt,
    additions: extractAdditions(originalPrompt, enhanced),
    styleModifiers,
    technicalParams,
  };
}

function getStyleModifiers(style: StyleCategory): string[] {
  const modifiers: Record<StyleCategory, string[]> = {
    'photorealistic': ['photorealistic', 'hyperdetailed', '8k resolution'],
    'anime': ['anime style', 'vibrant colors', 'detailed linework'],
    'digital-art': ['digital painting', 'artstation quality', 'concept art'],
    'oil-painting': ['oil painting', 'visible brushstrokes', 'classical lighting'],
    'watercolor': ['watercolor painting', 'soft edges', 'flowing colors'],
    'sketch': ['pencil sketch', 'detailed linework', 'artistic shading'],
    '3d-render': ['3d render', 'octane render', 'volumetric lighting'],
    'pixel-art': ['pixel art', 'crisp pixels', 'retro aesthetic'],
    'logo': ['minimalist logo design', 'vector style', 'clean professional'],
    'typography': ['typography design', 'clean lettering', 'balanced composition'],
    'abstract': ['abstract art', 'dynamic composition', 'expressive colors'],
    'other': ['high quality', 'detailed'],
  };

  return modifiers[style] || modifiers['other'];
}

function getTechnicalParams(analysis: PromptAnalysis): string[] {
  const params: string[] = [];

  if (analysis.isPhotorealistic) {
    params.push('professional photography');
    params.push('natural lighting');
    params.push('sharp focus');
  }

  if (analysis.complexity === 'complex') {
    params.push('intricate details');
    params.push('masterpiece quality');
  }

  if (analysis.hasTextRequest) {
    params.push('clear readable text');
    params.push('professional typography');
  }

  return params;
}

function extractAdditions(original: string, enhanced: string): string[] {
  const originalWords = new Set(
    original.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
  );

  const enhancedWords = enhanced.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 3);

  return enhancedWords.filter(w => !originalWords.has(w)).slice(0, 10);
}

function getColorStyleModifiers(colorStyle: ColorStyle): string[] {
  const modifiers: Record<ColorStyle, string[]> = {
    'auto': [],
    'vibrant': ['vibrant colors', 'bold saturated palette', 'high color contrast'],
    'muted': ['muted pastel colors', 'soft desaturated tones', 'subtle color palette'],
    'cinematic': ['cinematic color grading', 'film-like tones', 'dramatic lighting'],
    'bw': ['black and white', 'monochrome', 'high contrast grayscale'],
    'anime': ['anime style', 'cel shaded', 'vibrant anime colors', 'japanese animation aesthetic'],
    'neon': ['neon lights', 'cyberpunk aesthetic', 'glowing neon colors', 'dark background with neon accents'],
    'vintage': ['vintage aesthetic', 'retro film grain', 'faded colors', '70s photography style'],
  };
  return modifiers[colorStyle] || [];
}

function getBackgroundStyleModifiers(backgroundStyle: BackgroundStyle): string[] {
  const modifiers: Record<BackgroundStyle, string[]> = {
    'auto': [],
    'transparent': ['isolated subject', 'clean cutout', 'no background'],
    'white': ['pure white background', 'clean studio backdrop', 'minimalist white space'],
    'blur': ['blurred background', 'shallow depth of field', 'bokeh effect'],
  };
  return modifiers[backgroundStyle] || [];
}
