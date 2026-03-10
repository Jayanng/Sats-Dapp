import { principalCV, serializeCV } from '@stacks/transactions';

const addr = "ST3VDRCBYPNVQR90Y1GKRBP0M59QZ1YGD465NRXDF";
try {
    const cv = principalCV(addr);
    const hex = serializeCV(cv);
    console.log(hex);
} catch (e) {
    console.error(e);
}
