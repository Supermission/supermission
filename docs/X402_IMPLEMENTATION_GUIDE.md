# X402 Payment Protocol Implementation Guide

> Agent-agnostic guide for implementing HTTP 402 Payment Required flows in serverless agents.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [File Structure](#file-structure)
4. [Step-by-Step Implementation](#step-by-step-implementation)
5. [Code Templates](#code-templates)
6. [Payment Flow Diagram](#payment-flow-diagram)
7. [Configuration Reference](#configuration-reference)
8. [Testing](#testing)
9. [Frontend Integration (Chat Flow)](#frontend-integration-chat-flow)
10. [CDP Embedded Wallet Integration](#cdp-embedded-wallet-integration)
11. [Security Considerations](#security-considerations)
12. [Troubleshooting](#troubleshooting)

---

## Overview

The X402 protocol implements HTTP 402 Payment Required responses for agent services. When a client requests a service without payment, the agent returns a 402 response with payment requirements. The client makes an on-chain payment and retries with proof, which the agent verifies before executing the task.

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Middleware | `lib/x402/middleware.ts` | Core verification functions |
| Facilitator | `lib/x402/facilitator-service.ts` | Load-balanced payment verification |
| Types | `lib/x402/types.ts` | TypeScript interfaces |
| Callbacks | `lib/supermission/callbacks.ts` | Mission status reporting |

---

## Prerequisites

### Required Dependencies

```json
{
  "dependencies": {
    "viem": "^2.x",
    "axios": "^1.x",
    "facilitators": "latest"
  }
}
```

### Environment Variables

```env
# Required
OPENROUTER_API_KEY=your_openrouter_key
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Supabase (for anti-replay protection)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key

# Optional
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org
```

### Database Table (Supabase)

```sql
CREATE TABLE payment_proofs (
  id SERIAL PRIMARY KEY,
  tx_hash VARCHAR(66) UNIQUE NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  mission_id VARCHAR(255),
  amount VARCHAR(78) NOT NULL,
  token_address VARCHAR(42) NOT NULL,
  from_address VARCHAR(42) NOT NULL,
  to_address VARCHAR(42) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_proofs_tx_hash ON payment_proofs(tx_hash);
CREATE INDEX idx_payment_proofs_agent_id ON payment_proofs(agent_id);
```

---

## File Structure

```
lib/
├── x402/
│   ├── middleware.ts          # Core X402 functions
│   ├── facilitator-service.ts # Facilitator integration
│   ├── types.ts               # Type definitions
│   ├── agent-client.ts        # A2A payment client (optional)
│   ├── eip3009.ts             # EIP-3009 support (optional)
│   └── nonce-manager.ts       # Nonce management (optional)
├── supermission/
│   └── callbacks.ts           # Mission status helpers
└── supabase/
    └── client.ts              # Supabase admin client

app/api/agents/
└── [your-agent]/
    └── route.ts               # Agent endpoint
```

---

## Step-by-Step Implementation

### Step 1: Define Agent Constants

```typescript
// At the top of your route.ts file
const AGENT_ID = 'agent_your_agent_name';      // Unique identifier
const AGENT_NAME = 'Your Agent Name';           // Display name
const ERC8004_AGENT_ID = 'X';                   // ERC-8004 NFT Token ID (if registered)
const CDP_WALLET = '0xYourAgentWalletAddress';  // Wallet to receive payments
```

### Step 2: Import Required Modules

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { parseUnits } from 'viem';
import { verifyPaymentProof } from '@/lib/x402/middleware';
import {
  type ExecuteRequest,
  reportExecuting,
  reportCompleted,
  reportFailed,
  markAgentActive,
} from '@/lib/supermission/callbacks';
```

### Step 3: Implement POST Handler with X402 Flow

The POST handler follows this structure:

1. **Parse request** - Extract task details
2. **Check for payment proof** - Look for `x-payment-proof` header
3. **If no proof** - Return 402 with payment requirements
4. **If proof exists** - Verify on-chain and execute task

### Step 4: Implement GET Handler for Health Check

```typescript
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    agent: AGENT_NAME,
    agentId: AGENT_ID,
    erc8004AgentId: ERC8004_AGENT_ID,
    cdpWallet: CDP_WALLET,
    capabilities: ['your', 'capabilities', 'here'],
    timestamp: new Date().toISOString(),
  });
}
```

### Step 5: Implement Task Execution Function

```typescript
async function executeTask(task: ExecuteRequest) {
  try {
    // 1. Report execution started
    await reportExecuting(task);

    // 2. Perform your agent's work
    const result = await doYourAgentWork(task.description);

    // 3. Upload deliverable to IPFS
    const ipfsHash = await uploadJSON(result, `result-${task.missionId}.json`);
    const deliverableUri = getIPFSUrl(ipfsHash);

    // 4. Report completion
    await reportCompleted(task, deliverableUri, {
      content: result,
      ipfsHash,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    // 5. Report failure on error
    await reportFailed(
      task,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
```

---

## Code Templates

### Complete Agent Route Template

```typescript
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * [Agent Name] AI Agent Service (Serverless)
 * [Description of what the agent does]
 * Implements X402 Payment Required protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseUnits } from 'viem';
import { verifyPaymentProof } from '@/lib/x402/middleware';
import {
  type ExecuteRequest,
  reportExecuting,
  reportCompleted,
  reportFailed,
  markAgentActive,
} from '@/lib/supermission/callbacks';
import { uploadJSON, getIPFSUrl } from '@/lib/ipfs/pinata';

// ============================================
// AGENT CONFIGURATION - MODIFY THESE VALUES
// ============================================
const AGENT_ID = 'agent_your_agent_id';
const AGENT_NAME = 'Your Agent Name';
const ERC8004_AGENT_ID = 'X'; // Your ERC-8004 NFT Token ID
const CDP_WALLET = '0xYourWalletAddress'; // Your agent's wallet

// Token configuration (Base Sepolia USDC)
const PAYMENT_TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const CHAIN_ID = 84532; // Base Sepolia (use 8453 for mainnet)
const TOKEN_DECIMALS = 6; // USDC has 6 decimals

/**
 * Execute task endpoint with X402 Payment Required support
 */
export async function POST(request: NextRequest) {
  try {
    const task: ExecuteRequest = await request.json();
    const paymentProofHeader = request.headers.get('x-payment-proof');

    console.log(`[${AGENT_NAME}] Received task:`, task.missionId);
    console.log(`[${AGENT_NAME}] Description:`, task.description);
    console.log(`[${AGENT_NAME}] Payment: ${task.payment} USDC`);

    // ========================================
    // STEP 1: Check for payment proof header
    // ========================================
    if (!paymentProofHeader) {
      console.log(`[${AGENT_NAME}] No payment proof - returning 402 Payment Required`);

      // Convert payment from dollars to smallest unit
      const paymentInSmallestUnit = parseUnits(
        task.payment.toString(),
        TOKEN_DECIMALS
      ).toString();

      // Build X402 Payment Request
      const paymentRequest = {
        amount: paymentInSmallestUnit,
        token: PAYMENT_TOKEN,
        recipient: CDP_WALLET,
        chainId: CHAIN_ID,
        description: `Payment for ${AGENT_NAME} - Mission ${task.missionId}`,
      };

      // Return 402 Payment Required
      return NextResponse.json(
        {
          error: 'Payment required',
          message: 'Please provide payment to execute this task',
          agentId: AGENT_ID,
          agentName: AGENT_NAME,
        },
        {
          status: 402,
          headers: {
            'X-Payment-Required': JSON.stringify(paymentRequest),
          },
        }
      );
    }

    // ========================================
    // STEP 2: Verify payment proof
    // ========================================
    try {
      const paymentProof = JSON.parse(paymentProofHeader);

      console.log(`[${AGENT_NAME}] Verifying payment proof:`, {
        from: paymentProof.from,
        to: paymentProof.to,
        amount: paymentProof.amount,
        txHash: paymentProof.txHash,
      });

      // Validate proof format
      if (!paymentProof.txHash || !paymentProof.amount || !paymentProof.from) {
        throw new Error('Invalid payment proof format');
      }

      // Verify payment on-chain with replay protection
      const isValid = await verifyPaymentProof(paymentProof, {
        expectedRecipient: CDP_WALLET as `0x${string}`,
        expectedToken: PAYMENT_TOKEN as `0x${string}`,
        expectedAmount: parseUnits(task.payment.toString(), TOKEN_DECIMALS),
        chainId: CHAIN_ID,
        agentId: AGENT_ID,
        missionId: task.missionId,
      });

      if (!isValid) {
        throw new Error('Payment proof verification failed: on-chain verification failed');
      }

      console.log(`[${AGENT_NAME}] Payment verified on-chain! Executing task...`);

      // ========================================
      // STEP 3: Execute task asynchronously
      // ========================================

      // Mark agent as active
      markAgentActive(AGENT_ID).catch((error) => {
        console.error(`[${AGENT_NAME}] Failed to mark active:`, error);
      });

      // Execute task (don't await - respond immediately)
      executeTask(task).catch((error) => {
        console.error(`[${AGENT_NAME}] Task execution failed:`, error);
      });

      // ========================================
      // STEP 4: Return success with payment response
      // ========================================
      const paymentResponse = {
        txHash: paymentProof.txHash,
        from: paymentProof.from,
        to: paymentProof.to,
        amount: paymentProof.amount,
        token: paymentProof.token,
        status: 'accepted',
        agentId: AGENT_ID,
        missionId: task.missionId,
        timestamp: Date.now(),
      };

      return NextResponse.json(
        {
          success: true,
          message: 'Payment accepted, task execution started',
          agentId: AGENT_ID,
          agentName: AGENT_NAME,
          paymentReceived: paymentProof.amount,
        },
        {
          headers: {
            'X-PAYMENT-RESPONSE': JSON.stringify(paymentResponse),
          },
        }
      );
    } catch (error) {
      console.error(`[${AGENT_NAME}] Payment verification failed:`, error);
      return NextResponse.json(
        {
          error: 'Invalid payment proof',
          message: error instanceof Error ? error.message : 'Payment verification failed',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error(`[${AGENT_NAME}] Request error:`, error);
    return NextResponse.json(
      {
        error: 'Invalid request',
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
    capabilities: ['capability1', 'capability2'], // Update with your capabilities
    officialRegistry: '0x8004AA63c570c570eBF15376c0dB199918BFe9Fb',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Execute the agent's task
 * MODIFY THIS FUNCTION FOR YOUR AGENT'S SPECIFIC LOGIC
 */
async function executeTask(task: ExecuteRequest) {
  try {
    console.log(`[${AGENT_NAME}] Starting execution...`);

    // Report execution started
    await reportExecuting(task);

    // ========================================
    // YOUR AGENT LOGIC HERE
    // ========================================
    // Example: Call AI model, process data, generate content, etc.
    const result = {
      // Your result data
      generatedAt: new Date().toISOString(),
    };

    // Upload result to IPFS
    console.log(`[${AGENT_NAME}] Uploading to IPFS...`);
    const ipfsHash = await uploadJSON(result, `${AGENT_ID}-${task.missionId}.json`);
    const deliverableUri = getIPFSUrl(ipfsHash);

    console.log(`[${AGENT_NAME}] Deliverable uploaded:`, deliverableUri);

    // Report completion
    await reportCompleted(task, deliverableUri, {
      content: result,
      ipfsHash,
      prompt: task.description,
      generatedAt: new Date().toISOString(),
    });

    console.log(`[${AGENT_NAME}] Task completed successfully`);
  } catch (error) {
    console.error(`[${AGENT_NAME}] Task failed:`, error);
    await reportFailed(
      task,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
```

---

## Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        X402 PAYMENT FLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

   Client                          Agent                         Blockchain
     │                               │                               │
     │  1. POST /api/agents/xxx      │                               │
     │  (no payment proof)           │                               │
     │──────────────────────────────>│                               │
     │                               │                               │
     │  2. 402 Payment Required      │                               │
     │  + X-Payment-Required header  │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │  3. Parse payment requirements│                               │
     │  {amount, token, recipient,   │                               │
     │   chainId, description}       │                               │
     │                               │                               │
     │  4. Execute USDC transfer     │                               │
     │───────────────────────────────────────────────────────────────>│
     │                               │                               │
     │  5. Get tx receipt            │                               │
     │<───────────────────────────────────────────────────────────────│
     │                               │                               │
     │  6. POST /api/agents/xxx      │                               │
     │  + x-payment-proof header     │                               │
     │  {txHash, from, to, amount,   │                               │
     │   token, timestamp}           │                               │
     │──────────────────────────────>│                               │
     │                               │                               │
     │                               │  7. verifyPaymentProof()      │
     │                               │  - Check anti-replay (DB)     │
     │                               │  - Validate timestamp         │
     │                               │  - Verify on-chain            │
     │                               │─────────────────────────────>│
     │                               │<─────────────────────────────│
     │                               │  - Record proof to DB         │
     │                               │                               │
     │  8. 200 OK                    │                               │
     │  + X-PAYMENT-RESPONSE header  │                               │
     │<──────────────────────────────│                               │
     │                               │                               │
     │                               │  9. executeTask() async       │
     │                               │  - reportExecuting()          │
     │                               │  - Do agent work              │
     │                               │  - Upload to IPFS             │
     │                               │  - reportCompleted()          │
     │                               │                               │
```

---

## Configuration Reference

### Network Configuration

| Network | Chain ID | USDC Address | RPC URL |
|---------|----------|--------------|---------|
| Base Sepolia (testnet) | 84532 | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | `https://sepolia.base.org` |
| Base (mainnet) | 8453 | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | `https://mainnet.base.org` |

### Token Decimals

| Token | Decimals | Notes |
|-------|----------|-------|
| USDC | 6 | Use `parseUnits(amount, 6)` |
| ETH/WETH | 18 | Use `parseUnits(amount, 18)` |

### X402 Headers

| Header | Direction | Format | Purpose |
|--------|-----------|--------|---------|
| `X-Payment-Required` | Response (402) | JSON string | Payment requirements |
| `x-payment-proof` | Request | JSON string | Payment proof from client |
| `X-PAYMENT-RESPONSE` | Response (200) | JSON string | Payment acceptance confirmation |

### Payment Request Schema

```typescript
interface X402PaymentRequest {
  amount: string;       // Amount in smallest units (e.g., "1000000" for 1 USDC)
  token: Address;       // ERC20 token contract address
  recipient: Address;   // Agent wallet to receive payment
  chainId: number;      // Network chain ID
  description?: string; // Human-readable description
}
```

### Payment Proof Schema

```typescript
interface X402PaymentProof {
  txHash: string;       // On-chain transaction hash
  from: Address;        // Payer wallet address
  to: Address;          // Recipient wallet address
  amount: string;       // Amount transferred
  token: Address;       // Token contract address
  timestamp: number;    // Unix timestamp (ms)
  signature?: string;   // Optional signature
}
```

---

## Testing

### Manual Testing Flow

1. **Test 402 Response**
   ```bash
   curl -X POST http://localhost:3000/api/agents/your-agent \
     -H "Content-Type: application/json" \
     -d '{"missionId":"test-1","agentId":"agent_test","description":"Test task","capability":"test","payment":0.01,"requirements":{},"callbackUrl":"http://localhost:3000/api/missions/test-1/update"}'
   ```

   Expected: 402 status with `X-Payment-Required` header

2. **Test with Mock Payment Proof**
   ```bash
   curl -X POST http://localhost:3000/api/agents/your-agent \
     -H "Content-Type: application/json" \
     -H "x-payment-proof: {\"txHash\":\"0x...\",\"from\":\"0x...\",\"to\":\"0x...\",\"amount\":\"10000\",\"token\":\"0x036CbD53842c5426634e7929541eC2318f3dCF7e\",\"timestamp\":1234567890000}" \
     -d '{"missionId":"test-1","agentId":"agent_test","description":"Test task","capability":"test","payment":0.01,"requirements":{},"callbackUrl":"http://localhost:3000/api/missions/test-1/update"}'
   ```

3. **Test Health Check**
   ```bash
   curl http://localhost:3000/api/agents/your-agent
   ```

### Verification Checklist

- [ ] 402 returned when no payment proof provided
- [ ] `X-Payment-Required` header contains valid JSON
- [ ] Payment amount correctly converted (check decimals)
- [ ] Invalid proof format returns 400
- [ ] Expired proof (>5 min) rejected
- [ ] Replay attack (same txHash) rejected
- [ ] Valid proof triggers task execution
- [ ] `X-PAYMENT-RESPONSE` header returned on success
- [ ] Task status reported via callbacks
- [ ] Deliverable uploaded to IPFS
- [ ] Health check returns agent metadata

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Payment verification failed" | Invalid txHash or not confirmed | Wait for tx confirmation, verify txHash |
| "Replay attack detected" | Same txHash used twice | Each payment needs unique transaction |
| "Payment proof expired" | Timestamp >5 minutes old | Generate fresh proof with current timestamp |
| "Invalid payment proof format" | Missing required fields | Include txHash, from, to, amount, token, timestamp |
| "HTTP request failed / fetch failed" | RPC endpoint down or unreachable | Use public RPC as primary (see RPC Fallback section) |
| "On-chain verification failed" | RPC error or invalid hash | Check if using userOpHash instead of transactionHash |
| OPENROUTER_API_KEY error | Missing env variable | Set OPENROUTER_API_KEY in .env |

### RPC Fallback Configuration

**CRITICAL**: RPC connectivity is essential for payment verification. If your primary RPC (e.g., QuickNode) fails, verification fails entirely.

The verification code in `packages/agent-sdk/src/verify.ts` uses RPC fallback:

```typescript
// RPC URLs tried in order (public RPC first for reliability)
const rpcUrls = [
  'https://sepolia.base.org',  // Public RPC (most reliable)
  rpcUrl,                       // Passed RPC (may be QuickNode)
  'https://base-sepolia.g.alchemy.com/v2/demo',
].filter(Boolean) as string[];
```

**Key Points:**
- Public RPC (`https://sepolia.base.org`) is used FIRST for reliability
- QuickNode/custom RPCs are tried as fallback
- If the primary RPC works, verification succeeds even if other RPCs are down

**Debugging RPC Issues:**

```bash
# Test if transaction exists on public RPC
curl -s -X POST "https://sepolia.base.org" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getTransactionReceipt","params":["YOUR_TX_HASH"],"id":1}'
```

If this returns `"result": null`, either:
1. The transaction doesn't exist (wrong hash)
2. The transaction hasn't been mined yet
3. You're using a `userOperationHash` instead of `transactionHash`

### Debug Logging

All agents log with prefix `[AgentName]`. Check logs for:
- Payment proof parsing
- Verification steps
- Task execution progress
- IPFS upload status
- Callback results
- RPC connection errors (look for "fetch failed" or "HTTP request failed")

---

## Frontend Integration (Chat Flow)

This section covers implementing X402 in a chat-based UI with CDP embedded wallets.

### Frontend File Structure

```
components/chat/
├── x402-payment-panel.tsx    # Payment UI component
├── param-request-panel.tsx   # Parameter input form
├── input-bar.tsx             # Chat input handler
├── message-bubble.tsx        # Message renderer with action panels
└── token-dd-result-panel.tsx # Result display panel

lib/
├── ai/
│   ├── process-ai-request.ts # Routes messages, handles 402, formats responses
│   └── agent-info.ts         # Endpoint definitions
├── hooks/
│   └── use-cdp-wallet.ts     # CDP embedded wallet hook
├── config/
│   └── endpoints.ts          # API_BASE_URL configuration
└── onchainkit/
    └── config.ts             # Paymaster configuration
```

### Critical: API_BASE_URL for Development

**GOTCHA**: Server-to-server API calls must go to localhost in development, not production!

```typescript
// lib/config/endpoints.ts
const isDev = process.env.NODE_ENV === 'development';
const baseUrl = isDev
  ? 'http://localhost:3000'  // Always localhost in dev
  : (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000');

export const API_BASE_URL = baseUrl;
```

Without this fix, your local server will call the production API which may not have X402 enabled!

### Frontend X402 Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND X402 PAYMENT FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

1. User sends message
   └── input-bar.tsx / param-request-panel.tsx
       └── POST /api/agent/chat

2. Backend processes (process-ai-request.ts)
   ├── Routes to agent endpoint
   ├── callAgentEndpoint() → API returns 402
   ├── Detects res.status === 402
   ├── Extracts X-Payment-Required header
   └── Returns X402PaymentRequired object

3. formatAgentResponse() detects payment required
   └── Returns JSON: { message, action: { type: 'x402_payment_required', data } }

4. Frontend parses response
   ├── input-bar.tsx: JSON.parse(data.message)
   ├── Sets messageMetadata.action = parsed.action
   └── addMessage({ content, metadata: { action } })

5. message-bubble.tsx renders X402PaymentPanel
   └── Checks action.type === 'x402_payment_required'

6. User clicks "Pay" → CDP embedded wallet sends USDC (gasless)

7. After payment: handleRetryWithPayment()
   └── Sends [RUN_WITH_PAYMENT] message with payment proof

8. Backend verifies payment, executes task, returns result
   └── Returns: { action: { type: 'token_dd_result', data: result } }

9. Frontend displays result panel
   └── message-bubble.tsx renders TokenDDResultPanel
```

### Action Data Structure Consistency

**CRITICAL**: Keep action.data structure consistent across all handlers!

```typescript
// ✅ CORRECT - Direct data, no wrapper
const payload = {
  message: summaryMessage,
  action: {
    type: 'token_dd_result',
    data: resultData,  // TokenDueDiligenceResponse directly
  },
};

// ❌ WRONG - Wrapped data causes panel to fail
const payload = {
  message: summaryMessage,
  action: {
    type: 'token_dd_result',
    data: {
      analysisType: endpoint.id,
      result: resultData,  // Panel expects data.token, not data.result.token
    },
  },
};
```

All handlers must extract data the same way:

```typescript
// input-bar.tsx
if (parsed.action) {
  messageMetadata.action = parsed.action;  // Keep as-is
}

// param-request-panel.tsx
if (parsed.action?.type === 'token_dd_result') {
  messageMetadata.action = {
    type: 'token_dd_result',
    data: parsed.action.data,  // Direct, not .result
  };
}

// x402-payment-panel.tsx (after payment)
if (parsed.action?.type === 'token_dd_result') {
  messageMetadata.action = {
    type: 'token_dd_result',
    data: parsed.action.data,  // Direct, not .result
  };
}
```

### Handling Multiple Action Types

```typescript
// param-request-panel.tsx - Handle both X402 and result actions
try {
  const parsed = JSON.parse(result.message);

  if (parsed.message) {
    messageContent = parsed.message;
  }

  // Handle X402 payment required
  if (parsed.action?.type === 'x402_payment_required') {
    messageMetadata.action = {
      type: 'x402_payment_required',
      data: parsed.action.data
    };
  }
  // Handle successful result
  else if (parsed.action?.type === 'token_dd_result') {
    messageMetadata.action = {
      type: 'token_dd_result',
      data: parsed.action.data
    };
  }
} catch {
  // Not JSON, use as regular message
}
```

---

## CDP Embedded Wallet Integration

**CRITICAL**: Use `useSendUserOperation` for gasless transactions from CDP embedded wallets, NOT `useSendEvmTransaction` or wagmi hooks!

### Why NOT wagmi hooks?

| Approach | Problem |
|----------|---------|
| `useAccount()` from wagmi | Returns connected wallet (MetaMask), not CDP embedded wallet |
| `useApproveToken`, `useTransferToken` | Uses connected wallet, requires ETH for gas |
| `useSendEvmTransaction` | May fail with "EVM account not found" or require ETH for gas |

### Correct Approach: useSendUserOperation

```typescript
import { useSendUserOperation, useCurrentUser } from '@coinbase/cdp-hooks';
import { useCDPWallet } from '@/lib/hooks/use-cdp-wallet';

export function X402PaymentPanel({ data }) {
  // Get CDP wallet info
  const { cdpAddress, isReady: isCDPReady } = useCDPWallet();
  const { currentUser } = useCurrentUser();
  const { sendUserOperation } = useSendUserOperation();

  // CRITICAL: Get the full smart account OBJECT, not just the address
  const evmSmartAccount = currentUser?.evmSmartAccounts?.[0];

  const handlePay = async () => {
    if (!evmSmartAccount || !isCDPReady) {
      toast.error('Please sign in to your payment wallet first');
      return;
    }

    // Encode the ERC-20 transfer
    const transferData = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [recipientAddress, amount],
    });

    // Send with CDP paymaster for GASLESS transactions
    const result = await sendUserOperation({
      evmSmartAccount: evmSmartAccount,  // Full object, not just address!
      network: 'base-sepolia',
      calls: [{
        to: tokenAddress,
        value: 0n,
        data: transferData,
      }],
      useCdpPaymaster: true,  // Gasless via CDP paymaster
    });

    // Handle result...
  };
}
```

### Common CDP Wallet Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "EVM account not found" | Passing address string instead of account object | Use `currentUser?.evmSmartAccounts?.[0]` (full object) |
| "Cannot infer transaction type" | Missing `type` field in transaction | Add `type: 'eip1559'` to transaction object |
| "Insufficient balance to execute" | No ETH for gas | Use `useCdpPaymaster: true` for gasless transactions |
| "Sign in to Pay" button disabled | `evmSmartAccount` is undefined | User needs to sign in to CDP wallet first |
| "On-chain verification failed" | Using `userOperationHash` as transaction hash | Use `getUserOperation` from cdp-core to get real `transactionHash` |
| "Transaction receipt is null" | Hash is `userOperationHash`, not a blockchain tx | Wait for `getUserOperation` to return `transactionHash` after bundler confirms |

### CDP Wallet Hook

```typescript
// lib/hooks/use-cdp-wallet.ts
export function useCDPWallet() {
  const { isInitialized } = useIsInitialized();
  const { isSignedIn } = useIsSignedIn();
  const { currentUser } = useCurrentUser();

  // Handle both string and object formats
  const smartAccountRaw = currentUser?.evmSmartAccounts?.[0];
  const smartAccount = typeof smartAccountRaw === 'string'
    ? smartAccountRaw
    : smartAccountRaw?.address || smartAccountRaw;

  return {
    isInitialized,
    isSignedIn,
    cdpAddress: smartAccount as string | undefined,
    currentUser,
    isReady: isInitialized && isSignedIn && !!smartAccount,
  };
}
```

### Checking CDP Balance

Use wagmi's `useBalance` with the CDP address:

```typescript
const { data: balanceData, isLoading } = useBalance({
  address: cdpAddress as Address,
  token: tokenAddress,
  query: {
    enabled: isCDPReady && !!cdpAddress,
  },
});
```

### Waiting for Transaction Confirmation

**CRITICAL: userOperationHash vs transactionHash**

When using `useSendUserOperation`, the result contains `userOperationHash`, NOT `transactionHash`. These are DIFFERENT:

| Hash Type | Description | Verifiable On-Chain? |
|-----------|-------------|---------------------|
| `userOperationHash` | ERC-4337 identifier for the user operation | **NO** - Not a blockchain tx |
| `transactionHash` | Actual blockchain transaction hash from bundler | **YES** - Verifiable |

**For X402 payments, you MUST get the real `transactionHash`!** Using `userOperationHash` will fail on-chain verification.

```typescript
import { getUserOperation } from '@coinbase/cdp-core';

// After sendUserOperation
const userOpResult = result as any;
let transactionHash = userOpResult.transactionHash || userOpResult.hash;
const userOpHash = userOpResult.userOperationHash;

// If no direct hash, poll using getUserOperation from cdp-core
if (!transactionHash && userOpHash) {
  let attempts = 0;
  const maxAttempts = 45; // 90 seconds total

  while (!transactionHash && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;

    try {
      // getUserOperation returns the transactionHash once bundler includes the op
      const userOp = await getUserOperation({
        userOperationHash: userOpHash as `0x${string}`,
        evmSmartAccount: evmSmartAccount,
        network: 'base-sepolia',
      });

      // Check for transactionHash in response
      if (userOp && (userOp as any).transactionHash) {
        transactionHash = (userOp as any).transactionHash;
        break;
      }

      // Also check receipt
      if (userOp && (userOp as any).receipt?.transactionHash) {
        transactionHash = (userOp as any).receipt.transactionHash;
        break;
      }
    } catch {
      // Continue polling
    }
  }

  // For X402: DO NOT fall back to userOpHash - it will fail verification
  if (!transactionHash) {
    throw new Error('Could not get blockchain transaction hash');
  }
}
```

---

## Security Considerations

1. **Anti-Replay Protection**: Each txHash is recorded in Supabase and rejected if reused
2. **Timestamp Validation**: Proofs older than 5 minutes are rejected
3. **On-Chain Verification**: Actual transfer verified on blockchain
4. **Amount Verification**: Expected amount validated against proof
5. **Recipient Verification**: Payment must go to agent's wallet
6. **Token Verification**: Only accepted token (USDC) is valid

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12 | Initial implementation guide |
| 1.1.0 | 2024-12 | Added Frontend Integration section, CDP Embedded Wallet guide |
| 1.2.0 | 2024-12 | Fixed userOperationHash vs transactionHash issue, added RPC fallback |

---

## References

- [X402 Protocol Specification](https://x402.org)
- [ERC-8004 Agent Registry](https://eips.ethereum.org/EIPS/eip-8004)
- [Base Network Docs](https://docs.base.org)
- [Viem Documentation](https://viem.sh)
- [Coinbase CDP Hooks](https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2/frontend/@coinbase/cdp-hooks)
- [ERC-4337 Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)
