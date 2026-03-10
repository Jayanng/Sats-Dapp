import { c32addressDecode } from 'c32check';

const addr = "ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD4564VJZV";
const [version, hash] = c32addressDecode(addr);
console.log(`Address: ${addr}`);
console.log(`Hex: 0x051a${hash}`);

const userAddr = "ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD465NRXDF";
const [version2, hash2] = c32addressDecode(userAddr);
console.log(`User Address: ${userAddr}`);
console.log(`User Hex: 0x051a${hash2}`);
