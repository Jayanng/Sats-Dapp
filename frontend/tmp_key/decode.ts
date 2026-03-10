import { c32addressDecode } from 'c32check';

const addr = "ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD465NRXDF";
try {
    const [version, hash] = c32addressDecode(addr);
    console.log(`0x051a${hash}`);
} catch (e) {
    console.error(e);
}
