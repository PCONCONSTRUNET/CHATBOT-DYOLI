import { createClient } from '@supabase/supabase-js';
import { loadInstanceConfig } from '../src/config.js';

async function test() {
    const config = loadInstanceConfig('data/instances/fernanda.json');
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    
    console.log('--- SETTINGS ---');
    const { data: settings } = await supabase.from('settings').select('*');
    console.log(JSON.stringify(settings, null, 2));

    console.log('--- BUSINESS HOURS ---');
    const { data: hours } = await supabase.from('business_hours').select('*');
    console.log(JSON.stringify(hours, null, 2));

    console.log('--- SERVICES ---');
    const { data: services } = await supabase.from('services').select('*');
    console.log(JSON.stringify(services, null, 2));

    console.log('--- MESSAGES ---');
    const { data: messages } = await supabase.from('messages').select('*').limit(5);
    console.log(JSON.stringify(messages, null, 2));

    console.log('--- APPOINTMENTS (HOJE) ---');
    const today = new Date().toISOString().split('T')[0];
    const { data: appointments } = await supabase.from('appointments').select('*').eq('date', today);
    console.log(JSON.stringify(appointments, null, 2));
}

test();
