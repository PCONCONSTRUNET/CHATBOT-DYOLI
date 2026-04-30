import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Credenciais da Dyoli (do dyoli.json)
const DYOLI_URL = 'https://bevahgtmcdicyhjnrylk.supabase.co';
const DYOLI_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJldmFoZ3RtY2RpY3loam5yeWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDE1ODI1NywiZXhwIjoyMDg5NzM0MjU3fQ.SeYyVF6I-IEZA_Ejk8_5gyVXiNE2tVl0Yb9glBdGw2E';

const supabase = createClient(DYOLI_URL, DYOLI_KEY);

async function checkDyoliConfig() {
    console.log('🔍 Buscando configurações no Supabase da Dyoli...');
    
    // Tentando encontrar uma tabela de configurações
    const { data: configs, error } = await supabase.from('config').select('*').limit(1);
    
    if (configs) {
        console.log('Tabela "config" encontrada:', configs);
    } else {
        console.log('Tabela "config" não encontrada ou erro:', error?.message);
        
        // Tentando outra tabela comum
        const { data: settings } = await supabase.from('settings').select('*').limit(1);
        console.log('Tabela "settings":', settings);
    }
}

checkDyoliConfig();
