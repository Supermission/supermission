// Generate a clean, actionable summary based on market data
export function generateMarketSummary(deal: any, livePrices?: { yes: number; no: number } | null): string {
  const isYes = deal?.opportunity === 'BUY YES';
  const sentiment = deal?.current_sentiment?.toLowerCase();
  const confidence = Math.round((deal?.confidence_score || 0.5) * 100);
  const yesRaw = livePrices?.yes ?? deal?.current_yes_price;
  const noRaw = livePrices?.no ?? deal?.current_no_price;
  if (yesRaw == null || noRaw == null) return '';
  const yesPrice = Math.round(yesRaw * 100);
  const noPrice = Math.round(noRaw * 100);
  const potentialGain = Math.round(deal?.potential_gain || 0);

  if (isYes) {
    return `Market sentiment is ${sentiment} with ${confidence}% confidence. YES is currently priced at ${yesPrice}¢, suggesting an undervalued opportunity with ${potentialGain}% potential upside.`;
  } else {
    return `Market sentiment is ${sentiment} with ${confidence}% confidence. NO is currently priced at ${noPrice}¢, suggesting an undervalued opportunity with ${potentialGain}% potential upside.`;
  }
}

// Truncate text helper
export function truncateText(text: string, maxLength: number = 80): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace === -1) return truncated + '...';
  return truncated.slice(0, lastSpace) + '...';
}

// Format number helper
export function formatNumber(num: unknown, decimals: number = 2): string {
  if (num === null || num === undefined) return '0.00';
  const n = typeof num === 'number' ? num : parseFloat(String(num));
  if (isNaN(n) || !isFinite(n)) return '0.00';
  return n.toFixed(decimals);
}