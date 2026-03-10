async function main() {
    const res = await fetch("https://api.testnet.hiro.so/extended/v1/address/ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV/transactions?limit=8");
    const json = await res.json();
    console.log("Recent Transactions:");
    json.results.forEach(tx => {
        if (tx.tx_id === '0xdf47b34e9935fe5f58ab39218054f61bbcd37badf52f37f8fe38000da4ee1e2e' ||
            tx.tx_id === 'df47b34e9935fe5f58ab39218054f61bbcd37badf52f37f8fe38000da4ee1e2e') {
            console.log(`Oracle Price Update (${tx.tx_id.substring(0, 8)}...): ${tx.tx_status}`);
        }
        else if (tx.smart_contract && tx.smart_contract.contract_id.includes('lending-protocol-demo-v5')) {
            console.log(`lending-protocol-demo-v5 Deployment: ${tx.tx_status}`);
        }
        else if (tx.smart_contract && tx.smart_contract.contract_id.includes('vault-usd-v3')) {
            console.log(`vault-usd-v3 Deployment: ${tx.tx_status}`);
        }
        else if (tx.contract_call && tx.contract_call.contract_id.includes('lending-protocol-demo-v5')) {
            console.log(`Call to lending-protocol-demo-v5: ${tx.tx_status}`);
        }
    });

}
main();
