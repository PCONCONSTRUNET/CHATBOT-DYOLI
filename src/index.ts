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
    const token = req.headers['x-webhook-token'] || req.body.token || req.query.token || bearerToken;

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

app.get('/api/status', async (req, res) => {
    const isConnected = !!globalSock?.user;
    let qrBase64 = '';
    if (latestQR && !isConnected) {
        try { qrBase64 = await QRCode.toDataURL(latestQR); } catch (err) {}
    }
    res.json({ 
        status: isConnected ? 'CONNECTED' : (latestQR ? 'QR_READY' : 'WAITING'), 
        qr: latestQR,
        code: latestQR,
        qrcode: qrBase64,
        pairingCodeEnabled: true
    });
});

app.post('/api/pair', async (req, res) => {
    const phone = req.body.phone as string;
    if (!phone) return res.status(400).json({ erro: 'Telefone não fornecido' });
    if (!globalSock) return res.status(503).json({ erro: 'Bot não inicializado' });
    
    try {
        const code = await globalSock.requestPairingCode(phone.replace(/\D/g, ''));
        res.json({ code });
    } catch (err: any) {
        res.status(500).json({ erro: err.message });
    }
});

app.post('/api/logout', authMiddleware, async (req, res) => {
    try {
        if (globalSock) {
            await globalSock.logout();
            globalSock = null;
            res.json({ sucesso: true });
        } else {
            res.status(400).json({ erro: 'Bot já desconectado' });
        }
    } catch (err: any) { res.status(500).json({ erro: err.message }); }
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
    });

    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    (sock as any).supabase = supabase;

    // Função auxiliar para enviar mensagem com "falso digitando"
    const sendWithTyping = async (jid: string, content: any, options: any = {}) => {
        try {
            await sock.sendPresenceUpdate('composing', jid);
            await delay(500);
            await sock.sendPresenceUpdate('composing', jid);
            
            const text = content.text || '';
            const typingTime = Math.max(2000, Math.min(text.length * 50, 4000));
            await delay(typingTime);
            
            await sock.sendPresenceUpdate('paused', jid);
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

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            latestQR = qr;
            console.log(`[📱 ${config.id}] QR Code pronto!`);
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') { 
            latestQR = ''; 
            console.log(`[✅ ${config.id}] Conectado!`); 
            if (!reminderInterval && sock) {
                reminderInterval = startReminders(config, sock);
            }
        }
        if (connection === 'close') {
            if (reminderInterval) {
                clearInterval(reminderInterval);
                reminderInterval = null;
            }
            
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`[🚪 ${config.id}] Logout detectado. Limpando sessão e reiniciando...`);
                const sessionPath = path.resolve(config.sessionFolder || `sessions/${config.id}`);
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log(`[🔄 ${config.id}] Conexão fechada (Motivo: ${statusCode}). Reconectando em 3s...`);
                setTimeout(connectToWhatsApp, 3000);
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        if (!m.messages || m.messages.length === 0) return;
        const msg = m.messages[0];
        if (!msg || !msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

        // Evita processar a mesma mensagem duas vezes
        const msgId = msg.key.id;
        if (!msgId) return;
        if (processedMessages.has(msgId)) return;
        processedMessages.add(msgId);
        setTimeout(() => processedMessages.delete(msgId!), 60000); // Limpa após 1 minuto
        
        const remoteJid = msg.key.remoteJid;
        if (!remoteJid) return;
        
        const incomingText = (msg.message.conversation || msg.message.extendedTextMessage?.text || '').trim();
        if (!incomingText) return;

        const stateKey = remoteJid;
        let rawState = await getPersistentState(stateKey);

        const setState = async (newState: any) => {
            await savePersistentState(stateKey, newState);
        };



        const sendMsg = async (text: string) => {
            if (sock && (sock as any).sendWithTyping) {
                await (sock as any).sendWithTyping(remoteJid, { text });
            }
        };

        const currentState = rawState.state;

        // ── Boas-vindas para saudações ou estado inicial ──
        const greetings = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'menu', 'voltar'];
        if (greetings.includes(incomingText.toLowerCase()) || currentState === 'START') {
            const welcome = config.messages?.welcome || `Bem-vindo à ${config.name}!`;
            await sendMsg(formatMsg(welcome, { empresa: config.name, servicos_extra: config.welcomeExtra }));
            await setState({ state: 'MENU' });
            return;
        }

        // ── MENU PRINCIPAL ──
        if (currentState === 'MENU') {
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
                            servicos = res.data || res.services || (Array.isArray(res) ? res : []);
                        } catch (fnErr) {
                            console.log('Função bot-servicos falhou ou 404, tentando busca direta no banco...');
                            const { data: dbServices, error: dbErr } = await (sock as any).supabase
                                .from('services')
                                .select('*')
                                .eq('active', true);
                            
                            if (dbErr) throw dbErr;
                            servicos = dbServices || [];
                        }
                        
                        if (servicos.length === 0) {
                            await sendMsg('Desculpe, não encontrei nenhum procedimento disponível no momento. 😔');
                            await setState({ state: 'START' });
                            return;
                        }

                        let listMsg = `✨ *PROCEDIMENTOS* ✨\n\n${SEPARATOR}\n`;
                        servicos.forEach((s: any, i: number) => {
                            const nome = s.nome || s.name || 'Procedimento';
                            const valor = s.preco || s.price || 0;
                            const precoFormatado = parseFloat(valor).toFixed(2).replace('.', ',');
                            listMsg += `*${i+1}.* ${nome} — R$ ${precoFormatado}\n`;
                        });
                        listMsg += `\n${SEPARATOR}\n_Digite o número do procedimento ou *0* para voltar._`;
                        await setState({ state: 'SELECT_SERVICE', servicos });
                        await sendMsg(listMsg);
                    } catch (err) {
                        console.error('Erro ao listar serviços:', err);
                        await sendMsg('Erro ao buscar serviços. Tente novamente mais tarde.');
                    }
                    break;
                }

                case '3': { // Ver meus agendamentos
                    try {
                        const phone = remoteJid.replace(/\D/g, '');
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

                case '5': { // Dúvidas e Cuidados (IA)
                    await sendMsg(`Opa! Pode mandar sua dúvida sobre os procedimentos ou cuidados pós-sessão que eu te ajudo! 🤖✨`);
                    await setState({ state: 'AI_CHATTING' });
                    break;
                }

                case '6': { // Agendamento simplificado
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

                default:
                    await sendMsg('Opção inválida. Digite o número da opção desejada (1 a 6).');
            }
            return;
        }

        // ── ETAPA 1: Escolha do serviço ──
        if (currentState === 'SELECT_SERVICE') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }
            const idx = parseInt(incomingText) - 1;
            const servico = rawState.servicos?.[idx];
            if (!servico) {
                await sendMsg('Serviço inválido. Digite o número da opção ou *0* para voltar.');
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
                    const horariosRaw: any[] = Array.isArray(res) ? res : (res.data || res.horarios || []);

                    // Filtrar apenas horários disponíveis
                    horarios = horariosRaw.filter(h => {
                        if (typeof h === 'string') return true;
                        if (h.disponivel === false) return false;
                        if (h.ocupado === true) return false;
                        if (h.status && (h.status === 'ocupado' || h.status === 'bloqueado')) return false;
                        return true;
                    }).map(h => typeof h === 'string' ? h : (h.horario || h.hora || String(h)));
                } catch (fnErr) {
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
                `💰 *Valor:* R$ ${preco}\n` +
                `💵 *Pagamento:* Na recepção\n\n` +
                `${SEPARATOR}\n\n` +
                `Para confirmar, me diga seu *nome completo*:\n` +
                `_(ou *0* para cancelar)_`
            );

            await setState({ ...rawState, state: 'GET_NAME', hora });
            return;
        }

        // ── ETAPA 4: Coleta nome e cria o agendamento ──
        if (currentState === 'GET_NAME') {
            if (incomingText === '0') { await setState({ state: 'START' }); return; }

            const nome = incomingText.trim();
            const { servico, dataISO, dataBR, hora } = rawState;

            if (nome.length < 3) {
                await sendMsg('Por favor, informe seu *nome completo*.');
                return;
            }

            await sendMsg(`Processando seu agendamento, aguarde... ⏳`);

            try {
                const whatsapp = remoteJid.replace(/\D/g, '');
                
                try {
                    await lovable.agendar({
                        whatsapp,
                        nome,
                        servico_id: servico.id,
                        data: dataISO,
                        horario: hora,
                        forma_pagamento: 'recepcao'
                    });
                } catch (fnErr) {
                    console.log('Função bot-agendar falhou, inserindo direto no banco...');
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
                            amount: servico.preco || servico.price || 0,
                            total_amount: servico.preco || servico.price || 0
                        }]);
                    
                    if (dbErr) throw dbErr;
                }

                const msgSucesso = formatMsg(config.messages?.appointmentConfirmed || 
                    `✅ *AGENDAMENTO CONFIRMADO!*\n\n${SEPARATOR}\n\n` +
                    `Tudo certo, *{NOME}*!\nSeu horário está reservado:\n\n` +
                    `✂️ *Serviço:* {SERVICO}\n📅 *Data:* {DATA}\n🕐 *Horário:* {HORA}\n💰 *Valor:* R$ {VALOR}\n\n` +
                    `${SEPARATOR}\n_Te esperamos no estúdio! ✨_`, {
                    nome,
                    cliente: nome,
                    servico: servico.nome || servico.name,
                    data: dataBR,
                    hora: hora,
                    valor: parseFloat(servico.preco || servico.price || 0).toFixed(2).replace('.', ',')
                });

                await sendMsg(msgSucesso);
                await setState({ state: 'START' });
                return;
            } catch (err) {
                console.error('Erro ao agendar:', err);
                await sendMsg('Desculpe, ocorreu um erro ao finalizar seu agendamento. Por favor, tente novamente mais tarde ou fale com um atendente.');
                await setState({ state: 'START' });
                return;
            }
        }

        // ── Aguardando atendimento humano — silêncio ──
        if (currentState === 'WAITING_HUMAN') {
            return;
        }
    });
}

app.get('/api/status', (req, res) => {
    res.json({ 
        status: globalSock ? (globalSock.user ? 'CONNECTED' : (latestQR ? 'QR_READY' : 'CONNECTING')) : 'DISCONNECTED',
        qr: latestQR 
    });
});

app.post('/api/logout', async (req, res) => {
    try {
        console.log(`[🔌 ${config.id}] Recebido pedido de logout remoto...`);
        if (globalSock) {
            await globalSock.logout();
        }
        
        // Remove a pasta da sessão para garantir limpeza total
        const sessionPath = config.sessionFolder || `sessions/${config.id}`;
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }

        res.json({ success: true, message: 'Desconectado com sucesso. Reiniciando...' });
        
        // Pequeno delay para responder e depois reiniciar
        setTimeout(() => {
            process.exit(0); // O PM2 vai reiniciar automaticamente
        }, 1000);

    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.listen(config.port, () => { console.log(`[🌐 ${config.id}] Porta ${config.port}`); });
connectToWhatsApp();
