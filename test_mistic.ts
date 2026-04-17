import fetch from 'node-fetch';

async function test() {
    const id = "ci_jv1qky7dg3q1ok7";
    const secret = "cs_8o31ey1ln7jjvml2pxmq69opv";
    
    // Auth Test (Efi uses basic auth to /oauth/token, pushinpay just uses bearer token, maybe misticpay is the same)
    let res = await fetch('https://api.misticpay.com/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: id, client_secret: secret })
    });
    console.log("Auth 1:", res.status, await res.text());
    
    // Test base64 Basic
    const b64 = Buffer.from(id + ':' + secret).toString('base64');
    let res2 = await fetch('https://api.misticpay.com/oauth/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + b64
        },
        body: JSON.stringify({ grant_type: 'client_credentials' })
    });
    console.log("Auth 2:", res2.status, await res2.text());
    
    // Test direct charge
    let res3 = await fetch('https://api.misticpay.com/v1/pix/charge', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + secret // typical pattern
        },
        body: JSON.stringify({
            amount: 50,
            external_reference: 'test1234'
        })
    });
    console.log("Auth 3:", res3.status, await res3.text());
}
test();
