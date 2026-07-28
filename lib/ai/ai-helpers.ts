import { AGENT_ENDPOINTS, AgentEndpoint } from "./agent-info";
import { callAgentEndpoint } from "./call-agent-endpoint";
import { formatAgentResponse } from "./process-ai-request";


// Extract special command handlers
export async function handleRunWithParams(
  text: string,
  toolResults: Record<string, any>,
  walletAddress?: string
): Promise<string> {
  const payloadStr = text.replace('[RUN_WITH_PARAMS]', '').trim();

  try {
    const payload = JSON.parse(payloadStr) as {
      endpointId: string;
      params: Record<string, any>;
    };

    const endpoint = AGENT_ENDPOINTS.find(e => e.id === payload.endpointId);
    if (!endpoint) {
      return `Hmm, I couldn't find that service right now. Mind trying again?`;
    }

    const rawResult = await callAgentEndpoint(
      endpoint,
      payload.params,
      undefined,
      walletAddress
    );

    toolResults[endpoint.id] = {
      params: payload.params,
      result: rawResult,
      at: Date.now(),
    };

    return await formatAgentResponse(endpoint, rawResult);
  } catch (e) {
    return 'Oops! Something went wrong reading those details. Could you try entering them again?';
  }
}

export function buildParamRequest(
  endpoint: AgentEndpoint,
  provided: Record<string, any>,
  missing: string[],
  overrideMessage?: string
): string {
  // Special handling for contract-audit
  if (endpoint.id === 'contract-audit') {
    const payload = {
      message: `Let me get the **${endpoint.name}** agent for you.\n\nJust need your contract details below - you can either paste your Solidity code or fetch it by address.`,
      action: {
        type: 'param_request',
        data: {
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          description: endpoint.description,
          requiredParams: endpoint.bodyParams, // Include all params for the panel
          provided,
        },
      },
    };
    return JSON.stringify(payload);
  }

  const requiredParams = endpoint.bodyParams.filter(p => p.required);

  // If no missing params, this is a confirmation request
  if (missing.length === 0) {
    const isCreative = endpoint.id === 'super-image-gen';
    const actionText = isCreative ? "amplified your request for better results" : "configured the parameters based on our chat";

    const payload = {
      message: overrideMessage || `I've got everything needed for **${endpoint.name}**. I've ${actionText}. Please review and confirm below.`,
      action: {
        type: 'param_request',
        data: {
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          description: endpoint.description,
          requiredParams,
          provided,
        },
      },
    };
    return JSON.stringify(payload);
  }

  const requiredLabels = requiredParams.map(p => p.label);

  const payload = {
    message: `Got it! Let's run a **${endpoint.name}** for you.\n\nJust need a quick bit of info - drop in the **${requiredLabels.join('** and **')}** below and we'll get started.`,
    action: {
      type: 'param_request',
      data: {
        endpointId: endpoint.id,
        endpointName: endpoint.name,
        description: endpoint.description,
        requiredParams,
        provided,
      },
    },
  };

  return JSON.stringify(payload);
}