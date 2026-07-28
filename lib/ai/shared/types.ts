/**
 * Shared types for AI agent tool definitions and results.
 * Used by DELPHI, ORACLE, SECURO, and HYPERION agents.
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolResult {
  name: string;
  result: unknown;
}
