
import { fetchCallReadOnlyFunction, cvToJSON, Cl } from '@stacks/transactions';

const DEPLOYER = 'ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV';
const CONTRACT = 'p2p-matching-demo';

async function getAllOffers() {
    try {
        const countRes = await fetchCallReadOnlyFunction({
            network: 'testnet',
            contractAddress: DEPLOYER,
            contractName: CONTRACT,
            functionName: 'get-next-offer-id',
            functionArgs: [],
            senderAddress: DEPLOYER,
        });
        const count = Number(cvToJSON(countRes).value);
        console.log(`Total offers: ${count}`);

        for (let i = 1; i < count; i++) {
            const offerRes = await fetchCallReadOnlyFunction({
                network: 'testnet',
                contractAddress: DEPLOYER,
                contractName: CONTRACT,
                functionName: 'get-offer',
                functionArgs: [Cl.uint(i)],
                senderAddress: DEPLOYER,
            });
            const offer = cvToJSON(offerRes).value.value;
            console.log(`Offer #${i}: Lender=${offer.lender.value}, Active=${offer.active.value}, Filled=${offer.filled.value}`);
        }
    } catch (e) {
        console.error(e);
    }
}

getAllOffers();
