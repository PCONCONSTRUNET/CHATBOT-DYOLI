import fetch from 'node-fetch';
async function check() {
    try {
        const res = await fetch('http://localhost:3003/api/status');
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Error reaching local API:', e.message);
    }
}
check();
