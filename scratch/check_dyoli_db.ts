import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

async function check() {
    const supabase = createClient(process.env.MASTER_SUPABASE_URL!, process.env.MASTER_SUPABASE_KEY!);
    const { data, error } = await supabase.from('instances').select('*').eq('slug', 'dyoli').single();
    if (error) {
        console.error('Erro:', error);
    } else {
        console.log('--- CONFIG DYOLI NO BANCO ---');
        console.log(JSON.stringify(data, null, 2));
    }
}
check();
