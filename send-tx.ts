import { ApiPromise, Keyring, WsProvider } from '@polkadot/api';
import { cryptoWaitReady } from '@polkadot/util-crypto';

async function main() {
  await cryptoWaitReady();

  const provider = new WsProvider('ws://127.0.0.1:9944');
  const api = await ApiPromise.create({ provider });

  const keyring = new Keyring({ type: 'sr25519' });
  const alice = keyring.addFromUri('//Alice');
  const bob = keyring.addFromUri('//Bob');

  const amount = 1_000_000_000_000n;
  const transfer = api.tx.balances.transferKeepAlive(bob.address, amount);

  console.log('Submitting transfer...');

  await new Promise<void>((resolve, reject) => {
    transfer.signAndSend(alice, (result) => {
      if (result.status.isInBlock) {
        console.log('In block:', result.status.asInBlock.toHex());
      }

      if (result.status.isFinalized) {
        console.log('Finalized:', result.status.asFinalized.toHex());
        resolve();
      }

      if (result.isError) {
        reject(new Error('Transaction failed'));
      }
    }).catch(reject);
  });

  await api.disconnect();
}

main().catch((error) => {
  console.error('Error:', error);
  process.exitCode = 1;
});
