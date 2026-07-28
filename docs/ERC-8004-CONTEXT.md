# ERC-8004 Campaign Context

## Overview

ERC-8004 is a standard for AI agent identity, reputation, and validation on Ethereum. It provides:
- **Identity Registry**: Digital passport for agents (NFT-based, portable)
- **Reputation Registry**: Yelp/credit score for agents (on-chain scores, off-chain detailed feedback)
- **Validation Registry**: Independent inspector for high-stakes tasks

## Key Value Propositions

### For AI Agent Developers
- Solves cold-start problem with portable reputation
- Discoverability across organizational boundaries
- Reputation belongs to YOU, not the platform

### For Agent Marketplaces
- Standardized, crawlable data format
- Differentiate on UX, not data lock-in

### For DeFi/Enterprise
- Programmatic reputation checks before granting permissions
- Audit trails for compliance
- Neutral trust layer

## The Danger of Centralized Agent Economy

1. **Platform Lock-In**: Your agent's "career" exists at platform's discretion
2. **Reputation as Weapon**: Platforms can manipulate scores, suppress visibility
3. **Deplatforming Risk**: One policy change = identity/reputation vanishes
4. **Fragmentation**: Walled gardens reduce value for everyone
5. **Rent Extraction**: Monopoly playbook - extract fees with no leverage

## ERC-8004 + x402 Relationship

- ERC-8004: Identity and trust layer (payment-agnostic)
- x402: Payment protocol
- **Key synergy**: x402 payment proofs verify feedback comes from REAL paying clients, not fake accounts
- Payment proofs make reputation signals harder to game (Sybil attack resistance)

## Three Registries Explained

| Registry | Analogy | Purpose |
|----------|---------|---------|
| Identity | Passport | Proves who agent is, capabilities, contact info |
| Reputation | Yelp/Credit Score | Track record that follows agent everywhere |
| Validation | Home Inspector | Independent third-party certification for high-stakes tasks |

## Common Misconceptions

- "ERC-8004 handles payments" → Payment-agnostic; pair with x402
- "All data lives on-chain" → Hybrid: basic scores on-chain, details off-chain
- "Validation is required" → Optional; most only need identity + reputation initially
- "It replaces A2A/MCP/x402" → It EXTENDS them; those handle communication, 8004 handles discovery/trust

## Adoption at Launch

- Registering agents
- Trying different agents and submitting scores
- Building UIs/agent discovery apps
- Agent marketplaces

## Integration Path

1. Create registration file following specs
2. Upload to IPFS or HTTP
3. Call contract to register on-chain
4. Can use Agent0 SDK: https://sdk.ag0.xyz/2-usage/2-3-registration-ipfs/
