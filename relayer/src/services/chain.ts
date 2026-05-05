// services/chain.ts
// @polkadot/api wrapper for relayer

import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { KeyringPair } from '@polkadot/keyring/types';
import { CONFIG } from '../config.js';

let api: ApiPromise | null = null;
let relayerKeyring: KeyringPair | null = null;

export async function initChain() {
  console.log(`[Chain] Connecting to ${CONFIG.NODE_URL}...`);
  
  api = await ApiPromise.create({
    provider: new WsProvider(CONFIG.NODE_URL),
  });

  console.log(`[Chain] ✓ Connected. Chain: ${(await api.rpc.system.chain()).toString()}`);

  // Initialize relayer keypair
  const keyring = new Keyring({ type: 'sr25519' });
  relayerKeyring = keyring.addFromUri(CONFIG.RELAYER_MNEMONIC);
  console.log(`[Chain] ✓ Relayer account: ${relayerKeyring.address}`);

  return api;
}

export function getApi(): ApiPromise {
  if (!api) throw new Error('Chain not initialized. Call initChain() first.');
  return api;
}

export function getRelayerKeyring(): KeyringPair {
  if (!relayerKeyring) throw new Error('Relayer keyring not initialized.');
  return relayerKeyring;
}

/**
 * Submit a raw balance transfer (Phase 1 MVP).
 * Later this will be replaced with relay_proxy.relay_action() call.
 */
export async function submitBalanceTransfer(
  recipient: string,
  amount: bigint
): Promise<string> {
  const apiInstance = getApi();
  const relayer = getRelayerKeyring();

  const accountInfo: any = await apiInstance.query.system.account(relayer.address);
  const nonce = accountInfo.nonce;
  const tx = apiInstance.tx.balances.transferKeepAlive(recipient, amount);

  return new Promise((resolve, reject) => {
    tx.signAndSend(relayer, { nonce }, ({ status, events }) => {
      if (status.isInBlock) {
        const hash = status.asInBlock.toString();
        console.log(`[Chain] ✓ Tx in block: ${hash}`);
      } else if (status.isFinalized) {
        const hash = status.asFinalized.toString();
        console.log(`[Chain] ✓ Tx finalized: ${hash}`);

        let success = false;
        for (const event of events) {
          if (apiInstance.events.system.ExtrinsicSuccess.is(event.event)) {
            success = true;
            break;
          }
        }

        if (success) {
          resolve(hash);
        } else {
          reject(new Error('ExtrinsicFailed event detected'));
        }
      }
    }).catch(reject);
  });
}
