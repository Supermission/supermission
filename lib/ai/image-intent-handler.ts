/**
 * Image Intent Handler
 * Handles the different intents detected from image uploads
 */

import { ImageIntent, getModificationPresets } from './image-router';
import { AGENT_ENDPOINTS } from './agent-info';

/**
 * Handle token analysis intent
 * Returns a param_request action with pre-filled data from the screenshot
 */
export function handleTokenAnalysisIntent(intent: ImageIntent & { type: 'token_analysis' }): string {
  const { extractedData, visionResult } = intent;

  // Find the token-due-diligence endpoint
  const endpoint = AGENT_ENDPOINTS.find(e => e.id === 'token-due-diligence');
  if (!endpoint) {
    return JSON.stringify({
      message: "I can help you analyze this token. Please provide the contract address and chain.",
      action: {
        type: 'param_request',
        data: {
          endpointId: 'token-due-diligence',
          endpointName: 'Token Due Diligence',
          description: 'Comprehensive token analysis',
          requiredParams: [
            { key: 'contractAddress', label: 'Contract Address', type: 'string', required: true },
            { key: 'chainId', label: 'Chain', type: 'string', required: true },
          ],
          provided: {},
        },
      },
    });
  }

  // If we have extracted data from the screenshot
  if (extractedData && extractedData.contractAddress) {
    const platformName = extractedData.platform || 'screenshot';
    const tokenName = extractedData.tokenName || extractedData.tokenSymbol || 'this token';
    const confidence = Math.round((extractedData.confidence || 0.5) * 100);

    let message = `I detected **${tokenName}** from your ${platformName} screenshot.`;

    if (extractedData.price) {
      message += ` Current price: ${extractedData.price}.`;
    }

    message += `\n\nI've pre-filled the details below. Confirm to run a full due diligence analysis.`;

    return JSON.stringify({
      message,
      action: {
        type: 'param_request',
        data: {
          endpointId: 'token-due-diligence',
          endpointName: 'Token Due Diligence',
          description: `Analysis for ${tokenName}`,
          requiredParams: endpoint.bodyParams.filter(p => p.required),
          provided: {
            contractAddress: extractedData.contractAddress,
            chainId: extractedData.chainId || '1',
          },
          extractedFrom: {
            platform: platformName,
            confidence,
            tokenName: extractedData.tokenName,
            tokenSymbol: extractedData.tokenSymbol,
          },
        },
      },
    });
  }

  // If we couldn't extract data but user seems to want token analysis
  let message = "I can see this looks like a crypto-related image";

  if (visionResult?.description) {
    message = `I can see: ${visionResult.description}`;
  }

  message += "\n\nI couldn't automatically extract the contract address. Please enter the details below:";

  return JSON.stringify({
    message,
    action: {
      type: 'param_request',
      data: {
        endpointId: 'token-due-diligence',
        endpointName: 'Token Due Diligence',
        description: 'Enter token details for analysis',
        requiredParams: endpoint.bodyParams.filter(p => p.required),
        provided: {},
      },
    },
  });
}

/**
 * Handle image modification intent
 * Returns an image_modification_setup action with the source image and presets
 */
export function handleImageModificationIntent(intent: ImageIntent & { type: 'image_modification' }): string {
  const { modificationType, sourceImage, mimeType } = intent;

  const presets = getModificationPresets();
  const suggestedPreset = modificationType
    ? presets.find(p => p.id === modificationType)
    : undefined;

  let message = "I can help you transform this image!";

  if (suggestedPreset) {
    message = `I'll apply a **${suggestedPreset.name}** effect to your image. ${suggestedPreset.description}.`;
    message += "\n\nYou can also describe a custom transformation or choose a different preset below.";
  } else {
    message += "\n\nDescribe how you'd like to modify it, or choose from the preset styles below.";
  }

  return JSON.stringify({
    message,
    action: {
      type: 'image_modification_setup',
      data: {
        sourceImage,
        mimeType,
        suggestedPreset: modificationType,
        presets: presets.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })),
      },
    },
  });
}

/**
 * Handle general query with image
 * Returns a helpful response based on what was detected
 */
export function handleGeneralImageQuery(
  intent: ImageIntent & { type: 'general_query' },
  _userMessage: string
): string {
  const { description } = intent;

  if (description) {
    return JSON.stringify({
      message: `I can see: ${description}\n\nHow would you like me to help you with this image? I can:\n\n- **Analyze a token** if this is a crypto screenshot\n- **Modify the image** with various styles and effects`,
    });
  }

  return JSON.stringify({
    message: `I see you've uploaded an image. How can I help?\n\n- If this is a **token screenshot** (DexScreener, Etherscan, etc.), I can analyze it for you\n- If you want to **modify the image**, describe what changes you'd like or I can apply preset styles`,
  });
}

