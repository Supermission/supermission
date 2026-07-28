/**
 * Morpho Lending Agent — MetaMorpho vaults on Base
 * List vaults, vault details, deposit prep, withdraw prep, position check.
 * Powered by Morpho GraphQL API + ERC-4626 vault standard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { chatCompletionJSON, MODELS } from '@/lib/openrouter/client';
import { fetchMorphoVaults, fetchMorphoVault } from '@/lib/morpho/client';
import { requireAuth } from '@/lib/auth/require-auth';
import type { MorphoVault } from '@/lib/morpho/types';

const AGENT_ID = 'morpho-lend';

type MorphoAction = 'list_vaults' | 'vault_detail' | 'deposit_prep' | 'withdraw_prep' | 'positions' | 'general';

interface MorphoRequest {
  intent?: string;
  vaultAddress?: string;
  amount?: string;
  asset?: string;
  takerAddress?: string;
}

export async function POST(req: NextRequest) {
  const authError = await requireAuth(req);
  if (authError) return authError;

  try {
    const body: MorphoRequest = await req.json();
    const walletAddress = req.headers.get('x-wallet-address') || undefined;
    const intent = body.intent || '';

    if (!intent && !body.vaultAddress) {
      return NextResponse.json({
        action: 'general',
        message: "Hey! I'm the Morpho lending specialist. I can show you the best vaults on Base for USDC and WETH — with live APY, TVL, and risk analysis. What are you looking for?\n\n- **Show me USDC vaults** — browse all USDC lending vaults\n- **Best WETH yields** — see WETH vault options\n- **Deposit 500 USDC** — start earning right away\n- **My positions** — check your current vault deposits",
      });
    }

    const action = await detectMorphoAction(intent, body);

    switch (action) {
      case 'list_vaults':
        return await handleListVaults(intent, body.asset);
      case 'vault_detail':
        return await handleVaultDetail(intent, body.vaultAddress);
      case 'deposit_prep':
        return await handleDepositPrep(intent, body);
      case 'withdraw_prep':
        return await handleWithdrawPrep(intent, body);
      case 'positions':
        return await handlePositions(walletAddress);
      default:
        return await handleGeneral(intent);
    }
  } catch (err: any) {
    console.error(`[${AGENT_ID}] Error:`, err);
    return NextResponse.json(
      { error: err.message || 'Morpho agent error' },
      { status: 500 }
    );
  }
}

async function detectMorphoAction(intent: string, body: MorphoRequest): Promise<MorphoAction> {
  const lower = intent.toLowerCase();

  if (/position|balance|my\s+vault|my\s+deposit|portfolio/.test(lower)) return 'positions';
  if (/withdraw|redeem|pull\s+out|exit/.test(lower)) return 'withdraw_prep';
  if (/deposit|supply|invest|put\s+in|add\s+\d/.test(lower)) return 'deposit_prep';
  if (body.vaultAddress || /detail|info|about|tell\s+me\s+about/.test(lower)) return 'vault_detail';
  if (/vault|list|show|browse|available|morpho|lend|yield|apy|best/.test(lower)) return 'list_vaults';

  // Fallback: use LLM to classify
  try {
    const result = await chatCompletionJSON(
      MODELS.GEMINI_FLASH_15,
      `You classify user intents about Morpho Protocol lending. Return JSON: { "action": "list_vaults" | "vault_detail" | "deposit_prep" | "withdraw_prep" | "positions" | "general" }`,
      `User says: "${intent}"`,
      { temperature: 0 }
    );
    return (result as any).action || 'list_vaults';
  } catch {
    return 'list_vaults';
  }
}

async function handleListVaults(intent: string, asset?: string): Promise<NextResponse> {
  const vaults = await fetchMorphoVaults();

  // Filter by asset if specified
  let filtered = vaults;
  const lower = (intent + ' ' + (asset || '')).toLowerCase();
  if (/weth|eth/.test(lower) && !/usdc/.test(lower)) {
    filtered = vaults.filter((v) => v.asset.symbol === 'WETH');
  } else if (/usdc|stable/.test(lower) && !/weth|eth/.test(lower)) {
    filtered = vaults.filter((v) => v.asset.symbol === 'USDC');
  }

  // Sort by APY descending
  filtered.sort((a, b) => b.apy.net - a.apy.net);

  // Smart routing: if user mentions a specific vault name, auto-match
  const nameMatch = findVaultByName(intent, vaults);
  if (nameMatch) {
    return NextResponse.json({
      action: 'vault_detail',
      message: `Found **${nameMatch.name}** — here are the details.`,
      vault: nameMatch,
      vaults: [nameMatch],
    });
  }

  const assetLabel = filtered.length > 0 && filtered.every((v) => v.asset.symbol === 'WETH') ? 'WETH' :
                     filtered.length > 0 && filtered.every((v) => v.asset.symbol === 'USDC') ? 'USDC' : 'USDC & WETH';

  // Generate LLM summary
  let message: string;
  try {
    const vaultSummary = filtered.map((v, i) =>
      `${i + 1}. ${v.name} (${v.asset.symbol}) — ${(v.apy.net * 100).toFixed(2)}% APY, $${formatCompact(v.tvl)} TVL, curated by ${v.curator}`
    ).join('\n');

    const result = await chatCompletionJSON(
      MODELS.GEMINI_FLASH_15,
      `You are a concise DeFi analyst. Given these Morpho vaults, write a SHORT (2-3 sentence) summary for the user. Mention the top picks and why. Return JSON: { "message": "..." }`,
      `User asked: "${intent}"\n\nVaults:\n${vaultSummary}`,
      { temperature: 0.3 }
    );
    message = (result as any).message || `Here are ${filtered.length} ${assetLabel} Morpho vaults on Base.`;
  } catch {
    message = `Found ${filtered.length} ${assetLabel} Morpho vaults on Base. Tap any vault to see details and deposit.`;
  }

  return NextResponse.json({
    action: 'list_vaults',
    message,
    vaults: filtered,
  });
}

async function handleVaultDetail(intent: string, vaultAddress?: string): Promise<NextResponse> {
  let vault: MorphoVault | null = null;

  if (vaultAddress) {
    vault = await fetchMorphoVault(vaultAddress);
  } else {
    const allVaults = await fetchMorphoVaults();
    vault = findVaultByName(intent, allVaults);
  }

  if (!vault) {
    return handleListVaults(intent);
  }

  return NextResponse.json({
    action: 'vault_detail',
    message: `**${vault.name}** — ${(vault.apy.net * 100).toFixed(2)}% APY with $${formatCompact(vault.tvl)} TVL. Curated by ${vault.curator}.`,
    vault,
    vaults: [vault],
  });
}

async function handleDepositPrep(intent: string, body: MorphoRequest): Promise<NextResponse> {
  const allVaults = await fetchMorphoVaults();

  // Parse amount from intent
  let amount = body.amount;
  if (!amount) {
    const match = intent.match(/(\d+(?:\.\d+)?)\s*(?:usdc|weth|eth|\$)/i) || intent.match(/(?:deposit|supply|invest)\s+(\d+(?:\.\d+)?)/i);
    amount = match?.[1] || undefined;
  }

  // Detect asset
  const lower = intent.toLowerCase();
  const isWeth = /weth|eth/.test(lower) && !/usdc/.test(lower);
  const assetFilter = isWeth ? 'WETH' : 'USDC';

  // Find target vault
  let vault: MorphoVault | null = findVaultByName(intent, allVaults);

  if (!vault) {
    const filtered = allVaults
      .filter((v) => v.asset.symbol === assetFilter)
      .sort((a, b) => b.apy.net - a.apy.net);

    if (filtered.length === 0) {
      return NextResponse.json({
        action: 'general',
        message: `No ${assetFilter} vaults found. Try asking about available vaults.`,
      });
    }

    if (filtered.length === 1) {
      vault = filtered[0];
    } else {
      const top3 = filtered.slice(0, 3);
      return NextResponse.json({
        action: 'deposit_prep',
        message: amount
          ? `Ready to deposit ${amount} ${assetFilter}. Which vault would you like to use? Here are the top options:`
          : `Here are the best ${assetFilter} vaults. Pick one and tell me how much to deposit:`,
        vaults: top3,
        txData: amount ? { type: 'deposit', asset: assetFilter, amount } : undefined,
      });
    }
  }

  if (!amount) {
    return NextResponse.json({
      action: 'deposit_prep',
      message: `Great choice — **${vault.name}** at ${(vault.apy.net * 100).toFixed(2)}% APY. How much ${vault.asset.symbol} would you like to deposit?`,
      vault,
      vaults: [vault],
    });
  }

  return NextResponse.json({
    action: 'deposit_prep',
    message: `Ready to deposit **${amount} ${vault.asset.symbol}** into **${vault.name}** (${(vault.apy.net * 100).toFixed(2)}% APY). Confirm below to proceed.`,
    vault,
    vaults: [vault],
    txData: {
      type: 'deposit',
      vaultAddress: vault.address,
      vaultName: vault.name,
      asset: vault.asset.symbol,
      amount,
    },
  });
}

async function handleWithdrawPrep(intent: string, body: MorphoRequest): Promise<NextResponse> {
  const allVaults = await fetchMorphoVaults();
  let vault: MorphoVault | null = null;

  if (body.vaultAddress) {
    vault = allVaults.find((v) => v.address.toLowerCase() === body.vaultAddress!.toLowerCase()) || null;
  } else {
    vault = findVaultByName(intent, allVaults);
  }

  if (!vault) {
    return NextResponse.json({
      action: 'withdraw_prep',
      message: "Which vault would you like to withdraw from? Here are the vaults you might have deposits in:",
      vaults: allVaults,
    });
  }

  return NextResponse.json({
    action: 'withdraw_prep',
    message: `Ready to withdraw from **${vault.name}**. The panel below will check your balance and process the withdrawal.`,
    vault,
    vaults: [vault],
    txData: {
      type: 'withdraw',
      vaultAddress: vault.address,
      vaultName: vault.name,
      asset: vault.asset.symbol,
    },
  });
}

async function handlePositions(walletAddress?: string): Promise<NextResponse> {
  if (!walletAddress) {
    return NextResponse.json({
      action: 'positions',
      message: "Connect your wallet to see your Morpho vault positions. I'll show you all your active deposits with current value and earned yield.",
    });
  }

  // Return vault list — the frontend panel reads on-chain balanceOf for each vault
  // to determine which ones the user actually has positions in
  const allVaults = await fetchMorphoVaults();
  return NextResponse.json({
    action: 'positions',
    message: 'Here are the Morpho vaults on Base. Expand any vault to see your position and withdraw.',
    vaults: allVaults,
    walletAddress,
  });
}

async function handleGeneral(intent: string): Promise<NextResponse> {
  try {
    const result = await chatCompletionJSON(
      MODELS.GEMINI_FLASH_15,
      `You are a Morpho Protocol expert. Answer the user's question concisely. If they seem to want to interact with vaults, suggest the appropriate action. Return JSON: { "message": "..." }`,
      intent,
      { temperature: 0.3 }
    );
    return NextResponse.json({
      action: 'general',
      message: (result as any).message || "I can help with Morpho vaults. Try asking me to show vaults, deposit, or check positions.",
    });
  } catch {
    return NextResponse.json({
      action: 'general',
      message: "I can help with Morpho vaults on Base. Try:\n- **Show me USDC vaults**\n- **Deposit 500 USDC**\n- **My positions**",
    });
  }
}

// --- Helpers ---

function findVaultByName(intent: string, vaults: MorphoVault[]): MorphoVault | null {
  const lower = intent.toLowerCase();
  // Exact full name match (intent contains entire vault name)
  for (const v of vaults) {
    if (lower.includes(v.name.toLowerCase())) return v;
  }
  // Reverse: vault name contains the user's key words (partial match)
  // e.g. "steakhouse high yield" matches "Steakhouse High Yield Instant"
  for (const v of vaults) {
    const nameWords = v.name.toLowerCase().split(/\s+/);
    const intentWords = lower.split(/\s+/).filter(w => w.length > 2);
    const matchCount = intentWords.filter(w => nameWords.some(nw => nw.includes(w) || w.includes(nw))).length;
    if (matchCount >= 3 && matchCount >= intentWords.length * 0.5) return v;
  }
  // Curator + asset match (e.g. "gauntlet weth", "steakhouse usdc")
  for (const v of vaults) {
    const curatorLower = v.curator.toLowerCase();
    const assetLower = v.asset.symbol.toLowerCase();
    if (lower.includes(curatorLower) && lower.includes(assetLower)) return v;
  }
  // Just curator match (if unambiguous)
  for (const v of vaults) {
    if (lower.includes(v.curator.toLowerCase())) {
      const sameCurator = vaults.filter((x) => x.curator === v.curator);
      if (sameCurator.length === 1) return v;
    }
  }
  return null;
}

function formatCompact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
