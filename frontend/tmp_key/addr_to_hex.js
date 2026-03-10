import { c32addressDecode } from 'c32check';

const addr = process.argv[2];
if (!addr) {
    console.error("Usage: node addr_to_hex.js <address>");
    process.exit(1);
}

try {
    const [version, hash] = c32addressDecode(addr);
    console.log(`0x051a${hash}`);
} catch (e) {
    console.error("Error decoding address:", e.message);
}
