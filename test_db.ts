import fetch from 'node-fetch';
import 'dotenv/config';

async function check() {
    const url = process.env.SUPABASE_URL + '/rest/v1/';
    const res = await fetch(url, {
        headers: {
            'apikey': process.env.SUPABASE_KEY || '',
            'Authorization': 'Bearer ' + process.env.SUPABASE_KEY,
        }
    });
    
    // The root endpoint returns OpenAPI spec for all tables
    const data = await res.json();
    const tables = Object.keys(data.paths).filter(p => p.startsWith('/') && !p.includes('{'));
    console.log("Tables:", tables);
}
check();
