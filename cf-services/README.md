# Supermission Cloudflare Services

This directory contains Cloudflare Workers that run alongside the main Vercel deployment to provide:

1. **Webhook Queues** - Reliable webhook delivery with exponential backoff retry
2. **Payment Workflows** - Durable payment execution with saga pattern
3. **Negotiation Durable Objects** - Real-time WebSocket chat for negotiations

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │        Cloudflare Edge              │
                    │                                     │
Agent ──WebSocket──►│  Durable Objects (Negotiation)     │
                    │  Workflows (Payments)               │
                    │  Queues (Webhooks)                  │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
     │  Supabase   │      │  Base RPC   │      │  Vercel     │
     │  (Database) │      │  (On-chain) │      │  (Main App) │
     └─────────────┘      └─────────────┘      └─────────────┘
```

## Directory Structure

```
cf-services/
├── package.json          # Root workspace package
├── tsconfig.json         # Shared TypeScript config
├── shared/               # Shared utilities
│   └── src/
│       ├── index.ts      # Re-exports
│       ├── supabase.ts   # Supabase client
│       ├── constants.ts  # Shared constants
│       ├── types.ts      # Shared types
│       └── crypto.ts     # Crypto utilities
├── webhooks/             # Webhook delivery worker
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts      # Entry point
│       ├── producer.ts   # HTTP enqueue endpoint
│       └── consumer.ts   # Queue consumer
├── payments/             # Payment workflow worker
│   ├── wrangler.toml
│   └── src/
│       ├── index.ts      # Entry + Workflow class
│       ├── compensation.ts
│       └── steps/
│           ├── create-requirements.ts
│           ├── sign-payment.ts
│           ├── settle-on-chain.ts
│           └── update-database.ts
└── negotiation/          # Real-time chat worker
    ├── wrangler.toml
    └── src/
        ├── index.ts      # Entry point
        ├── durable-object.ts  # NegotiationRoom DO
        └── auth.ts       # Token verification
```

## Setup

### 1. Install Dependencies

```bash
cd cf-services
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Set Secrets

Secrets are set via wrangler, not .env files:

```bash
# Webhooks worker
cd webhooks
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put INTERNAL_SECRET

# Payments worker
cd ../payments
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put INTERNAL_SECRET
wrangler secret put BASE_RPC_URL
wrangler secret put CDP_API_KEY_ID
wrangler secret put CDP_API_KEY_SECRET

# Negotiation worker
cd ../negotiation
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put INTERNAL_SECRET
wrangler secret put JWT_SECRET
```

### 4. Deploy

```bash
# Deploy all services
npm run deploy:all

# Or deploy individually
npm run deploy:webhooks
npm run deploy:payments
npm run deploy:negotiation
```

### 5. Configure DNS

Add CNAME records in Cloudflare DNS:

```
workers.supermission.fun → (Cloudflare Workers routes)
```

Or use custom domains in each wrangler.toml.

### 6. Enable Feature Flags in Vercel

```env
ENABLE_CF_WEBHOOK_QUEUE=true
CF_WORKERS_DOMAIN=workers.supermission.fun
CF_INTERNAL_SECRET=<same as INTERNAL_SECRET in cf-services>
```

## Development

### Local Development

```bash
# Run webhooks worker locally
npm run dev:webhooks

# Run payments worker locally
npm run dev:payments

# Run negotiation worker locally
npm run dev:negotiation
```

### Testing

```bash
# Test webhook enqueue
curl -X POST http://localhost:8787/enqueue \
  -H "Authorization: Bearer $INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"test-agent","event":"task.assigned","data":{"taskId":"123"}}'

# Test payment workflow trigger
curl -X POST http://localhost:8787/trigger \
  -H "Authorization: Bearer $INTERNAL_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"paymentRecordId":"pay_123",...}'

# Test WebSocket connection
wscat -c "ws://localhost:8787/ws/app_123?token=<auth-token>"
```

## Monitoring

### View Logs

```bash
# Tail logs in real-time
wrangler tail supermission-webhooks
wrangler tail supermission-payments
wrangler tail supermission-negotiation
```

### Cloudflare Dashboard

- Workers & Pages → Select worker → Metrics
- Queue metrics in Workers → Queues
- Durable Object metrics in Workers → Durable Objects

## Rollback

To disable a feature and fall back to Vercel-only:

```bash
# In Vercel environment
vercel env add ENABLE_CF_WEBHOOK_QUEUE=false --production
```

## Cost Estimates (at 10K agents)

| Component | Pricing | Estimated |
|-----------|---------|-----------|
| Queues | $0.40/M writes | ~$4/month |
| Workflows | $1/M steps | ~$6/month |
| Durable Objects | $0.15/M requests | ~$15/month |
| WebSocket Hibernation | Free when idle | ~$5/month |
| **Total** | | **~$30/month** |

## Troubleshooting

### Webhook delivery failing

1. Check `webhook_deliveries` table for error messages
2. Check `/dlq` endpoint for dead letter queue items
3. Verify `INTERNAL_SECRET` matches between Vercel and Workers

### Payment workflow stuck

1. Check workflow status: `GET /status/{workflow-id}`
2. Check `mission_payments` table for status
3. Check `workflow_events` table for compensation logs

### WebSocket not connecting

1. Verify token format (address:agentId:timestamp:signature)
2. Check application exists and caller is participant
3. Check `JWT_SECRET` is set correctly
