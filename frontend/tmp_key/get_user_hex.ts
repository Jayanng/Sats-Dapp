import { generateWallet, getStxAddress } from '@stacks/wallet-sdk';
import { principalCV, serializeCV } from '@stacks/transactions';

const mnemonic = "ozone crystal help census script flight inherit ugly work obvious gloom victory immense grief defy december wire demand mass brush group pattern slice audit";

async function main() {
    const wallet = await generateWallet({ secretKey: mnemonic, password: '' });
    const account = wallet.accounts[0];
    const address = getStxAddress({ account, transactionVersion: 26 }); // Testnet
    console.log("Address:", address);

    const cv = principalCV(address);
    const hex = serializeCV(cv);
    console.log("Hex:", hex);
}

main().catch(console.error);
