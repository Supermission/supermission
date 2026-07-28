import type { ToolDefinition } from '../../shared/types';

/**
 * RORO tool set. Read-only market/portfolio tools bridge straight to the
 * Robinhood Trading MCP. `prepare_equity_order` / `prepare_option_order` run a
 * pre-trade REVIEW and return an envelope the inline card auto-executes after
 * the user confirms — orders are never placed directly by the model.
 */

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

export const RORO_TOOLS: ToolDefinition[] = [
  // ── Account / portfolio ──
  {
    type: 'function',
    function: {
      name: 'get_portfolio',
      description: "Snapshot of the user's Robinhood portfolio: total value, values by asset class, and real-time buying power.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_accounts',
      description: 'List the user\'s Robinhood accounts (including the Agentic account).',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_realized_pnl',
      description: 'Realized profit & loss over a time window, broken down by asset class.',
      parameters: { type: 'object', properties: { window: str('Time window, e.g. "1d", "1w", "1m", "1y", "all"') }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equity_positions',
      description: 'Open equity positions with quantity and cost basis.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_option_positions',
      description: 'Open or closed options positions.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  // ── Market data ──
  {
    type: 'function',
    function: {
      name: 'search',
      description: 'Resolve a company name or partial name to a ticker symbol.',
      parameters: { type: 'object', properties: { query: str('Company name or partial name') }, required: ['query'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equity_quotes',
      description: 'Real-time equity quotes and prior close for up to 20 symbols.',
      parameters: { type: 'object', properties: { symbols: { type: 'array', items: { type: 'string' }, description: 'Ticker symbols' } }, required: ['symbols'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equity_historicals',
      description: 'OHLCV price bars for a symbol across a time range.',
      parameters: { type: 'object', properties: { symbol: str('Ticker'), interval: str('e.g. day, hour, 5minute'), span: str('e.g. day, week, month, year') }, required: ['symbol'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equity_fundamentals',
      description: 'Valuation ratios, market cap, 52-week range, dividend info, and today\'s OHLCV.',
      parameters: { type: 'object', properties: { symbol: str('Ticker') }, required: ['symbol'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_equity_technical_indicators',
      description: 'Compute a technical indicator (RSI, MACD, Bollinger Bands, moving averages, …) for a stock.',
      parameters: { type: 'object', properties: { symbol: str('Ticker'), indicator: str('e.g. RSI, MACD, SMA, EMA, BBANDS'), span: str('time range') }, required: ['symbol', 'indicator'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_earnings_results',
      description: "A stock's earnings history and next report (estimated vs actual EPS).",
      parameters: { type: 'object', properties: { symbol: str('Ticker') }, required: ['symbol'] },
    },
  },
  // ── Watchlists ──
  {
    type: 'function',
    function: {
      name: 'get_watchlists',
      description: "List the user's watchlists.",
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_watchlist_items',
      description: 'List symbols in a specific watchlist.',
      parameters: { type: 'object', properties: { name: str('Watchlist name') }, required: ['name'] },
    },
  },
  // ── Trading (gated: review -> confirm -> execute) ──
  {
    type: 'function',
    function: {
      name: 'prepare_equity_order',
      description: 'Prepare (REVIEW, do not place) an equity order. Runs Robinhood pre-trade validation and returns an order the user must confirm by typing yes. Use ONLY after you have the symbol, side, quantity, and order type. NEVER claim the order was placed from this tool.',
      parameters: {
        type: 'object',
        properties: {
          symbol: str('Ticker symbol'),
          side: { type: 'string', enum: ['buy', 'sell'], description: 'buy or sell' },
          quantity: num('Number of shares (fractional allowed if tradable fractionally)'),
          amount_dollars: num('Optional: notional dollar amount instead of share quantity'),
          order_type: { type: 'string', enum: ['market', 'limit'], description: 'market or limit' },
          limit_price: num('Required for limit orders'),
          time_in_force: { type: 'string', enum: ['gfd', 'gtc'], description: 'good-for-day or good-till-cancel' },
        },
        required: ['symbol', 'side', 'order_type'],
      },
    },
  },
  // ── Meta ──
  {
    type: 'function',
    function: {
      name: 'request_clarification',
      description: 'Ask the user to choose from a defined set of options when you genuinely cannot proceed (e.g. which ticker, buy or sell, how many shares).',
      parameters: {
        type: 'object',
        properties: {
          question: str('The question to ask'),
          options: { type: 'array', items: { type: 'string' }, description: 'Choices' },
        },
        required: ['question'],
      },
    },
  },
];

/** Tool names bridged read-only straight to the Robinhood MCP (name matches the MCP tool). */
export const RORO_MCP_READ_TOOLS = new Set([
  'get_portfolio', 'get_accounts', 'get_realized_pnl', 'get_equity_positions', 'get_option_positions',
  'search', 'get_equity_quotes', 'get_equity_historicals', 'get_equity_fundamentals',
  'get_equity_technical_indicators', 'get_earnings_results', 'get_watchlists', 'get_watchlist_items',
]);
