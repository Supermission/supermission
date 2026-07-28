Do not assume things on your own, ask for the info you want.
Fix problems at the source, not the symptom. Patch the root cause first, then add safety nets if needed.
Make surgical changes: when modifying logic, do not touch UI/styling; when modifying UI/styling, do not touch logic. Never alter unrelated logic as a side effect of your change — scope every edit to exactly what was requested.
When modifying code, only change what was explicitly requested. Do not alter adjacent UI elements, swap icons, or refactor unrelated code unless asked. Minimize the blast radius of every change.

## UI/Design Standards
Aim for premium/minimal aesthetics. Never use generic SVG icons or placeholder-quality designs. If unsure about design direction, ask before implementing rather than shipping something that needs multiple revisions.
No buttons in chat UIs — all confirmations are text-based yes/no. Never add clickable action buttons to agent chat responses.
Never add generic/AI-looking SVG icons to badges, tags, or labels — rely on typography and clean layout instead.
Never use gradients, glowing orbs, or generic "AI art" visuals. Every visual element must serve a purpose and look intentional.

## Architecture
Supermission is multi-chain (Base + Polygon). Never describe it as "on Base" only — Polymarket trades happen on Polygon.
Delphi agent behavior is controlled by `lib/ai/delphi/prompt.ts`. All chat agent UX rules live there.
Inline execution components (`components/chat/*-inline.tsx`) auto-execute on mount — no confirmation buttons. All chat confirmations are text-based yes/no.

### Agent Hierarchy
Four primary agents: DELPHI (DeFi), ORACLE (prediction markets), HYPERION (perps), SECURO (security).
Tier-2 agents (token-due-diligence, defi-yield, wallet-intelligence, morpho-lend, prediction-market) are sub-capabilities of the primary agents — always merge configurations into the parent agent unless explicitly told to create separate files.
DELPHI owns: token analysis, yields, swaps, bridges, wallet intel, Morpho lending, LP, batch operations.
ORACLE owns: market search, signals, trading, portfolio, watchlist, prediction market discovery.
Understand the agent architecture before making structural changes.

## Wallet Integration
Privy embedded wallet address can differ from wagmi `useAccount()` address. Always prefer the Privy embedded wallet address (`wallets.find(w => w.walletClientType === 'privy')`) for balance checks and transactions.

## Code Quality
This is a TypeScript-first codebase. `npx tsc --noEmit` should pass with zero errors. If new type errors appear, they're from your changes — fix them before committing.
Always test changes locally before declaring them done. Watch for: runtime crashes, build failures, incorrect data mappings (key mismatches), and string mismatches (e.g., 'perp' vs 'perps'). Never ship code with untested edge cases.
After making changes, verify by: (1) run `tsc --noEmit`, (2) grep for hardcoded/mock data that should be dynamic, (3) trace the data flow from API response to UI render and confirm all keys match.
Never hardcode dynamic data (standings, schedules, scores, prices) — always fetch from APIs.