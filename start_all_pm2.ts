import pm2 from 'pm2';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const MASTER_URL = process.env.MASTER_SUPABASE_URL!;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY!;

const supabase = createClient(MASTER_URL, MASTER_KEY);

async function startAll() {
    const { data: instances, error } = await supabase.from('instances').select('*').eq('active', true);
    if (error) {
        console.error('Error fetching instances:', error.message);
        return;
    }

    pm2.connect((err) => {
        if (err) {
            console.error(err);
            process.exit(2);
        }

        for (const inst of instances) {
            console.log(`Starting ${inst.slug}...`);
            pm2.start({
                script: 'src/index.ts',
                name: `bot-${inst.slug}`,
                args: inst.slug,
                interpreter: 'node',
                interpreter_args: '--import tsx',
                restart_delay: 3000
            }, (err) => {
                if (err) console.error(`Error starting ${inst.slug}:`, err.message);
                else console.log(`${inst.slug} started!`);
            });
        }
    });
}

startAll();
