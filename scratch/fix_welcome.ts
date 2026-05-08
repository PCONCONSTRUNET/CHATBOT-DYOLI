import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.MASTER_SUPABASE_URL!, process.env.MASTER_SUPABASE_KEY!);

async function fixWelcome() {
    // Primeiro, busca o estado atual
    const { data, error } = await supabase
        .from('instances')
        .select('slug, messages')
        .eq('slug', 'dyoli')
        .single();

    if (error) {
        console.error('Erro ao buscar:', error);
        return;
    }

    console.log('Estado atual:', JSON.stringify(data.messages, null, 2));

    // Atualiza com a mensagem correta
    const correctWelcome = `✨ *ESTUDIO DYOLI GODIM* ✨\n\nOlá! 💗 Seja muito bem-vindo(a)!\n\n🌸 Tattoo • Piercing • Micropigmentação • Manicure\n\n━━━━━━━━━━━━━━━━━━━━\n*COMO POSSO TE AJUDAR HOJE?*\n\n1️⃣ Agendar pelo site\n2️⃣ Agendar por aqui mesmo\n3️⃣ Ver meus agendamentos\n4️⃣ Falar com a Dyoli\n5️⃣ Agendamento simplificado\n6️⃣ Dúvidas e Cuidados Pós-Procedimento\n\n━━━━━━━━━━━━━━━━━━━━\n_Digite apenas o número da opção desejada._`;

    const newMessages = { ...(data.messages || {}), welcome: correctWelcome };

    const { error: updateError } = await supabase
        .from('instances')
        .update({ messages: newMessages })
        .eq('slug', 'dyoli');

    if (updateError) {
        console.error('Erro ao atualizar:', updateError);
    } else {
        console.log('✅ Mensagem de welcome da Dyoli atualizada com sucesso!');
    }
}

fixWelcome();
