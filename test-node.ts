// send-tx.ts / test-node.ts
// Phase 1 Gate: Prove @polkadot/api can connect, sign, and confirm a tx on local node

import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';

async function main() {
  try {
    console.log('Connecting to Portaldot node at ws://165.232.96.28:9944...');
    const api = await ApiPromise.create({
      provider: new WsProvider('ws://165.232.96.28:9944')
    });

    console.log('✓ Connected. Chain:', (await api.rpc.system.chain()).toString());

    // Create keyring and get Alice account
    const keyring = new Keyring({ type: 'sr25519' });
    const alice = keyring.addFromUri('//Alice');
    console.log('✓ Alice account:', alice.address);

    // Get current nonce for Alice
    const { nonce } = await api.query.system.account(alice.address);
    console.log('Current nonce:', nonce.toNumber());

    // Create a balance transfer from Alice to Bob (send 1 POT)
    const bob = keyring.addFromUri('//Bob');
    console.log('Recipient (Bob):', bob.address);

    // Build the extrinsic
    const tx = api.tx.balances.transferKeepAlive(bob.address, 1_000_000_000_000);
    console.log('Built extrinsic. Submitting...');

    // Sign and submit
    const unsub = await tx.signAndSend(alice, { nonce }, ({ status, events }) => {
      if (status.isInBlock) {
        console.log(`✓ Transaction included in block: ${status.asInBlock.toString()}`);
      } else if (status.isFinalized) {
        console.log(`✓ Transaction finalized at block: ${status.asFinalized.toString()}`);

        // Check for success
        let success = false;
        for (const event of events) {
          if (api.events.system.ExtrinsicSuccess.is(event.event)) {
            success = true;
            console.log('✓ ExtrinsicSuccess event fired');
            break;
          }
          if (api.events.system.ExtrinsicFailed.is(event.event)) {
            console.error('✗ ExtrinsicFailed event fired');
            break;
          }
        }

        if (success) {
          console.log('\n✓✓✓ PHASE 1 GATE PASSED ✓✓✓');
          console.log('Transaction confirmed on-chain.');
        } else {
          console.log('\n✗ Transaction may have failed. Check events.');
        }

        unsub();
        process.exit(success ? 0 : 1);
      }
    });

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();