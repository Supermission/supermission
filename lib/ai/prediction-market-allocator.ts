/**
 * Confidence-weighted allocation for batch prediction market trades.
 * Deterministic — no LLM call needed.
 */

export interface AllocationItem {
  condition_id: string;
  question: string;
  outcome: string;
  confidence: number;
  amount: number;
  weight: number;
  clob_token_ids?: string;
  market_id?: string;
  end_date?: string;
  slug?: string;
}

export interface AllocationResult {
  allocations: AllocationItem[];
  total_budget: number;
  reasoning: string;
}

export function computeAllocation(
  selectedMarkets: any[],
  totalBudget: number,
): AllocationResult {
  if (selectedMarkets.length === 0) {
    return {
      allocations: [],
      total_budget: totalBudget,
      reasoning: 'No markets selected.',
    };
  }

  // Calculate confidence weights
  const totalConfidence = selectedMarkets.reduce(
    (sum, m) => sum + (m.signal_confidence || m.ai_confidence || 50),
    0,
  );

  // Build allocations with a loop (not .map) so we can track running sum
  const allocations: AllocationItem[] = [];
  let runningSum = 0;

  for (let idx = 0; idx < selectedMarkets.length; idx++) {
    const market = selectedMarkets[idx];
    const confidence = market.signal_confidence || market.ai_confidence || 50;
    const weight = totalConfidence > 0 ? confidence / totalConfidence : 1 / selectedMarkets.length;

    const sentiment = (market.ai_sentiment || '').toLowerCase();
    const outcomes: string[] = typeof market.outcomes === 'string' ? JSON.parse(market.outcomes) : (market.outcomes || ['Yes', 'No']);
    // Use favourite_outcome if available, otherwise resolve from sentiment + outcomes array
    const outcome: string = market.favourite_outcome
      || (sentiment === 'bearish' ? (outcomes[1] || 'NO') : (outcomes[0] || 'YES'));

    // Round to 2 decimals
    let amount = Math.floor(totalBudget * weight * 100) / 100;

    // Last item gets the remainder to avoid rounding dust
    if (idx === selectedMarkets.length - 1) {
      amount = Math.round((totalBudget - runningSum) * 100) / 100;
    }

    runningSum += amount;

    allocations.push({
      condition_id: market.condition_id,
      question: market.question || market.market_question || 'Market',
      outcome,
      confidence,
      amount,
      weight: Math.round(weight * 1000) / 10, // percentage with 1 decimal
      clob_token_ids: market.clob_token_ids,
      market_id: market.market_id,
      end_date: market.end_date,
      slug: market.slug || market.event_slug,
    });
  }

  // If rounding left dust, add to highest-confidence market
  const remaining = totalBudget - runningSum;
  if (Math.abs(remaining) > 0.01) {
    const sorted = [...allocations].sort((a, b) => b.confidence - a.confidence);
    sorted[0].amount = Math.round((sorted[0].amount + remaining) * 100) / 100;
  }

  // Minimum $1 per trade — only when budget allows, redistribute from largest allocations
  if (totalBudget >= selectedMarkets.length) {
    let deficit = 0;
    for (const alloc of allocations) {
      if (alloc.amount < 1) {
        deficit += 1 - alloc.amount;
        alloc.amount = 1;
      }
    }
    // Reduce from largest allocations to cover the deficit
    if (deficit > 0) {
      const sorted = [...allocations].filter(a => a.amount > 1).sort((a, b) => b.amount - a.amount);
      for (const alloc of sorted) {
        if (deficit <= 0) break;
        const canTake = Math.min(alloc.amount - 1, deficit);
        alloc.amount = Math.round((alloc.amount - canTake) * 100) / 100;
        deficit = Math.round((deficit - canTake) * 100) / 100;
      }
    }
  }

  const reasoning = `Confidence-weighted allocation across ${allocations.length} markets. ` +
    `Higher confidence = larger position. ` +
    `Top pick: "${allocations.sort((a, b) => b.confidence - a.confidence)[0]?.question}" at ${allocations[0]?.confidence}% confidence.`;

  return {
    allocations: allocations.sort((a, b) => b.amount - a.amount),
    total_budget: totalBudget,
    reasoning,
  };
}
