import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vgrjiexdvctcvkrvumjo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZncmppZXhkdmN0Y3ZrcnZ1bWpvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzUwNDY3MSwiZXhwIjoyMDkzMDgwNjcxfQ.CAgIecq7QWjgQ9oV0lH9saOKSXkZLvvoGexPsiJ6S2c';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    try {
        const { error } = await supabase.from('instances').select('id').limit(1);
        if (error) {
            console.log('Tables do not exist or error:', error.message);
        } else {
            console.log('Tables already exist!');
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

checkTables();
