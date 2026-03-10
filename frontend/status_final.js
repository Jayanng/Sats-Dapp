async function check() {
    const ids = [
        "9e544db9a421486e227c209da6cbee7d93121081cc47e7882e7fcc55e2dd6d75",
        "858d697c63bcac7aba6faaab03fc52be46b229c38519c6616e5033fd222c27d6"
    ];
    for (const id of ids) {
        try {
            const res = await fetch(`https://api.testnet.hiro.so/extended/v1/tx/${id}`);
            const json = await res.json();
            console.log(`${id.substring(0, 8)}: ${json.tx_status}`);
        } catch (e) {
            console.log(`${id.substring(0, 8)}: pending/error`);
        }
    }
}
check();
