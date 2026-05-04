import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

async function checkMaster() {
    const masterSupabase = createClient(MASTER_URL, MASTER_KEY);
    const { data: instances, error } = await masterSupabase.from('instances').select('*');
    
    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('--- Instances in Master ---');
    instances.forEach(inst => {
        console.log(`Slug: ${inst.slug}, Name: ${inst.name}, URL: ${inst.supabase_url}`);
    });
}

checkMaster();
