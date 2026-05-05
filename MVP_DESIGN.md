# Gasless POT MVP Design

## Project Scope: What We Build vs What We Skip

### Core Components (MVP Only)

#### 1. Relay Proxy Smart Contract (ink!)
**What it does:** Acts as a trusted relayer execution layer on-chain.

**Minimal Functions:**
- `relay_action(user: AccountId, action: Action, nonce: u64)` → executes action, increments nonce
  - ⚠️ Uses structured `Action` enum (not Vec<u8>) to avoid SCALE encoding issues
  - Cross-contract call to RentLock via ink! `call::build_call()` builder
- `get_nonce(user: AccountId)` → returns current nonce
- `fund(amount: Balance)` → escrow for RentLock demo (receives POT)
- Admin functions: `set_relayer()`, `add_whitelist()`

**Note on Signatures:**
- Signatures are collected from frontend for forward compatibility
- NOT verified on-chain in MVP (trusted relayer model)
- Relayer validates payload authenticity off-chain before submission

**What we SKIP:**
- On-chain signature verification (sr25519_verify) — signatures collected but not verified (relayer trusted)
- Complex permission systems
- Fee collection mechanisms

---

#### 2. Relayer Service (Node.js/Express)
**What it does:** Holds the funded wallet, validates requests, submits transactions.

**Minimal API Endpoints:**
- `POST /relay` → body: { user, action_bytes, nonce, signature, app_id }
  - Validate nonce matches
  - Check whitelist (hardcoded)
  - Enforce gas budget
  - Submit tx using relayer wallet
  - Return { status: 'pending', tx_hash }

- `GET /status/:tx_hash` → returns { status: 'pending'|'success'|'failed', ... }

- `GET /nonce/:account_id` → returns current nonce

**What we SKIP:**
- Multi-relayer coordination
- Advanced rate limiting
- Developer dashboard / dApp registration UI
- Fee collection

**Hardcoded for MVP:**
```
APP_REGISTRY = {
  "RentLock": {
    contract: "0x...",
    gas_budget: 1_000_000,  // Adjust as needed
    api_key: "test_key_1"
  }
}

RELAYER_WHITELIST = [
  "0x..." // RentLock contract address
]
```

---

#### 3. Demo dApp (React)
**What it does:** Demonstrates RentLock without requiring user POT balance.

**Minimal Scenario:**
1. Tenant (0 POT) connects wallet
2. Tenant signs intent to "lock funds for rental" 
3. Frontend sends to `/relay` endpoint
4. Relayer pays gas, executes on-chain
5. Show success UI

**What we SKIP:**
- Multi-step UI wizards
- Advanced portfolio management
- Production-grade error handling
- Landlord flow (can be simplified or mocked)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│  Browser (Polkadot.js Extension)                    │
│  ┌──────────────────────────────────────────────┐   │
│  │ React Demo dApp (RentLock)                    │   │
│  │ 1. User connects wallet (0 POT balance)       │   │
│  │ 2. Signs intent: {user, action, nonce}        │   │
│  │ 3. POST /relay with signature                 │   │
│  └──────────┬───────────────────────────────────┘   │
└─────────────┼────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  Relayer Service (Node.js/Express)                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ Validate Request:                             │   │
│  │ - Check nonce matches user's current nonce    │   │
│  │ - Check target contract in whitelist          │   │
│  │ - Check gas budget not exceeded               │   │
│  └──────────┬───────────────────────────────────┘   │
│  ┌──────────▼───────────────────────────────────┐   │
│  │ Submit TX:                                    │   │
│  │ - Relayer wallet signs & submits to chain    │   │
│  │ - Uses @polkadot/api (SCALE encoding)        │   │
│  └──────────┬───────────────────────────────────┘   │
└─────────────┼────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  Local Portaldot Node (Development)                 │
│  ┌──────────────────────────────────────────────┐   │
│  │ Relay Proxy Contract (ink!)                  │   │
│  │ - Trusted relayer model (no sig verification)│   │
│  │ - Executes: relay_action(user, contract,     │   │
│  │             action_data, nonce)              │   │
│  │ - Increments nonce after success             │   │
│  │ - Prevents replay via nonce                  │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ RentLock Demo Contract (ink!)                │   │
│  │ - Simple escrow: fund(), confirm(), release()│   │
│  │ - Called only via relay_proxy                │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## Data Flow: One Transaction

### Step 1: Intent Signing (Off-Chain, No Gas)
```
User in browser:
1. Polkadot.js extension has zero POT balance ✓
2. User clicks "Lock Funds for Rental"
3. Frontend constructs intent payload:
   {
     user: "5DHqWUBZt4E4f7k...",          // User's account
     contract: "5G1...",                   // RentLock contract
     action: "lock_funds",                 // Function name
     args: { amount: 1000 },               // Arguments
     nonce: 42                             // Current nonce from relay_proxy
   }
4. Polkadot.js signs this payload
5. Signature returned to frontend (no transaction cost)
```

### Step 2: Relay Submission
```
Frontend → Relayer Service (HTTP):
POST /relay
{
  user: "5DHqWUBZt4E4f7k...",
  action: { type: "LockFunds", amount: 1000 },  // Structured enum
  nonce: 42,
  signature: "0x...",          // From Polkadot.js (collected, not verified on-chain)
  app_id: "RentLock"           // For budget tracking
}                             // NOTE: Relayer trusts source, verifies payload off-chain

Relayer validates:
- get_nonce(user) === 42 ✓
- RentLock contract in whitelist ✓
- gas_budget not exceeded ✓

Relayer submits TX:
- Relayer's wallet (funded with test POT) signs:
  relay_proxy.relay_action(user, contract, action_data, nonce)
- Relayer pays POT as gas ✓
- Returns: { status: "pending", tx_hash: "0x..." }
```

### Step 3: Execution (On-Chain)
```
Portaldot Node executes:
1. Call relay_proxy.relay_action(user, Action::LockFunds { amount: 1000 }, nonce: 42)
2. relay_proxy checks: caller == relayer_account ✓
3. relay_proxy checks: nonce == stored_nonce[user] ✓
4. relay_proxy increments nonce: nonce[user] = 43
5. relay_proxy makes cross-contract call → RentLock.lock_funds(user, 1000)
   (using ink! call::build_call() builder)
6. RentLock escrow locked ✓
7. Block finalized ✓

Frontend polls GET /status/:tx_hash
Response: { status: "success", block: 42 }
UI shows: "Funds locked! Waiting for landlord confirmation..."
```

---

## Key Simplifications for MVP

| Feature | Full Version | MVP | Why |
|---------|-------------|-----|-----|
| Signature Verification | sr25519_verify on-chain | Trusted relayer (no on-chain sig check) | Reduces contract complexity, we control relayer |
| dApp Registration | Self-serve dashboard | Hardcoded whitelist | Manual for now, fast to iterate |
| Gas Budgets | Per-user tracking | Per-dApp budget | Simpler, good enough for MVP |
| Replay Protection | Merkle tree + nonce | Simple nonce per user | Effective, easy to implement |
| Relayer Network | Multiple relayers | Single relayer | No consensus needed |
| Fee Model | Dynamic fees | Fixed (for demo) | No tokenomics in MVP |
| Monitoring | Analytics dashboard | Logs to console | Good enough for demo |

---

## MVP Checklist

### Phase 1: Setup (Day 1-2)
- [ ] Local Portaldot node running (`docker run` or substrate-contracts-node)
- [ ] ink! project scaffolding
- [ ] Node.js + Express server scaffolded
- [ ] React app created

### Phase 2: Smart Contracts (Day 3-5)
- [ ] relay_proxy contract compiles
- [ ] relay_proxy test: nonce increment works
- [ ] relay_proxy test: unauthorized caller rejected
- [ ] RentLock demo contract compiles
- [ ] Both contracts deploy to local node

### Phase 3: Relayer Service (Day 6-8)
- [ ] POST /relay endpoint works
- [ ] Nonce validation works
- [ ] Gas budget enforcement works
- [ ] Transaction submission works
- [ ] GET /status endpoint works
- [ ] End-to-end test: 0-POT wallet → on-chain success

### Phase 4: Demo dApp (Day 9-11)
- [ ] React app connects to Polkadot.js
- [ ] Intent signing works
- [ ] Calls POST /relay successfully
- [ ] Shows transaction status
- [ ] RentLock scenario end-to-end works

### Phase 5: Polish & Demo (Day 12-14)
- [ ] README written (contracts, relayer, dApp setup)
- [ ] Full flow tested 5+ times
- [ ] Demo video recorded
- [ ] GitHub repo ready

---

## Success Criteria (MVP)
1. ✓ Wallet with 0 POT executes on-chain transaction
2. ✓ relay_proxy deployed on local node
3. ✓ Relayer confirms tx within block time
4. ✓ Demo video shows full flow
5. ✓ Code is clean, explainable, documented

---

## File Structure (Minimal)

```
relayer/
├── contract/
│   ├── relay_proxy/           # ink! smart contract
│   │   ├── lib.rs
│   │   ├── Cargo.toml
│   │   └── tests/
│   └── rent_lock/             # Demo escrow contract
│       ├── lib.rs
│       ├── Cargo.toml
│       └── tests/
├── relayer/                   # Node.js backend
│   ├── src/
│   │   ├── index.js          # Express server
│   │   ├── relay.js          # /relay endpoint logic
│   │   └── chain.js          # Portaldot chain interaction
│   ├── package.json
│   └── .env.example
├── demo/                      # React frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── WalletConnect.tsx
│   │   │   ├── LockFunds.tsx
│   │   │   └── StatusDisplay.tsx
│   │   └── services/
│   │       └── relayerApi.ts
│   ├── package.json
│   └── .env.example
├── MVP_DESIGN.md              # This file
└── README.md
```

---

## Next Steps

1. **Confirm this scope** — Does this cover the hackathon requirements?
2. **Pick a stack** — ink! version, Portaldot setup method (docker vs local build)?
3. **Start Phase 1** — Get local node + tooling running

Ready to build?
