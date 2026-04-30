import fetch from 'node-fetch';
async function getTunnels() {
    try {
        const res = await fetch('http://localhost:4040/api/tunnels');
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Ngrok not running or API not reachable');
    }
}
getTunnels();
