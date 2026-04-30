import ngrok from 'ngrok';
import fs from 'fs';

async function start() {
  try {
    const url = await ngrok.connect(3000);
    console.log('NGROK_URL:' + url);
    fs.writeFileSync('ngrok_url.txt', url);
  } catch (err) {
    console.error('Failed to start ngrok:', err);
    process.exit(1);
  }
}

start();
