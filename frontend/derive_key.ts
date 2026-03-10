import { generateWallet, getStxAddress } from '@stacks/wallet-sdk';

const mnemonic = "ozone crystal help census script flight inherit ugly work obvious gloom victory immense grief defy december wire demand mass brush group pattern slice audit";

async function main() {
    const wallet = await generateWallet({ secretKey: mnemonic, password: '' });
    const account = wallet.identities[0];
    const address = getStxAddress({ account, transactionVersion: 26 }); // 26 = testnet
    console.log("Address:", address);
    console.log("Private Key:", account.stxPrivateKey);
}

main().catch(console.error);
