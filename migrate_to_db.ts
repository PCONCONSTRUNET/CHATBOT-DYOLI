import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const MASTER_URL = 'https://vgrjiexdvctcvkrvumjo.supabase.co';
const MASTER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZncmppZXhkdmN0Y3ZrcnZ1bWpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzUwNDY3MSwiZXhwIjoyMDkzMDgwNjcxfQ.CAgIecq7QWjgQ9oV0lH9saOKSXkZLvvoGexPsiJ6S2c';

const supabase = createClient(MASTER_URL, MASTER_KEY);

async function migrate() {
    const instancesDir = path.resolve('data/instances');
    const files = fs.readdirSync(instancesDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
        const slug = file.replace('.json', '');
        const data = JSON.parse(fs.readFileSync(path.join(instancesDir, file), 'utf8'));

        console.log(`Migrating ${slug}...`);

        const { error } = await supabase.from('instances').upsert({
            slug: slug,
            name: data.name,
            active: data.active ?? true,
            port: data.port,
            supabase_url: data.supabaseUrl,
            supabase_key: data.supabaseKey,
            supabase_functions_url: data.supabaseFunctionsUrl,
            bot_api_secret: data.botApiSecret,
            webhook_secret: data.webhookSecret,
            website_url: data.websiteUrl,
            welcome_extra: data.welcomeExtra,
            mistic_client_id: data.misticClientId,
            mistic_client_secret: data.misticClientSecret,
            mercadopago_access_token: data.mercadopagoAccessToken,
            messages: data.messages || {}
        }, { onConflict: 'slug' });

        if (error) {
            console.error(`Error migrating ${slug}:`, error.message);
        } else {
            console.log(`Successfully migrated ${slug}`);
        }
    }
}

migrate();
