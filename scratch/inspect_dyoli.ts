import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

const supabase = createClient(MASTER_URL!, MASTER_KEY!);

async function inspectData() {
    const { data, error } = await supabase.from('instances').select('*').eq('slug', 'dyoli').single();
    if (data) {
        console.log('Dados da Dyoli no Banco Mestre:');
        console.log(JSON.stringify(data, null, 2));
    } else {
        console.error('Erro:', error);
    }
}

inspectData();
