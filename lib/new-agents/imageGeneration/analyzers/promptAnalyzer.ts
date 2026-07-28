/**
 * Prompt Analyzer
 * Analyzes prompts for style, complexity, and optimal model selection
 */

import { PromptAnalysis, StyleCategory } from '../types';

export async function analyzePrompt(prompt: string): Promise<PromptAnalysis> {
  const lowerPrompt = prompt.toLowerCase();

  // Detect style
  const styleIndicators: Record<string, string[]> = {
    photorealistic: ['photo', 'realistic', 'photograph', 'real', 'cinematic', 'film', 'dslr', 'canon', 'nikon', 'portrait photography'],
    anime: ['anime', 'manga', 'japanese', 'chibi', 'kawaii', 'studio ghibli', 'makoto shinkai'],
    'digital-art': ['digital', 'concept art', 'illustration', 'artstation', 'digital painting'],
    'oil-painting': ['oil painting', 'classical', 'renaissance', 'baroque', 'rembrandt', 'vermeer'],
    watercolor: ['watercolor', 'aquarelle', 'soft colors', 'watercolour'],
    sketch: ['sketch', 'pencil', 'drawing', 'line art', 'charcoal'],
    '3d-render': ['3d', 'render', 'blender', 'octane', 'unreal engine', 'cinema 4d', 'vray'],
    'pixel-art': ['pixel', '8-bit', '16-bit', 'retro game', 'sprite'],
    logo: ['logo', 'brand', 'icon', 'emblem', 'corporate'],
    typography: ['text', 'typography', 'lettering', 'font', 'calligraphy'],
    abstract: ['abstract', 'surreal', 'psychedelic', 'trippy', 'dreamlike'],
  };

  let detectedStyle: StyleCategory = 'other';
  let maxScore = 0;

  for (const [style, keywords] of Object.entries(styleIndicators)) {
    const score = keywords.filter(k => lowerPrompt.includes(k)).length;
    if (score > maxScore) {
      maxScore = score;
      detectedStyle = style as StyleCategory;
    }
  }

  // Check for text rendering needs
  const hasTextRequest = /["'].*["']|text|words|lettering|typography|logo|sign|banner|poster/i.test(prompt);

  // Check complexity based on word count and detail
  const wordCount = prompt.split(/\s+/).length;
  const hasDetailedDescriptions = /detailed|intricate|complex|elaborate|highly detailed/i.test(prompt);
  const complexity = wordCount < 10 && !hasDetailedDescriptions
    ? 'simple'
    : wordCount < 30
      ? 'moderate'
      : 'complex';

  // Check if photorealistic
  const isPhotorealistic = detectedStyle === 'photorealistic' ||
    /real|photo|cinematic|film|dslr|camera|photograph|35mm|50mm|85mm/i.test(prompt);

  // Recommend model - Gemini Pro is best for most use cases
  let recommendedModel = 'gemini-3-pro-image-preview';
  let confidence = 0.7;

  if (hasTextRequest) {
    // Gemini Pro has excellent text rendering
    recommendedModel = 'gemini-3-pro-image-preview';
    confidence = 0.9;
  } else if (isPhotorealistic) {
    recommendedModel = 'gemini-3-pro-image-preview';
    confidence = 0.85;
  } else if (complexity === 'simple') {
    // Flash is fine for simple prompts
    recommendedModel = 'gemini-2.5-flash-image';
    confidence = 0.75;
  }

  return {
    detectedStyle,
    complexity,
    subjects: extractSubjects(prompt),
    hasTextRequest,
    isPhotorealistic,
    isArtistic: !isPhotorealistic,
    recommendedModel,
    confidence,
  };
}

function extractSubjects(prompt: string): string[] {
  const lowerPrompt = prompt.toLowerCase();

  const commonSubjects = [
    'person', 'woman', 'man', 'child', 'girl', 'boy', 'people',
    'animal', 'cat', 'dog', 'bird', 'horse', 'lion', 'tiger',
    'landscape', 'city', 'building', 'architecture', 'house', 'castle',
    'car', 'vehicle', 'motorcycle', 'airplane', 'ship',
    'forest', 'ocean', 'mountain', 'beach', 'river', 'lake',
    'robot', 'alien', 'dragon', 'monster', 'creature',
    'character', 'portrait', 'scene', 'still life',
    'food', 'flower', 'tree', 'nature', 'space', 'galaxy'
  ];

  return commonSubjects.filter(s => lowerPrompt.includes(s));
}
