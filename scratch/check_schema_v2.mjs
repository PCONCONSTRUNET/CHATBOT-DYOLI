import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { loadInstanceConfig } from '../src/config.js';

async function checkSchema() {
    const config = loadInstanceConfig('data/instances/fernanda.json');
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    
    console.log('Querying schema...');
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'appointments' });
    
    if (error) {
        // Se o RPC não existir, tenta outro jeito
        console.log('RPC failed, trying raw query...');
        const { data: rawData, error: rawErr } = await supabase.from('appointments').select('*').limit(0);
        if (rawErr) {
            console.error('Error:', rawErr);
        } else {
            console.log('Got headers?');
        }
    } else {
        console.log('Columns:', data);
    }
}

checkSchema();
