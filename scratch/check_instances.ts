import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

const supabase = createClient(MASTER_URL!, MASTER_KEY!);

async function checkInstances() {
    const { data, error } = await supabase.from('instances').select('*');
    if (error) {
        console.error('Error fetching instances:', error.message);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

checkInstances();
