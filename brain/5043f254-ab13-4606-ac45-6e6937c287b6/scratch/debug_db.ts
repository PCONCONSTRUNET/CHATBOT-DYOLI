import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    const cpf = '11767589930';
    console.log(`Checking data for CPF: ${cpf}`);
    
    const { data: client, error: clientErr } = await supabase
        .from('clients')
        .select('*')
        .eq('document', cpf)
        .single();

    if (clientErr) {
        console.error('Error fetching client:', clientErr);
        return;
    }

    console.log('Client found:', client);

    const { data: invoices, error: invErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('client_id', client.id);

    if (invErr) {
        console.error('Error fetching invoices:', invErr);
    } else {
        console.log('Invoices count:', invoices.length);
        console.log('Invoices details:', JSON.stringify(invoices, null, 2));
    }
    
    // Check if there is a subscriptions table
    const { data: subs, error: subsErr } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('client_id', client.id);
        
    if (!subsErr) {
        console.log('Subscriptions found:', subs.length);
        console.log('Subscriptions details:', JSON.stringify(subs, null, 2));
    } else {
        console.log('No subscriptions table or error:', subsErr.message);
    }
}

checkData();
