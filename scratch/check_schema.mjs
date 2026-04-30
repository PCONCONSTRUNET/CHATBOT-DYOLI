import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { loadInstanceConfig } from '../src/config.js';

async function checkSchema() {
    const config = loadInstanceConfig('data/instances/fernanda.json');
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    
    console.log('Checking appointments table...');
    const { data, error } = await supabase.from('appointments').select('*').limit(1);
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Columns:', Object.keys(data[0] || {}));
    }
}

checkSchema();
