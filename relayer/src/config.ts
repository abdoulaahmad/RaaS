// config.ts
// MVP Relayer Configuration (hardcoded for hackathon)

export const CONFIG = {
  NODE_URL: 'ws://165.232.96.28:9944',
  PORT: 3000,
  
  // Relayer account (derived from //Charlie dev account)
  RELAYER_MNEMONIC: process.env.RELAYER_MNEMONIC || '//Charlie',
  
  // Whitelisted contracts (only relay_proxy for MVP)
  WHITELISTED_CONTRACTS: [
    // Will be set after relay_proxy is deployed
    // e.g. '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
  ],
  
  // Gas budgets per dApp
  GAS_BUDGETS: {
    'demo-dapp': 10_000_000_000n, // 10 billion units (max POT to spend)
  },
  
  // API keys for dApps
  API_KEYS: {
    'demo-dapp': process.env.DEMO_API_KEY || 'test-key-demo-dapp',
  },
};
