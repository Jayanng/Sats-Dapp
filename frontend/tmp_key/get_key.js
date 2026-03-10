const { generateWallet } = require('@stacks/wallet-sdk');

const mnemonic = "ozone crystal help census script flight inherit ugly work obvious gloom victory immense grief defy december wire demand mass brush group pattern slice audit";

async function main() {
    const wallet = await generateWallet({ secretKey: mnemonic, password: '' });
    console.log("Wallet keys:", Object.keys(wallet));
    if (wallet.accounts) {
        console.log("Accounts found");
        console.log("Private Key:", wallet.accounts[0].stxPrivateKey);
    } else if (wallet.identities) {
        console.log("Identities found");
        console.log("Private Key:", wallet.identities[0].stxPrivateKey);
    }
}

main().catch(console.error);
