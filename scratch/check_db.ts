import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.MASTER_SUPABASE_URL!, process.env.MASTER_SUPABASE_KEY!);

async function check() {
    // 1. Verifica o config completo da instância dyoli
    const { data: instance, error } = await supabase
        .from('instances')
        .select('*')
        .eq('slug', 'dyoli')
        .single();

    if (error) {
        console.error('Erro:', error.message);
        return;
    }

    console.log('=== INSTÂNCIA DYOLI ===');
    console.log('messages:', JSON.stringify(instance.messages, null, 2));
    console.log('---');
    
    // Verifica TODOS os campos por "ola teste"
    const allFields = JSON.stringify(instance).toLowerCase();
    if (allFields.includes('ola teste')) {
        console.log('🚨 ENCONTRADO "ola teste" em algum campo da instância!');
        // Encontra em qual campo
        for (const [key, value] of Object.entries(instance)) {
            const valStr = JSON.stringify(value).toLowerCase();
            if (valStr.includes('ola teste')) {
                console.log(`   -> Campo: ${key}`);
                console.log(`   -> Valor: ${JSON.stringify(value)}`);
            }
        }
    } else {
        console.log('✅ Nenhum "ola teste" encontrado nos campos da instância');
    }

    // 2. Verifica se há triggers ou functions no Supabase
    console.log('\n=== CHECANDO OUTRAS TABELAS ===');
    
    // Verifica chat_sessions recentes
    const { data: sessions } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('instance_slug', 'dyoli')
        .order('updated_at', { ascending: false })
        .limit(5);

    console.log('Últimas 5 sessões Dyoli:');
    sessions?.forEach(s => {
        console.log(`  JID: ${s.remote_jid} | State: ${s.state} | Raw: ${JSON.stringify(s.raw_state)}`);
    });
}

check().catch(console.error);
