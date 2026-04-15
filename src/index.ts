import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';

// Inicializa o banco de dados caso as chaves existam no .env
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import express from 'express';
import fs from 'fs';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running! 🚀');
});

app.listen(port, () => {
    console.log(`[HealthCheck] Servidor ouvindo na porta ${port}`);
});


async function connectToWhatsApp() {
    // Salva o estado da autenticação (credenciais) em uma pasta local
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    // Busca a versão mais recente do WhatsApp Web para não ser bloqueado (Erro 405)
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        // Silenciando os logs gigantescos
        logger: pino({ level: 'silent' }) as any,
        // Evita bloqueio do WhatsApp ('Status 405') mascarando como um navegador real
        browser: Browsers.macOS('Desktop'),
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        const phoneNumber = process.env.PHONE_NUMBER;
        
        if (qr) {
            if (!phoneNumber) {
                console.log('📱 Escaneie o QR Code abaixo no WhatsApp (Dispositivos Conectados):');
                qrcode.generate(qr, { small: true });
            } else {
                const cleanedNumber = phoneNumber.replace(/\D/g, '');
                console.log(`📡 Tentando gerar código para o número: ${cleanedNumber}`);
                try {
                    const code = await sock.requestPairingCode(cleanedNumber);
                    console.log('--------------------------------------------------');
                    console.log(`🔑 SEU CÓDIGO DE ACESSO: ${code}`);
                    console.log('--------------------------------------------------');
                } catch (err) {
                    console.error('Erro ao gerar código de pareamento:', err);
                }
            }
        }

        if (connection === 'close') {
            const error = lastDisconnect?.error as Boom;
            const statusCode = error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('🛑 Conexão fechada. Erro:', error?.message || 'Sem mensagem', 'Status:', statusCode);
            
            if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
                console.log('🧹 Limpando arquivos de sessão corrompidos e reiniciando...');
                const authPath = path.resolve('auth_info_baileys');
                try {
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                    }
                    console.log('✅ Limpeza concluída. Reiniciando...');
                } catch (err) {
                    console.error('Erro ao limpar pasta:', err);
                }
                process.exit(1); // Força o Railway a reiniciar o bot do zero
            }

            console.log('🔄 Reconectando:', shouldReconnect);
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 3000);
            } else {
                console.log('❌ Você foi desconectado permanentemente. Verifique seu número e tente novamente.');
            }
        } else if (connection === 'open') {
            console.log('✅ Bot conectado com sucesso e pronto para responder!');
        }
    });

    // Salva as credenciais recém-geradas automaticamente
    sock.ev.on('creds.update', saveCreds);

    // Função auxiliar para simular "digitando..." com delay
    const sendMsg = async (jid: string, content: any) => {
        await sock.sendPresenceUpdate('composing', jid);
        const delay = Math.min(Math.max(content.text ? content.text.length * 20 : 1500, 1500), 3000); 
        await new Promise(resolve => setTimeout(resolve, delay));
        await sock.sendPresenceUpdate('paused', jid);
        return await sock.sendMessage(jid, content);
    };

    // Estado do usuário para simular um menu de atendimento
    // Dica para produção: utilizar um banco de dados para salvar os estágios
    const userState: Record<string, any> = {};

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        if (!msg) return;

        // Ignora mensagens do bot, status e reações
        if (!msg.message || msg.key?.fromMe || msg.key?.remoteJid === 'status@broadcast' || msg.message?.reactionMessage) return;

        const remoteJid = msg.key?.remoteJid;
        if (!remoteJid) return;

        // Extrai o texto da mensagem de várias fontes possíveis (texto simples, mensagem estendida, legenda de imagem/vídeo)
        const incomingMessage = 
            msg.message?.conversation || 
            msg.message?.extendedTextMessage?.text || 
            msg.message?.imageMessage?.caption ||
            msg.message?.videoMessage?.caption ||
            "";
        
        if (!incomingMessage && !msg.message?.buttonsResponseMessage && !msg.message?.templateButtonReplyMessage) {
            console.log(`[👤 ${remoteJid}] Mensagem ignorada (tipo não suportado ou vazia)`);
            return;
        }

        const stateKey = remoteJid;
        const rawState = userState[stateKey] || 'START';
        const currentState = typeof rawState === 'string' ? rawState : rawState.state;

        console.log(`[👤 ${remoteJid}] Mensagem: "${incomingMessage}" | Estado atual: ${currentState}`);

        try {
            // Se estiver no início ou resetado, enviamos o Menu Principal
            if (currentState === 'START') {
                const welcomeText = `Fala! 👋 Eu sou o *Conny*, assistente aqui da equipe.\n\nVou te ajudar rapidinho, me diz o que você precisa:\n\n1️⃣ Fazer orçamento\n2️⃣ Nossos planos\n3️⃣ Consultar fatura\n4️⃣ Já sou cliente (suporte)\n5️⃣ Falar com especialista\n\n_Por favor, digite apenas o número da opção desejada._`;
                
                await sendMsg(remoteJid, { text: welcomeText });
                userState[stateKey] = 'MENU';
            } 
            else if (currentState === 'MENU') {
                // Checa qual número o usuário digitou
                switch (incomingMessage.trim()) {
                    case '1':
                        await sendMsg(remoteJid, { text: `📝 *Fazer Orçamento*\n\nLegal! Para agilizar seu orçamento, por favor me conte brevemente o que você precisa ou qual serviço tem interesse.` });
                        break;

                    case '2':
                        const planosText = `📦 *NOSSOS PLANOS P-CON*\n\nTemos a solução ideal para o seu negócio:\n\n` +
                                         `🔹 *P-CON BARBER ONE*\n` +
                                         `🔹 *P-CON NAILS ONE*\n` +
                                         `🔹 *P-CON CONTROL ONE*\n` +
                                         `🔹 *P-CON AUTO ONE*\n` +
                                         `🔹 *P-CON MOTO ONE*\n` +
                                         `🔹 *P-CON WEB ONE*\n` +
                                         `🔹 *P-CON SAAS ONE*\n` +
                                         `🔹 *P-CON STORE ONE*\n` +
                                         `🔹 *P-CON SOB MEDIDA*\n\n` +
                                         `👉 Digite *0* para voltar ao menu ou nos chame no suporte (opção 4) para detalhes de preços!`;
                        await sendMsg(remoteJid, { text: planosText });
                        break;

                    case '3':
                        await sendMsg(remoteJid, { text: `📄 *Consultar Fatura*\n\nPara consultar sua fatura, por favor informe o seu CPF/CNPJ (apenas números):` });
                        userState[stateKey] = 'WAITING_CPF';
                        break;

                    case '4':
                        await sendMsg(remoteJid, { text: `🎧 *Suporte ao Cliente*\n\nOlá! Em que podemos ajudar hoje? Descreva o seu problema ou dúvida que já vamos te atender.` });
                        userState[stateKey] = 'WAITING_HUMAN';
                        break;

                    case '5':
                        await sendMsg(remoteJid, { text: `👨‍💼 *Falar com Especialista*\n\nUm de nossos especialistas já vai entrar em contato com você. Por favor, aguarde um momento.` });
                        userState[stateKey] = 'WAITING_HUMAN';
                        break;

                    case '0':
                        userState[stateKey] = 'START';
                        await sendMsg(remoteJid, { text: `🔄 *Retornando ao menu principal...*` });
                        break;

                    default:
                        await sendMsg(remoteJid, { text: `⚠️ *Opção Inválida*\n\nPor favor, escolha uma das opções do menu (*1, 2, 3, 4* ou *5*).` });
                        break;
                }
            }
            else if (currentState === 'WAITING_CPF') {
                if (incomingMessage.trim() === '0') {
                    userState[stateKey] = 'START';
                    await sendMsg(remoteJid, { text: `Busca cancelada. Retornando ao menu principal...\n\n(Envie "Olá" para reabrir o menu)` });
                } else {
                    const cpfOrCnpj = incomingMessage.replace(/\D/g, ''); // Remove pontuação, deixa apenas os números
                    
                    if (cpfOrCnpj.length !== 11 && cpfOrCnpj.length !== 14) {
                        await sendMsg(remoteJid, { text: `Ops, isso não parece ser um documento válido de 11 ou 14 dígitos.\n\nPor favor, digite novamente apenas os números, ou envie *0* para cancelar e voltar.` });
                    } else {
                        await sendMsg(remoteJid, { text: `🔎 *Buscando faturas...*\n\nLocalizando registros para o documento *${cpfOrCnpj}*. Só um momento...` });
                        
                        if (!supabase) {
                            await sendMsg(remoteJid, { text: `❌ Erro de configuração no servidor. Por favor, tente mais tarde.` });
                            userState[stateKey] = 'START';
                            return;
                        }

                        // 1. Busca o cliente pelo documento (CPF/CNPJ)
                        const { data: client, error: clientErr } = await (supabase as any)
                            .from('clients')
                            .select('id, name, email')
                            .eq('document', cpfOrCnpj)
                            .single();

                        if (clientErr || !client) {
                            await sendMsg(remoteJid, { text: `❌ *Documento não encontrado*\n\nNão localizamos nenhum cliente com o documento *${cpfOrCnpj}* em nossa base.\n\nPor favor, verifique o número ou fale com nosso suporte (Opção 5).` });
                            userState[stateKey] = 'START';
                        } else {
                            // 2. Busca as faturas pendentes desse cliente
                            const { data: invoices, error: invErr } = await (supabase as any)
                                .from('invoices')
                                .select('*')
                                .eq('client_id', client.id)
                                .neq('status', 'paid') 
                                .neq('status', 'approved')
                                .neq('status', 'pago')
                                .order('issued_at', { ascending: false });

                            if (invErr || !invoices || invoices.length === 0) {
                                await sendMsg(remoteJid, { text: `💎 *Olá, ${client.name}!*\n\nNão encontramos faturas pendentes para o seu documento no momento. Seu cadastro está em dia! 😎` });
                                userState[stateKey] = 'START';
                            } else {
                                let invoiceText = `🟦 *Faturas Localizadas - ${client.name}*\n\nEncontrei as seguintes pendências:\n\n`;
                                
                                invoices.forEach((inv: any, index: number) => {
                                    const valor = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.amount);
                                    const data = inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('pt-BR') : 'N/A';
                                    invoiceText += `📄 *Fatura #${inv.number || (index + 1)}*\n📅 Data: ${data}\n💰 Valor: ${valor}\n📝 Status: ${inv.status}\n\n`;
                                });

                                invoiceText += `_Para mais detalhes ou para realizar o pagamento, entre em contato com nosso suporte._\n\n👉 Digite *0* para voltar ao menu principal.`;
                                
                                await sendMsg(remoteJid, { text: invoiceText });
                                userState[stateKey] = 'START'; // Volta para o início após exibir
                            }
                        }
                    }
                }
            }
            else if (currentState === 'WAITING_HUMAN') {
                // Aqui podemos criar lógicas caso o usuário queira desistir de aguardar e voltar ao robô
                if (incomingMessage.toLowerCase().trim() === 'voltar') {
                    await sock.sendMessage(remoteJid, { text: `Ok! Cancelei a transferência para o atendente.` });
                    userState[stateKey] = 'START';
                    await sock.sendMessage(remoteJid, { text: `(Mande um "Olá" para reabrir o nosso menu)` });
                }
            }
        } catch (error) {
            console.error('Erro ao enviar mensagem no WhatsApp:', error);
        }
    });

}

connectToWhatsApp();
