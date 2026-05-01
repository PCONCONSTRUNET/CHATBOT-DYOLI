
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const masterUrl = process.env.MASTER_SUPABASE_URL;
const masterKey = process.env.MASTER_SUPABASE_KEY;

const supabase = createClient(masterUrl, masterKey);

async function updateDyoli() {
    console.log('🔄 Atualizando configuração da Dyoli no Banco Mestre...');
    
    const { data, error } = await supabase
        .from('instances')
        .update({
            supabase_functions_url: 'https://vlepenxinekoljxecomr.supabase.co/functions/v1',
            bot_api_secret: 'sk_pcon_ef341b29f7a8c5d6e245a89cd01f3e4a'
        })
        .eq('slug', 'dyoli');

    if (error) {
        console.error('❌ Erro ao atualizar:', error);
    } else {
        console.log('✅ Configuração da Dyoli atualizada com sucesso!');
    }
}

updateDyoli();
