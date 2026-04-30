import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;
const VPS_IP = '178.105.54.230';

if (!MASTER_URL || !MASTER_KEY) {
    console.error('Faltam credenciais MASTER no .env');
    process.exit(1);
}

const supabase = createClient(MASTER_URL, MASTER_KEY);

async function updateUrls() {
    console.log('🔄 Atualizando URLs das instâncias para o IP da VPS...');

    // Lista de instâncias e suas portas baseadas nos seus JSONs
    const updates = [
        { slug: 'dyoli', port: 3001 },
        { slug: 'natan', port: 3002 },
        { slug: 'fernanda', port: 3003 },
        { slug: 'estudio5', port: 3004 }
    ];

    for (const item of updates) {
        const newUrl = `http://${VPS_IP}:${item.port}`;
        const { error } = await supabase
            .from('instances')
            .update({ public_url: newUrl })
            .eq('slug', item.slug);

        if (error) {
            console.error(`❌ Erro ao atualizar ${item.slug}:`, error.message);
        } else {
            console.log(`✅ ${item.slug} -> ${newUrl}`);
        }
    }

    console.log('✨ Todas as URLs foram atualizadas!');
}

updateUrls();
