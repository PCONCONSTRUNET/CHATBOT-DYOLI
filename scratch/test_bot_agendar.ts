import { createClient } from '@supabase/supabase-js';
import { loadInstanceConfig } from '../src/config.js';

const config = loadInstanceConfig('data/instances/fernanda.json');
const supabase = createClient(config.supabaseUrl, config.supabaseKey);

async function callEdgeFunction(secret: string, endpoint: string, body: any) {
    const url = `${config.supabaseFunctionsUrl}/${endpoint}`;
    console.log(`\n📡 POST ${url}`);
    console.log(`🔑 Secret: ${secret}`);
    console.log(`📦 Body:`, JSON.stringify(body, null, 2));

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-bot-secret': secret,
        },
        body: JSON.stringify(body),
    });

    const text = await res.text();
    console.log(`📬 Status: ${res.status}`);
    try {
        console.log(`📬 Response:`, JSON.stringify(JSON.parse(text), null, 2));
    } catch {
        console.log(`📬 Response (raw):`, text.slice(0, 500));
    }
    return res.status;
}

async function main() {
    // 1. Busca serviços disponíveis
    console.log('\n=== SERVIÇOS NO BANCO ===');
    const { data: services, error: sErr } = await supabase
        .from('services')
        .select('id, name, price, active')
        .eq('active', true)
        .limit(5);
    if (sErr) console.error('Erro serviços:', sErr);
    else console.log(JSON.stringify(services, null, 2));

    if (!services || services.length === 0) {
        console.log('❌ Nenhum serviço encontrado! Buscando sem filtro active...');
        const { data: all } = await supabase.from('services').select('id, name, price, active').limit(5);
        console.log('Todos os serviços:', JSON.stringify(all, null, 2));
        return;
    }

    const testServiceId = services[0].id;
    const testDate = new Date().toISOString().split('T')[0];

    // 2. Testa bot-servicos com o secret atual
    console.log('\n=== TESTANDO bot-servicos ===');
    await callEdgeFunction(config.botApiSecret, 'bot-servicos', {});

    // 3. Testa bot-agendar com o secret atual (pode falhar)
    console.log('\n=== TESTANDO bot-agendar (secret atual) ===');
    const status = await callEdgeFunction(config.botApiSecret, 'bot-agendar', {
        whatsapp: '5511999990000',
        nome: 'Teste Script',
        servico_id: testServiceId,
        data: testDate,
        horario: '14:00',
        forma_pagamento: 'recepcao'
    });

    if (status !== 200) {
        console.log('\n⚠️ Edge Function falhou com o secret atual!');
        console.log('👉 Testando fallback direto no banco...');

        // 4. Testa insert direto
        const { data: inserted, error: insErr } = await supabase
            .from('appointments')
            .insert([{
                customer_whatsapp: '5511999990000',
                customer_name: 'Teste Script',
                service_id: testServiceId,
                date: testDate,
                time: '14:00',
                status: 'confirmado',
                payment_method: 'recepcao',
                amount: services[0].preco || services[0].price || 0,
                total_amount: services[0].preco || services[0].price || 0
            }])
            .select();

        if (insErr) {
            console.log('\n❌ Insert direto TAMBÉM falhou!');
            console.log('Erro:', JSON.stringify(insErr, null, 2));
        } else {
            console.log('\n✅ Insert direto funcionou! Agendamento criado:');
            console.log(JSON.stringify(inserted, null, 2));
            // Limpa o teste
            const { data: testApp } = await supabase.from('appointments').select('id').eq('customer_name', 'Teste Script').single();
            if (testApp?.id) {
                await supabase.from('appointments').delete().eq('id', testApp.id);
                console.log('🧹 Registro de teste removido.');
            }
        }
    } else {
        console.log('\n✅ Edge Function funcionou!');
    }
}

main().catch(console.error);
