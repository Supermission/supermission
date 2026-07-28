/**
 * Chat AI model definitions.
 * These are the models available for the user to pick in the chat model selector.
 * All models are routed through OpenRouter.
 */

export interface ChatModel {
  id: string;
  name: string;
  provider: string;
  openRouterId: string; // OpenRouter model identifier
  description: string;
  icon: string; // 2-letter abbreviation for the icon badge
  logo?: string; // Path to logo image
}

export const CHAT_MODELS: ChatModel[] = [
  {
    id: 'default',
    name: 'GEMINI 2.5 FLASH',
    provider: 'Google',
    openRouterId: 'google/gemini-2.5-flash',
    description: 'Cheap, fast, lightweight reasoning',
    icon: 'DF',
    logo: '/models/google.png',
  },
  {
    id: 'gemini-2.5-pro',
    name: 'GEMINI 2.5 PRO',
    provider: 'Google',
    openRouterId: 'google/gemini-2.5-pro',
    description: 'Large context, fast analysis',
    icon: 'GE',
    logo: '/models/google.png',
  },
  {
    id: 'grok-3-mini',
    name: 'GROK 3 MINI',
    provider: 'xAI',
    openRouterId: 'x-ai/grok-3-mini-beta',
    description: 'Deep reasoning with chain-of-thought',
    icon: 'GK',
    logo: '/models/xai.svg',
  },
  {
    id: 'claude-sonnet-4',
    name: 'CLAUDE SONNET 4',
    provider: 'Anthropic',
    openRouterId: 'anthropic/claude-sonnet-4',
    description: 'Best for security analysis & reasoning',
    icon: 'CL',
    logo: '/models/anthropic.png',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4O',
    provider: 'OpenAI',
    openRouterId: 'openai/gpt-4o',
    description: 'Advanced reasoning & audit capabilities',
    icon: 'GP',
    logo: '/models/openai.png',
  },
  {
    id: 'kimi-k2',
    name: 'KIMI K2',
    provider: 'Moonshot',
    openRouterId: 'moonshotai/kimi-k2',
    description: 'Fast multi-step thinking',
    icon: 'KM',
    logo: '/models/kimi.png',
  },
  {
    id: 'minimax-m2.7',
    name: 'MINIMAX M2.7',
    provider: 'MiniMax',
    openRouterId: 'minimax/minimax-m2.7',
    description: 'Deep reasoning with extended thinking',
    icon: 'MM',
    logo: '/models/minimax.png',
  },
];

export const DEFAULT_MODEL_ID = 'default';

export function getChatModelById(id: string): ChatModel | undefined {
  return CHAT_MODELS.find((m) => m.id === id);
}

export function getOpenRouterId(modelId: string): string {
  const model = getChatModelById(modelId);
  return model?.openRouterId ?? CHAT_MODELS[0].openRouterId;
}
