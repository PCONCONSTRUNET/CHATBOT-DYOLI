import { loadAllInstances } from './config.js';
import type { InstanceConfig } from './config.js';
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * RUNNER DE INSTÂNCIAS - Versão compatível com Node v20+
 */

async function start() {
    console.log('🚀 Iniciando Gerenciador de Instâncias...');
    
    const instancesDir = path.resolve('data/instances');
    const files = fs.readdirSync(instancesDir).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
        const configPath = path.join(instancesDir, file);
        const config: InstanceConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (config.active) {
            console.log(`✅ Iniciando bot: ${config.name} (Porta ${config.port})`);
            
            // No Node v20+, usamos --import tsx para carregar TypeScript no ESM
            const child = fork(path.resolve(__dirname, 'index.ts'), [configPath], {
                stdio: 'inherit',
                execArgv: [
                    '--import', 'tsx',
                    '--no-warnings'
                ]
            });

            child.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    console.log(`🛑 Bot ${config.name} parou (Código: ${code}). Reiniciando em 10s...`);
                    setTimeout(start, 10000);
                }
            });
        }
    }
}

start().catch(console.error);
