import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

const supabase = createClient(MASTER_URL!, MASTER_KEY!);

async function listTables() {
    // Busca informações do schema
    const { data, error } = await supabase.rpc('get_tables_info'); 
    // Se o RPC não existir, tentamos listar as tabelas de outra forma
    if (error) {
        console.log('RPC falhou, tentando busca direta...');
        const { data: tables, error: err2 } = await supabase.from('instances').select('id').limit(1);
        console.log('Banco mestre conectado.');
    }
    
    // Vou tentar buscar todas as tabelas do schema public
    const { data: schemas, error: err3 } = await supabase.from('_sessions').select('*').limit(1); // Exemplo de tabela técnica
}

listTables();
