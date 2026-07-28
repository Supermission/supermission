/**
 * DELPHI tool definitions — OpenAI function calling schema.
 * 30+ tools exposed to the DeFi agent. No executor logic — see ./dispatch.ts
 * and the per-domain executor files.
 */

import type { ToolDefinition } from '../../shared/types';

export const DELPHI_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'analyze_token',
      description:
        'Deep due diligence on a token: safety score, liquidity analysis, holder distribution, social signals, contract risks. Provide contract address and chain ID.',
      parameters: {
        type: 'object',
        properties: {
          contractAddress: { type: 'string', description: 'Token contract address' },
          chainId: { type: 'number', description: 'Chain ID (e.g. 8453 for Base, 1 for Ethereum)' },
        },
        required: ['contractAddress', 'chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_swap_quote',
      description:
        'Get a swap or bridge quote between two tokens. Returns route, estimated output, price impact, and fees. Supports cross-chain bridges.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Source token contract address' },
          toToken: { type: 'string', description: 'Destination token contract address' },
          amount: { type: 'string', description: 'Amount to swap (in token units, e.g. "100" for 100 USDC)' },
          fromChainId: { type: 'number', description: 'Source chain ID (default: 8453 for Base)' },
          toChainId: { type: 'number', description: 'Destination chain ID (same as fromChainId for same-chain swap)' },
          slippage: { type: 'number', description: 'Slippage tolerance as decimal (e.g. 0.005 for 0.5%). Default: 0.005' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_price',
      description:
        'Get the current price of a token in USD. Uses multi-source price aggregation (CoinGecko, CryptoCompare, Chainlink). Provide token symbol (e.g. "ETH", "WETH", "USDC") or contract address.',
      parameters: {
        type: 'object',
        properties: {
          tokenSymbol: { type: 'string', description: 'Token symbol (e.g. "ETH", "WETH", "USDC", "DAI"). Preferred over address.' },
          tokenAddress: { type: 'string', description: 'Token contract address (fallback if symbol not provided)' },
          chainId: { type: 'number', description: 'Chain ID (default: 8453 for Base)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_yields',
      description:
        'Scan for the best DeFi yield opportunities on Base or Polygon. Returns protocols, APYs, TVL, and risk scores. ASK the user which chain they want to scan — do not assume.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', enum: ['base', 'polygon'], description: 'Chain to scan yields on. ASK the user if not specified.' },
          minTvl: { type: 'number', description: 'Minimum TVL in USD (default: 100000)' },
          minApy: { type: 'number', description: 'Minimum APY percentage' },
          stablecoinOnly: { type: 'boolean', description: 'Only show stablecoin pools' },
          riskTolerance: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Risk tolerance filter' },
          target: { type: 'string', enum: ['stable', 'balanced', 'max_yield'], description: 'Yield strategy target' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_wallet',
      description:
        'Wallet analysis on Base, Ethereum, and Polygon: token balances, NFT portfolio, DeFi positions, risk assessment. Uses connected wallet if no address provided. Defaults to Base only for speed — pass chains explicitly for multi-chain.',
      parameters: {
        type: 'object',
        properties: {
          walletAddress: { type: 'string', description: 'Wallet address to analyze (uses connected wallet if omitted)' },
          chains: {
            type: 'array',
            items: { type: 'string', enum: ['base', 'polygon', 'ethereum'] },
            description: 'Chains to analyze (default: Base only). Pass ["base","polygon","ethereum"] for full multi-chain analysis.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio',
      description:
        'Quick native-only balance check (ETH/MATIC) and tx counts. Does NOT include ERC20 tokens, NFTs, or DeFi positions. Use analyze_wallet for full portfolio.',
      parameters: {
        type: 'object',
        properties: {
          walletAddress: { type: 'string', description: 'Wallet address (uses connected wallet if omitted)' },
          chains: {
            type: 'array',
            items: { type: 'string', enum: ['base', 'polygon', 'ethereum'] },
            description: 'Chains to check (default: all)',
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
        'Search the web for latest crypto/DeFi news, protocol updates, market context. Returns excerpts from recent sources.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Specific search query. Be specific: "Aave v3 Base TVL March 2026", "Uniswap v4 hooks launch date".',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tokens',
      description:
        'List available tokens on a specific chain. Returns token symbols, names, and contract addresses.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID to list tokens for (e.g. 8453 for Base)' },
        },
        required: ['chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_chains',
      description: 'List all supported blockchain networks with their chain IDs.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'scan_morpho_vaults',
      description:
        'Browse Morpho Protocol MetaMorpho vaults on Base. Shows live APY, TVL, curators, risk levels, and investment reasons. Users can deposit USDC or WETH into these ERC-4626 vaults. Filter by asset (USDC, WETH) or get all vaults.',
      parameters: {
        type: 'object',
        properties: {
          asset: {
            type: 'string',
            enum: ['USDC', 'WETH'],
            description: 'Filter by asset type. Omit to show all vaults.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_morpho_deposit',
      description:
        'Prepare a deposit into a Morpho MetaMorpho vault. Returns deposit parameters that the user can confirm to execute. Use this when the user explicitly wants to deposit into a specific vault.',
      parameters: {
        type: 'object',
        properties: {
          vaultName: {
            type: 'string',
            description: 'Name of the vault (e.g. "Steakhouse High Yield Instant", "Gauntlet USDC Prime")',
          },
          amount: {
            type: 'string',
            description: 'Amount to deposit in human-readable units (e.g. "3" for 3 USDC)',
          },
        },
        required: ['vaultName', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_swap',
      description:
        'Prepare a swap for execution. Returns a Confirm Swap button the user clicks to execute. Call this when the user confirms they want to swap after seeing a quote.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', description: 'Source token contract address' },
          toToken: { type: 'string', description: 'Destination token contract address' },
          amount: { type: 'string', description: 'Amount to swap (human-readable, e.g. "100" for 100 USDC)' },
          fromChainId: { type: 'number', description: 'Source chain ID (default: 8453 for Base)' },
          toChainId: { type: 'number', description: 'Destination chain ID (defaults to fromChainId)' },
          slippage: { type: 'number', description: 'Slippage tolerance as decimal (default 0.005)' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_transfer',
      description:
        'Prepare a token transfer (send tokens) to an arbitrary address. Returns a Confirm Transfer button the user clicks to execute. Use for "send X to address", "transfer X to address".',
      parameters: {
        type: 'object',
        properties: {
          tokenAddress: { type: 'string', description: 'Token contract address to send. Use 0x0000000000000000000000000000000000000000 for native ETH/MATIC (native gas token is ETH on Robinhood).' },
          toAddress: { type: 'string', description: 'Destination wallet address (0x...)' },
          amount: { type: 'string', description: 'Amount to send (human-readable, e.g. "10" for 10 USDC)' },
          chainId: { type: 'number', description: 'Chain ID (1=Ethereum, 8453=Base, 137=Polygon, 42161=Arbitrum, 4663=Robinhood)' },
        },
        required: ['tokenAddress', 'toAddress', 'amount', 'chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_balance',
      description:
        'Check balance of a specific token in the connected wallet. Fast single-token lookup. Use "native" or 0x000...000 for ETH/MATIC.',
      parameters: {
        type: 'object',
        properties: {
          tokenAddress: { type: 'string', description: 'Token contract address, or "native" for ETH/MATIC' },
          chainId: { type: 'number', description: 'Chain ID (default: 8453 for Base). Supports 1=Ethereum, 8453=Base, 137=Polygon, 42161=Arbitrum, 4663=Robinhood (native ETH + USDG).' },
        },
        required: ['tokenAddress', 'chainId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'browse_pools',
      description:
        'Browse Uniswap V3 liquidity pools. Returns pair, fee tier, APR, TVL, and 24h volume.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID (default: 8453 for Base)' },
          search: { type: 'string', description: 'Filter by token symbol (e.g. "WETH")' },
          limit: { type: 'number', description: 'Number of results (default: 10, max: 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_defi_deposit',
      description:
        'Prepare a USDC deposit into Aave V3 or Compound III on Base. Returns a Confirm Deposit button the user clicks to execute.',
      parameters: {
        type: 'object',
        properties: {
          protocol: { type: 'string', enum: ['aave-v3', 'compound-iii'], description: 'Target protocol' },
          amount: { type: 'string', description: 'USDC amount to deposit (e.g. "100")' },
        },
        required: ['protocol', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_yield_strategy',
      description:
        'Generate an AI-powered yield allocation strategy based on risk tolerance and investment amount.',
      parameters: {
        type: 'object',
        properties: {
          riskTolerance: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'], description: 'Risk level (default: balanced)' },
          amount: { type: 'string', description: 'Total amount to allocate in USD (e.g. "1000")' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_uniswap_lp',
      description:
        'Prepare a Uniswap V3 LP position on Base. Shows the LP details card. User must type yes/go in chat to execute. Resolves token symbols, fetches pool data, calculates optimal range.',
      parameters: {
        type: 'object',
        properties: {
          token0Symbol: { type: 'string', description: 'First token symbol (e.g. "WETH")' },
          token1Symbol: { type: 'string', description: 'Second token symbol (e.g. "USDC")' },
          amount0: { type: 'string', description: 'Amount of first token (e.g. "0.1"). Provide at least one amount.' },
          amount1: { type: 'string', description: 'Amount of second token (e.g. "250"). Provide at least one amount.' },
          feeTier: { type: 'number', description: 'Fee tier: 500 (0.05%), 3000 (0.3%), 10000 (1%). Default: 3000' },
          riskLevel: { type: 'string', enum: ['conservative', 'moderate', 'aggressive'], description: 'Range width risk level. Default: moderate' },
        },
        required: ['token0Symbol', 'token1Symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_uniswap_lp',
      description:
        'Execute a prepared LP position the user has confirmed. Call this ONLY after user says yes/go/confirm after seeing a prepare_uniswap_lp result.',
      parameters: {
        type: 'object',
        properties: {
          confirmed: { type: 'boolean', description: 'Must be true' },
        },
        required: ['confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lp_positions',
      description:
        'Get all Uniswap V3 LP positions for the connected wallet on Base. Shows position details, in-range status, token amounts, and accrued fees.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_remove_liquidity',
      description:
        'Prepare to remove liquidity from a Uniswap V3 LP position. Returns a Confirm button to execute removal.',
      parameters: {
        type: 'object',
        properties: {
          positionId: { type: 'string', description: 'NFT token ID of the LP position' },
          percentage: { type: 'number', description: 'Percentage of liquidity to remove (1-100). Default: 100' },
        },
        required: ['positionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'collect_lp_fees',
      description:
        'Prepare to collect accrued fees from a Uniswap V3 LP position without removing liquidity.',
      parameters: {
        type: 'object',
        properties: {
          positionId: { type: 'string', description: 'NFT token ID of the LP position' },
        },
        required: ['positionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_trending_tokens',
      description:
        'Get trending tokens by trading volume, smart money activity, or price change. Shows top movers across Base, Ethereum, and Polygon.',
      parameters: {
        type: 'object',
        properties: {
          chains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Chains to scan (default: base, ethereum, polygon)',
          },
          sortBy: {
            type: 'string',
            enum: ['volume', 'buy_volume', 'price_change', 'netflow', 'nof_traders'],
            description: 'Sort metric (default: buy_volume)',
          },
          timeframe: {
            type: 'string',
            enum: ['1h', '6h', '24h', '7d'],
            description: 'Time window (default: 24h)',
          },
          category: {
            type: 'string',
            enum: ['all', 'smart_money', 'whale'],
            description: 'Filter by trader type (default: all)',
          },
          limit: { type: 'number', description: 'How many to return (default: 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_smart_money_moves',
      description:
        'See what smart money (funds, top traders) is buying and accumulating. Shows net flows and holdings changes.',
      parameters: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            enum: ['netflows', 'holdings', 'trades'],
            description: 'Data view (default: netflows)',
          },
          chains: {
            type: 'array',
            items: { type: 'string' },
            description: 'Chains to scan (default: base, ethereum, polygon)',
          },
          timeframe: {
            type: 'string',
            description: 'For netflows sorting: 1h, 24h, 7d, 30d (default: 24h)',
          },
          limit: { type: 'number', description: 'How many to return (default: 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'nansen_token_analysis',
      description:
        'Deep token analysis: trading metrics, risk/reward indicators, smart money flow intelligence, holder analysis. Provide chain and token address.',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', description: "Chain name (e.g. 'base', 'ethereum', 'polygon')" },
          tokenAddress: { type: 'string', description: 'Token contract address' },
          tokenSymbol: { type: 'string', description: 'Token symbol if known, used for search fallback' },
        },
        required: ['chain', 'tokenAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_nansen_token',
      description:
        'Search for a token by name or symbol to get its address, chain, price, and market cap. Use this when you need to resolve a token name to an address for other tools.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Token name or symbol to search for' },
          chain: { type: 'string', description: 'Filter by chain (optional)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_buy_trending',
      description:
        'Analyze trending tokens on a chain and generate a distribution plan for a given USDC budget. Returns a ranked token list with amounts and reasoning. Use when user says "distribute X across top N tokens", "buy top trending", "batch buy trending", "diversify into trending".',
      parameters: {
        type: 'object',
        properties: {
          chain: { type: 'string', enum: ['base', 'ethereum', 'polygon'], description: 'Chain to buy on (default: base)' },
          totalAmount: { type: 'string', description: 'Total USDC to distribute (e.g. "50" for $50)' },
          count: { type: 'number', description: 'Number of tokens to buy (default: 5, min: 2, max: 10)' },
          allocationStrategy: { type: 'string', enum: ['equal', 'weighted'], description: 'equal: split evenly. weighted: weight by buy volume. Default: equal' },
        },
        required: ['totalAmount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_batch_buy',
      description:
        'Execute a batch buy plan the user has confirmed. Call this ONLY after user says yes/go/confirm after seeing a batch_buy_trending plan.',
      parameters: {
        type: 'object',
        properties: {
          confirmed: { type: 'boolean', description: 'Must be true' },
          chainId: { type: 'number', description: 'Chain ID from the plan' },
          fromToken: { type: 'string', description: 'USDC address from the plan' },
          totalAmount: { type: 'string', description: 'Total USD amount from the plan' },
        },
        required: ['confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'batch_allocate_yield',
      description:
        'Prepare multiple yield positions (Uniswap V3 LP and/or Morpho vault deposits) for batch execution. Use when user says "allocate X in each of these", "deploy into all 5", "put $5 in each". Takes an array of positions from a yield scan or pool browse result.',
      parameters: {
        type: 'object',
        properties: {
          positions: {
            type: 'array',
            description: 'Array of yield positions to prepare',
            items: {
              type: 'object',
              properties: {
                protocol: { type: 'string', enum: ['uniswap_v3', 'morpho'], description: 'Protocol type' },
                token0Symbol: { type: 'string', description: 'First token symbol (for uniswap_v3)' },
                token1Symbol: { type: 'string', description: 'Second token symbol (for uniswap_v3)' },
                vaultName: { type: 'string', description: 'Vault name (for morpho)' },
                amountUSD: { type: 'number', description: 'USD amount to allocate to this position' },
                feeTier: { type: 'number', description: 'Fee tier for uniswap_v3 (default 3000)' },
              },
              required: ['protocol', 'amountUSD'],
            },
          },
        },
        required: ['positions'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_batch_yield',
      description:
        'Execute a batch yield allocation plan the user has confirmed. Call this ONLY after user says yes/go/confirm after seeing a batch_allocate_yield plan.',
      parameters: {
        type: 'object',
        properties: {
          confirmed: { type: 'boolean', description: 'Must be true' },
        },
        required: ['confirmed'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_twap',
      description:
        'Calculate time-weighted average price (TWAP) for a token. Use when user asks about average price, whether a token is overbought/oversold vs its average, or before setting LP ranges.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: "Token symbol (e.g. 'WETH', 'USDC')" },
          period: { type: 'string', enum: ['24h', '7d'], description: 'TWAP period (default: 24h)' },
        },
        required: ['symbol'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_top_traded_tokens',
      description:
        'Get tokens with highest on-chain trading volume on Base. Shows real DEX activity, not social signals. Use when user asks about most traded, highest volume, or on-chain activity.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of tokens (default: 10, max: 20)' },
          period: { type: 'string', enum: ['24h', '7d'], description: 'Time period (default: 24h)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_price_chart',
      description:
        'Fetch OHLCV candlestick data for a token to render an inline price chart. Use for ANY technical analysis, trend, or price history request. Always call this before writing a TA response.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: "Token symbol (e.g. 'ETH', 'POL', 'WBTC') or contract address" },
          timeframe: { type: 'string', enum: ['24h', '7d', '30d'], description: 'Chart timeframe (default: 7d)' },
        },
        required: ['token'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_wallet_swap_history',
      description:
        'Get a wallet\'s swap history. Shows tokens traded, direction, size, and timestamps. Use when user asks about swap history, recent trades, or what a wallet has been trading.',
      parameters: {
        type: 'object',
        properties: {
          wallet: { type: 'string', description: 'Wallet address (defaults to connected wallet if omitted)' },
          limit: { type: 'number', description: 'Number of swaps (default: 20, max: 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_new_pools',
      description:
        'Find newly created Uniswap pools on Base with real liquidity. Shows recently listed tokens. Use when user asks about new listings, new trading pairs, or recently added tokens.',
      parameters: {
        type: 'object',
        properties: {
          hours: { type: 'number', description: 'Look back period in hours (default: 48, max: 168)' },
          minTvl: { type: 'number', description: 'Minimum TVL in USD to filter spam (default: 5000)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_large_swaps',
      description:
        'Find the largest recent swaps on Base for a token. Detects whale activity. Use when user asks about whale swaps, large trades, big buys/sells, or market pressure.',
      parameters: {
        type: 'object',
        properties: {
          token: { type: 'string', description: "Token symbol to track (e.g. 'WETH')" },
          minUsd: { type: 'number', description: 'Minimum swap size in USD (default: 10000)' },
          hours: { type: 'number', description: 'Look back period in hours (default: 4)' },
        },
        required: ['token'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_pool_fee_analytics',
      description:
        'Analyze fee revenue and APR for a specific Uniswap pool over time. Use when user asks about pool fees, LP yield, pool performance, or whether a pool is worth LPing in.',
      parameters: {
        type: 'object',
        properties: {
          token0: { type: 'string', description: "First token symbol (e.g. 'WETH')" },
          token1: { type: 'string', description: "Second token symbol (e.g. 'USDC')" },
          feeTier: { type: 'number', description: 'Fee tier in bps: 100 (0.01%), 500 (0.05%), 3000 (0.3%), 10000 (1%). Default: 3000' },
          days: { type: 'number', description: 'Number of days to analyze (default: 7, max: 30)' },
        },
        required: ['token0', 'token1'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_swap_routes',
      description:
        'Compare swap execution across different fee tiers and aggregators. Use when user asks about best route, cheapest swap, or wants to compare fee tiers.',
      parameters: {
        type: 'object',
        properties: {
          tokenIn: { type: 'string', description: 'Token to sell (symbol)' },
          tokenOut: { type: 'string', description: 'Token to buy (symbol)' },
          amount: { type: 'string', description: 'Amount to swap (in tokenIn units)' },
        },
        required: ['tokenIn', 'tokenOut', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_lp_position_analytics',
      description:
        "Analyze an LP position's performance including fees earned, impermanent loss, and net PnL. Use when user asks about LP performance, impermanent loss, whether their LP is profitable, or position PnL.",
      parameters: {
        type: 'object',
        properties: {
          positionId: { type: 'string', description: 'NFT token ID of the LP position' },
          wallet: { type: 'string', description: 'Wallet address (defaults to connected wallet)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_token_safety',
      description:
        'Check if a token contract is safe. Verifies source code, checks deployer, holder concentration, and supply. Use when user asks "is this safe", "rug check", "is this legit", or before buying unknown tokens.',
      parameters: {
        type: 'object',
        properties: {
          contractAddress: { type: 'string', description: 'Token contract address' },
          chainId: { type: 'number', description: 'Chain ID (default: 8453 for Base)' },
        },
        required: ['contractAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_token_holders',
      description:
        'Get holder count and top holders for a token. Shows supply concentration. Use when user asks about holders, whale concentration, or supply distribution.',
      parameters: {
        type: 'object',
        properties: {
          contractAddress: { type: 'string', description: 'Token contract address' },
          chainId: { type: 'number', description: 'Chain ID (default: 8453)' },
        },
        required: ['contractAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'trace_wallet_funding',
      description:
        'Trace where a wallet got its initial funding. Shows the first address that sent funds. Use when user asks "who funded this wallet", "where did funds come from", or for deployer reputation checks.',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Wallet address to trace' },
          chainId: { type: 'number', description: 'Chain ID (default: 8453)' },
        },
        required: ['address'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_wallet_tx_history',
      description:
        'Get full transaction history for any wallet. Shows all transactions including contract calls, ETH transfers, and token movements. Use when user asks about transaction history or "what has this wallet been doing".',
      parameters: {
        type: 'object',
        properties: {
          address: { type: 'string', description: 'Wallet address (defaults to connected wallet)' },
          chainId: { type: 'number', description: 'Chain ID (default: 8453)' },
          limit: { type: 'number', description: 'Number of transactions (default: 20, max: 50)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_gas_info',
      description:
        'Get current gas prices and ETH price. Use when user asks about gas, transaction costs, or if now is a good time to transact.',
      parameters: {
        type: 'object',
        properties: {
          chainId: { type: 'number', description: 'Chain ID (default: 8453)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_clarification',
      description:
        'Render an interactive multi-choice picker. EXTREMELY RESTRICTED — only use when ALL of the following are true: (1) the user has issued a CLEAR DeFi intent (yield, swap, bridge, lend, etc.), (2) you genuinely cannot proceed without picking from a SMALL CLOSED SET of 2-4 concrete, mutually-exclusive options (e.g. Base vs Polygon, low/medium/high risk, a specific token from a fixed list), and (3) plain text would be worse UX than buttons. NEVER call this for: ambiguous, garbled, empty, or unparseable input; pasted file paths, URLs, screenshots, or stray text; greetings/small talk; opinions or open-ended questions; yes/no confirmations (use plain text); follow-ups; "what do you think"; situations where a sensible default exists; or any time you are already returning results. If in doubt, DO NOT call this — reply in plain text and let the user type freely.',
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
                id: { type: 'string', description: 'Short identifier for the option' },
                label: { type: 'string', description: 'Display label for the option' },
                description: { type: 'string', description: 'Optional brief explanation' },
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
      name: 'redirect_to_agent',
      description:
        'Redirect the user to a sister agent that can handle their request. Use this when the task is outside your scope and belongs to another agent (ORACLE for prediction markets, HYPERION for perps, SECURO for audits). This shows an interactive redirect prompt.',
      parameters: {
        type: 'object',
        properties: {
          agent: {
            type: 'string',
            enum: ['oracle', 'hyperion', 'securo'],
            description: 'The target agent ID to redirect to',
          },
          reason: {
            type: 'string',
            description: 'Brief reason for the redirect, e.g. "Prediction market trades are handled by ORACLE"',
          },
        },
        required: ['agent', 'reason'],
      },
    },
  },
];
