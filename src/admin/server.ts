import express from 'express';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pm2 = require('pm2');
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.ADMIN_PORT || 3000;
const MASTER_URL = process.env.MASTER_SUPABASE_URL!;
const MASTER_KEY = process.env.MASTER_SUPABASE_KEY!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;
const JWT_SECRET = process.env.JWT_SECRET!;

const supabase = createClient(MASTER_URL, MASTER_KEY);

app.use(express.json());
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
app.use(express.static(path.join(__dirname, 'public')));

// Middleware de Autenticação
const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Não autorizado' });

    try {
        jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

// Login
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Senha incorreta' });
    }
});

// Listar Instâncias e Status do PM2 + Status Interno do WhatsApp
app.get('/api/instances', authenticate, async (req, res) => {
    try {
        const { data: dbInstances, error } = await supabase.from('instances').select('*');
        if (error) throw error;

        pm2.connect((err) => {
            if (err) return res.status(500).json({ error: 'Erro ao conectar ao PM2' });

            pm2.list(async (err, list) => {
                const instancesWithStatus = await Promise.all(dbInstances.map(async (inst) => {
                    const pmProcess = list.find(p => p.name === `bot-${inst.slug}`);
                    
                    let whatsappStatus = 'desconectado';
                    if (pmProcess && pmProcess.pm2_env?.status === 'online') {
                        try {
                            // Tenta bater na API interna do bot para ver se está logado
                            const botRes = await fetch(`http://localhost:${inst.port}/api/status`).then(r => r.json());
                            const statusRaw = (botRes.status || '').toUpperCase();
                            
                            if (statusRaw === 'CONNECTED') whatsappStatus = 'conectado';
                            else if (statusRaw === 'QR_READY' || statusRaw === 'WAITING') whatsappStatus = 'aguardando qr';
                            else whatsappStatus = 'desconectado';
                        } catch (e) {
                            whatsappStatus = 'erro api';
                        }
                    }

                    const uptimeMs = pmProcess?.pm2_env?.pm_uptime ? (Date.now() - pmProcess.pm2_env.pm_uptime) : 0;

                    return {
                        ...inst,
                        status: pmProcess ? pmProcess.pm2_env?.status : 'stopped',
                        whatsappStatus,
                        memory: pmProcess ? Math.round((pmProcess.monit?.memory || 0) / 1024 / 1024) : 0,
                        cpu: pmProcess ? pmProcess.monit?.cpu : 0,
                        uptime: uptimeMs
                    };
                }));
                res.json(instancesWithStatus);
            });
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Controle de Processo (Start/Stop/Restart)
app.post('/api/control', authenticate, (req, res) => {
    const { slug, action } = req.body;

    pm2.connect((err) => {
        if (err) return res.status(500).json({ error: 'Erro ao conectar ao PM2' });

        const processName = `bot-${slug}`;

        const callback = (err: any) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        };

        if (action === 'start' || action === 'restart') {
            pm2.start({
                script: 'src/index.ts',
                name: processName,
                args: slug,
                interpreter: 'node',
                interpreter_args: '--import tsx',
                restart_delay: 3000
            }, callback);
        } else if (action === 'stop') {
            pm2.stop(processName, callback);
        } else if (action === 'delete') {
            pm2.delete(processName, callback);
        }
    });
});

// Logs Master (últimas 50 linhas)
app.get('/api/logs', authenticate, (req, res) => {
    const processName = req.query.name as string || 'pcon-admin';

    pm2.connect((err) => {
        if (err) return res.status(500).json({ error: 'Erro PM2' });
        
        pm2.list((err, list) => {
            if (err) return res.status(500).json({ error: 'Erro ao listar' });
            
            const proc = list.find(p => p.name === processName);
            const logPath = proc?.pm2_env?.pm_out_log_path;
            const errPath = proc?.pm2_env?.pm_err_log_path;

            let combinedLogs = '';
            
            if (logPath && fs.existsSync(logPath)) {
                combinedLogs += fs.readFileSync(logPath, 'utf8').split('\n').slice(-30).join('<br>');
            }
            if (errPath && fs.existsSync(errPath)) {
                const errs = fs.readFileSync(errPath, 'utf8').split('\n').slice(-20).join('<br>');
                if (errs) combinedLogs += '<br><span style="color:red;">[ERROR LOGS]</span><br>' + errs;
            }

            if (combinedLogs) {
                res.json({ logs: combinedLogs });
            } else {
                res.json({ logs: "Nenhum log encontrado para este processo." });
            }
        });
    });
});

// Salvar/Editar Instância
app.post('/api/instances/save', authenticate, async (req, res) => {
    try {
        const inst = req.body;
        
        // Remove campos temporários do PM2/Frontend que não existem na tabela
        const { 
            status, whatsappStatus, memory, cpu, uptime, 
            ...cleanInst 
        } = inst;

        const { error } = await supabase
            .from('instances')
            .upsert({
                ...cleanInst,
                updated_at: new Date().toISOString()
            }, { onConflict: 'slug' });

        if (error) throw error;
        res.json({ success: true });
    } catch (err: any) {
        console.error('Erro ao salvar instância:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(port, () => {
    console.log(`🚀 P-CON BOT Admin rodando em http://localhost:${port}`);
});
