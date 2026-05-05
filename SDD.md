# GASLESS POT
Zero-Balance Transaction Layer for Portaldot

**Product Design Document  (DESIGN.md)**

Version	1.0 — Hackathon MVP
Status	Engineering Reference
Date	May 2026
Author	Backend Engineer
 
## 1. System Architecture

### 1.1 High-Level Overview
The system has three layers: the client (React), the relayer service (Node.js), and the chain (local Portaldot node with ink! contracts).

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│   React dApp  →  Polkadot.js Extension  →  Sign intent      │
└─────────────────────────┬───────────────────────────────────┘
                          │  POST /relay  (signed payload)     
┌─────────────────────────▼───────────────────────────────────┐
│                   RELAYER SERVICE                           │
│   Validate  →  Check whitelist  →  Check budget             │
│   Submit tx  →  Pay POT as gas  →  Return tx hash           │
└─────────────────────────┬───────────────────────────────────┘
                          │  extrinsic                        
┌─────────────────────────▼───────────────────────────────────┐
│                   PORTALDOT LOCAL NODE                      │
│   relay_proxy (ink!)  →  RentLock escrow (ink!)             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Component Responsibilities
| Component | Responsibility |
|-----------|----------------|
| React Frontend | User interaction. Polkadot.js signing. POST to relayer. Poll tx status. |
| Relayer Service | Holds funded wallet. Validates requests. Submits tx. Pays POT gas. |
| relay_proxy contract | Trusts relayer caller. Tracks nonces. Executes actions on-chain. |
| RentLock contract | Escrow business logic. Funding, check-in, release, dispute, resolve. |

### 1.3 Meta-Transaction Flow (Step by Step)
| Step | Detail |
|------|--------|
| 1. User opens dApp | React app loads. Polkadot.js extension prompts for account connection. |
| 2. User selects action | e.g. Fund rental listing. dApp fetches current nonce from GET /nonce/:addr. |
| 3. Build payload | Frontend constructs: { user, action_type, args, nonce } |
| 4. Sign off-chain | User signs payload with Polkadot.js extension. No tx submitted yet. No gas. |
| 5. POST /relay | Frontend sends { payload, signature, pubkey } to relayer endpoint. |
| 6. Relayer validates | Checks contract whitelist, gas budget, payload integrity. |
| 7. Relayer submits | Relayer calls relay_proxy.relay_action() with its own funded wallet. |
| 8. Contract executes | relay_proxy verifies caller is trusted relayer. Checks nonce. Runs action. |
| 9. RentLock updates | Target contract (RentLock) state changes. Event emitted. |
| 10. Response | Relayer returns tx_hash. Frontend polls GET /status/:tx. UI updates. |

## 2. Smart Contracts

### 2.1 relay_proxy — Architecture
The relay_proxy is the core on-chain component. It is the only contract the relayer interacts with directly. Other contracts (like RentLock) are called by relay_proxy.

### 2.2 relay_proxy — Storage
```rust
#[ink(storage)]
pub struct RelayProxy {
    owner: AccountId,           // deployer, can update config
    relayer: AccountId,         // only address allowed to call relay_action
    nonces: Mapping<AccountId, u64>,  // replay protection per user
}
```

### 2.3 relay_proxy — Messages
| Message | Description |
|---------|-------------|
| new(relayer: AccountId) | Constructor. Sets owner and trusted relayer address. |
| relay_action(user, nonce, action) | Core relay function. Caller must be relayer. Validates nonce. Executes action. |
| update_relayer(new_relayer) | Owner only. Updates trusted relayer address (e.g. key rotation). |
| get_nonce(user) -> u64 | View. Returns current nonce for a user. Called by frontend before signing. |

### 2.4 relay_proxy — Full Contract
```rust
#![cfg_attr(not(feature = "std"), no_std, no_main)]

#[ink::contract]
mod relay_proxy {
    use ink::storage::Mapping;

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Action {
        FundListing { listing_id: u32 },
        ConfirmCheckin { listing_id: u32 },
        ReleaseFunds { listing_id: u32 },
        Dispute { listing_id: u32 },
    }

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        Unauthorized,
        InvalidNonce,
        ActionFailed,
    }

    #[ink(storage)]
    pub struct RelayProxy {
        owner: AccountId,
        relayer: AccountId,
        nonces: Mapping<AccountId, u64>,
    }

    #[ink(event)]
    pub struct ActionRelayed {
        #[ink(topic)] user: AccountId,
        nonce: u64,
    }

    impl RelayProxy {
        #[ink(constructor)]
        pub fn new(relayer: AccountId) -> Self {
            Self {
                owner: Self::env().caller(),
                relayer,
                nonces: Mapping::default(),
            }
        }

        #[ink(message)]
        pub fn relay_action(
            &mut self,
            user: AccountId,
            nonce: u64,
            action: Action,
        ) -> Result<(), Error> {
            // Only trusted relayer may call
            if self.env().caller() != self.relayer {
                return Err(Error::Unauthorized);
            }
            // Validate nonce
            let current = self.nonces.get(user).unwrap_or(0);
            if nonce != current {
                return Err(Error::InvalidNonce);
            }
            // Increment nonce
            self.nonces.insert(user, &(current + 1));
            // Execute action
            self.execute(user, action)?;
            self.env().emit_event(ActionRelayed { user, nonce });
            Ok(())
        }

        fn execute(&self, user: AccountId, action: Action) -> Result<(), Error> {
            // In MVP: inline logic or cross-contract call to RentLock
            match action {
                Action::FundListing { listing_id } => { /* call rentlock */ Ok(()) }
                Action::ConfirmCheckin { listing_id } => { Ok(()) }
                Action::ReleaseFunds { listing_id } => { Ok(()) }
                Action::Dispute { listing_id } => { Ok(()) }
            }
        }

        #[ink(message)]
        pub fn get_nonce(&self, user: AccountId) -> u64 {
            self.nonces.get(user).unwrap_or(0)
        }

        #[ink(message)]
        pub fn update_relayer(&mut self, new_relayer: AccountId) -> Result<(), Error> {
            if self.env().caller() != self.owner { return Err(Error::Unauthorized); }
            self.relayer = new_relayer;
            Ok(())
        }
    }
}
```

### 2.5 RentLock Contract — State Machine
States:  Created → Funded → CheckedIn → Completed
                  ↘                   ↘
                Refunded            Disputed → Resolved

| Message | Caller → Effect |
|---------|-----------------|
| new(landlord, price, arbiter) | Constructor. Creates listing in Created state. |
| fund() | Tenant (via relay). Sends POT. Created → Funded. |
| confirm_checkin() | Landlord. Funded → CheckedIn. |
| release() | Tenant (via relay). Pays landlord. CheckedIn → Completed. |
| dispute() | Tenant or landlord. Funded/CheckedIn → Disputed. |
| resolve(to_landlord) | Arbiter. Pays winner. Disputed → Resolved. |

## 3. Relayer Service

### 3.1 Overview
A Node.js Express service. Holds a funded Portaldot wallet. Exposes a REST API that any registered dApp can call to relay transactions on behalf of users.

### 3.2 API Endpoints
| Method + Path | Auth | Description |
|---------------|------|-------------|
| POST /relay | API key header | Submit signed payload. Returns tx_hash. |
| GET  /nonce/:addr | None | Get current nonce for an AccountId. |
| GET  /status/:tx | None | Poll transaction status: pending / success / fail. |
| GET  /health | None | Service health check. |

### 3.3 POST /relay — Request Schema
```json
{
  "user":       "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
  "action_type": "FundListing",
  "args":       { "listing_id": 1 },
  "nonce":      0,
  "signature":  "0x...",
  "pubkey":     "0x...",
  "contract":   "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty"
}
```

### 3.4 POST /relay — Response Schema
```json
// Success
{ "status": "pending", "tx_hash": "0x..." }

// Error
{ "status": "error", "message": "Contract not whitelisted" }
```

### 3.5 Relayer Config (MVP — hardcoded)
```javascript
// config.ts
export const CONFIG = {
  RELAYER_MNEMONIC: process.env.RELAYER_MNEMONIC,
  NODE_URL: 'ws://127.0.0.1:9944',
  WHITELISTED_CONTRACTS: [
    '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',  // relay_proxy
  ],
  GAS_BUDGETS: {
    'demo-dapp': 10_000_000_000n,   // max POT units to spend
  },
  API_KEYS: {
    'demo-dapp': process.env.DEMO_API_KEY,
  }
};
```

### 3.6 Relayer Internal Flow
| Step | Code action |
|------|-------------|
| 1. Receive POST /relay | Parse and validate request body schema |
| 2. Check API key | Match X-API-Key header against CONFIG.API_KEYS |
| 3. Check whitelist | Verify contract address in CONFIG.WHITELISTED_CONTRACTS |
| 4. Check gas budget | Query current spend for dApp, compare to CONFIG.GAS_BUDGETS |
| 5. Build extrinsic | Use @polkadot/api to call relay_proxy.relay_action() |
| 6. Sign and submit | Sign with relayer keypair (KeyringPair), submit to local node |
| 7. Return tx_hash | Respond immediately with pending status + hash |
| 8. GET /status/:tx | Frontend polls — return success/fail from chain events |

## 4. Frontend (React Demo dApp)

### 4.1 Tech Stack
| Library | Purpose |
|---------|---------|
| React + TypeScript + Vite | Component framework |
| @polkadot/extension-dapp | Browser wallet connection and signing |
| @polkadot/api | Type encoding utilities |
| axios | HTTP calls to relayer service |
| Tailwind CSS | Styling |

### 4.2 Screens
| Screen | Purpose |
|--------|---------|
| Connect Wallet | Detect Polkadot.js extension. Show accounts. Display POT balance (will show 0). |
| Tenant View | Select listing. Click 'Book Now'. Sign intent. Submit to relayer. Show pending → confirmed. |
| Landlord View | See funded listing. Confirm check-in. (Uses own wallet with POT for this action) |
| Tx Status | Real-time status: Signing → Relaying → Confirmed. Show block number. |

### 4.3 GaslessClient — SDK Interface
The frontend uses a GaslessClient class that abstracts the relayer integration. This is the seed of the eventual SDK.
```typescript
// src/lib/GaslessClient.ts
export class GaslessClient {
  constructor(private relayerUrl: string, private apiKey: string) {}

  async execute({
    contract,
    actionType,
    args,
    signer,          // InjectedAccountWithMeta from polkadot extension
  }: ExecuteParams): Promise<{ txHash: string }> {

    // 1. Get current nonce
    const { data: { nonce } } = await axios.get(
      `${this.relayerUrl}/nonce/${signer.address}`
    );

    // 2. Build payload
    const payload = { user: signer.address, contract, actionType, args, nonce };

    // 3. Sign off-chain
    const { signature } = await web3FromAddress(signer.address);
    const sig = await signature.signRaw({
      address: signer.address,
      data: JSON.stringify(payload),
      type: 'payload'
    });

    // 4. Submit to relayer
    const { data } = await axios.post(`${this.relayerUrl}/relay`, {
      ...payload,
      signature: sig.signature,
    }, { headers: { 'X-API-Key': this.apiKey } });

    return { txHash: data.tx_hash };
  }
}
```

## 5. Repository Structure
```
gasless-pot/
├── contracts/
│   ├── relay_proxy/
│   │   ├── Cargo.toml
│   │   └── lib.rs                 ← relay_proxy ink! contract
│   └── rentlock/
│       ├── Cargo.toml
│       └── lib.rs                 ← RentLock escrow contract
├── relayer/
│   ├── src/
│   │   ├── index.ts               ← Express app entry point
│   │   ├── routes/relay.ts        ← POST /relay handler
│   │   ├── routes/nonce.ts        ← GET /nonce/:addr handler
│   │   ├── routes/status.ts       ← GET /status/:tx handler
│   │   ├── services/chain.ts      ← @polkadot/api wrapper
│   │   └── config.ts              ← whitelist, budgets, keys
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── ConnectWallet.tsx
│   │   │   ├── TenantView.tsx
│   │   │   └── LandlordView.tsx
│   │   └── lib/
│   │       └── GaslessClient.ts   ← SDK seed
│   ├── package.json
│   └── vite.config.ts
├── README.md
├── DESIGN.md
└── .env.example
```

## 6. Local Development Setup

### 6.1 Prerequisites
- Rust + cargo (rustup)
- cargo-contract v4.x
- Node.js v20+
- Portaldot local node binary (from docs)
- Polkadot.js browser extension

### 6.2 Start Local Node
```bash
# Start local Portaldot development node
./portaldot --dev --tmp

# Node runs at:
#   RPC:       http://127.0.0.1:9933
#   WebSocket: ws://127.0.0.1:9944
```

### 6.3 Build and Deploy Contracts
```bash
# Build relay_proxy
cd contracts/relay_proxy
cargo contract build

# Deploy (replace RELAYER_ADDR with relayer wallet address)
cargo contract instantiate \
  --constructor new \
  --args RELAYER_ADDR \
  --suri //Alice \
  --url ws://127.0.0.1:9944

# Repeat for rentlock contract
cd ../rentlock && cargo contract build
cargo contract instantiate --constructor new \
  --args LANDLORD PRICE ARBITER \
  --suri //Bob --url ws://127.0.0.1:9944
```

### 6.4 Start Relayer Service
```bash
cd relayer
cp ../.env.example .env
# Edit .env: add RELAYER_MNEMONIC (//Charlie dev account), DEMO_API_KEY

npm install
npm run dev
# Relayer runs at http://localhost:3000
```

### 6.5 Start Frontend
```bash
cd frontend
npm install
npm run dev
# App runs at http://localhost:5173
```

## 7. Demo Flow (For Video Recording)
This is the exact sequence to record for the demo video. Practice this 10 times before recording.

| Step | What judge sees |
|------|-----------------|
| Open app. Show tenant wallet. | Polkadot.js extension shows 0 POT balance. No funds at all. |
| Select listing 'Lagos Apartment #1' | Listing shows price: 10 POT. Landlord: Alice. Arbiter: Charlie. |
| Click 'Book Now' | Extension popup: 'Sign this message'. NOT a transaction. No gas shown. |
| Approve signature | App shows: Relaying transaction... |
| Wait ~6 seconds | App shows: Confirmed! Block #1234. Tx hash: 0x... |
| Switch to landlord view (Alice) | Listing now shows status: Funded. Tenant: Bob (0 POT wallet). |
| Alice clicks 'Confirm Check-in' | State moves to CheckedIn. Alice pays gas from her wallet. |
| Switch back to tenant (0 POT) | Click 'Release Funds'. Sign again. No gas. Confirmed. |
| Show Alice's wallet | POT balance increased by 10 POT. Funds transferred. |
| Summarise | Entire tenant journey: zero POT. One signature per action. |

**Key talking point:** The relayer paid POT as gas on every tenant transaction. Tenant signed, relayer submitted. This is what Gasless POT enables for every dApp on Portaldot.

---

# ⚙️ 2. System Architecture

## 2.1 High-Level Architecture

```text
Any dApp (Client)
        ↓
Relayer Service (Node.js)
        ↓
Relay Proxy Contract (ink!)
        ↓
Target Contract (e.g. RentLock)
        ↓
Blockchain State
```

---

## 2.2 Component Breakdown

### 2.2.1 Relayer Service (MAIN PRODUCT)

* Stateless API server
* Holds funded wallet (POT)
* Validates requests
* Submits transactions
* Generic: Works with any registered dApp

---

### 2.2.2 Relay Proxy Contract

* On-chain execution layer
* Enforces nonce
* Restricts access to relayer
* Executes predefined actions
* Generic: Supports any Action enum

---

### 2.2.3 Target Contract (Example: RentLock)

* Implements business logic
* Example: RentLock escrow
* Any developer can build their own

---

# 🔁 3. Data Flow

## 3.1 End-to-End Flow

```text
1. User signs intent (off-chain)
2. Frontend sends request to relayer
3. Relayer validates request
4. Relayer submits transaction
5. Relay proxy executes action
6. Target contract updates state
7. Frontend receives result
```

---

## 3.2 Sequence Diagram

```text
User → Frontend → Relayer → Relay Contract → Target Contract → Blockchain
```

---

# 🧩 4. Component Design

---

## 4.1 Relayer Service (MAIN PRODUCT)

### Responsibilities

* Accept API requests from any dApp
* Validate nonce and payload
* Enforce gas budget per dApp
* Submit blockchain transactions using relayer wallet
* Track transaction status

---

### API Endpoints

#### POST /relay

Request:
```json
{
  "user": "AccountId",
  "contract": "AccountId",
  "action": "string",
  "args": {},
  "nonce": "number",
  "signature": "string",
  "app_id": "string"
}
```

Response:
```json
{
  "status": "pending",
  "tx_hash": "0x...",
  "message": "Transaction submitted"
}
```

---

#### GET /nonce/:user

Returns current nonce from relay proxy contract.

Response:
```json
{
  "nonce": 42
}
```

---

#### GET /status/:tx_hash

Returns transaction status.

Response:
```json
{
  "status": "pending | success | failed",
  "block": 12345,
  "message": "..."
}
```

---

### Internal Flow

```text
1. Receive request from frontend
2. Validate nonce matches on-chain
3. Check target contract in whitelist
4. Enforce dApp gas budget
5. Encode action payload (SCALE)
6. Submit tx via relayer wallet
7. Wait for confirmation
8. Return tx_hash to frontend
9. Track status for polling
```

---

### Hardcoded Config (MVP)

```javascript
const APP_REGISTRY = {
  "RentLock": {
    contract: "0x...",
    gas_budget: 1_000_000,
    api_key: "test_key_1"
  }
};

const RELAYER_WHITELIST = [
  "0x...", // RentLock contract
];
```

---

---

## 4.2 Relay Proxy Contract (ink!)

---

### Storage

```rust
relayer: AccountId                    // Trusted relayer account
nonces: Mapping<AccountId, u64>       // Per-user nonce tracking
whitelist: Mapping<AccountId, bool>   // Contract whitelist
```

---

### Action Model

```rust
enum Action {
    LockFunds {
        contract: AccountId,
        amount: Balance,
    },
    // Future actions here
}
```

---

### Core Function

```rust
#[ink(message)]
pub fn relay_action(
    &mut self,
    user: AccountId,
    action: Action,
    nonce: u64
) -> Result<(), Error>
```

---

### Execution Flow

```text
1. Check: caller == self.relayer
2. Validate: nonce == self.nonces[user]
3. Check: action contract in whitelist
4. Execute: Make cross-contract call to target
5. Increment: self.nonces[user] += 1
6. Return: Success
```

---

### Admin Functions

```rust
#[ink(message)]
pub fn set_relayer(&mut self, new_relayer: AccountId)

#[ink(message)]
pub fn add_whitelist(&mut self, contract: AccountId)

#[ink(message)]
pub fn remove_whitelist(&mut self, contract: AccountId)
```

---

### Query Functions

```rust
#[ink(message)]
pub fn get_nonce(&self, user: AccountId) -> u64

#[ink(message)]
pub fn is_whitelisted(&self, contract: AccountId) -> bool
```

---

---

## 4.3 Target Contract (Demo: RentLock)

---

### Responsibilities

* Implement business logic (escrow)
* Accept calls only from relay proxy
* Maintain rental state

---

### Example Functions

```rust
#[ink(message)]
pub fn lock_funds(&mut self, user: AccountId, amount: Balance)

#[ink(message)]
pub fn confirm_check_in(&mut self, landlord: AccountId)

#[ink(message)]
pub fn release_funds(&mut self, tenant: AccountId)
```

---

### Cross-Contract Call

RentLock receives call from relay proxy (not directly from user).

---

---

# 🔐 5. Security Design

---

## 5.1 MVP Security Model

| Feature | Status | Reason |
|---------|--------|--------|
| Trusted relayer | MVP | Relayer account whitelisted in contract |
| Nonce replay protection | MVP | Per-user nonce prevents double-spend |
| Contract whitelist | MVP | Only authorized contracts can be called |
| On-chain signature verification | v2 | Deferred (adds complexity) |
| Rate limiting | v2 | Deferred |
| Per-user budget | v2 | Deferred |

---

## 5.2 Abuse Prevention

| Attack | Prevention |
|--------|-----------|
| Replay attack | Nonce-based (incremented per success) |
| Unauthorized execution | Relayer whitelist + nonce validation |
| Arbitrary contract calls | Contract whitelist |
| Budget draining | Per-dApp gas budget enforced by relayer |

---

---

# 🧠 6. Data Structures

---

## Meta Transaction (Frontend → Relayer)

```json
{
  "user": "AccountId",
  "contract": "AccountId",
  "action": "string",
  "args": {},
  "nonce": "number",
  "signature": "string (from PortalDot wallet extension)"
}
```

**Note:** Signature is collected for forward compatibility. Not verified on-chain in MVP.

---

## On-Chain Action (Relayer → Contract)

```rust
Action::LockFunds {
  contract: AccountId,
  amount: Balance,
}
```

---

---

# ⚠️ 7. Constraints & Assumptions

---

## Assumptions

* PortalDot supports ink! contracts
* Local Portaldot node available for development
* Relayer wallet is funded with test POT at genesis
* Users can sign payloads via PortalDot wallet extension
* SCALE codec available via @polkadot/api

---

## Constraints

* MVP timeline: ~4 weeks
* Limited security scope (no sr25519_verify)
* Single relayer (no decentralization)
* Hardcoded dApp registry

---

---

# 🧪 8. Testing Strategy

---

## Unit Testing

**Relay Proxy Contract:**
* Nonce increment validation
* Access control (relayer-only)
* Whitelist enforcement
* Nonce boundary cases

---

## Integration Testing

**End-to-End:**
1. Frontend signs intent
2. Relayer validates & submits
3. Relay proxy executes
4. RentLock state updates
5. Frontend receives confirmation

---

## Demo Testing

* 0 POT wallet executes transaction
* Full RentLock escrow flow succeeds
* Repeated 5+ times without failure

---

---

# 🚀 9. Deployment Plan

---

## Smart Contracts

```bash
# Build
cargo contract build

# Deploy relay_proxy to local node
cargo contract upload
cargo contract instantiate

# Deploy rent_lock similarly
```

---

## Relayer Service

```bash
# Install deps
npm install

# Start server
node src/index.js
# Listens on http://localhost:3000
```

---

## Frontend

```bash
# Install deps
npm install

# Start dev server
npm run dev
# Opens http://localhost:5173
```

---

---

# 🏁 10. MVP Completion Criteria

```text
✔ Relay proxy deployed on local node
✔ Relayer service running and responding
✔ /relay endpoint submits transactions
✔ /nonce endpoint returns current nonce
✔ /status endpoint tracks confirmations
✔ 0 POT wallet executes transaction successfully
✔ RentLock demo end-to-end works
✔ Demo video recorded
✔ README complete
✔ Code is clean and explainable
```

---

---

# 🔮 11. Future Enhancements (Post-MVP)

* **On-chain Signature Verification** — sr25519_verify makes relayer trustless
* **npm SDK** — @portaldot/gasless for one-line integration
* **Developer Dashboard** — Self-serve dApp registration UI
* **Multi-Relayer Network** — Decentralized relayer coordination
* **Rate Limiting & Analytics** — Per-user/per-dApp metrics
* **Mainnet Deployment** — After local testing proves correctness

---

---

# 🏆 12. Success Metrics (Hackathon)

| Criterion | Target | Status |
|-----------|--------|--------|
| Demo Completion | 0 POT wallet executes on-chain | TBD |
| Contract Deployment | relay_proxy deployed locally | TBD |
| API Functionality | /relay, /status, /nonce working | TBD |
| Code Quality | Clean, documented, tested | TBD |
| Presentation | Story + live demo | TBD |

---

# 📋 13. Implementation Roadmap

| Week | Deliverable |
|------|-------------|
| Week 1 (May 1–7) | Local node + relay_proxy contract deployed |
| Week 2 (May 8–14) | Relayer service with /relay endpoint working |
| Week 3 (May 15–21) | React dApp + end-to-end flow |
| Week 4 (May 22–28) | Polish, demo video, README |
| May 29–31 | GitHub submission |

---

# 🎯 Final Notes

This design ensures:

* ✅ **Relayer is the product** — Generic, reusable RaaS backend
* ✅ **RentLock is proof** — Demonstrates relayer viability
* ✅ **Clear separation** — Contract, relayer, frontend are decoupled
* ✅ **Hackathon-ready** — Meets all judging criteria
* ✅ **Future-proof** — Architecture scales to multi-dApp ecosystem

**This is the SDD. You're ready to implement.** 🚀
