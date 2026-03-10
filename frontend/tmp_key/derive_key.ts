import { generateWallet, getStxAddress } from '@stacks/wallet-sdk';

const mnemonic = "ozone crystal help census script flight inherit ugly work obvious gloom victory immense grief defy december wire demand mass brush group pattern slice audit";

async function main() {
    const wallet = await generateWallet({ secretKey: mnemonic, password: '' });
    // Try accounts or identities
    const account = wallet.accounts ? wallet.accounts[0] : (wallet.identities ? wallet.identities[0] : null);
    if (!account) {
        console.error("Could not find accounts array:", Object.keys(wallet));
        return;
    }
    const address = getStxAddress({ account, transactionVersion: 26 }); // 26 = testnet
    console.log("Address:", address);
    console.log("PrivateKey:", account.stxPrivateKey);
}

main().catch(console.error);
