import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.MASTER_SUPABASE_URL!,
    process.env.MASTER_SUPABASE_KEY!
);

async function register() {
    console.log('📝 Atualizando "estudio5" → "princesadelacos" (Princesa de Laços)...\n');

    const { error } = await supabase
        .from('instances')
        .update({
            slug: 'princesadelacos',
            name: 'Princesa de Laços',
            active: true,
            port: 3005,
            bot_api_secret: 'sk_pcon_princesadelacos',
            webhook_secret: 'princesa_secret_123',
            welcome_extra: 'Laços • Acessórios • Tiaras',
            website_url: 'www.princesadelacos.com.br',
            messages: {
                welcome: "🎀 *PRINCESA DE LAÇOS* 🎀\n\nOlá! 💖 Seja muito bem-vindo(a)!\n\n🌸 Laços • Acessórios • Tiaras\n\n━━━━━━━━━━━━━━━━━━━━\n*COMO POSSO TE AJUDAR HOJE?*\n\n1️⃣ Ver nossos produtos\n2️⃣ Fazer um pedido\n3️⃣ Ver meus pedidos\n4️⃣ Falar com a atendente\n5️⃣ Dúvidas frequentes\n\n━━━━━━━━━━━━━━━━━━━━\n_Digite apenas o número da opção desejada._",
                paymentConfirmed: "✅ *PAGAMENTO CONFIRMADO* 🎀\n\nSeu pagamento foi confirmado na *Princesa de Laços*. Seu pedido está sendo preparado com muito carinho! 💖🌸",
                reminder24h: "⏰ Lembrete sobre seu pedido na *Princesa de Laços*.",
                reminder1h: "🚨 Seu pedido na *Princesa de Laços* está quase pronto!"
            },
            updated_at: new Date().toISOString()
        })
        .eq('slug', 'estudio5');

    if (error) {
        console.error('❌ Erro:', error.message);
    } else {
        console.log('✅ Atualizado com sucesso!');
    }

    // Confirmar
    const { data: all } = await supabase.from('instances').select('slug, name, port, active');
    console.log('\n📋 Instâncias no banco mestre:');
    all?.forEach((i: any) => {
        console.log(`  ${i.active ? '🟢' : '🔴'} ${i.slug} — ${i.name} (Porta ${i.port})`);
    });
}

register().catch(console.error);
