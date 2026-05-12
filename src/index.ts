import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import QRCode from 'qrcode';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { createLovableClient } from './lovable-factory.js';
import { createPaymentClients } from './payments-factory.js';
import { loadInstanceConfig, loadConfigFromDb } from './config.js';
import type { InstanceConfig } from './config.js';
import { startReminders } from './reminders.js';
import { SEPARATOR, formatMsg } from './utils.js';

// Pega o argumento (caminho JSON ou slug do banco)
const configPath = process.argv[2];
if (!configPath) {
    console.error('❌ Caminho ou slug da configuração não fornecido!');
    process.exit(1);
}

// Carrega a configuração inicial
let config: InstanceConfig;
if (configPath.endsWith('.json')) {
    config = loadInstanceConfig(configPath);
} else {
    config = await loadConfigFromDb(configPath);
}

// Inicializa cliente mestre para persistência de estado
const masterSupabase = createClient(process.env.MASTER_SUPABASE_URL!, process.env.MASTER_SUPABASE_KEY!);

// Inicializa clients
const supabase = createClient(config.supabaseUrl, config.supabaseKey);
const lovable = createLovableClient(config);
const payments = createPaymentClients(config);

const app = express();
app.use(cors());
app.use(express.json());


let globalSock: any = null;
let latestQR = '';
let reminderInterval: NodeJS.Timeout | null = null;

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

// Middleware de segurança para webhooks
const authMiddleware = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const bodyToken = (req.body && typeof req.body === 'object') ? req.body.token : null;
    const token = req.headers['x-webhook-token'] || bodyToken || req.query.token || bearerToken;

    if (token !== config.webhookSecret) {
        console.log(`[🔐 ${config.id}] Bloqueado: Token inválido.`);
        return res.status(401).json({ erro: 'Não autorizado' });
    }
    next();
};

app.post('/api/refresh', authMiddleware, (req, res) => {
    try {
        config = loadInstanceConfig(configPath);
        console.log(`[🔄 ${config.id}] Configuração recarregada!`);
        res.json({ sucesso: true });
    } catch (err: any) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/webhook/notificacao', authMiddleware, async (req: any, res: any) => {
    try {
        const { numero, mensagem } = req.body;
        if (!numero || !mensagem) return res.status(400).json({ erro: 'Faltando dados' });

        // LOG para rastrear a origem de mensagens inesperadas
        console.log(`[📨 ${config.id}] Webhook recebido | IP: ${req.ip} | Numero: ${numero} | Msg: "${mensagem}"`);

        // BLOQUEIO ESTRITO: Não envia nada que contenha "teste" ou "ola teste"
        const msgLower = mensagem.toLowerCase().trim();
        if (msgLower.includes('teste')) {
            console.log(`[🚫 ${config.id}] Mensagem contendo "teste" BLOQUEADA.`);
            return res.json({ sucesso: true, aviso: 'Mensagem de teste ignorada' });
        }

        if (globalSock) {
            let tel = numero.replace(/\D/g, '');
            if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
            const jid = tel.includes('@') ? tel : `${tel}@s.whatsapp.net`;
            
            if (globalSock.sendWithTyping) {
                await globalSock.sendWithTyping(jid, { text: mensagem });
            } else {
                await globalSock.sendMessage(jid, { text: mensagem });
            }
            res.json({ sucesso: true });
        } else {
            res.status(503).json({ erro: 'Bot desconectado' });
        }
    } catch (err: any) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/webhook/mercadopago', async (req: any, res: any) => {
    try {
        const paymentId = req.query?.['data.id'] || req.query?.data?.id || req.body?.data?.id;
        if (!paymentId) return res.status(200).send('No ID');

        console.log(`[💸 ${config.id}] Webhook Mercado Pago recebido. Payment ID: ${paymentId}`);

        if (!config.mercadopagoAccessToken) {
            console.log(`[💸 ${config.id}] Ignorado: Sem token do Mercado Pago configurado.`);
            return res.status(200).send('No Token Configured');
        }

        const { MercadoPagoConfig, Payment } = await import('mercadopago');
        const clientMP = new MercadoPagoConfig({ accessToken: config.mercadopagoAccessToken });
        const payment = new Payment(clientMP);

        const paymentData = await payment.get({ id: paymentId });
        
        if (paymentData.status === 'approved') {
            const extRef = paymentData.external_reference;
            
            if (extRef && extRef.startsWith('AGEN_')) {
                // Buscar o agendamento
                const { data: appt, error } = await masterSupabase
                    .from('appointments')
                    .select('*')
                    .eq('external_reference', extRef)
                    .single();

                if (appt && appt.status === 'pendente') {
                    // Atualizar para confirmado
                    await masterSupabase
                        .from('appointments')
                        .update({ status: 'confirmado' })
                        .eq('id', appt.id);

                    // Enviar msg de sucesso
                    const whatsapp = appt.customer_whatsapp;
                    // Formatar número
                    let tel = whatsapp.replace(/\D/g, '');
                    if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
                    const jid = tel.includes('@') ? tel : `${tel}@s.whatsapp.net`;

                    const dataBR = appt.date.split('-').reverse().join('/');
                    const msgSucesso = `✅ *PAGAMENTO APROVADO E AGENDAMENTO CONFIRMADO!*\n\n${SEPARATOR}\n\n` +
                        `Tudo certo, *${appt.customer_name}*!\nSeu pagamento de R$ ${parseFloat(appt.amount).toFixed(2).replace('.',',')} foi aprovado e seu horário está garantido!\n\n` +
                        `📅 *Data:* ${dataBR}\n🕐 *Horário:* ${appt.time}\n\n` +
                        `${SEPARATOR}\n_Te esperamos no estúdio! ✨_`;

                    if (globalSock && globalSock.sendWithTyping) {
                        await globalSock.sendWithTyping(jid, { text: msgSucesso });
                    } else if (globalSock && globalSock.sendMessage) {
                        await globalSock.sendMessage(jid, { text: msgSucesso });
                    }

                    // Limpar o state para a pessoa
                    await savePersistentState(jid, { state: 'START' });
                } else if (!appt) {
                    // Tenta na base especifica se a master nao tiver (fallback pra estrutura antiga)
                    const { data: localAppt } = await supabase
                        .from('appointments')
                        .select('*')
                        .eq('external_reference', extRef)
                        .single();

                    if (localAppt && localAppt.status === 'pendente') {
                        await supabase.from('appointments').update({ status: 'confirmado' }).eq('id', localAppt.id);
                        const whatsapp = localAppt.customer_whatsapp;
                        let tel = whatsapp.replace(/\D/g, '');
                        if (tel.length === 10 || tel.length === 11) tel = '55' + tel;
                        const jid = tel.includes('@') ? tel : `${tel}@s.whatsapp.net`;

                        const dataBR = localAppt.date.split('-').reverse().join('/');
                        const msgSucesso = `✅ *PAGAMENTO APROVADO E AGENDAMENTO CONFIRMADO!*\n\n${SEPARATOR}\n\n` +
                            `Tudo certo, *${localAppt.customer_name}*!\nSeu pagamento de R$ ${parseFloat(localAppt.amount).toFixed(2).replace('.',',')} foi aprovado e seu horário está garantido!\n\n` +
                            `📅 *Data:* ${dataBR}\n🕐 *Horário:* ${localAppt.time}\n\n` +
                            `${SEPARATOR}\n_Te esperamos no estúdio! ✨_`;

                        if (globalSock?.sendWithTyping) await globalSock.sendWithTyping(jid, { text: msgSucesso });
                        await savePersistentState(jid, { state: 'START' });
                    }
                }
            }
        }

        res.status(200).send('OK');
    } catch (err) {
        console.error("Erro MP Webhook:", err);
        res.status(500).send('Error');
    }
});

const processedMessages = new Set<string>();

async function getPersistentState(remoteJid: string) {
    const { data, error } = await masterSupabase
        .from('chat_sessions')
        .select('state, raw_state')
        .eq('instance_slug', config.id)
        .eq('remote_jid', remoteJid)
        .single();
    
    if (error || !data) return { state: 'START' };
    return { state: data.state, ...data.raw_state };
}

async function savePersistentState(remoteJid: string, stateObj: any) {
    const { state, ...raw_state } = stateObj;
    await masterSupabase
        .from('chat_sessions')
        .upsert({
            instance_slug: config.id,
            remote_jid: remoteJid,
            state: state,
            raw_state: raw_state,
            updated_at: new Date().toISOString()
        }, { onConflict: 'instance_slug,remote_jid' });
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder || `sessions/${config.id}`);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }) as any,
        printQRInTerminal: false,
        browser: Browsers.macOS('Chrome'),
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    (sock as any).supabase = supabase;

    // Função auxiliar para enviar mensagem com "falso digitando"
    const sendWithTyping = async (jid: string, content: any, options: any = {}) => {
        try {
            // Precisa inscrever na presença do JID antes de mostrar "digitando"
            await sock.presenceSubscribe(jid);
            await sock.sendPresenceUpdate('available', jid);
            await delay(200);
            
            await sock.sendPresenceUpdate('composing', jid);
            
            const text = content.text || '';
            const typingTime = Math.max(1500, Math.min(text.length * 30, 4000));
            await delay(typingTime);
            
            await sock.sendPresenceUpdate('paused', jid);
            await delay(300);
            return await sock.sendMessage(jid, content, options);
        } catch (e) {
            if (sock?.sendMessage) {
                return await sock.sendMessage(jid, content, options);
            }
        }
    };

    // Anexa ao global para o webhook usar
    (sock as any).sendWithTyping = sendWithTyping;

    globalSock = sock;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            latestQR = qr;
            console.log(`[📱 ${config.id}] Novo QR Code gerado.`);
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`[⚡ ${config.id}] Conexão fechada. Reconectando: ${shouldReconnect}`);
            
            if (reminderInterval) {
                clearInterval(reminderInterval);
                reminderInterval = null;
            }

            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`[🚪 ${config.id}] Logout detectado. Limpando sessão e reiniciando...`);
                const sessionPath = path.resolve(config.sessionFolder || `sessions/${config.id}`);
                try {
                    if (fs.existsSync(sessionPath)) {
                        fs.rmSync(sessionPath, { recursive: true, force: true });
                    }
                } catch (e) {}
                
                // Força a reconexão para gerar um novo QR Code
                console.log(`[🔄 ${config.id}] Iniciando nova tentativa de conexão para gerar QR...`);
                setTimeout(connectToWhatsApp, 5000);
            } else if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            }
        } else if (connection === 'open') {
            latestQR = '';
            console.log(`[✅ ${config.id}] Conexão estabelecida com sucesso!`);
            globalSock = sock;
            
            if (!reminderInterval) {
                reminderInterval = startReminders(config, sock);
            }

            try {
                await masterSupabase.from('instances').update({ 
                    last_connection: new Date().toISOString() 
                }).eq('slug', config.id);
            } catch (e) {
                console.error(`[⚠️ ${config.id}] Falha ao atualizar timestamp no banco master`);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        console.log(`[DEBUG MSG UPSERT] type: ${m.type}, messages length: ${m.messages?.length}`);
        // ✅ Só processa mensagens novas (type 'notify'), ignora histórico
        if (m.type !== 'notify') return;
        if (!m.messages || m.messages.length === 0) return;
        const msg = m.messages[0];
        if (!msg || !msg.message || msg.key.remoteJid === 'status@broadcast') return;

        // 🛡️ Wrapper de segurança: captura qualquer erro e loga sem matar o processo
        try {

        // 🚫 BLOQUEIO DE GRUPOS E COMUNIDADES: Só processa se for chat privado
        if (!msg.key.remoteJid?.endsWith('@s.whatsapp.net') && !msg.key.remoteJid?.endsWith('@lid')) {
            return;
        }

        // Evita processar a mesma mensagem duas vezes
        const msgId = msg.key.id;
        if (!msgId) return;
        if (processedMessages.has(msgId)) return;
        processedMessages.add(msgId);
        setTimeout(() => processedMessages.delete(msgId!), 60000); // Limpa após 1 minuto
        
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) return;

        let incomingText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        console.log(`[📥 MENSAGEM] De ${remoteJid}: "${incomingText}"`);

        // ── COMANDO DA ATENDENTE (atendimento finalizado) ──
        // Se a mensagem partiu de você (dona) e for o comando, reseta o estado do cliente
        if (msg.key.fromMe) {
            const cmd = incomingText.toLowerCase();
            if (cmd === 'atendimento finalizado') {
                await savePersistentState(remoteJid, { state: 'START' });
                await sock.sendMessage(remoteJid, { text: '🔄 *Atendimento finalizado. O bot voltará a te atender agora.*' });
                console.log(`[🔄 ${config.id}] Bot resetado manualmente para ${remoteJid}`);
            }
            return; // Não processa mensagens próprias como mensagens de cliente
        }

        let userPhone = '';
        if (remoteJid.endsWith('@lid')) {
            const senderPn = (msg.key as any).senderPn?.split('@')[0];
            const remoteJidAlt = (msg.key as any).remoteJidAlt?.split('@')[0];
            const resolvedWa = await sock.onWhatsApp(remoteJid);
            const resolvedJid = resolvedWa?.[0]?.jid?.split('@')[0];
            const participant = msg.key.participant || msg.message?.extendedTextMessage?.contextInfo?.participant;
            
            userPhone = remoteJidAlt || senderPn || resolvedJid || participant?.split('@')[0] || remoteJid.split('@')[0];
        } else {
            userPhone = remoteJid.split('@')[0];
        }
        userPhone = userPhone.replace(/\D/g, '');

        if (!incomingText) return;

        const stateKey = remoteJid;
        let rawState = await getPersistentState(stateKey);

        const setState = async (newState: any) => {
            await savePersistentState(stateKey, newState);
        };



        const sendMsg = async (text: string) => {
            try {
                if (sock && (sock as any).sendWithTyping) {
                    await (sock as any).sendWithTyping(remoteJid, { text });
                } else if (sock?.sendMessage) {
                    await sock.sendMessage(remoteJid, { text });
                }
            } catch (sendErr: any) {
                console.error(`[❌ ${config.id}] Erro ao enviar msg para ${remoteJid}:`, sendErr?.message || sendErr);
                // Tentativa final direta
                try { await sock.sendMessage(remoteJid, { text }); } catch (_) {}
            }
        };

        const sendDoc = async (url: string, fileName: string) => {
            if (sock) {
                // Ajusta link do Dropbox para download direto se necessário
                const directUrl = url.replace('dl=0', 'dl=1').replace('www.dropbox.com', 'dl.dropboxusercontent.com');
                await sock.sendMessage(remoteJid, {
                    document: { url: directUrl },
                    mimetype: 'application/pdf',
                    fileName: fileName
                });
            }
        };

        const currentState = rawState.state;

        // Bloqueio se estiver em atendimento humano
        if (currentState === 'WAITING_HUMAN') {
            console.log(`[👤 ${config.id}] Cliente ${userPhone} em atendimento humano. Bot silenciado.`);
            return;
        }

        // Helper: monta welcome limpo (remove qualquer "ola teste" residual do banco)
        const getWelcomeMessage = () => {
            let welcome = config.messages?.welcome || `Bem-vindo à ${config.name}!`;
            // Remove "ola teste" / "olá teste" que ficou salvo no banco por engano
            if (welcome.toLowerCase().includes('ola teste') || welcome.toLowerCase().includes('olá teste') || welcome.trim().toLowerCase() === 'ola teste') {
                welcome = `✨ *ESTUDIO DYOLI GODIM* ✨\n\nOlá! 💗 Seja muito bem-vindo(a)!\n\n🌸 Tattoo • Piercing • Micropigmentação • Manicure\n\n${SEPARATOR}\nCOMO POSSO TE AJUDAR HOJE?`;
            }
            return formatMsg(welcome, { empresa: config.name, servicos_extra: config.welcomeExtra });
        };

        // ── Boas-vindas para saudações ou estado inicial ──
        const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'voltar'];
        if (greetings.includes(incomingText.toLowerCase()) || currentState === 'START') {
            await sendMsg(getWelcomeMessage());
            await setState({ state: 'MENU' });
            return;
        }

        // ── MENU PRINCIPAL ──
        if (currentState === 'MENU') {
            // Verifica se há um menu dinâmico configurado
            const menuItems = config.menu || [];
            const dynamicItem = menuItems.find(item => item.key === incomingText);

            if (dynamicItem) {
                switch (dynamicItem.action) {
                    case 'schedule': incomingText = '2'; break;
                    case 'appointments': incomingText = '3'; break;
                    case 'human': incomingText = '4'; break;
                    case 'faq': incomingText = '5'; break;
                    case 'link': {
                        const url = dynamicItem.value || config.websiteUrl;
                        await sendMsg(`Clique no link abaixo para acessar:\n\n${url}`);
                        await setState({ state: 'START' });
                        return;
                    }
                    case 'text': {
                        await sendMsg(dynamicItem.value || 'Opção selecionada.');
                        await setState({ state: 'START' });
                        return;
                    }
                }
            }

            switch (incomingText) {
                case '1': { // Agendar pelo site
                    await sendMsg(
                        `🔗 *AGENDAR PELO SITE*\n\n${SEPARATOR}\n\n` +
                        `Reserve seu horário com facilidade:\n\n` +
                        `${config.websiteUrl}\n\n${SEPARATOR}`
                    );
                    await setState({ state: 'START' });
                    break;
                }

                case '2': { // Agendar por aqui
                    await sendMsg(`Buscando procedimentos disponíveis... ⏳`);
                    try {
                        let servicos: any[] = [];
                        try {
                            const res = await lovable.listarServicos();
                            servicos = res.data || res.services || res.servicos || (Array.isArray(res) ? res : []);
                        } catch (fnErr) {
                            console.log('Função bot-servicos falhou, tentando busca direta nas tabelas...');
                            
                            // Tenta buscar em 'procedures'
                            let { data: dbServices, error: dbErr } = await (sock as any).supabase
                                .from('procedures')
                                .select('*');
                            
                            console.log(`[🔎 ${config.id}] Busca em 'procedures':`, { count: dbServices?.length, error: dbErr?.message });
                            
                            // Se não achar nada, tenta 'services'
                            if (!dbServices || dbServices.length === 0) {
                                console.log(`[🔎 ${config.id}] Tentando 'services'...`);
                                const { data: srvData } = await (sock as any).supabase
                                    .from('services')
                                    .select('*');
                                dbServices = srvData;
                            }

                            // Se ainda nada, tenta 'procedure' (singular)
                            if (!dbServices || dbServices.length === 0) {
                                console.log(`[🔎 ${config.id}] Tentando 'procedure'...`);
                                const { data: prData } = await (sock as any).supabase
                                    .from('procedure')
                                    .select('*');
                                dbServices = prData;
                            }

                             // Se ainda nada, tenta 'service' (singular)
                             if (!dbServices || dbServices.length === 0) {
                                console.log(`[🔎 ${config.id}] Tentando 'service'...`);
                                const { data: sData } = await (sock as any).supabase
                                    .from('service')
                                    .select('*');
                                dbServices = sData;
                            }
                            
                            servicos = dbServices || [];
                        }
                        
                        if (servicos.length === 0) {
                            await sendMsg('Desculpe, não encontrei nenhum procedimento disponível no momento. 😔');
                            await setState({ state: 'START' });
                            return;
                        }

                        // Agrupar por categorias
                        const categories = [...new Set(servicos.map((s: any) => s.categoria || 'Outros'))];
                        
                        // Adição especial para Dyoli
                        if (config.id === 'dyoli' && !categories.includes('Unhas')) {
                            categories.push('Unhas');
                        }

                        let listMsg = `✨ *CATEGORIAS* ✨\n\n${SEPARATOR}\n`;
                        categories.forEach((cat: string, i: number) => {
                            listMsg += `*${i+1}.* ${cat}\n`;
                        });

                        listMsg += `\n${SEPARATOR}\n_Digite o número da categoria ou *0* para voltar._`;
                        await setState({ state: 'SELECT_CATEGORY', categories, servicos });
                        await sendMsg(listMsg);
                    } catch (err) {
                        console.error('Erro ao listar serviços:', err);
                        await sendMsg('Erro ao buscar serviços. Tente novamente mais tarde.');
                    }
                    break;
                }

                case '3': { // Ver meus agendamentos
                    try {
                        const phone = userPhone;
                        const res = await lovable.meusAgendamentos(phone);
                        const agendamentos = res.data || [];

                        if (agendamentos.length === 0) {
                            await sendMsg(`Você ainda não possui agendamentos no seu número *${phone}*. 🌸`);
                        } else {
                            let msg = `📅 *SEUS AGENDAMENTOS*\n\n${SEPARATOR}\n`;
                            agendamentos.forEach((a: any) => {
                                msg += `✨ *${a.services?.name || 'Serviço'}*\n📅 ${a.date}\n🕐 ${a.time}\n\n`;
                            });
                            msg += SEPARATOR;
                            await sendMsg(msg);
                        }
                    } catch (err) {
                        await sendMsg('Erro ao buscar seus agendamentos. Tente novamente mais tarde.');
                    }
                    await setState({ state: 'START' });
                    break;
                }

                case '4': { // Falar com Dyoli
                    await sendMsg(`Transferindo para atendimento humano... 📞\n\nEm breve você será atendido!`);
                    await setState({ state: 'WAITING_HUMAN' });
                    break;
                }

                case '5': { // Agendamento simplificado
                    const simpleUrl = config.websiteUrl.endsWith('/')
                        ? `${config.websiteUrl}simplificada`
                        : `${config.websiteUrl}/simplificada`;
                    await sendMsg(
                        `🚀 *AGENDAMENTO SIMPLIFICADO*\n\n${SEPARATOR}\n\n` +
                        `Agende em poucos cliques:\n\n` +
                        `${simpleUrl}\n\n${SEPARATOR}`
                    );
                    await setState({ state: 'START' });
                    break;
                }

                case '6': { // Cuidados Pós-Procedimento
                    const aftercareMsg = `✨ *CUIDADOS PÓS-PROCEDIMENTO* ✨\n\n${SEPARATOR}\n` +
                        `Selecione o procedimento para receber o guia em PDF:\n\n` +
                        `*1.* Reconstrução de lóbulo com TCA\n` +
                        `*2.* Piercing / Perfuração\n` +
                        `*3.* Piercing Íntimo\n` +
                        `*4.* Micropigmentação Labial\n` +
                        `*5.* Micropigmentação Sobrancelha\n` +
                        `*6.* Tatuagem (Em breve)\n\n` +
                        `${SEPARATOR}\n_Digite o número ou *0* para voltar._`;
                    await sendMsg(aftercareMsg);
                    await setState({ state: 'SELECT_AFTERCARE' });
                    break;
                }

                default:
                    await sendMsg('Opção inválida. Digite o número da opção desejada (1 a 6).');
            }
            return;
        }

        // ── ETAPA 0: Escolha da categoria ──
        if (currentState === 'SELECT_CATEGORY') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }

            const categories = rawState.categories || [];
            const servicos = rawState.servicos || [];
            const idx = parseInt(incomingText) - 1;
            const category = categories[idx];

            if (!category) {
                await sendMsg('Categoria inválida. Digite o número da opção ou *0* para voltar.');
                return;
            }

            // Caso especial: Unhas para Dyoli
            if (config.id === 'dyoli' && category === 'Unhas') {
                await sendMsg(`💅 *UNHAS - Zelia Kad*\n\nPara agendar serviços de unhas, por favor entre em contato diretamente com a Zelia no link abaixo:\n\nhttps://wa.me/554899171918`);
                await setState({ state: 'START' });
                return;
            }

            const filteredServices = servicos.filter((s: any) => (s.categoria || 'Outros') === category);
            
            let listMsg = `✨ *${category.toUpperCase()}* ✨\n\n${SEPARATOR}\n`;
            filteredServices.forEach((s: any, i: number) => {
                const nome = s.nome || s.name || 'Procedimento';
                const valor = s.preco || s.price || 0;
                const precoFormatado = parseFloat(valor).toFixed(2).replace('.', ',');
                listMsg += `*${i+1}.* ${nome} — R$ ${precoFormatado}\n`;
            });

            listMsg += `\n${SEPARATOR}\n_Digite o número do procedimento ou *0* para voltar._`;
            await setState({ state: 'SELECT_SERVICE', servicos: filteredServices, categories, allServices: servicos });
            await sendMsg(listMsg);
            return;
        }

        // ── ETAPA 1: Escolha do serviço ──
        if (currentState === 'SELECT_SERVICE') {
            if (incomingText === '0') { 
                // Se veio de categorias, volta para categorias
                if (rawState.categories && rawState.allServices) {
                    let listMsg = `✨ *CATEGORIAS* ✨\n\n${SEPARATOR}\n`;
                    rawState.categories.forEach((cat: string, i: number) => {
                        listMsg += `*${i+1}.* ${cat}\n`;
                    });
                    listMsg += `\n${SEPARATOR}\n_Digite o número da categoria ou *0* para voltar._`;
                    await setState({ state: 'SELECT_CATEGORY', categories: rawState.categories, servicos: rawState.allServices });
                    await sendMsg(listMsg);
                    return;
                }
                await setState({ state: 'START' }); 
                return; 
            }
            
            const servicos = rawState.servicos || [];

            const idx = parseInt(incomingText) - 1;
            const servico = servicos[idx];
            if (!servico) {
                await sendMsg('Serviço inválido. Digite o número da opção ou *0* para voltar.');
                return;
            }

            // Fluxo de Tatuagem para Dyoli (Julie) - Ficha de Anamnese e Detalhes
            if (config.id === 'dyoli' && (servico.categoria === 'Tatuagens' || servico.category === 'Tatuagens')) {
                await sendMsg(
                    `🎨 *TATUAGEM - Dyoli Godim*\n\n` +
                    `Que legal que você tem interesse em uma tatuagem! 💖\n\n` +
                    `Antes de continuarmos, precisamos preencher uma rápida *ficha de anamnese* por segurança.\n\n` +
                    `📝 *Ficha de Anamnese:*\n` +
                    `Você possui alguma alergia, problema de saúde, doença crônica ou faz uso de medicamentos contínuos?\n\n` +
                    `_Por favor, descreva abaixo ou digite "Não" para prosseguir._`
                );
                await setState({ state: 'TATTOO_ANAMNESE', servico });
                return;
            }

            const nome = servico.nome || servico.name || 'Procedimento';
            const valor = servico.preco || servico.price || 0;
            const preco = parseFloat(valor).toFixed(2).replace('.', ',');

            await sendMsg(
                `✨ *${nome.toUpperCase()}*\n` +
                `💰 Valor: R$ ${preco}\n\n` +
                `${SEPARATOR}\n\n` +
                `📅 Para qual *data* você quer agendar?\n\n` +
                `Digite no formato *DD/MM* (ex: 10/05)\n` +
                `ou responda *Hoje* ou *Amanhã*.\n\n` +
                `_Digite *0* para voltar._`
            );
            await setState({ state: 'SELECT_DATE', servico });
            return;
        }

        // ── ETAPA 2: Escolha da data ──
        if (currentState === 'SELECT_DATE') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }

            let dataBR = incomingText.trim();
            let dataISO = '';
            const hoje = new Date();

            // Helper para formatar data local (Brasil) sem fuso
            const getBrazilDate = (d: Date) => {
                // Formata para YYYY-MM-DD no fuso de SP (en-CA retorna YYYY-MM-DD)
                const iso = d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
                const [y, m, day] = iso.split('-');
                return { iso, br: `${day}/${m}` };
            };

            if (dataBR.toLowerCase() === 'hoje') {
                const res = getBrazilDate(hoje);
                dataISO = res.iso;
                dataBR = res.br;
            } else if (dataBR.toLowerCase() === 'amanhã' || dataBR.toLowerCase() === 'amanha') {
                const amanha = new Date(hoje);
                amanha.setDate(hoje.getDate() + 1);
                const res = getBrazilDate(amanha);
                dataISO = res.iso;
                dataBR = res.br;
            } else {
                // Aceita DD/MM ou DD/MM/YYYY
                const match = dataBR.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
                if (!match || !match[1] || !match[2]) {
                    await sendMsg('Data inválida. Digite no formato *DD/MM* (ex: 10/05), *Hoje* ou *Amanhã*.');
                    return;
                }
                const dia = match[1].padStart(2, '0');
                const mes = match[2].padStart(2, '0');
                const ano = match[3] || hoje.getFullYear().toString();
                dataISO = `${ano}-${mes}-${dia}`;
                dataBR = `${dia}/${mes}`;
            }

            await sendMsg(`Buscando horários disponíveis para *${dataBR}*... ⏳`);
            try {
                if (!rawState.servico?.id) {
                    await sendMsg('Erro: Serviço não identificado. Por favor, recomece o agendamento.');
                    await setState({ state: 'START' });
                    return;
                }
                
                let horarios: string[] = [];
                try {
                    const res = await lovable.horariosDisponiveis(rawState.servico.id, dataISO);
                    console.log(`[🔎 ${config.id}] Horários para ${dataISO}:`, JSON.stringify(res));
                    const hRaw = Array.isArray(res) ? res : (res.horarios_disponiveis || res.horarios || res.servicos || res.data || []);

                    horarios = (Array.isArray(hRaw) ? hRaw : []).map(h => {
                        if (typeof h === 'string') return h;
                        return h.horario || h.hora || String(h);
                    });

                    console.log(`[🔎 ${config.id}] Horários processados:`, horarios.length, horarios);
                } catch (fnErr: any) {
                    console.error(`[❌ ${config.id}] Função bot-horarios falhou:`, fnErr.message || fnErr);
                    console.log('Função bot-horarios falhou, calculando via banco...');
                    // Fallback: Busca horas de funcionamento e agendamentos existentes
                    const targetDate = new Date(dataISO + 'T12:00:00');
                    const weekday = targetDate.getDay();

                    const { data: bHours } = await (sock as any).supabase
                        .from('business_hours')
                        .select('*')
                        .eq('weekday', weekday)
                        .single();

                    if (!bHours || bHours.closed) {
                        horarios = [];
                    } else {
                        // Gera horários de hora em hora
                        const start = parseInt(bHours.open_time.split(':')[0]);
                        const end = parseInt(bHours.close_time.split(':')[0]);
                        let possibleSlots = [];
                        for (let h = start; h < end; h++) {
                            possibleSlots.push(`${String(h).padStart(2, '0')}:00`);
                        }

                        // Busca agendamentos do dia
                        const { data: appointments } = await (sock as any).supabase
                            .from('appointments')
                            .select('time')
                            .eq('date', dataISO)
                            .neq('status', 'cancelado');

                        const takenTimes = (appointments || []).map((a: any) => a.time);
                        horarios = possibleSlots.filter(s => !takenTimes.includes(s));
                    }
                }

                if (!horarios || horarios.length === 0) {
                    await sendMsg(
                        `😔 Não há horários disponíveis para *${dataBR}*.\n\n` +
                        `Digite outra data ou *0* para voltar ao menu.`
                    );
                    return;
                }

                let horariosMsg = `🕐 *HORÁRIOS DISPONÍVEIS — ${dataBR}*\n\n${SEPARATOR}\n`;
                horarios.forEach((hora: string, i: number) => {
                    horariosMsg += `*${i+1}.* ${hora}\n`;
                });
                horariosMsg += `\n${SEPARATOR}\n_Digite o número do horário ou *0* para mudar a data._`;

                await setState({ ...rawState, state: 'SELECT_TIME', dataISO, dataBR, horarios });
                await sendMsg(horariosMsg);
            } catch (err: any) {
                console.error('Erro ao buscar horários:', err);
                await sendMsg(`Erro ao buscar horários. Tente novamente ou escolha outra data.`);
            }
            return;
        }

        // ── ETAPA 3: Escolha do horário → Resumo do agendamento ──
        if (currentState === 'SELECT_TIME') {
            if (incomingText === '0') {
                await sendMsg(
                    `📅 Para qual *data* você quer agendar?\n\n` +
                    `Digite no formato *DD/MM* ou *Hoje* / *Amanhã*.\n\n` +
                    `_Digite *0* para voltar ao menu._`
                );
                await setState({ ...rawState, state: 'SELECT_DATE' });
                return;
            }

            const idx = parseInt(incomingText) - 1;
            const horarioSelecionado = rawState.horarios?.[idx];
            if (horarioSelecionado === undefined || horarioSelecionado === null || isNaN(idx)) {
                await sendMsg('Horário inválido. Digite o número ou *0* para mudar a data.');
                return;
            }

            const hora = typeof horarioSelecionado === 'string'
                ? horarioSelecionado
                : (horarioSelecionado.horario || horarioSelecionado.hora || String(horarioSelecionado));

            const servico = rawState.servico;
            const nome = servico.nome || servico.name || 'Procedimento';
            const valor = servico.preco || servico.price || 0;
            const preco = parseFloat(valor).toFixed(2).replace('.', ',');

            await sendMsg(
                `✅ *RESUMO DO AGENDAMENTO*\n\n${SEPARATOR}\n\n` +
                `🎨 *Serviço:* ${nome}\n` +
                `📅 *Data:* ${rawState.dataBR}\n` +
                `🕐 *Horário:* ${hora}\n` +
                `💰 *Valor:* R$ ${preco}\n\n` +
                `${SEPARATOR}\n\n` +
                `Para prosseguir, me diga seu *nome completo*:\n` +
                `_(ou *0* para cancelar)_`
            );

            await setState({ ...rawState, state: 'GET_NAME', hora });
            return;
        }

        // ── ETAPA 4: Coleta nome e pergunta CPF ──
        if (currentState === 'GET_NAME') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }

            const nome = incomingText.trim();
            const { servico, dataISO, dataBR, hora } = rawState;

            if (nome.length < 3) {
                await sendMsg('Por favor, informe seu *nome completo*.');
                return;
            }

            await sendMsg(
                `Perfeito, ${nome}! Agora, por favor, me informe o seu *CPF* (apenas números) para podermos gerar a chave PIX do seu agendamento.\n\n` +
                `_Digite *0* para cancelar._`
            );

            await setState({ ...rawState, state: 'GET_CPF', nome });
            return;
        }

        // ── ETAPA 4.1: Coleta CPF e pergunta forma de pagamento ──
        if (currentState === 'GET_CPF') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }

            let cpf = incomingText.replace(/\D/g, '');
            if (cpf.length !== 11) {
                await sendMsg('CPF inválido. Por favor, digite apenas os 11 números do seu CPF.');
                return;
            }

            const { servico, nome } = rawState;
            const valorTotal = parseFloat(servico.preco || servico.price || 0);
            const sinal = (valorTotal * 0.2).toFixed(2).replace('.', ',');
            const total = valorTotal.toFixed(2).replace('.', ',');

            await sendMsg(
                `Ótimo! Para confirmar sua vaga, precisamos que você realize o pagamento via PIX.\n\n` +
                `Como você prefere pagar?\n\n` +
                `*1.* Sinal de 20% (R$ ${sinal}) e o restante no dia.\n` +
                `*2.* Valor Total (R$ ${total}).\n\n` +
                `_Digite *1* ou *2*, ou *0* para cancelar._`
            );

            await setState({ ...rawState, state: 'SELECT_PAYMENT_TYPE', cpf });
            return;
        }

        // ── ETAPA 5: Seleciona pagamento e gera PIX ──
        if (currentState === 'SELECT_PAYMENT_TYPE') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }

            if (incomingText !== '1' && incomingText !== '2') {
                await sendMsg('Por favor, digite *1* para Sinal (20%) ou *2* para Valor Total.');
                return;
            }

            const { servico, dataISO, dataBR, hora, nome } = rawState;
            const valorTotal = parseFloat(servico.preco || servico.price || 0);
            const valorCobrado = incomingText === '1' ? valorTotal * 0.2 : valorTotal;

            if (!config.mercadopagoAccessToken) {
                await sendMsg("⚠️ Este estúdio ainda não configurou os pagamentos online. Seu agendamento será concluído com pagamento no local.");
                
                // Concluir igual antes sem pagar se não tiver token
                try {
                    const whatsapp = userPhone;
                    const { error: dbErr } = await (sock as any).supabase
                        .from('appointments')
                        .insert([{
                            customer_whatsapp: whatsapp,
                            customer_name: nome,
                            service_id: servico.id,
                            date: dataISO,
                            time: hora,
                            status: 'confirmado',
                            payment_method: 'recepcao',
                            amount: valorCobrado,
                            total_amount: valorTotal
                        }]);

                    const msgSucesso = `✅ *AGENDAMENTO CONFIRMADO!*\n\n${SEPARATOR}\n\n` +
                        `Tudo certo, *${nome}*!\nSeu horário está reservado:\n\n` +
                        `✂️ *Serviço:* ${servico.nome || servico.name}\n📅 *Data:* ${dataBR}\n🕐 *Horário:* ${hora}\n💰 *Valor:* R$ ${valorTotal.toFixed(2).replace('.', ',')}\n\n` +
                        `${SEPARATOR}\n_Te esperamos no estúdio! ✨_`;

                    await sendMsg(msgSucesso);
                    await setState({ state: 'START' });
                } catch (e) {
                    await sendMsg('Erro ao finalizar agendamento. Tente novamente.');
                    await setState({ state: 'START' });
                }
                return;
            }

            await sendMsg(`Gerando seu PIX Copia e Cola no valor de *R$ ${valorCobrado.toFixed(2).replace('.', ',')}*... Aguarde ⏳`);

            try {
                const { MercadoPagoConfig, Payment } = await import('mercadopago');
                const clientMP = new MercadoPagoConfig({ accessToken: config.mercadopagoAccessToken });
                const payment = new Payment(clientMP);

                const external_reference = `AGEN_${config.id}_${Date.now()}`;

                const [first_name, ...last_name_arr] = rawState.nome.split(' ');
                const last_name = last_name_arr.join(' ') || 'Cliente';

                const body = {
                    transaction_amount: Number(valorCobrado.toFixed(2)),
                    description: `Agendamento - ${config.name}`,
                    payment_method_id: 'pix',
                    external_reference,
                    payer: { 
                        email: 'binarioscompany@gmail.com',
                        first_name: first_name,
                        last_name: last_name,
                        identification: {
                            type: 'CPF',
                            number: rawState.cpf
                        }
                    }
                };

                // Log para verificar se o token está carregando (mostra só o início por segurança)
                const tokenCheck = config.mercadopagoAccessToken ? `${config.mercadopagoAccessToken.substring(0, 15)}...` : 'NÃO CARREGADO';
                console.log(`[📨 MP REQ ${config.id}] Token: ${tokenCheck} | Body:`, JSON.stringify(body));

                const resposta = await payment.create({ 
                    body,
                    requestOptions: { idempotencyKey: `idemp-${Date.now()}` }
                });

                const copiaECola = resposta.point_of_interaction?.transaction_data?.qr_code;

                await sendMsg(
                    `✅ PIX Gerado com sucesso!\n\n` +
                    `Copie o código abaixo e cole no seu banco (PIX Copia e Cola) para realizar o pagamento. ` +
                    `Assim que for confirmado, seu agendamento será efetivado automaticamente.\n\n` +
                    `_Você tem 10 minutos para pagar. Se desistir, digite *0*._`
                );
                
                if (copiaECola) {
                    await sendMsg(copiaECola);
                }

                // Salvar agendamento como pendente
                const whatsapp = userPhone;
                // Tenta salvar na master, senao vai na local
                const apptData = {
                    instance_slug: config.id,
                    customer_whatsapp: whatsapp,
                    customer_name: nome,
                    service_id: servico.id,
                    date: dataISO,
                    time: hora,
                    status: 'pendente', // IMPORTANTE
                    payment_method: 'pix',
                    amount: valorCobrado,
                    total_amount: valorTotal,
                    external_reference: external_reference
                };

                const { error: dbErr } = await masterSupabase.from('appointments').insert([apptData]);
                if (dbErr) {
                    console.warn(`[⚠️ ${config.id}] Falha ao salvar na master (${dbErr.message}). Salvando no local...`);
                    // Fallback se não tiver master (pra instâncias não migradas)
                    const { instance_slug: _, ...localApptData } = apptData;
                    await (sock as any).supabase.from('appointments').insert([localApptData]);
                }

                await setState({ ...rawState, state: 'AWAITING_PAYMENT', payment_id: resposta.id, external_reference, valorPagamento: valorCobrado });

            } catch (err: any) {
                // Log detalhado para diagnóstico
                const errMsg = err?.message || String(err);
                const errCause = err?.cause?.message || '';
                const errStatus = err?.status || err?.statusCode || '';
                const errBody = JSON.stringify(err?.cause || err?.response || {});
                console.error(`[❌ PIX ERRO ${config.id}] status=${errStatus} msg="${errMsg}" cause="${errCause}" body=${errBody}`);
                await sendMsg(`Desculpe, ocorreu um erro ao gerar o PIX. Tente novamente mais tarde.\n\n_Código: ${errMsg.substring(0, 80)}_`);
                await setState({ state: 'START' });
            }
            return;
        }

        // ── ETAPA 6: Aguardando Pagamento ──
        if (currentState === 'AWAITING_PAYMENT') {
            if (incomingText === '0') {
                await sendMsg("Agendamento cancelado com sucesso.");
                await setState({ state: 'START' });
                return;
            }
            await sendMsg("⏳ Estamos aguardando a confirmação do seu pagamento.\nSe já pagou, o sistema confirmará automaticamente em alguns instantes.\n\nPara cancelar o agendamento, digite *0*.");
            return;
        }

        // ── Seleção de Cuidados Pós-Procedimento (PDF) ──
        if (currentState === 'SELECT_AFTERCARE') {
            if (incomingText === '0') {
                await setState({ state: 'START' });
                await sendMsg(getWelcomeMessage());
                await setState({ state: 'MENU' });
                return;
            }

            switch (incomingText) {
                case '1': {
                    await sendMsg("Gerando o guia de *Reconstrução de lóbulo com TCA*... Aguarde um instante. 📄");
                    await sendDoc(
                        "https://www.dropbox.com/scl/fi/1sbrkz0gwhh0rf60bn496/cuidados_tca_dyoli.pdf?rlkey=tqq8us61phzbjw34x4zzopp3h&st=11cxp73t&dl=1",
                        "Cuidados_Reconstrucao_Lobulo_TCA.pdf"
                    );
                    await sendMsg("Acabei de enviar o PDF acima! 🌸\n\nPrecisa de mais algum guia? Se não, digite *0* para voltar.");
                    break;
                }
                case '2': {
                    await sendMsg("Gerando o guia de *Piercing / Perfuração*... Aguarde um instante. 📄");
                    await sendDoc(
                        "https://www.dropbox.com/scl/fi/rf5xguudfledflhi5mv11/Recomenda-es-Piercing.pdf?rlkey=07fyqkt4akypg6m42b8jmkdbv&st=yevutw9x&dl=1",
                        "Guia_Pos_Piercing.pdf"
                    );
                    await sendMsg("Acabei de enviar o PDF acima! 🌸\n\nPrecisa de mais algum guia? Se não, digite *0* para voltar.");
                    break;
                }
                case '3': {
                    await sendMsg("Gerando o guia de *Piercing Íntimo*... Aguarde um instante. 📄");
                    await sendDoc(
                        "https://www.dropbox.com/scl/fi/qeoj1wkqf9cqxoregwptc/Recomenda-es-Piercing-ntimo.pdf?rlkey=sm8hdyahfwfqfej2v357sg5ck&st=yv94z72x&dl=1",
                        "Guia_Pos_Piercing_Intimo.pdf"
                    );
                    await sendMsg("Acabei de enviar o PDF acima! 🌸\n\nPrecisa de mais algum guia? Se não, digite *0* para voltar.");
                    break;
                }
                case '4': {
                    await sendMsg("Gerando o guia de *Micropigmentação Labial*... Aguarde um instante. 📄");
                    await sendDoc(
                        "https://www.dropbox.com/scl/fi/trt0a5zbdm2orinl6qoyy/Recomenda-es-Micropgmenta-o-Labial.pdf?rlkey=vjwxmirk424s5kf0b02v1pxzs&st=xe65qslk&dl=1",
                        "Guia_Micropigmentacao_Labial.pdf"
                    );
                    await sendMsg("Acabei de enviar o PDF acima! 🌸\n\nPrecisa de mais algum guia? Se não, digite *0* para voltar.");
                    break;
                }
                case '5': {
                    await sendMsg("Gerando o guia de *Micropigmentação Sobrancelha*... Aguarde um instante. 📄");
                    await sendDoc(
                        "https://www.dropbox.com/scl/fi/392frpc2seqh1kr4old1x/Recomenda-es-Micropgmenta-o-Sobrancelha.pdf?rlkey=qewe525xboxxziuta06tm7zaa&st=6ei8avzt&dl=1",
                        "Guia_Micropigmentacao_Sobrancelha.pdf"
                    );
                    await sendMsg("Acabei de enviar o PDF acima! 🌸\n\nPrecisa de mais algum guia? Se não, digite *0* para voltar.");
                    break;
                }
                case '6': {
                    await sendMsg("Este guia de Tatuagem ainda está sendo preparado pela nossa equipe e estará disponível em breve! ⏳\n\nEscolha outra opção ou digite *0* para voltar.");
                    break;
                }
                default:
                    await sendMsg("Opção inválida. Digite o número correspondente ou *0* para voltar.");
            }
            return;
        }

        // ── Fluxo de Tatuagem: Anamnese ──
        if (currentState === 'TATTOO_ANAMNESE') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }
            
            // Salva a resposta da anamnese e pede os detalhes da tattoo
            await setState({ ...rawState, state: 'TATTOO_DETAILS', anamnese: incomingText });
            await sendMsg(
                `Obrigado pelas informações! ✅\n\n` +
                `Agora, por favor, *descreva a tatuagem* que você deseja (ideia, local do corpo, tamanho aproximado) e, se possível, envie uma ou mais *fotos de referência* aqui no chat.`
            );
            return;
        }

        // ── Fluxo de Tatuagem: Detalhes e Fotos ──
        if (currentState === 'TATTOO_DETAILS') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }

            const hasImage = !!(msg.message?.imageMessage || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage);
            
            await sendMsg(
                `Perfeito! Recebemos seus detalhes ${hasImage ? 'e imagens ' : ''}com sucesso. ✨\n\n` +
                `A *Dyoli* já vai analisar tudo e te chamar aqui para combinarem os detalhes finais e passar o orçamento.\n\n` +
                `*Aguarde um instante!* ⏳`
            );
            
            // Transferência final para atendimento humano
            await setState({ state: 'WAITING_HUMAN' });
            return;
        }

        // ── Dúvidas e Cuidados (IA) ──
        if (currentState === 'AI_CHATTING') {
            if (incomingText === '0') {
                await setState({ state: 'START' });
                await sendMsg(getWelcomeMessage());
                await setState({ state: 'MENU' });
                return;
            }

            // Simple FAQ keyword matching
            let bestMatch = null;
            let highestScore = 0;
            const faqs = config.faq || [];
            
            if (faqs.length > 0) {
                const userWords = incomingText.toLowerCase().split(/\s+/);
                
                faqs.forEach(faq => {
                    const qWords = faq.question.toLowerCase().split(/\s+/);
                    let score = 0;
                    userWords.forEach(uw => {
                        if (uw.length > 3 && faq.question.toLowerCase().includes(uw)) score++;
                    });
                    if (score > highestScore) {
                        highestScore = score;
                        bestMatch = faq;
                    }
                });
            }

            if (bestMatch && highestScore > 0) {
                await sendMsg(`${bestMatch.answer}\n\n${SEPARATOR}\n_Mais alguma dúvida? Digite ou envie *0* para voltar._`);
            } else {
                await sendMsg(`Poxa, não entendi muito bem. Você pode tentar perguntar de outra forma ou enviar *0* para voltar ao menu.`);
            }
            return;
        }

        // ── Aguardando atendimento humano — silêncio ──
        if (currentState === 'WAITING_HUMAN') {
            return;
        }

        } catch (handlerErr: any) {
            console.error(`[💥 ${config.id}] ERRO CRÍTICO no handler de mensagens:`, handlerErr?.message || handlerErr);
            console.error(handlerErr?.stack || '');
        }
    });
}

app.get('/api/status', async (req, res) => {
    const isConnected = !!globalSock?.user;
    let qrBase64 = '';
    if (latestQR && !isConnected) {
        try { 
            qrBase64 = await QRCode.toDataURL(latestQR, { 
                scale: 12, 
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#ffffff'
                }
            }); 
        } catch (err) {}
    }
    res.json({ 
        status: isConnected ? 'CONNECTED' : (latestQR ? 'QR_READY' : 'CONNECTING'), 
        qr: latestQR,
        code: latestQR,
        qrcode: qrBase64,
        qrCode: qrBase64,
        qr_code: qrBase64,
        image: qrBase64,
        pairingCodeEnabled: true
    });
});

app.post('/api/logout', async (req, res) => {
    try {
        console.log(`[🔌 ${config.id}] Recebido pedido de logout remoto...`);
        
        // Se já estiver deslogado, nem tenta o logout do Baileys para evitar erro
        if (globalSock) {
            try {
                // Se não houver usuário, provavelmente já está deslogado
                if (globalSock.user) {
                    await globalSock.logout();
                } else {
                    console.log(`[🔌 ${config.id}] Socket existe mas sem usuário. Ignorando logout do Baileys.`);
                }
            } catch (logoutErr: any) {
                console.warn(`[⚠️ ${config.id}] Erro ao tentar logout do Baileys (provavelmente já desconectado):`, logoutErr.message);
            }
        }
        
        // Remove a pasta da sessão para garantir limpeza total
        const sessionPath = path.resolve(config.sessionFolder || `sessions/${config.id}`);
        try {
            if (fs.existsSync(sessionPath)) {
                console.log(`[🧹 ${config.id}] Removendo pasta da sessão: ${sessionPath}`);
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        } catch (rmErr: any) {
            console.error(`[❌ ${config.id}] Erro ao remover pasta da sessão:`, rmErr.message);
            // No Windows, às vezes o arquivo está preso. Vamos tentar renomear se falhar? 
            // Por enquanto só logamos, pois o process.exit(0) deve liberar os handles.
        }

        res.json({ success: true, message: 'Desconectado com sucesso. Reiniciando...' });
        
        // Pequeno delay para responder e depois reiniciar
        setTimeout(() => {
            console.log(`[🔄 ${config.id}] Reiniciando processo...`);
            process.exit(0); // O PM2 ou script de loop vai reiniciar
        }, 1500);

    } catch (err: any) {
        console.error(`[💥 ${config.id}] Erro no endpoint de logout:`, err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(config.port, () => { console.log(`[🌐 ${config.id}] Porta ${config.port}`); });
connectToWhatsApp();
