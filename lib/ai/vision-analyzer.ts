/**
 * Vision Analyzer
 * Uses Gemini 2.5 Flash for analyzing images and extracting token data
 */

import openrouter from '@/lib/openrouter/client';

// Cheap/fast multimodal model routed via OpenRouter — only OPENROUTER_API_KEY needed.
const VISION_MODEL = 'google/gemini-2.5-flash';

/**
 * Extracted token data from screenshot
 */
export interface TokenImageData {
  contractAddress?: string;
  chainId?: string;
  chainName?: string;
  tokenName?: string;
  tokenSymbol?: string;
  platform?: string; // DexScreener, Etherscan, Birdeye, etc.
  price?: string;
  marketCap?: string;
  confidence: number; // 0-1 confidence score
}

/**
 * Vision analysis result
 */
export interface VisionAnalysisResult {
  isTokenScreenshot: boolean;
  isCryptoRelated: boolean;
  tokenData?: TokenImageData;
  description: string;
  suggestedAction?: 'token_analysis' | 'image_modification' | 'general';
}

/**
 * Analyze an image using Gemini Vision
 * Returns structured data about what's in the image
 */
export async function analyzeImage(
  imageBase64: string,
  mimeType: string = 'image/png'
): Promise<VisionAnalysisResult> {
  console.log('[VisionAnalyzer] Analyzing image...');

  const systemPrompt = `You are a crypto/blockchain image analyzer. Analyze the provided image and extract information.

IMPORTANT: You must respond with ONLY a valid JSON object. No markdown, no explanation, just the JSON.

If this is a screenshot of a token/cryptocurrency page (from DexScreener, Etherscan, Basescan, Birdeye, CoinGecko, Dextools, wallet apps, etc.), extract:
- Contract address (0x... format, 40 hex chars)
- Chain/network name (Ethereum, Base, Polygon, Solana, etc.)
- Token name and symbol
- Platform name (where the screenshot is from)
- Price if visible
- Market cap if visible

Response format (ONLY JSON, nothing else):
{
  "isTokenScreenshot": true/false,
  "isCryptoRelated": true/false,
  "description": "brief description of what's in the image",
  "suggestedAction": "token_analysis" | "image_modification" | "general",
  "tokenData": {
    "contractAddress": "0x..." or null,
    "chainName": "Base" or null,
    "tokenName": "Token Name" or null,
    "tokenSymbol": "TKN" or null,
    "platform": "DexScreener" or null,
    "price": "$0.001" or null,
    "marketCap": "$1M" or null,
    "confidence": 0.0-1.0
  }
}

If NOT a token screenshot, set isTokenScreenshot to false and tokenData to null.
For non-crypto images that could be modified (photos, art, etc.), suggest "image_modification".
For crypto-related but not token screenshots (charts, memes, etc.), set isCryptoRelated to true.`;

  try {
    const response = await openrouter.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: systemPrompt },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
      temperature: 0.1, // Low temperature for consistent extraction
    });

    const text = response.choices[0]?.message?.content || '';
    console.log('[VisionAnalyzer] Raw response:', text.slice(0, 500));

    // Parse JSON from response
    let parsed: {
      isTokenScreenshot?: boolean;
      isCryptoRelated?: boolean;
      description?: string;
      suggestedAction?: 'token_analysis' | 'image_modification' | 'general';
      tokenData?: {
        contractAddress?: string;
        chainName?: string;
        tokenName?: string;
        tokenSymbol?: string;
        platform?: string;
        price?: string;
        marketCap?: string;
        confidence?: number;
      };
    };
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[VisionAnalyzer] Failed to parse response:', parseError);
      return {
        isTokenScreenshot: false,
        isCryptoRelated: false,
        description: 'Unable to analyze image',
        suggestedAction: 'general',
      };
    }

    // Map chain name to chain ID
    let chainId: string | undefined;
    if (parsed.tokenData?.chainName) {
      chainId = mapChainNameToId(parsed.tokenData.chainName);
    }

    const result: VisionAnalysisResult = {
      isTokenScreenshot: parsed.isTokenScreenshot || false,
      isCryptoRelated: parsed.isCryptoRelated || false,
      description: parsed.description || 'Image analyzed',
      suggestedAction: parsed.suggestedAction || 'general',
    };

    if (parsed.tokenData && parsed.isTokenScreenshot) {
      result.tokenData = {
        contractAddress: parsed.tokenData.contractAddress || undefined,
        chainId: chainId,
        chainName: parsed.tokenData.chainName || undefined,
        tokenName: parsed.tokenData.tokenName || undefined,
        tokenSymbol: parsed.tokenData.tokenSymbol || undefined,
        platform: parsed.tokenData.platform || undefined,
        price: parsed.tokenData.price || undefined,
        marketCap: parsed.tokenData.marketCap || undefined,
        confidence: parsed.tokenData.confidence || 0.5,
      };
    }

    console.log('[VisionAnalyzer] Analysis result:', {
      isTokenScreenshot: result.isTokenScreenshot,
      hasAddress: !!result.tokenData?.contractAddress,
      chainId: result.tokenData?.chainId,
      platform: result.tokenData?.platform,
    });

    return result;
  } catch (error) {
    console.error('[VisionAnalyzer] Error analyzing image:', error);
    return {
      isTokenScreenshot: false,
      isCryptoRelated: false,
      description: 'Error analyzing image',
      suggestedAction: 'general',
    };
  }
}

/**
 * Map chain name to chain ID
 */
export function mapChainNameToId(chainName: string): string {
  const lower = chainName.toLowerCase().trim();

  const chainMap: Record<string, string> = {
    'ethereum': '1',
    'eth': '1',
    'mainnet': '1',
    'base': '8453',
    'polygon': '137',
    'matic': '137',
    'arbitrum': '42161',
    'arb': '42161',
    'optimism': '10',
    'op': '10',
    'bsc': '56',
    'binance': '56',
    'bnb': '56',
    'avalanche': '43114',
    'avax': '43114',
    'fantom': '250',
    'ftm': '250',
    'zksync': '324',
    'linea': '59144',
    'solana': 'solana',
    'sol': 'solana',
  };

  // Check for partial matches
  for (const [key, value] of Object.entries(chainMap)) {
    if (lower.includes(key)) {
      return value;
    }
  }

  return '1'; // Default to Ethereum
}
