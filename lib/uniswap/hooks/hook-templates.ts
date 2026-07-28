export interface HookTemplate {
  id: string;
  name: string;
  description: string;
  type: 'twap' | 'limit_order' | 'dynamic_fee';
  configSchema: HookConfigField[];
  x402Fee: string; // USD
  supportedChains: number[];
}

export interface HookConfigField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'address' | 'boolean';
  required: boolean;
  description?: string;
  defaultValue?: string | number | boolean;
}

export const HOOK_TEMPLATES: HookTemplate[] = [
  {
    id: 'twap-order',
    name: 'TWAP Order',
    description: 'Time-Weighted Average Price orders that split a large swap into smaller chunks over a specified time period to minimize price impact.',
    type: 'twap',
    x402Fee: '1.00',
    supportedChains: [1, 8453, 137],
    configSchema: [
      { key: 'tokenIn', label: 'Token In', type: 'address', required: true, description: 'Token to sell' },
      { key: 'tokenOut', label: 'Token Out', type: 'address', required: true, description: 'Token to buy' },
      { key: 'totalAmount', label: 'Total Amount', type: 'string', required: true, description: 'Total amount to swap (in whole units)' },
      { key: 'numChunks', label: 'Number of Chunks', type: 'number', required: true, defaultValue: 10, description: 'Split order into this many pieces' },
      { key: 'intervalSeconds', label: 'Interval (seconds)', type: 'number', required: true, defaultValue: 3600, description: 'Time between each chunk (default: 1 hour)' },
      { key: 'maxSlippageBps', label: 'Max Slippage (bps)', type: 'number', required: false, defaultValue: 100, description: 'Maximum slippage per chunk' },
    ],
  },
  {
    id: 'limit-order',
    name: 'Limit Order',
    description: 'On-chain limit orders that execute automatically when the target price is reached. No off-chain dependencies.',
    type: 'limit_order',
    x402Fee: '1.00',
    supportedChains: [1, 8453, 137],
    configSchema: [
      { key: 'tokenIn', label: 'Token In', type: 'address', required: true, description: 'Token to sell' },
      { key: 'tokenOut', label: 'Token Out', type: 'address', required: true, description: 'Token to buy' },
      { key: 'amount', label: 'Amount', type: 'string', required: true, description: 'Amount to sell (in whole units)' },
      { key: 'targetPrice', label: 'Target Price', type: 'string', required: true, description: 'Price at which to execute (tokenOut per tokenIn)' },
      { key: 'expiry', label: 'Expiry (hours)', type: 'number', required: false, defaultValue: 168, description: 'Order expires after this many hours (default: 7 days)' },
    ],
  },
  {
    id: 'dynamic-fee',
    name: 'Dynamic Fee',
    description: 'Automatically adjusts pool fee based on volatility. Higher fees during volatile periods, lower fees during stable periods. Maximizes LP revenue.',
    type: 'dynamic_fee',
    x402Fee: '1.00',
    supportedChains: [1, 8453],
    configSchema: [
      { key: 'baseFee', label: 'Base Fee (bps)', type: 'number', required: true, defaultValue: 30, description: 'Base fee rate in basis points' },
      { key: 'maxFee', label: 'Max Fee (bps)', type: 'number', required: true, defaultValue: 100, description: 'Maximum fee during high volatility' },
      { key: 'minFee', label: 'Min Fee (bps)', type: 'number', required: true, defaultValue: 5, description: 'Minimum fee during low volatility' },
      { key: 'volatilityWindow', label: 'Volatility Window (blocks)', type: 'number', required: false, defaultValue: 100, description: 'Lookback window for volatility calculation' },
    ],
  },
];

export function getHookTemplate(id: string): HookTemplate | undefined {
  return HOOK_TEMPLATES.find((t) => t.id === id);
}

export function getHookTemplatesForChain(chainId: number): HookTemplate[] {
  return HOOK_TEMPLATES.filter((t) => t.supportedChains.includes(chainId));
}
