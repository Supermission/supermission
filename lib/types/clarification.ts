export interface ClarificationOption {
  id: string;
  label: string;
  description?: string;
}

export interface AgentClarificationData {
  question: string;
  options: ClarificationOption[];
  allowCustom?: boolean;
  allowSkip?: boolean;
  step?: number;
  totalSteps?: number;
}
