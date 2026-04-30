import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://levghaokyjrhgrjzmpnb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxldmdoYW9reWpyaGdyanptcG5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE2NTYyNCwiZXhwIjoyMDkyNzQxNjI0fQ.M5oTsFae7NvNEhvAG3FiZtWT6ybVOTfrRD4HHvxTSS8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Testing connection...");
    const { data, error } = await supabase.from('appointments').select('id').limit(1);
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Success! Found:", data.length, "appointments");
    }
}

test();
