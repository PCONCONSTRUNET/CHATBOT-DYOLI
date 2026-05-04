import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SEPARATOR = '━━━━━━━━━━━━━━━━━━━━';

async function syncDb() {
    const supabase = createClient(process.env.MASTER_SUPABASE_URL!, process.env.MASTER_SUPABASE_KEY!);
    
    const welcomeMsg = `✨ *ESTUDIO DYOLI GODIM* ✨\n\nOlá! 🩷 Seja muito bem-vindo(a)!\n\n🌸 Tattoo • Piercing • Micropigmentação • Manicure\n\n${SEPARATOR}\n*COMO POSSO TE AJUDAR HOJE?*\n\n1️⃣ Agendar pelo site\n2️⃣ Agendar por aqui mesmo\n3️⃣ Ver meus agendamentos\n4️⃣ Falar com a Dyoli\n5️⃣ Agendamento simplificado\n6️⃣ Dúvidas e Cuidados Pós-Procedimento\n\n${SEPARATOR}\n_Digite apenas o número da opção desejada._`;

    console.log('🔄 Sincronizando Menu no Banco de Dados...');

    // Busca as mensagens atuais para não sobrescrever o resto
    const { data: inst } = await supabase.from('instances').select('messages').eq('slug', 'dyoli').single();
    
    if (inst) {
        const newMessages = {
            ...inst.messages,
            welcome: welcomeMsg
        };

        const { error } = await supabase
            .from('instances')
            .update({ messages: newMessages })
            .eq('slug', 'dyoli');

        if (error) {
            console.error('❌ Erro ao atualizar banco:', error);
        } else {
            console.log('✅ Banco de dados atualizado com sucesso (Menu 5 e 6 invertidos)!');
        }
    }
}

syncDb();
