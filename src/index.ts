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
// @ts-ignore
import QRCode from 'qrcode';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { lovable } from './lovable.js';
import { criarPagamentoPix, criarLinkCartao } from './mercadopago.js';

const app = express();
const port = process.env.PORT || 3000;

// Variável para armazenar o QR Code mais recente
let latestQR = '';

app.get('/', async (req, res) => {
    if (!latestQR) {
        res.send('<h1>Aguardando QR Code...</h1><p>Se o bot já estiver conectado, você verá uma mensagem aqui em breve.</p><script>setTimeout(() => location.reload(), 2000)</script>');
        return;
    }
    
    try {
        const qrImage = await QRCode.toDataURL(latestQR);
        res.send(`
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; background-color: #f0f2f5;">
                <div style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); text-align: center;">
                    <h1 style="color: #128c7e;">Conectar WhatsApp</h1>
                    <p style="color: #666;">Aponte seu celular para o código abaixo:</p>
                    <img src="${qrImage}" style="width: 300px; height: 300px; margin: 20px 0;" />
                    <p style="font-size: 14px; color: #999;">O site atualiza sozinho quando conectar.</p>
                </div>
                <script>setTimeout(() => location.reload(), 5000)</script>
            </div>
        `);
    } catch (err) {
        res.status(500).send('Erro ao gerar imagem do QR Code');
    }
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
        // Mudando a identidade para Ubuntu/Chrome para melhorar o pareamento
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        const phoneNumber = process.env.PHONE_NUMBER;

        if (qr && phoneNumber && !sock.authState.creds.registered) {
            const cleanedNumber = phoneNumber.replace(/\D/g, '');
            console.log(`📡 Gerando código para: ${cleanedNumber} (Aguardando 5s...)`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            try {
                const code = await sock.requestPairingCode(cleanedNumber);
                console.log('--------------------------------------------------');
                console.log(`🔑 SEU CÓDIGO DE ACESSO: ${code}`);
                console.log('--------------------------------------------------');
            } catch (err) {
                console.error('Erro ao gerar código de pareamento:', err);
            }
        } else if (qr && !phoneNumber) {
            latestQR = qr; // Salva para o navegador
            console.log('📱 QR Code recebido! Acesse o link do Railway para escanear visualmente.');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            latestQR = ''; // Limpa ao fechar
            const error = lastDisconnect?.error as Boom;
            const statusCode = error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log('🛑 Conexão fechada. Erro:', error?.message || 'Sem mensagem', 'Status:', statusCode);
            
            if (statusCode === 401 || statusCode === DisconnectReason.loggedOut) {
                console.log('🧹 Limpando arquivos de sessão corrompidos e reiniciando...');
                const authPath = path.resolve('auth_info_baileys');
                try {
                    if (fs.existsSync(authPath)) {
                        // Em vez de apagar a pasta (que é um Volume), apagamos apenas o conteúdo
                        const files = fs.readdirSync(authPath);
                        for (const file of files) {
                            fs.rmSync(path.join(authPath, file), { recursive: true, force: true });
                        }
                    }
                    console.log('✅ Arquivos limpos com sucesso. Reiniciando...');
                } catch (err) {
                    console.error('Erro ao limpar arquivos:', err);
                }
                process.exit(1); 
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

        // Ignora mensagens originadas de Grupos (JID termina com @g.us)
        if (remoteJid.endsWith('@g.us')) return;

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
                const welcomeText = `Olá! 👋 Bem-vindo ao nosso Salão.\n\nComo posso te ajudar hoje?\n\n1️⃣ Agendar pelo site\n2️⃣ Agendar por aqui\n3️⃣ Meus agendamentos\n4️⃣ Falar com atendente\n\n_Digite apenas o número da opção desejada._`;
                
                await sendMsg(remoteJid, { text: welcomeText });
                userState[stateKey] = 'MENU';
            } 
            else if (currentState === 'MENU') {
                // Checa qual número o usuário digitou
                switch (incomingMessage.trim()) {
                    case '1':
                        await sendMsg(remoteJid, { text: `Ótimo! Você pode ver todos os horários livres e agendar rapidinho pelo nosso site:\n\n🔗 *[COLOQUE AQUI O LINK DO SEU SITE LOVABLE]*\n\nQualquer dúvida, é só chamar a gente aqui!` });
                        userState[stateKey] = 'START';
                        break;

                    case '2':
                        await sendMsg(remoteJid, { text: `Buscando nossos serviços disponíveis... 🔎` });
                        try {
                            const res = await lovable.listarServicos();
                            // Se a API retornar um array direto ou um objeto { success: true, data: [...] }
                            const servicos = Array.isArray(res) ? res : (res.data || res.servicos || []);
                            
                            if (servicos.length === 0) {
                                await sendMsg(remoteJid, { text: `Parece que não temos serviços cadastrados no momento. Tente de novo mais tarde. 😢` });
                                userState[stateKey] = 'START';
                            } else {
                                let msg = `Temos esses serviços maravilhosos! Qual você deseja?\n\n`;
                                servicos.forEach((srv: any, i: number) => {
                                    const nome = srv.nome || srv.name || srv.title || 'Serviço';
                                    const preco = srv.preco || srv.price ? `- R$ ${srv.preco || srv.price}` : '';
                                    const numStr = String(i + 1).padStart(2, '0');
                                    msg += `*${numStr}.* ${nome} ${preco}\n`;
                                });
                                msg += `\n_Digite o número do serviço ou *0* para voltar._`;
                                
                                userState[stateKey] = { state: 'WAITING_SERVICE', servicos };
                                await sendMsg(remoteJid, { text: msg });
                            }
                        } catch (err: any) {
                             console.error('Erro ao listar serviços:', err.message);
                             await sendMsg(remoteJid, { text: `Desculpe, o nosso sistema de agendamento está offline no momento. 🔧` });
                             userState[stateKey] = 'START';
                        }
                        break;

                    case '3':
                        await sendMsg(remoteJid, { text: `🔎 Consultando seus agendamentos...` });
                        try {
                            // Pega o número do cliente que vem pelo JID (ex: 5511999999999)
                            const clientPhone = remoteJid.replace(/\D/g, '');
                            const res = await lovable.meusAgendamentos(clientPhone);
                            const agendamentos = Array.isArray(res) ? res : (res.data || res.agendamentos || []);
                            
                            if (agendamentos.length === 0) {
                                await sendMsg(remoteJid, { text: `Você não tem nenhum agendamento pendente no momento! 📅` });
                            } else {
                                let msg = `*Suas próximas visitas:*\n\n`;
                                agendamentos.forEach((ag: any, index: number) => {
                                    const dataFormatada = ag.data || ag.date || 'Data a confirmar';
                                    const hora = ag.horario || ag.time || 'Hora a confirmar';
                                    const nomeServ = ag.servico?.nome || ag.servico || 'Procedimento';
                                    
                                    msg += `📌 *${nomeServ}*\n📅 ${dataFormatada} às ${hora}\nStatus: ${ag.status}\n\n`;
                                });
                                await sendMsg(remoteJid, { text: msg });
                            }
                            userState[stateKey] = 'START';
                        } catch (err: any) {
                            console.error('Erro meus agendamentos:', err.message);
                            await sendMsg(remoteJid, { text: `Não consegui puxar seus agendamentos agora. 😕` });
                            userState[stateKey] = 'START';
                        }
                        break;

                    case '4':
                        await sendMsg(remoteJid, { text: `🎧 *Atendimento Humano*\n\nUm de nossos profissionais já vai falar com você. Por favor, aguarde só um momento.` });
                        userState[stateKey] = 'WAITING_HUMAN';
                        break;

                    case '0':
                        userState[stateKey] = 'START';
                        await sendMsg(remoteJid, { text: `🔄 *Retornando...*` });
                        break;

                    default:
                        await sendMsg(remoteJid, { text: `⚠️ *Opção Inválida*\n\nPor favor, escolha uma das opções do menu (*1, 2, 3* ou *4*).` });
                        break;
                }
            }
            else if (currentState === 'WAITING_SERVICE') {
                if (incomingMessage.trim() === '0') {
                    userState[stateKey] = 'START';
                    await sendMsg(remoteJid, { text: `Cancelado. Retornando ao início...` });
                } else {
                    const servicosList = rawState.servicos;
                    const index = parseInt(incomingMessage.trim()) - 1;

                    if (isNaN(index) || index < 0 || index >= servicosList.length) {
                        await sendMsg(remoteJid, { text: `Opção inválida! Digite o número correspondente de 1 a ${servicosList.length}, ou 0 para voltar.` });
                    } else {
                        const servicoEscolhido = servicosList[index];
                        const servId = servicoEscolhido.id;
                        const servNome = servicoEscolhido.nome || servicoEscolhido.name || 'este serviço';

                        await sendMsg(remoteJid, { text: `Você selecionou *${servNome}*.\n\nPara qual data você gostaria? (Digite no formato Dia/Mês. Ex: 25/12)` });
                        userState[stateKey] = { state: 'WAITING_DATE', servico: servicoEscolhido, id: servId };
                    }
                }
            }
            else if (currentState === 'WAITING_DATE') {
                if (incomingMessage.trim() === '0') {
                    userState[stateKey] = 'START';
                    await sendMsg(remoteJid, { text: `Cancelado. Retornando...` });
                } else {
                    // Aqui faremos a ponte simples com a API para ver os horários. 
                    // No mundo real, precisaríamos validar se é uma data possível e converter para YYYY-MM-DD
                    const dataUser = incomingMessage.trim(); // "25/12"
                    
                    // Lógica básica para YYYY-MM-DD
                    let dateIso = "";
                    try {
                        const parts = dataUser.split('/');
                        const currentYear = new Date().getFullYear();
                        if (parts.length >= 2) {
                            dateIso = `${currentYear}-${(parts[1] as string).padStart(2, '0')}-${(parts[0] as string).padStart(2, '0')}`;
                        } else {
                            dateIso = `${currentYear}-12-01`; // Placeholder se digitou errado
                        }
                    } catch { dateIso = "2024-01-01"; }

                    await sendMsg(remoteJid, { text: `Checando a agenda para ${dataUser}... 📅` });
                    
                    try {
                        const res = await lovable.horariosDisponiveis(rawState.id, dateIso);
                        
                        // Extrai a lista que pode estar em res.horarios_disponiveis, ou arrays genéricos
                        let horarios = Array.isArray(res) ? res : (res.horarios_disponiveis || res.horarios || res.slots);
                        
                        if (!horarios && Array.isArray(res.data)) {
                            horarios = res.data;
                        }

                        // Se a resposta ainda não for um array (ex: veio um objeto ou null), forçamos para evitar o crash "is not a function"
                        if (!Array.isArray(horarios)) {
                            if (typeof horarios === 'object' && horarios !== null) {
                                // Se veio um objeto com os horários dentro das chaves, transformamos em array
                                horarios = Object.values(horarios);
                            } else {
                                horarios = [];
                            }
                        }

                        if (horarios.length === 0) {
                            await sendMsg(remoteJid, { text: `Poxa, não temos mais horários vagos neste dia e serviço. Digite outra data, ou *0* para voltar.` });
                        } else {
                            let msg = `📅 *Horários disponíveis para ${dataUser}:*\n\n`;
                            horarios.forEach((hr: any, i: number) => {
                                const numStr = String(i + 1).padStart(2, '0');
                                msg += `*${numStr}.* ${hr.horario || hr}\n`;
                            });
                            msg += `\nQual horário prefere? (Digite o número)`;
                            userState[stateKey] = { state: 'WAITING_TIME', id: rawState.id, servico: rawState.servico, data: dataUser, dateIso, horarios };
                            await sendMsg(remoteJid, { text: msg });
                        }
                    } catch (e: any) {
                        console.error('Erro na data', e.message);
                        console.log('Dados enviados:', { id: rawState.id, dateIso, dataUser });
                        userState[stateKey] = 'START';
                        await sendMsg(remoteJid, { text: `Falha ao buscar horários! Servidor Lovable respondeu: *${e.message}*\n_ID do serviço procurado:_ ${rawState.id}\n\nTente de novo ou agende pelo site (opção 1).` });
                    }
                }
            }
            else if (currentState === 'WAITING_TIME') {
                 if (incomingMessage.trim() === '0') {
                    userState[stateKey] = 'START';
                    await sendMsg(remoteJid, { text: `Cancelado.` });
                } else {
                    const idx = parseInt(incomingMessage.trim()) - 1;
                    const horariosList = rawState.horarios;
                    if (isNaN(idx) || idx < 0 || idx >= horariosList.length) {
                        await sendMsg(remoteJid, { text: `Número inválido.` });
                    } else {
                        const hrObj = horariosList[idx];
                        const horaEscolhida = hrObj.horario || hrObj;
                        
                        await sendMsg(remoteJid, { text: `Legal! Para confirmar o agendamento no dia *${rawState.data} às ${horaEscolhida}*, como você se chama? (Nome e Sobrenome)` });
                        userState[stateKey] = { ...rawState, state: 'WAITING_NAME', horaEscolhida };
                    }
                }
            }
            else if (currentState === 'WAITING_NAME') {
                const nomeCliente = incomingMessage.trim();
                await sendMsg(remoteJid, { text: `Muito prazer, ${nomeCliente}!\n\nComo você prefere realizar o pagamento?\n\n1️⃣ Pagar por aqui\n2️⃣ Pagar no salão` });
                userState[stateKey] = { ...rawState, state: 'WAITING_PAYMENT_WHERE', nomeCliente };
            }
            else if (currentState === 'WAITING_PAYMENT_WHERE') {
                const opcao = incomingMessage.trim();
                const clientPhone = remoteJid.replace(/\D/g, '');

                if (opcao === '2') {
                    // Finaliza como "pagar no salão"
                    await sendMsg(remoteJid, { text: `Registrando seu agendamento no sistema, ${rawState.nomeCliente}... ⏳` });

                    try {
                        await lovable.agendar({
                            whatsapp: clientPhone,
                            nome: rawState.nomeCliente,
                            servico_id: rawState.id,
                            data: rawState.dateIso,
                            horario: rawState.horaEscolhida,
                            forma_pagamento: 'salao'
                        });

                        await sendMsg(remoteJid, { text: `✅ *Agendamento Confirmado!* 🎉\n\nEstá tudo certo para o dia *${rawState.data} às ${rawState.horaEscolhida}*.\nTe esperamos lá! ❤️` });
                    } catch (err: any) {
                        console.error('Erro Agendar', err);
                        await sendMsg(remoteJid, { text: `Poxa, deu erro na hora de confirmar ${err.message || ''}. 😭\nPor favor chame um atendente.` });
                    }
                    userState[stateKey] = 'START';
                }
                else if (opcao === '1') {
                    await sendMsg(remoteJid, { text: `Ótimo! Qual forma de pagamento você prefere utilizar?\n\n1️⃣ Via PIX\n2️⃣ Cartão de Crédito/Débito\n\n_Ou digite *0* para cancelar._` });
                    userState[stateKey] = { ...rawState, state: 'WAITING_PAYMENT_METHOD' };
                }
                else {
                    await sendMsg(remoteJid, { text: `⚠️ Opção inválida.\nDigite 1 para pagar por aqui ou 2 para pagar no salão.` });
                }
            }
            else if (currentState === 'WAITING_PAYMENT_METHOD') {
                const opcao = incomingMessage.trim();
                const clientPhone = remoteJid.replace(/\D/g, '');

                if (opcao === '0') {
                    userState[stateKey] = 'START';
                    await sendMsg(remoteJid, { text: `Cancelado.` });
                }
                else if (opcao === '1' || opcao === '2') {
                    await sendMsg(remoteJid, { text: `Gerando ${opcao === '1' ? 'o código PIX Copia e Cola' : 'o link de pagamento seguro'}... ⏳` });
                    
                    try {
                        const precoOriginal = rawState.servico?.preco || 1;
                        const nomeServico = rawState.servico?.nome || 'Serviço';
                        
                        let txtPagamento = '';
                        if (opcao === '1') {
                            const pix = await criarPagamentoPix(precoOriginal, `${clientPhone}@pagamento.whatsapp.com`, `Pagamento ${nomeServico}`);
                            txtPagamento = `Aqui está o código *PIX Copia e Cola* no valor de R$ ${precoOriginal}:\n\n${pix.qr_code}\n\nAssim que fizer o pagamento pelo seu app de banco, mande o comprovante aqui, por favor!`;
                        } else {
                            const link = await criarLinkCartao(precoOriginal, `Pagamento ${nomeServico}`);
                            txtPagamento = `Aqui está o link 100% seguro do Mercado Pago para efetuar o pagamento de R$ ${precoOriginal}:\n\n🔗 ${link.init_point}\n\nAssim que finalizar, mande um "Ok" pra gente validar!`;
                        }

                        // Registramos como pré-reservado no lovable (status pendente é o default)
                        await lovable.agendar({
                            whatsapp: clientPhone,
                            nome: rawState.nomeCliente,
                            servico_id: rawState.id,
                            data: rawState.dateIso,
                            horario: rawState.horaEscolhida,
                            forma_pagamento: opcao === '1' ? 'pix' : 'cartao'
                        });

                        await sendMsg(remoteJid, { text: txtPagamento });
                        await sendMsg(remoteJid, { text: `✅ *Vaga Reservada com sucesso!* 🎉\nFicou configurada para *${rawState.data} às ${rawState.horaEscolhida}*.\nSe puder enviar o comprovante assim que pagar, agradecemos! ❤️` });

                    } catch (err: any) {
                        console.error("Erro Pagamento:", err);
                        await sendMsg(remoteJid, { text: `Poxa, deu erro na hora de gerar a cobrança pelo Mercado Pago! 😭 Chame um atendente humano para te passar os dados.` });
                    }
                    userState[stateKey] = 'START';
                }
                else {
                    await sendMsg(remoteJid, { text: `⚠️ Opção inválida.\nDigite 1 para PIX, 2 para Cartão ou 0 para cancelar.` });
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
