export function getCoinGeckoNetwork(chainId: number): string {
  switch (chainId) {
    case 1: return "eth";
    case 56: return "bsc";
    case 137: return "polygon_pos";
    case 42161: return "arbitrum";
    case 8453: return "base";
    case 43114: return "avax";
    case 101: return "solana";
    case 1399811149: return "solana"
    default: return "eth";
  }
}

export function getGoPlusChainId(chainId: number): string {
  return String(chainId);
}
