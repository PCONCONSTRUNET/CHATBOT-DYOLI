import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

async function listTables() {
    const masterSupabase = createClient(MASTER_URL, MASTER_KEY);
    const { data: instance } = await masterSupabase.from('instances').select('*').eq('slug', 'dyoli').single();
    
    const instanceSupabase = createClient(instance.supabase_url, instance.supabase_key);
    
    console.log('Listing tables for Dyoli...');
    const { data, error } = await instanceSupabase.rpc('get_tables'); // If a RPC exists
    
    if (error) {
        // Try querying information_schema if possible (might be restricted)
        const { data: tables, error: tableError } = await instanceSupabase
            .from('pg_catalog.pg_tables') // Usually not accessible via PostgREST
            .select('tablename')
            .eq('schemaname', 'public');
            
        if (tableError) {
             console.log('Could not list tables directly. Trying common names again or checking specific structure.');
             // Let's try to query a known table like 'appointments' which I saw in the code
             const { data: appts, error: apptErr } = await instanceSupabase.from('appointments').select('*').limit(1);
             if (apptErr) {
                 console.log('Error on appointments:', apptErr.message);
             } else {
                 console.log('Appointments table exists.');
             }
        } else {
            console.log('Tables found:', tables.map(t => t.tablename));
        }
    } else {
        console.log('Tables:', data);
    }
}

listTables();
