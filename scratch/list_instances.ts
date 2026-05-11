import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.MASTER_SUPABASE_URL || 'https://vgrjiexdvctcvkrvumjo.supabase.co';
const supabaseKey = process.env.MASTER_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZncmppZXhkdmN0Y3ZrcnZ1bWpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzUwNDY3MSwiZXhwIjoyMDkzMDgwNjcxfQ.CAgIecq7QWjgQ9oV0lH9saOKSXkZLvvoGexPsiJ6S2c';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listInstances() {
    const { data, error } = await supabase.from('instances').select('*');
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log(JSON.stringify(data, null, 2));
}

listInstances();
