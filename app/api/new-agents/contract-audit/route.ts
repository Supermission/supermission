/**
 * Smart Contract Audit AI Agent Service (Serverless)
 * Provides comprehensive Solidity contract security analysis
 * Implements X402 Payment Required protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { getCachedAuditData } from '@/lib/new-agents/contractAudit/cacheDataHelper';
import { getAuditStats } from '@/lib/new-agents/contractAudit/fetchContractAudit';
import { createSingleAgentJob, completeSingleAgentJob } from '@/lib/agent-economy/collaborate';
import { fetchContractSource } from '@/lib/new-agents/contractAudit/helpers/blockExplorerFetcher';
import { generateAIAuditReport } from '@/lib/new-agents/contractAudit/helpers/aiReportGenerator';
import type { AIAuditReport } from '@/lib/new-agents/contractAudit/types';

// ============================================
// AGENT CONFIGURATION
// ============================================
const AGENT_ID = 'agent_contract_audit_001';
const AGENT_NAME = 'Smart Contract Audit';
const ERC8004_AGENT_ID = '0'; // Update with actual ERC-8004 NFT Token ID when registered
const CDP_WALLET = '0xE7138DF3CcB480718Dc2C37fAf7Aee70B08157e7'; // Agent's wallet to receive payments

// Token configuration (Base Mainnet USDC)
const PAYMENT_TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const CHAIN_ID = 8453; // Base Mainnet
const TOKEN_DECIMALS = 6; // USDC has 6 decimals

// Pricing (in USDC)
const SERVICE_PRICE = '0.2'; // $0.2 per contract audit

/**
 * Contract Audit Request Interface
 */
interface ContractAuditRequest {
  sourceCode?: string;
  contractAddress?: string;
  chainId?: number;
  contractName?: string;
  compilerVersion?: string;
  payment?: number; // Optional: override default price
  selectedModel?: string; // AI model for comprehensive report generation
  deepAudit?: boolean; // Optional: run Nemesis + Pashov AI passes (~2-3 min)
}

/**
 * Execute task endpoint with X402 Payment Required support
 */
export async function POST(request: NextRequest) {
  const authError = await requireAuth(request);
  if (authError) return authError;

  console.log('[ContractAudit API] POST handler called');
  try {
    const body: ContractAuditRequest = await request.json();
    let { sourceCode, contractName, compilerVersion } = body;
    const { contractAddress, chainId, deepAudit } = body;
    const paymentProofHeader = request.headers.get('x-payment-proof');

    // If sourceCode is missing but address is provided, try to fetch it
    if ((!sourceCode || sourceCode.trim().length === 0) && contractAddress && chainId) {
      try {
        console.log(`[ContractAudit API] Fetching sources for ${contractAddress} on chain ${chainId}`);
        const fetchedData = await fetchContractSource(contractAddress, chainId);
        sourceCode = fetchedData.sourceCode;
        contractName = contractName || fetchedData.contractName; // Prefer user provided name or fetched name
        compilerVersion = compilerVersion || fetchedData.compilerVersion;

        console.log(`[ContractAudit API] Successfully fetched source for ${contractName}`);
      } catch (error) {
        console.error(`[ContractAudit API] Failed to fetch contract source:`, error);
        return NextResponse.json(
          { error: `Failed to fetch contract source: ${(error as Error).message}` },
          { status: 400 }
        );
      }
    }

    console.log('[ContractAudit API] Payment proof header exists?:', !!paymentProofHeader);
    console.log('[ContractAudit API] Source code length:', sourceCode?.length || 0);
    console.log('[ContractAudit API] Contract name:', contractName);

    // Validate required fields
    if (!sourceCode || sourceCode.trim().length === 0) {
      return NextResponse.json(
        { error: 'Missing sourceCode - Solidity source code is required or valid Contract Address' },
        { status: 400 }
      );
    }

    if (sourceCode.length > 500_000) {
      return NextResponse.json(
        { error: 'Source code too large (max 500KB)' },
        { status: 400 }
      );
    }

    console.log(`[${AGENT_NAME}] Received request for contract: ${contractName || 'unnamed'}`);

    // Payment gating disabled - agents are free to use
    console.log(`[${AGENT_NAME}] Payment gating disabled - proceeding without payment`);

    // ========================================
    // STEP 1: Execute contract audit (no payment required)
    // ========================================
    // Track job in collaborate_missions
    const user_address = request.headers.get('x-wallet-address');
    const jobResult = await createSingleAgentJob({
      agentName: AGENT_NAME,
      agentWallet: CDP_WALLET,
      title: `Contract Audit: ${contractName || 'unnamed'}`,
      description: `Smart contract security analysis${body.deepAudit ? ' (deep audit)' : ''}`,
      budget: SERVICE_PRICE,
      category: 'contract-audit',
      creatorAddress: user_address || 'anonymous',
    });
    const missionId = jobResult.missionId || null;

    let auditResult;
    let aiReport: AIAuditReport | null = null;
    try {
      auditResult = await getCachedAuditData({
        sourceCode,
        contractName,
        compilerVersion,
        deepAudit: deepAudit === true,
        selectedModel: body.selectedModel,
      });
      console.log(`[${AGENT_NAME}] Audit completed for contract: ${contractName || 'unnamed'}`);

      // Generate AI-enhanced report if model is selected
      if (body.selectedModel) {
        try {
          console.log(`[${AGENT_NAME}] Generating AI report with model: ${body.selectedModel}`);
          aiReport = await generateAIAuditReport({
            sourceCode,
            contractName: contractName || 'unnamed',
            auditResult,
            selectedModel: body.selectedModel,
          });
          console.log(`[${AGENT_NAME}] AI report generated successfully`);
        } catch (aiError) {
          console.error(`[${AGENT_NAME}] AI report generation failed:`, aiError);
        }
      }
    } catch (auditError) {
      const errorMessage = auditError instanceof Error ? auditError.message : 'Contract audit failed';
      console.error(`[${AGENT_NAME}] Contract audit failed:`, errorMessage);

      return NextResponse.json(
        {
          success: false,
          error: 'Contract audit failed',
          message: errorMessage,
          contractName,
        },
        { status: 422 }
      );
    }

    // ========================================
    // STEP 2: Return success
    // ========================================
    const stats = getAuditStats(auditResult);

    // Complete the job
    if (missionId && jobResult.taskId) {
      completeSingleAgentJob({ missionId, taskId: jobResult.taskId, submissionData: { contractName, stats } }).catch(() => {});
    }

    return NextResponse.json(
      {
        success: true,
        agentId: AGENT_ID,
        agentName: AGENT_NAME,
        missionId,
        stats: stats,
        data: auditResult,
        aiReport: aiReport,
      },
    );
  } catch (error) {
    console.error(`[${AGENT_NAME}] Request error:`, error);
    return NextResponse.json(
      {
        error: 'Internal error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    agent: AGENT_NAME,
    agentId: AGENT_ID,
    erc8004AgentId: ERC8004_AGENT_ID,
    cdpWallet: CDP_WALLET,
    pricing: {
      perAudit: SERVICE_PRICE,
      currency: 'USDC',
      chainId: CHAIN_ID,
      token: PAYMENT_TOKEN,
    },
    capabilities: [
      'security-analysis',
      'gas-optimization',
      'best-practices-check',
      'openzeppelin-compliance',
      'reentrancy-detection',
      'access-control-analysis',
      'vulnerability-scanning',
      'nemesis-feynman-analysis',
      'pashov-vector-scan',
    ],
    analysisFeatures: {
      securityChecks: [
        'Reentrancy vulnerabilities (SWC-107)',
        'tx.origin authorization (SWC-115)',
        'Unchecked call returns (SWC-104)',
        'Unprotected ether withdrawal (SWC-105)',
        'Delegatecall risks (SWC-112)',
        'Floating pragma (SWC-103)',
        'selfdestruct usage (SWC-106)',
      ],
      gasOptimizations: [
        'Calldata vs memory optimization',
        'Loop optimization',
        'Storage packing',
        'Unchecked blocks',
        'Custom errors vs require strings',
      ],
      ozPatterns: [
        'Ownable',
        'AccessControl',
        'ReentrancyGuard',
        'Pausable',
        'SafeERC20',
        'Initializable',
        'UUPSUpgradeable',
      ],
    },
    supportedVersions: {
      solidity: '0.4.0 - 0.8.x',
      openzeppelin: 'v4.x, v5.x',
    },
    officialRegistry: '0x8004AA63c570c570eBF15376c0dB199918BFe9Fb',
    timestamp: new Date().toISOString(),
  });
}
