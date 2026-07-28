/**
 * Polymarket Markets API utilities
 * Fetch market details including clobTokenIds for YES/NO outcomes
 */

export interface PolymarketMarket {
  id: string
  question: string
  description?: string
  slug?: string
  marketSlug?: string
  endDate?: string
  clobTokenIds: string[] // Token IDs (order matches outcomes array)
  outcomePrices: string[] // Current prices (order matches outcomes array)
  outcomes: string[] // Outcome names like ["Yes", "No"] - determines order of other arrays
  volume: number
  active: boolean
}

/**
 * Fetch market details by slug
 * Uses local API route to avoid CORS issues
 */
export async function getMarketBySlug(slug: string): Promise<PolymarketMarket | null> {
  try {
    // Use local API route instead of direct fetch to avoid CORS
    const response = await fetch(`/api/polymarket/?slug=${encodeURIComponent(slug)}`)
    
    if (!response.ok) {
      console.error('Failed to fetch market by slug:', response.status)
      return null
    }

    const data = await response.json()
    const tokenIds = JSON.parse(data.clobTokenIds);
    const outcomePrices = JSON.parse(data.outcomePrices);
    const outcomes = JSON.parse(data.outcomes || '["Yes", "No"]');


    return {
      id: data.id,
      question: data.question,
      description: data.description,
      slug: data.slug,
      marketSlug: data.market_slug,
      endDate: data.end_date,
      clobTokenIds: tokenIds,
      outcomePrices: outcomePrices,
      outcomes: outcomes,
      volume: data.volume || 0,
      active: data.active || false,
    }
  } catch (error) {
    console.error('Error fetching market by slug:', error)
    return null
  }
}

/**
 * Find the index for a given outcome (YES or NO) in the outcomes array
 * The outcomes array may be ["Yes", "No"] or ["No", "Yes"] - order is not guaranteed
 */
function getOutcomeIndex(market: PolymarketMarket, outcome: string): number {
  const outcomes = market.outcomes || ['Yes', 'No']
  const targetOutcome = outcome.toLowerCase()
  const index = outcomes.findIndex(o => o.toLowerCase() === targetOutcome)
  // Default to 0 for YES and 1 for NO if not found (fallback for old data)
  return index >= 0 ? index : (outcome.toLowerCase() === 'no' ? 1 : 0)
}

/**
 * Get YES token ID from market
 */
export function getYesTokenId(market: PolymarketMarket): string {
  const index = getOutcomeIndex(market, 'YES')
  return market.clobTokenIds[index] || ''
}

/**
 * Get NO token ID from market
 */
export function getNoTokenId(market: PolymarketMarket): string {
  const index = getOutcomeIndex(market, 'NO')
  return market.clobTokenIds[index] || ''
}

/**
 * Get token ID based on outcome choice
 */
export function getTokenIdForOutcome(market: PolymarketMarket, outcome: string): string {
  const index = getOutcomeIndex(market, outcome)
  return market.clobTokenIds[index] || ''
}

/**
 * Get current price for outcome
 */
export function getPriceForOutcome(market: PolymarketMarket, outcome: string): number {
  const index = getOutcomeIndex(market, outcome)
  return parseFloat(market.outcomePrices[index] || '0.5')
}