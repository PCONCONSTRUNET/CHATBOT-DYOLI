import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

const supabase = createClient(MASTER_URL!, MASTER_KEY!);

async function checkColumns() {
    const { data, error } = await supabase.from('instances').select('*').limit(1);
    if (data && data[0]) {
        console.log('Colunas disponíveis:', Object.keys(data[0]));
    } else {
        console.error('Erro ao buscar dados:', error);
    }
}

checkColumns();
