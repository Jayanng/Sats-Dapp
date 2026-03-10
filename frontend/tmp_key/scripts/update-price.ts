import { makeContractCall, broadcastTransaction, uintCV } from '@stacks/transactions';
import { STACKS_TESTNET } from '@stacks/network';

async function main() {
  const txOptions = {
    contractAddress: 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV',
    contractName: 'mock-oracle-demo',
    functionName: 'set-price',
    functionArgs: [uintCV(85000000000n)],
    senderKey: process.env.DEPLOYER_PRIVATE_KEY!,
    network: STACKS_TESTNET,
    fee: 10000n,
  };

  const tx = await makeContractCall(txOptions);
  const result = await broadcastTransaction({ 
    transaction: tx, 
    network: STACKS_TESTNET 
  });
  console.log('Price update TX:', result.txid);
}

main().catch(console.error);

