import ngrok from 'ngrok';
import fs from 'fs';

async function start() {
  try {
    const port = parseInt(process.argv[2]) || 3003;
    console.log(`Connecting to port ${port}...`);
    const url = await ngrok.connect({
        proto: 'http',
        addr: port,
        name: 'fernanda_' + Date.now()
    });
    console.log('NGROK_URL:' + url);
    fs.writeFileSync('ngrok_url_fernanda.txt', url);
  } catch (err) {
    console.error('Failed to start ngrok:', err);
    process.exit(1);
  }
}

start();
