# Gasless POT Development Plan

Date: May 3, 2026
Version: 1.0

## Phased Breakdown

### Phase 1: Prove the Pipeline (Week 1: May 1-7)
1. Local Portaldot node running
   - Command: ./portaldot --dev --tmp
   - Verify WebSocket: ws://127.0.0.1:9944

2. send-tx.ts: submit a raw balance transfer
   - @polkadot/api connects
   - Alice signs
   - Transaction confirmed on-chain
   - This is the "hello world" gate

3. POST /relay: Express wrapper around send-tx
   - Single endpoint
   - No auth or whitelist yet
   - curl POST /relay sends and tx appears on-chain

Gate: curl POST /relay -> tx confirmed on local node

### Phase 2: Build the Core (Week 2: May 8-14)
4. relay_proxy ink! contract
   - Storage, nonces, relay_action(), get_nonce()
   - Compile and deploy locally

5. RentLock ink! contract
   - fund, confirm_checkin, release, dispute, resolve
   - State machine implemented

6. Relayer calls contract
   - Replace balances.transfer with relay_proxy.relay_action()
   - Wire to deployed contract address

7. Add nonce, whitelist, API key
   - GET /nonce/:addr
   - Contract whitelist
   - X-API-Key header check

Gate: relay_proxy deployed, relayer calls contract, nonce increments on-chain

### Phase 3: Build the Frontend (Week 3: May 15-21)
8. Wallet connect screen
   - Polkadot.js extension detection
   - Show account and POT balance (may be 0)

9. GaslessClient.ts (SDK seed)
   - Get nonce -> build payload -> sign off-chain -> POST /relay
   - Return tx_hash

10. Tenant view: Book Now flow
   - Select listing -> sign -> relayer submits
   - Pending -> confirmed, zero POT spent

11. Landlord + tx status views
   - Confirm check-in
   - Poll GET /status/:tx
   - Show block number on success

Gate: end-to-end flow in browser, 0 POT wallet books a listing

### Phase 4: Ship It (Week 4 + Submission: May 22-31)
12. Stress-test the demo flow
   - Run the full demo 10+ times
   - Fix every edge case

13. Record demo video
   - Show 0 POT wallet
   - Book listing, tx confirmed
   - Landlord receives funds
   - Max 5 minutes

14. Write README + submit
   - Architecture overview
   - Setup instructions
   - Contract address
   - Video link
   - GitHub repo

## Development Methodology

- Use vertical slices, not horizontal layers.
  Build a thin, end-to-end pipeline before deepening any single component.

- One working thing before the next thing.
  Do not move to the next phase until the gate is met.

- AI-code boilerplate, understand the logic.
  Use AI for scaffolding (Express, TypeScript types, React components).
  Write the ink! contract logic yourself to avoid subtle chain-type errors.

- Compile early and often.
  Run cargo contract build after each contract message change.

- Favor working pipelines over perfect components.
  A minimal, running path is better than a complete component that is disconnected.

## Immediate Next Action

- Implement send-tx.ts that submits a balance transfer.
  This proves the local node + @polkadot/api setup is correct and unblocks Phase 1.
