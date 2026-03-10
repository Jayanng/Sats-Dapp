const fs = require('fs');

async function getTx() {
    try {
        const res = await fetch("https://api.testnet.hiro.so/extended/v1/address/ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV/transactions?limit=10");
        const json = await res.json();

        // Find lending-protocol-demo-v5 transaction
        const tx = json.results.find(t =>
            (t.smart_contract && t.smart_contract.contract_id.includes('lending-protocol-demo-v5')) ||
            (t.contract_call && t.contract_call.contract_id.includes('lending-protocol-demo-v5'))
        );

        if (tx) {
            fs.writeFileSync('tx_data.json', JSON.stringify(tx, null, 2), 'utf8');
            console.log("Wrote to tx_data.json");
        } else {
            console.log("Could not find lending-protocol-demo-v5 in the last 10 transactions.");
        }
    } catch (err) {
        console.error(err);
    }
}

getTx();
