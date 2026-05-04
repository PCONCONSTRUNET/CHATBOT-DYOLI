import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY;

async function checkCategories() {
    const masterSupabase = createClient(MASTER_URL, MASTER_KEY);
    
    // Get Dyoli config
    const { data: instance, error: instError } = await masterSupabase
        .from('instances')
        .select('*')
        .eq('slug', 'dyoli')
        .single();
    
    if (instError) {
        console.error('Error fetching instance:', instError);
        return;
    }

    console.log('--- Instance Info ---');
    console.log('Name:', instance.name);
    console.log('Supabase URL:', instance.supabase_url);

    const instanceSupabase = createClient(instance.supabase_url, instance.supabase_key);
    
    // Check categories in various possible tables
    const tables = ['procedures', 'services', 'procedure', 'service'];
    let foundServices = [];

    for (const table of tables) {
        console.log(`\n--- Trying table: ${table} ---`);
        const { data, error } = await instanceSupabase
            .from(table)
            .select('*');
        
        if (error) {
            console.log(`Error on ${table}:`, error.message);
        } else if (data && data.length > 0) {
            console.log(`Found ${data.length} services in ${table}`);
            foundServices = data;
            break; 
        }
    }
    
    if (foundServices.length > 0) {
        const categories = [...new Set(foundServices.map(s => s.categoria || s.category || 'Sem Categoria'))];
        console.log('\n--- Categories Found ---');
        categories.forEach(cat => console.log(`- ${cat}`));
        
        console.log('\n--- Recent Services (First 10) ---');
        foundServices.slice(0, 10).forEach(s => {
            console.log(`[${s.categoria || s.category}] ${s.nome || s.name}`);
        });
    } else {
        console.log('\nNo services found in any of the expected tables.');
    }
}

checkCategories();
