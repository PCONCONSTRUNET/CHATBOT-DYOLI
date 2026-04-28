import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_PORT = 3000;
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'pcon2026';
const DATA_DIR = path.resolve('data');
const INSTANCES_DIR = path.resolve('data/instances');

// Garante que as pastas existem
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(INSTANCES_DIR)) fs.mkdirSync(INSTANCES_DIR, { recursive: true });

// Template padrão para novas instâncias
function createDefaultInstance(id: string, name: string, portNum: number) {
    return {
        id,
        name,
        active: false, // Começa desativada — configura tudo e ativa depois!
        port: portNum,
        phoneNumber: '',
        supabaseUrl: '',
        supabaseKey: '',
        supabaseFunctionsUrl: '',
        botApiSecret: '',
        webhookSecret: `token_${id}`,
        reminder24h: true,
        reminder1h: true,
        welcomeExtra: '',
        websiteUrl: '',
        misticClientId: '',
        misticClientSecret: '',
        mercadopagoAccessToken: '',
        messages: {
            welcome: '✨ *{EMPRESA}* ✨\n\nOlá! 🩷 Seja muito bem-vindo(a)!\n\n🌸 {SERVICOS_EXTRA}\n\n━━━━━━━━━━━━━━━━━━━━\n*COMO POSSO TE AJUDAR HOJE?*\n\n1️⃣ Agendar pelo site\n2️⃣ Agendar por aqui mesmo\n3️⃣ Ver meus agendamentos\n4️⃣ Falar com atendente\n5️⃣ Dúvidas e Cuidados\n6️⃣ Agendamento simplificado\n\n━━━━━━━━━━━━━━━━━━━━\n_Digite apenas o número da opção desejada._',
            paymentConfirmed: '✅ *PAGAMENTO CONFIRMADO* 🎉\n\n━━━━━━━━━━━━━━━━━━━━\n\nOlá! Identificamos o pagamento de *R$ {VALOR}* aqui na *{EMPRESA}*.\n\nSua vaga está 100% garantida! 🩷\n\n━━━━━━━━━━━━━━━━━━━━\n_Qualquer dúvida, é só chamar!_ 💬',
            reminder24h: '⏰ *LEMBRETE DE AGENDAMENTO*\n\n━━━━━━━━━━━━━━━━━━━━\n\nOlá, *{CLIENTE}*! 👋\n\n📅 *Amanhã* você tem um agendamento na *{EMPRESA}*:\n\n✂️ *Serviço:* {SERVICO}\n🕐 *Horário:* {HORA}\n\n━━━━━━━━━━━━━━━━━━━━\n_Esperamos você! 🩷_',
            reminder1h: '🚨 *LEMBRETE — FALTA 1 HORA!*\n\n━━━━━━━━━━━━━━━━━━━━\n\nOi, *{CLIENTE}*! ⏳\n\nSeu agendamento na *{EMPRESA}* começa em *1 hora*!\n\n✂️ *Serviço:* {SERVICO}\n\n━━━━━━━━━━━━━━━━━━━━\n_Te esperamos! ✨_',
        }
    };
}

// Cria 5 configs padrão se não existirem
for (let i = 1; i <= 5; i++) {
    const configPath = path.join(INSTANCES_DIR, `empresa${i}.json`);
    if (!fs.existsSync(configPath)) {
        const instance = createDefaultInstance(`empresa${i}`, `Empresa ${i}`, 3000 + i);
        fs.writeFileSync(configPath, JSON.stringify(instance, null, 2));
    }
}

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-auth-token");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
    if (req.method === "OPTIONS") { res.sendStatus(200); return; }
    next();
});

// Auth básico via token
const SESSIONS = new Set<string>();

function generateToken() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const token = req.headers['x-auth-token'] as string;
    if (!token || !SESSIONS.has(token)) {
        res.status(401).json({ error: 'Não autorizado' });
        return;
    }
    next();
}

// ===== ROTAS DE AUTH =====
app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;
    if (user === ADMIN_USER && pass === ADMIN_PASS) {
        const token = generateToken();
        SESSIONS.add(token);
        res.json({ success: true, token });
    } else {
        res.status(401).json({ error: 'Credenciais inválidas' });
    }
});

// ===== ROTAS DAS INSTÂNCIAS =====

// Listar todas
app.get('/api/instances', authMiddleware, (req, res) => {
    const files = fs.readdirSync(INSTANCES_DIR).filter(f => f.endsWith('.json'));
    const instances = files.map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(INSTANCES_DIR, f), 'utf8'));
        // Garante que instâncias antigas tenham o campo active
        if (data.active === undefined) data.active = false;
        data.status = botStatuses[data.id] || 'disconnected';
        return data;
    });
    res.json(instances);
});

// Buscar uma específica
app.get('/api/instances/:id', authMiddleware, (req, res) => {
    const filePath = path.join(INSTANCES_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Instância não encontrada' });
        return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.active === undefined) data.active = false;
    data.status = botStatuses[data.id] || 'disconnected';
    res.json(data);
});

// Atualizar configuração
app.put('/api/instances/:id', authMiddleware, (req, res) => {
    const filePath = path.join(INSTANCES_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Instância não encontrada' });
        return;
    }
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const updated = { ...existing, ...req.body, id: existing.id }; // Não permite alterar o ID
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    res.json({ success: true, data: updated });
});

// ===== TOGGLE ATIVAR/DESATIVAR =====
app.patch('/api/instances/:id/toggle', authMiddleware, (req, res) => {
    const filePath = path.join(INSTANCES_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Instância não encontrada' });
        return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Toggle do estado active
    data.active = !data.active;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    
    // Se desativou, desconecta o bot automaticamente
    if (!data.active) {
        const sock = botSockets[data.id];
        if (sock) {
            try { sock.logout(); } catch(e) {}
            delete botSockets[data.id];
            delete botQRs[data.id];
            botStatuses[data.id] = 'disconnected';
        }
    }
    
    console.log(`${data.active ? '✅' : '⏸️'} Instância "${data.name}" ${data.active ? 'ATIVADA' : 'DESATIVADA'}`);
    
    res.json({ 
        success: true, 
        active: data.active,
        message: data.active 
            ? `${data.name} ativada! Agora pode conectar o bot.`
            : `${data.name} desativada. O bot foi desconectado.`
    });
});

// Verificar % de configuração completa
app.get('/api/instances/:id/readiness', authMiddleware, (req, res) => {
    const filePath = path.join(INSTANCES_DIR, `${req.params.id}.json`);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Instância não encontrada' });
        return;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Campos obrigatórios para considerar a instância "pronta"
    const checks = [
        { label: 'Nome da empresa', ok: !!data.name && data.name !== `Empresa ${data.id.replace('empresa', '')}` },
        { label: 'URL do Supabase', ok: !!data.supabaseUrl },
        { label: 'Chave do Supabase', ok: !!data.supabaseKey },
        { label: 'URL Functions', ok: !!data.supabaseFunctionsUrl },
        { label: 'API Secret', ok: !!data.botApiSecret },
        { label: 'Webhook Secret', ok: !!data.webhookSecret },
        { label: 'Texto de boas-vindas', ok: !!data.welcomeExtra },
        { label: 'URL do site', ok: !!data.websiteUrl },
    ];
    
    const completed = checks.filter(c => c.ok).length;
    const total = checks.length;
    const percentage = Math.round((completed / total) * 100);
    
    res.json({
        percentage,
        completed,
        total,
        checks,
        ready: percentage >= 75, // 75%+ = Pode ativar
    });
});

// ===== STATUS DOS BOTS EM MEMÓRIA =====
const botStatuses: Record<string, string> = {};
const botSockets: Record<string, any> = {};
const botQRs: Record<string, string> = {};

// Exporta para o bot-runner usar
export { botStatuses, botSockets, botQRs };

app.get('/api/instances/:id/qr', authMiddleware, async (req, res) => {
    const qr = botQRs[req.params.id];
    if (qr) {
        const QRCode = (await import('qrcode')).default;
        const qrImage = await QRCode.toDataURL(qr);
        res.json({ status: 'QR_READY', qr: qrImage });
    } else if (botStatuses[req.params.id] === 'connected') {
        res.json({ status: 'CONNECTED', qr: null });
    } else {
        res.json({ status: 'WAITING', qr: null });
    }
});

app.post('/api/instances/:id/connect', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const filePath = path.join(INSTANCES_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'Instância não encontrada' });
        return;
    }
    
    const config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // BLOQUEIA conexão se a instância não estiver ativa
    if (!config.active) {
        res.status(403).json({ 
            error: 'Instância desativada',
            message: 'Ative a instância antes de conectar o bot. Configure todos os dados necessários e clique em "Ativar".'
        });
        return;
    }
    
    if (botStatuses[id] === 'connected') {
        res.json({ success: true, message: 'Já conectado' });
        return;
    }

    try {
        const { startBotInstance } = await import('./bot-runner.js');
        await startBotInstance(config);
        res.json({ success: true, message: 'Iniciando conexão...' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/instances/:id/disconnect', authMiddleware, async (req, res) => {
    const id = req.params.id;
    const sock = botSockets[id];
    if (sock) {
        try { await sock.logout(); } catch(e) {}
        delete botSockets[id];
        delete botQRs[id];
        botStatuses[id] = 'disconnected';
    }
    res.json({ success: true });
});

// Serve o frontend estático
app.use(express.static(path.resolve('src/admin/public')));

app.get('*', (req, res) => {
    res.sendFile(path.resolve('src/admin/public/index.html'));
});

app.listen(ADMIN_PORT, () => {
    console.log(`\n🎛️  PAINEL ADMIN rodando em http://localhost:${ADMIN_PORT}`);
    console.log(`   Login: ${ADMIN_USER} / ${ADMIN_PASS}\n`);
});

export default app;
