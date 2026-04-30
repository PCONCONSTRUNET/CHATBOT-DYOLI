import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { loadInstanceConfig } from '../src/config.js';

async function listTables() {
    const config = loadInstanceConfig('data/instances/fernanda.json');
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    
    console.log('Listing tables in public schema...');
    // In Supabase, we can't easily list tables via client without a custom RPC
    // But we can try to query common tables to see if they exist
    const commonTables = ['services', 'appointments', 'schedules', 'business_hours', 'settings', 'professionals'];
    
    for (const table of commonTables) {
        const { error } = await supabase.from(table).select('*').limit(0);
        if (!error) {
            console.log(`✅ Table exists: ${table}`);
        } else {
            console.log(`❌ Table missing: ${table} (${error.message})`);
        }
    }
}

listTables();
