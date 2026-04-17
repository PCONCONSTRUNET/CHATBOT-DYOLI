import fetch from 'node-fetch';
import * as fs from 'fs';

async function main() {
    const r = await fetch('https://docs.misticpay.com/');
    const t = await r.text();
    fs.writeFileSync('docs.html', t);
    console.log("Written. Length:", t.length);
}
main();
