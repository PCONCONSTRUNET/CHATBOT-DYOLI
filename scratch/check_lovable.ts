import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function checkLovable() {
    const MASTER_URL = process.env.MASTER_SUPABASE_URL;
    const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;
    const masterSupabase = createClient(MASTER_URL, MASTER_KEY);
    
    const { data: instance } = await masterSupabase.from('instances').select('*').eq('slug', 'dyoli').single();
    
    const BASE_URL = instance.supabase_functions_url;
    const BOT_SECRET = instance.bot_api_secret;

    console.log(`Calling bot-servicos for Dyoli at ${BASE_URL}...`);
    
    const res = await fetch(`${BASE_URL}/bot-servicos`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': BOT_SECRET,
        },
        body: JSON.stringify({}),
    });

    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
}

checkLovable();
