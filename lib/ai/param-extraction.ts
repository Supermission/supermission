import { AgentEndpoint } from "./agent-info";
import { ChatMessage } from "@/app/api/agent/chat/route";
import { minimaxCompletion, minimaxCompletionJSON } from "@/lib/minimax/client";

/** Wrap untrusted data in XML-style delimiters so the LLM treats it as data, not instructions. */
function fence(label: string, value: string): string {
    return `<${label}>${sanitize(value)}</${label}>`;
}

/** Strip control characters and cap length to limit prompt-injection surface. */
function sanitize(input: string, maxLength = 2000): string {
    return input
        .slice(0, maxLength)
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
}

export async function llmExtractParams(
    endpoint: AgentEndpoint,
    message: string,
    conversationHistory: ChatMessage[],
    modelId?: string
): Promise<Record<string, any>> {
    // Construct parameter schema description
    const paramSchema = endpoint.bodyParams
        .map(p => `- ${p.key} (${p.type}): ${p.label}${p.required ? ' (Required)' : ''}`)
        .join('\n');

    // Construct relevant conversation
    const recentHistory = conversationHistory
        .slice(-10)
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

    const systemPrompt = `
You are a parameter extraction system for an AI Agent.
Agent Name: ${fence('agent_name', endpoint.name)}
Description: ${fence('agent_description', endpoint.description)}

Your task is to extract exact values for the following parameters from the conversation:
${fence('param_schema', paramSchema)}

Instructions:
1. Analyze the conversation history and the latest message.
2. Extract ANY values that match the parameters.
3. If a parameter is NOT found, omit it (do not invent information).
4. For 'prompt' parameters (e.g. Image Prompt), capture the user's intent creatively.
   - If user says "Draw a cat", prompt="A cat"
   - If user says "Make it blue" after previous "Draw a cat", prompt="A blue cat" (Merge context if appropriate, or just capture the latest intent).
   - IMPORTANT: Enhance and amplify the 'prompt' to be more descriptive and artistic if it is too simple. (e.g. "A cat" -> "A majestic fluffy cat sitting on a velvet cushion, cinematic lighting").
5. Return ONLY a valid JSON object. No markdown, no explanations.
`;

    const userContent = `
Conversation History:
${fence('conversation_history', recentHistory)}

Latest Message: ${fence('latest_message', message)}

Extract parameters in JSON:
`;

    try {
        return await minimaxCompletionJSON(systemPrompt, userContent, { temperature: 0 });
    } catch (error) {
        console.error('LLM param extraction failed:', error);
        return {};
    }
}

export type MissingParamsResult = {
    message: string;
    options: ClarificationOption[];
};

/** Generate fallback options from param names when the LLM doesn't return structured options. */
function buildFallbackOptions(missingParams: string[]): ClarificationOption[] {
    return missingParams.slice(0, 4).map((param, i) => ({
        id: `provide_${param}`,
        label: `Provide ${param.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()}`,
    }));
}

export async function askForMissingParams(
    endpoint: AgentEndpoint,
    missingParams: string[],
    message: string,
    modelId?: string
): Promise<MissingParamsResult> {
    const systemPrompt = `
You are the ${fence('agent_name', endpoint.name)} AI Agent.
Description: ${fence('agent_description', endpoint.description)}
Personality Guide: ${fence('personality', endpoint.personality || "Friendly, helpful, and professional.")}

The user wants to use your service but is missing the following required information:
${fence('missing_params', missingParams.join(', '))}

Ask the user for this information and provide 2-4 selectable options.
- Ask in ONE short sentence. No fluff, no filler.
- Be direct but friendly (e.g., "What's the contract address?" or "Drop the token address and I'll dig in.").
- ADOPT THE PERSONALITY from "Personality Guide", but keep it brief.
- Provide 2-4 option choices that cover the most common answers. If the missing param is a free-form input (like an address), provide example-based options.

Return JSON ONLY:
{
  "message": "your question here",
  "options": [{"id": "opt1", "label": "Option label", "description": "brief detail"}]
}
`;

    try {
        const parsed = await minimaxCompletionJSON<{ message: string; options?: ClarificationOption[] }>(
            systemPrompt, message, { temperature: 0.7 }
        );
        const llmOptions = Array.isArray(parsed.options) && parsed.options.length > 0
            ? parsed.options
            : buildFallbackOptions(missingParams);
        return {
            message: parsed.message || `I need a bit more info for **${endpoint.name}**.`,
            options: llmOptions,
        };
    } catch (error) {
        return {
            message: `I need a bit more info for **${endpoint.name}**.`,
            options: buildFallbackOptions(missingParams),
        };
    }
}

export type ClarificationOption = {
    id: string;
    label: string;
    description?: string;
};

export type ConversationReadiness = {
    status: 'READY' | 'CONTINUE_CHATTING';
    message: string; // If CONTINUE_CHATTING: follow-up question. If READY: confirmation message.
    options?: ClarificationOption[]; // Structured options when CONTINUE_CHATTING
};

/**
 * Combined conversation gate + confirmation generator.
 * Replaces the old assessConversationReadiness + generateFriendlyConfirmation
 * (2 sequential LLM calls → 1 single call).
 */
export async function assessAndRespond(
    endpoint: AgentEndpoint,
    providedParams: Record<string, any>,
    message: string,
    conversationHistory: ChatMessage[],
    modelId?: string
): Promise<ConversationReadiness> {
    const fallbackConfirmation = `I've got everything needed for **${endpoint.name}**. Please review and confirm below.`;

    const recentHistory = conversationHistory
        .slice(-12)
        .map(m => `${m.role.toUpperCase()}: ${m.content}`)
        .join('\n');

    const systemPrompt = `
You are the ${fence('agent_name', endpoint.name)} AI Agent.
Description: ${fence('agent_description', endpoint.description)}
Personality Guide: ${fence('personality', endpoint.personality || "Friendly, helpful, and professional.")}

Decide: should we proceed or ask ONE more question?

=== DECISION RULES ===

DEFAULT TO READY. Only choose CONTINUE_CHATTING if:
- A required parameter is missing AND cannot be inferred.
- The request is genuinely ambiguous (not just short).

A short message with clear intent is ENOUGH. "Audit 0xABC" = ready. "Find yields" = ready.
Do NOT ask follow-ups just to make conversation or "personalize" the result.

Choose READY if:
- All required params are present (even if optional ones are missing).
- The user's intent is clear from context.
- The user says "go", "run it", "do it", or sounds direct.
- There are already 2+ conversation turns.

=== MESSAGE RULES ===

If CONTINUE_CHATTING:
- Ask for the specific missing info. ONE sentence max. Stay in personality voice.
- ALWAYS provide 2-4 selectable options the user can pick from. Options should cover the most common/likely answers.
- Each option: { "id": "short_key", "label": "Short label", "description": "Optional brief explanation" }

If READY:
- Confirm briefly. ONE sentence. Echo their intent and say you're on it.
- Example: "Running the audit on 0xABC, check the details below."
- Do NOT include options.

Stay in the personality from "Personality Guide" but keep it tight.

=== OUTPUT FORMAT ===
Return JSON ONLY:
{
  "status": "READY" | "CONTINUE_CHATTING",
  "message": "your response message here",
  "options": [{"id": "opt1", "label": "Option label", "description": "brief detail"}]
}
The "options" array is REQUIRED when status is CONTINUE_CHATTING, omit it when READY.
`;

    const userContent = `
Conversation so far:
${fence('conversation_history', recentHistory)}

Latest User Message: ${fence('latest_message', message)}

Current Params Collected: ${fence('collected_params', JSON.stringify(providedParams))}

Decision:
`;

    try {
        const parsed = await minimaxCompletionJSON<{ status: string; message: string; options?: ClarificationOption[] }>(
            systemPrompt, userContent, { temperature: 0.7 }
        );
        return {
            status: parsed.status === 'CONTINUE_CHATTING' ? 'CONTINUE_CHATTING' : 'READY',
            message: parsed.message || fallbackConfirmation,
            options: parsed.status === 'CONTINUE_CHATTING' && Array.isArray(parsed.options) ? parsed.options : undefined,
        };
    } catch (e) {
        console.error('Conversation assessment failed:', e);
        return { status: 'READY', message: fallbackConfirmation };
    }
}
