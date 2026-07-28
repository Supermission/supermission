/**
 * ORACLE tool definitions — OpenAI function calling schema.
 * Prediction-market agent tools. No executor logic — see ./dispatch.ts
 * and the per-domain executor files.
 */

import type { ToolDefinition } from '../../shared/types';

export const ORACLE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_markets',
      description:
        'Search active prediction markets by keyword, category, trending status, or volume. Always return at least 5 markets so users have variety to choose from. Use offset to skip already-shown markets when user asks for "another" or "different" ones. For league-specific queries (NBA, NFL, etc.) the keyword is auto-expanded to match Polymarket event slugs. For day-scale time queries ("today", "tomorrow", "this week") use ending_within_days; for sub-day queries ("closing in the next 5 minutes", "ending in the next hour") use ending_within_minutes. Either way, do not put the time words in the keyword.',
      parameters: {
        type: 'object',
        properties: {
          keyword: { type: 'string', description: 'Search term. Matches question, description, event_slug, and categories. Short league codes like "nba" are recognised and map to their event-slug families automatically.' },
          category: {
            type: 'string',
            description: 'Category filter (e.g. "Crypto", "Politics", "Sports", "AI", "Business")',
          },
          trending: { type: 'boolean', description: 'Only return trending markets' },
          min_volume: { type: 'number', description: 'Minimum total volume in USD' },
          ending_within_days: {
            type: 'number',
            description: 'Only markets ending within this many days from now. Use 1 for "today", 2 for "tomorrow", 7 for "this week".',
          },
          ending_within_minutes: {
            type: 'number',
            description: 'Only markets closing within this many MINUTES from now. Use this (not ending_within_days) for sub-day queries like "closing in the next 5 minutes" (=5), "ending in the next hour" (=60), "next 2 hours" (=120).',
          },
          sort: {
            type: 'string',
            enum: ['volume', 'volume_24h', 'liquidity', 'end_date'],
            description: 'Sort field (default: volume). Use end_date when the user asks about upcoming/soon/today.',
          },
          limit: { type: 'number', description: 'Number of results (default 5, max 10)' },
          offset: { type: 'number', description: 'Skip this many results. Use when user asks for different/more markets to avoid repeating the same ones. E.g. offset=5 to get the next batch.' },
          exclude_condition_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Condition IDs to exclude from results. Pass IDs of markets already shown to the user.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_positions',
      description:
        "Get the user's current prediction market positions including P&L. Uses the user's wallet address from context.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trade_history',
      description: "Get the user's recent prediction market trade history.",
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of trades to return (default 10, max 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_details',
      description:
        'Get detailed information about a specific prediction market by condition ID or keyword search.',
      parameters: {
        type: 'object',
        properties: {
          condition_id: { type: 'string', description: 'The condition ID of the market' },
          keyword: {
            type: 'string',
            description: 'Search keyword to find the market (used if condition_id not provided)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_orderbook',
      description:
        'Get live orderbook data for a prediction market — best bid, best ask, spread, and depth. Use this before recommending trades to check liquidity and estimate slippage.',
      parameters: {
        type: 'object',
        properties: {
          condition_id: { type: 'string', description: 'The condition_id of the market' },
          size: { type: 'number', description: 'Optional trade size in USD to estimate slippage' },
        },
        required: ['condition_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_watchlist',
      description: "Get the user's watchlisted prediction markets with current prices.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_trade',
      description:
        'EXECUTE a trade. This is the ONLY way to place a trade — the trade executes automatically when you call this tool. You MUST call this after the user confirms. Never say you bought something without calling this tool first.',
      parameters: {
        type: 'object',
        properties: {
          market_query: {
            type: 'string',
            description: 'Market condition_id or keyword to find the market',
          },
          side: {
            type: 'string',
            enum: ['YES', 'NO'],
            description: 'Which outcome to buy',
          },
          amount: {
            type: 'number',
            description: 'Amount in USD to trade',
          },
        },
        required: ['market_query', 'side', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_batch_trade',
      description:
        'EXECUTE multiple trades at once. Use this when the user confirms a batch/bulk buy across multiple markets. Each trade executes automatically and sequentially. Call this ONLY after user confirms the batch plan.',
      parameters: {
        type: 'object',
        properties: {
          trades: {
            type: 'array',
            description: 'Array of trades to execute',
            items: {
              type: 'object',
              properties: {
                market_query: {
                  type: 'string',
                  description: 'Market condition_id or keyword',
                },
                side: {
                  type: 'string',
                  enum: ['YES', 'NO'],
                  description: 'Which outcome to buy',
                },
                amount: {
                  type: 'number',
                  description: 'Amount in USD',
                },
              },
              required: ['market_query', 'side', 'amount'],
            },
          },
        },
        required: ['trades'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_sell',
      description:
        'EXECUTE a sell/close of existing positions. This is the ONLY way to sell — the sell executes automatically when you call this tool. You MUST call this after the user confirms. Set sell_all=true for ALL positions, or market_query for one.',
      parameters: {
        type: 'object',
        properties: {
          market_query: {
            type: 'string',
            description: 'Market condition_id or keyword to find a specific position. Not needed when sell_all=true.',
          },
          sell_all: {
            type: 'boolean',
            description: 'Set to true to prepare ALL open positions for selling at once.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'research_topic',
      description:
        'Search the web for recent news and context about a prediction market topic. Use after search_markets to enrich results with WHY context.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Specific news search query with topic + event + timeframe. Examples: "AITC Bengal election 2026 latest polls", "Bitcoin ETF approval SEC March 2026", "Trump criminal trial verdict latest". Be specific, generic queries return useless results.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_signals',
      description:
        'Get AI-generated trading signals with rich filters. Signals come from multi-article news consensus analysis. Returns edge (AI confidence minus market price = profit potential), reasoning, and market data. Falls back to persistent AI predictions when live signals have expired. THIS IS YOUR PRIMARY TOOL for recommendations like "what should I bet on", "safe picks", "high edge", "ending soon".',
      parameters: {
        type: 'object',
        properties: {
          keyword: {
            type: 'string',
            description: 'Search term to match against market questions',
          },
          signal_type: {
            type: 'string',
            enum: ['sentiment', 'momentum', 'spot_price'],
            description: 'sentiment = AI prediction from news, momentum = price confirms AI view, spot_price = crypto price vs threshold',
          },
          sentiment: {
            type: 'string',
            enum: ['bullish', 'bearish'],
            description: 'Filter by bullish or bearish AI sentiment',
          },
          category: {
            type: 'string',
            description: 'Market category (e.g. "Crypto", "Politics", "Sports", "AI", "Business")',
          },
          min_confidence: {
            type: 'number',
            description: 'Minimum AI confidence (0-100). Signals are typically 90+. Use 95+ for "safe" picks.',
          },
          min_edge: {
            type: 'number',
            description: 'Minimum edge percentage (AI confidence minus market implied probability). E.g. min_edge=15 means AI sees at least 15% more upside than the market. Higher edge = more undervalued by market.',
          },
          min_volume: {
            type: 'number',
            description: 'Minimum total volume in USD. Higher volume = more liquid, less risky.',
          },
          min_liquidity: {
            type: 'number',
            description: 'Minimum liquidity in USD. Higher liquidity = tighter fills, lower slippage.',
          },
          max_spread: {
            type: 'number',
            description: 'Maximum bid-ask spread (0-1). Lower spread = cheaper to trade. 0.02 = very tight, 0.1 = wide.',
          },
          ending_within_days: {
            type: 'number',
            description: 'Only markets ending within this many days. E.g. 7 = ending in the next week. Good for short-term plays.',
          },
          max_end_date: {
            type: 'string',
            description: 'Only markets ending before this date (ISO format). Alternative to ending_within_days.',
          },
          trending: {
            type: 'boolean',
            description: 'Only return trending markets (volume spike or big price move)',
          },
          sort: {
            type: 'string',
            enum: ['edge', 'confidence', 'volume', 'volume_24h', 'liquidity', 'end_date', 'price_change'],
            description: 'Sort results by: edge (most undervalued first), confidence (highest AI conviction), volume, liquidity, end_date (soonest first), price_change (biggest movers). Default: edge.',
          },
          limit: { type: 'number', description: 'Number of results (default 10, max 20)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'save_preference',
      description:
        'Save a user preference for future personalization (e.g. favorite category, risk appetite, typical budget).',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: ['category', 'risk', 'budget'],
            description:
              'Preference type: "category" for favorite market categories, "risk" for risk appetite (low/medium/high), "budget" for typical trade size in USD',
          },
          value: {
            type: 'string',
            description: 'The preference value',
          },
        },
        required: ['key', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_clarification',
      description:
        'Render an interactive multi-choice picker. EXTREMELY RESTRICTED — only use when ALL of the following are true: (1) the user has issued a CLEAR market/trading intent, (2) you genuinely cannot proceed without picking from a SMALL CLOSED SET of 2-4 concrete, mutually-exclusive options (e.g. YES vs NO side, a specific market category from a fixed list, low/medium/high risk), and (3) plain text would be worse UX than buttons. NEVER call this for: ambiguous, garbled, empty, or unparseable input; pasted file paths, URLs, screenshots, or stray text; greetings/small talk; opinions or open-ended questions; yes/no confirmations (use plain text); follow-ups; "what do you think"; situations where a sensible default exists; or any time you are already returning results. If in doubt, DO NOT call this — reply in plain text and let the user type freely.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The clarification question to ask' },
          options: {
            type: 'array',
            description: '2-4 selectable options for the user',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Short identifier' },
                label: { type: 'string', description: 'Display label' },
                description: { type: 'string', description: 'Brief explanation' },
              },
              required: ['id', 'label'],
            },
          },
        },
        required: ['question', 'options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_resolution',
      description:
        'Check if a prediction market has resolved, what the winning outcome was, and whether the user won. Use when users ask about settled markets, their winnings, or redemption status.',
      parameters: {
        type: 'object',
        properties: {
          condition_id: { type: 'string', description: 'The condition_id of the market to check' },
        },
        required: ['condition_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'redirect_to_agent',
      description:
        'Redirect the user to a sister agent that can handle their request. Use this when the task is outside your scope and belongs to another agent (DELPHI for DeFi, HYPERION for perps, SECURO for audits). This shows an interactive redirect prompt.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            enum: ['delphi', 'hyperion', 'securo'],
            description: 'The target agent ID to redirect to',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the redirect, e.g. "DeFi swaps are handled by DELPHI"',
          },
        },
        required: ['agent', 'reason'],
      },
    },
  },
];
