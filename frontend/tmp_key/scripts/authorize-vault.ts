import { makeContractCall, broadcastTransaction, principalCV } from '@stacks/transactions';
import { STACKS_TESTNET } from '@stacks/network';

async function main() {
    const txOptions = {
        contractAddress: 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV',
        contractName: 'vault-usd-final',
        functionName: 'set-authorized-contract',
        functionArgs: [principalCV('ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV.lending-protocol-v3')],
        senderKey: process.env.DEPLOYER_PRIVATE_KEY!,
        network: STACKS_TESTNET,
        fee: 10000n,
    };

    const tx = await makeContractCall(txOptions);
    const result = await broadcastTransaction({ transaction: tx, network: STACKS_TESTNET });
    console.log('Authorize TX ID:', result.txid);
}

main().catch(console.error);
